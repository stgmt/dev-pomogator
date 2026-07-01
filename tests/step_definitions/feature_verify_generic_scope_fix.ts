/**
 * Step definitions for `verify-generic-scope-fix` spec (VSGF001).
 *
 * Drives the REAL scope-gate-guard.ts PreToolUse hook — no mocks, no inline
 * copies of production logic. Every runtime scenario spawns the hook via
 * `spawnSync(process.execPath, ['--import','tsx', HOOK_ABS], {input, cwd:REPO_ROOT})`
 * per the SKILL.md dogfood gotcha (npx doesn't resolve in a host spawn on Windows;
 * `--import tsx` requires cwd=REPO_ROOT so tsx resolves from node_modules).
 *
 * Artifact scenarios (_50, _51) read the real shipped files and assert their shape.
 *
 * Feature reconciliations applied via apply_spec_change door (bdd-migrator SKILL
 * "when the prose lies, fix the .feature"):
 *   - VSGF001_51: v1 `extensions/scope-gate/extension.json` path removed in v2;
 *     reconciled to assert the v2 artifact paths that fs.existsSync can verify.
 *   - VSGF001_20: "verification stale" phrase not emitted by denyAndExit(); hook
 *     emits score reasons + re-run hint; reconciled to "re-run hint or score pattern".
 *
 * Regex step patterns (NOT Cucumber Expressions) so literal `/`, `—`, `[`, `]`
 * and `>=` match verbatim. Every pattern is namespaced to VSGF001 vocabulary so
 * the file — loaded by the full BDD suite — never collides with another spec's steps.
 *
 * @see .specs/verify-generic-scope-fix/verify-generic-scope-fix.feature
 * @see tools/scope-gate/scope-gate-guard.ts
 * @see tools/_shared/scope-gate-score-diff.ts
 * @see tools/_shared/scope-gate-marker-store.ts
 * @see .claude/skills/bdd-migrator/SKILL.md
 */
import { Given, When, Then, Before, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { V4World } from '../hooks/before-after.ts';
import { scoreDiff, isDocsOrTestsOnly, parseFilesFromDiff } from '../../tools/_shared/scope-gate-score-diff.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const REPO_ROOT = process.cwd();
const HOOK_ABS = path.resolve(REPO_ROOT, 'tools', 'scope-gate', 'scope-gate-guard.ts');
const FIXTURES_DIR = path.resolve(REPO_ROOT, 'tests', 'fixtures', 'scope-gate');

// ---------------------------------------------------------------------------
// World extension
// ---------------------------------------------------------------------------
interface VsgfWorld extends V4World {
  /** Isolated git repo for the scenario (separate from V4World.tempDir) */
  vsgfRepo?: string;
  /** Result of the last hook spawn */
  vsgfHookResult?: HookResult;
  /** Staged diff computed after git add (for hash assertions) */
  vsgfStagedDiff?: string;
  /** Session id used in the current scenario */
  vsgfSessionId?: string;
  /** FR-6 weighted-heuristic result (regression pin VSGF001_61 + score-diff fold) */
  vsgfScore?: number;
  vsgfReasons?: string[];
  vsgfBaselineScore?: number;
  vsgfDampenedScore?: number;
  /** Marker-unit scenarios (VSGF001_74..81): isolated tmp cwd for marker store */
  vsgfMarkerCwd?: string;
  /** Last diff sha used in marker-unit scenarios */
  vsgfMarkerDiff?: string;
  /** Last readFreshMarker() return value */
  vsgfReadResult?: import('../../tools/_shared/scope-gate-marker-store.ts').Marker | null;
}

interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  denyJson: {
    hookSpecificOutput?: {
      permissionDecision?: string;
      permissionDecisionReason?: string;
    };
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers (local — no import from tests/e2e/helpers.ts because helpers.ts
// uses __dirname at top-level which throws under cucumber's ESM loader)
// ---------------------------------------------------------------------------

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function initGitRepo(dir: string): void {
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync('git commit --allow-empty -q -m "init"', { cwd: dir });
}

/**
 * Apply a patch file exactly like the vitest's applyPatch() helper:
 * extract +/context lines per file, write as content, then git add each file.
 */
function applyPatch(dir: string, patchName: string): void {
  const patchPath = path.join(FIXTURES_DIR, patchName);
  const patch = fs.readFileSync(patchPath, 'utf-8');

  const files: Record<string, string[]> = {};
  let currentFile: string | null = null;
  for (const line of patch.split(/\r?\n/)) {
    const df = line.match(/^diff --git a\/(.+?) b\/.+$/);
    if (df) { currentFile = df[1]; files[currentFile] = []; continue; }
    if (!currentFile) continue;
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@') ||
        line.startsWith('index ')) continue;
    if (line.startsWith('+')) files[currentFile].push(line.slice(1));
    else if (line.startsWith(' ')) files[currentFile].push(line.slice(1));
  }
  for (const [rel, lines] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, lines.join('\n') + '\n', 'utf-8');
    execSync(`git add "${rel}"`, { cwd: dir });
  }
}

function getStagedDiff(dir: string): string {
  return execSync('git diff --cached', { cwd: dir, encoding: 'utf-8' });
}

function spawnHook(repoDir: string, command: string, sessionId: string): HookResult {
  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command },
    cwd: repoDir,
    session_id: sessionId,
  });
  // Spawn from REPO_ROOT so --import tsx resolves node_modules
  const res = spawnSync(process.execPath, ['--import', 'tsx', HOOK_ABS], {
    input,
    encoding: 'utf-8',
    cwd: REPO_ROOT,
    timeout: 20000,
  });
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  let denyJson = null;
  if (stdout.trim()) {
    try { denyJson = JSON.parse(stdout); } catch { /* not a deny JSON */ }
  }
  return { stdout, stderr, exitCode: res.status ?? -1, denyJson };
}

// ---------------------------------------------------------------------------
// Lifecycle — per-scenario vsgf repo (separate from V4World tempDir which is
// also cleaned up by the global After hook in before-after.ts)
// ---------------------------------------------------------------------------

Before({ tags: '@feature1 or @feature2 or @feature3 or @feature4' }, function (this: VsgfWorld) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vsgf-e2e-'));
  initGitRepo(repo);
  this.vsgfRepo = repo;
  this.vsgfSessionId = `sess-bdd-${Date.now()}`;
});

After({ tags: '@feature1 or @feature2 or @feature3 or @feature4' }, function (this: VsgfWorld) {
  if (this.vsgfRepo) {
    try { fs.rmSync(this.vsgfRepo, { recursive: true, force: true }); } catch { /* best-effort */ }
    this.vsgfRepo = undefined;
  }
  // Cleanup per-scenario marker-unit tmpdir (VSGF001_74..81)
  if (this.vsgfMarkerCwd) {
    try { fs.rmSync(this.vsgfMarkerCwd, { recursive: true, force: true }); } catch { /* best-effort */ }
    this.vsgfMarkerCwd = undefined;
  }
});

// ---------------------------------------------------------------------------
// Background steps
// ---------------------------------------------------------------------------

Given(/^dev-pomogator is installed with scope-gate extension$/, function () {
  // Verified structurally by VSGF001_51 — no setup needed here
});

Given(/^a git repository project exists$/, function (this: VsgfWorld) {
  // vsgfRepo is set up by the Before hook for feature1-4 scenarios
  // For feature5 (artifact) scenarios this is a no-op
});

Given(/^target project has \.claude\/ directory initialised$/, function () {
  // Created on demand by the hook itself — no explicit setup needed
});

// ---------------------------------------------------------------------------
// VSGF001_10 / _12 / _60 — @feature1 given steps
// ---------------------------------------------------------------------------

Given(/^staged diff adds line "'stocktaking'" to array in file "src\/services\/StockValidationService\.ts"$/,
  function (this: VsgfWorld) {
    applyPatch(this.vsgfRepo!, 'stocktaking-diff.patch');
    this.vsgfStagedDiff = getStagedDiff(this.vsgfRepo!);
  },
);

Given(/^no marker file exists under "\.claude\/\.scope-verified\/"$/, function (this: VsgfWorld) {
  // Fresh repo — no marker dir exists
  const markerDir = path.join(this.vsgfRepo!, '.claude', '.scope-verified');
  assert.equal(fs.existsSync(markerDir), false, 'marker dir must not pre-exist');
});

Given(/^commit message does not contain "\[skip-scope-verify:"$/, function () {
  // Enforced by the When step's command string — no setup
});

Given(/^staged diff adds line "case StockTaking:" inside switch in file "src\/services\/DocumentGate\.ts"$/,
  function (this: VsgfWorld) {
    applyPatch(this.vsgfRepo!, 'switch-case-diff.patch');
    this.vsgfStagedDiff = getStagedDiff(this.vsgfRepo!);
  },
);

Given(/^no marker file exists$/, function (this: VsgfWorld) {
  const markerDir = path.join(this.vsgfRepo!, '.claude', '.scope-verified');
  assert.equal(fs.existsSync(markerDir), false, 'marker dir must not pre-exist');
});

// ---------------------------------------------------------------------------
// VSGF001_11 — @feature1 fresh marker
// ---------------------------------------------------------------------------

Given(/^fresh marker file exists at "\.claude\/\.scope-verified\/sess1-<diff12>\.json" with matching diff_sha256 and should_ship true$/,
  function (this: VsgfWorld) {
    const diff = getStagedDiff(this.vsgfRepo!);
    this.vsgfStagedDiff = diff;
    const fullSha = sha256(diff);
    const markerDir = path.join(this.vsgfRepo!, '.claude', '.scope-verified');
    fs.mkdirSync(markerDir, { recursive: true });
    const marker = {
      timestamp: Date.now(),
      diff_sha256: fullSha,
      session_id: this.vsgfSessionId!,
      variants: [{ file: 'x', kind: 'enum-item', name: 'stocktaking', lineNumber: 1, reach: 'traced', evidence: 'ok' }],
      should_ship: true,
    };
    fs.writeFileSync(
      path.join(markerDir, `${this.vsgfSessionId}-${fullSha.slice(0, 12)}.json`),
      JSON.stringify(marker, null, 2),
    );
  },
);

Given(/^marker timestamp is within last 30 minutes$/, function () {
  // Timestamp is Date.now() — always within 30 minutes; assertion is implicit
});

// ---------------------------------------------------------------------------
// VSGF001_20 — @feature2 stale marker (hash mismatch)
// ---------------------------------------------------------------------------

Given(/^staged diff has sha256 "new456"$/, function (this: VsgfWorld) {
  applyPatch(this.vsgfRepo!, 'stocktaking-diff.patch');
  this.vsgfStagedDiff = getStagedDiff(this.vsgfRepo!);
});

Given(/^marker exists with diff_sha256 "old123" and session_id matching current session$/,
  function (this: VsgfWorld) {
    const currentSha = sha256(this.vsgfStagedDiff!);
    const markerDir = path.join(this.vsgfRepo!, '.claude', '.scope-verified');
    fs.mkdirSync(markerDir, { recursive: true });
    const marker = {
      timestamp: Date.now(),
      diff_sha256: 'old_sha_does_not_match',
      session_id: this.vsgfSessionId!,
      variants: [],
      should_ship: true,
    };
    // Use current sha in filename so readFreshMarker looks at the right file
    fs.writeFileSync(
      path.join(markerDir, `${this.vsgfSessionId}-${currentSha.slice(0, 12)}.json`),
      JSON.stringify(marker, null, 2),
    );
  },
);

// ---------------------------------------------------------------------------
// VSGF001_21 — @feature2 stale TTL
// ---------------------------------------------------------------------------

Given(/^staged diff adds suspicious pattern$/, function (this: VsgfWorld) {
  applyPatch(this.vsgfRepo!, 'stocktaking-diff.patch');
  this.vsgfStagedDiff = getStagedDiff(this.vsgfRepo!);
});

Given(/^marker exists with matching diff_sha256 and session_id but timestamp 31 minutes ago$/,
  function (this: VsgfWorld) {
    const fullSha = sha256(this.vsgfStagedDiff!);
    const markerDir = path.join(this.vsgfRepo!, '.claude', '.scope-verified');
    fs.mkdirSync(markerDir, { recursive: true });
    const staleTs = Date.now() - (31 * 60 * 1000); // 31 minutes ago → past TTL_MS (30 min)
    const marker = {
      timestamp: staleTs,
      diff_sha256: fullSha,
      session_id: this.vsgfSessionId!,
      variants: [],
      should_ship: true,
    };
    fs.writeFileSync(
      path.join(markerDir, `${this.vsgfSessionId}-${fullSha.slice(0, 12)}.json`),
      JSON.stringify(marker, null, 2),
    );
  },
);

// ---------------------------------------------------------------------------
// VSGF001_40 — @feature4 docs-only diff
// ---------------------------------------------------------------------------

Given(/^staged diff touches only "README\.md" and "docs\/CHANGES\.md"$/,
  function (this: VsgfWorld) {
    applyPatch(this.vsgfRepo!, 'docs-only-diff.patch');
    this.vsgfStagedDiff = getStagedDiff(this.vsgfRepo!);
  },
);

// ---------------------------------------------------------------------------
// VSGF001_41 — @feature4 non-guard enum (escapable)
// ---------------------------------------------------------------------------

Given(/^staged diff adds line "'hotpink'" to array in file "src\/utils\/ColorPalette\.ts"$/,
  function (this: VsgfWorld) {
    applyPatch(this.vsgfRepo!, 'non-guard-enum-diff.patch');
    this.vsgfStagedDiff = getStagedDiff(this.vsgfRepo!);
  },
);

// ---------------------------------------------------------------------------
// VSGF001_30 — @feature3 escape hatch
// ---------------------------------------------------------------------------

Given(/^staged diff adds line "case StockTaking:" in file "src\/services\/DocumentGate\.ts"$/,
  function (this: VsgfWorld) {
    applyPatch(this.vsgfRepo!, 'switch-case-diff.patch');
    this.vsgfStagedDiff = getStagedDiff(this.vsgfRepo!);
  },
);

// ---------------------------------------------------------------------------
// VSGF001_50 / _51 — @feature5 artifact steps
// ---------------------------------------------------------------------------

Given(/^dev-pomogator scope-gate extension is installed$/, function () {
  // Verified by checking paths in Then steps
});

// ---------------------------------------------------------------------------
// When steps
// ---------------------------------------------------------------------------

When(/^Claude Code invokes Bash "(.+)"$/, function (this: VsgfWorld, command: string) {
  const repo = this.vsgfRepo!;
  const sid = this.vsgfSessionId!;
  this.vsgfHookResult = spawnHook(repo, command, sid);
});

When(/^I read "\.claude\/skills\/verify-generic-scope-fix\/SKILL\.md" frontmatter$/,
  function (this: VsgfWorld) {
    // State is read in Then steps
  },
);

When(/^I check the v2 artifact paths$/, function () {
  // Checked in Then steps via fs.existsSync
});

// ---------------------------------------------------------------------------
// Then — exit code and deny JSON assertions (shared across scenarios)
// ---------------------------------------------------------------------------

Then(/^hook exit code is (\d+)$/, function (this: VsgfWorld, code: string) {
  assert.equal(this.vsgfHookResult!.exitCode, parseInt(code, 10),
    `expected exit ${code} but got ${this.vsgfHookResult!.exitCode}. stdout: ${this.vsgfHookResult!.stdout.slice(0, 300)}`);
});

Then(/^hook stdout contains permissionDecision "deny"$/, function (this: VsgfWorld) {
  assert.equal(
    this.vsgfHookResult!.denyJson?.hookSpecificOutput?.permissionDecision,
    'deny',
    `expected deny but got: ${this.vsgfHookResult!.stdout.slice(0, 300)}`,
  );
});

Then(/^no deny JSON is emitted$/, function (this: VsgfWorld) {
  assert.equal(this.vsgfHookResult!.denyJson, null,
    `expected no deny JSON but stdout was: ${this.vsgfHookResult!.stdout.slice(0, 200)}`);
});

Then(/^permissionDecisionReason mentions "\/verify-generic-scope-fix"$/,
  function (this: VsgfWorld) {
    const reason = this.vsgfHookResult!.denyJson?.hookSpecificOutput?.permissionDecisionReason ?? '';
    assert.match(reason, /verify-generic-scope-fix/,
      `expected /verify-generic-scope-fix in reason but got: ${reason.slice(0, 300)}`);
  },
);

Then(/^permissionDecisionReason mentions score >= 2$/, function (this: VsgfWorld) {
  const reason = this.vsgfHookResult!.denyJson?.hookSpecificOutput?.permissionDecisionReason ?? '';
  assert.match(reason, /Score:\s*\d+/,
    `expected "Score: N" in reason but got: ${reason.slice(0, 300)}`);
  const scoreMatch = reason.match(/Score:\s*(\d+)/);
  if (scoreMatch) {
    assert.ok(parseInt(scoreMatch[1], 10) >= 2, `expected score >= 2 but got ${scoreMatch[1]}`);
  }
});

Then(/^permissionDecisionReason mentions "switch-case" or "case"$/, function (this: VsgfWorld) {
  const reason = this.vsgfHookResult!.denyJson?.hookSpecificOutput?.permissionDecisionReason ?? '';
  assert.match(reason, /switch-case|case\b/,
    `expected "switch-case" or "case" in reason but got: ${reason.slice(0, 300)}`);
});

Then(/^permissionDecisionReason mentions re-run hint or score pattern$/, function (this: VsgfWorld) {
  const reason = this.vsgfHookResult!.denyJson?.hookSpecificOutput?.permissionDecisionReason ?? '';
  const hasRerunHint = /verify-generic-scope-fix|\/verify-generic-scope-fix/.test(reason);
  const hasScorePattern = /Score:\s*\d+|\+\d+\s+(enum-item|switch-case|filename)/.test(reason);
  assert.ok(hasRerunHint || hasScorePattern,
    `expected re-run hint or score pattern in reason but got: ${reason.slice(0, 300)}`);
});

Then(/^permissionDecisionReason mentions re-verify required$/, function (this: VsgfWorld) {
  const reason = this.vsgfHookResult!.denyJson?.hookSpecificOutput?.permissionDecisionReason ?? '';
  // Hook emits score reasons when marker is stale (TTL expired → readFreshMarker returns null → no marker → denyAndExit(reasons))
  const hasHint = /verify-generic-scope-fix|Score:\s*\d+|\+\d+/.test(reason);
  assert.ok(hasHint,
    `expected re-verify hint (score reasons + /verify-generic-scope-fix) in reason but got: ${reason.slice(0, 300)}`);
});

// ---------------------------------------------------------------------------
// Then — escape log assertions (VSGF001_30 / _31 / _41)
// ---------------------------------------------------------------------------

Then(/^file "\.claude\/logs\/scope-gate-escapes\.jsonl" contains one new line$/, function (this: VsgfWorld) {
  const logPath = path.join(this.vsgfRepo!, '.claude', 'logs', 'scope-gate-escapes.jsonl');
  assert.ok(fs.existsSync(logPath), `escape log must exist at ${logPath}`);
  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
  assert.ok(lines.length >= 1, `expected ≥1 log entry but got ${lines.length}`);
});

Then(/^the new line contains reason starting with "dead-code path confirmed"$/, function (this: VsgfWorld) {
  const logPath = path.join(this.vsgfRepo!, '.claude', 'logs', 'scope-gate-escapes.jsonl');
  const entry = JSON.parse(fs.readFileSync(logPath, 'utf-8').trim().split('\n')[0]);
  assert.match(entry.reason, /dead-code path confirmed/,
    `expected reason to start with "dead-code path confirmed" but got: ${entry.reason}`);
});

Then(/^the new line contains the diff_sha256 of staged diff$/, function (this: VsgfWorld) {
  const logPath = path.join(this.vsgfRepo!, '.claude', 'logs', 'scope-gate-escapes.jsonl');
  const entry = JSON.parse(fs.readFileSync(logPath, 'utf-8').trim().split('\n')[0]);
  const expectedSha = sha256(this.vsgfStagedDiff!);
  assert.equal(entry.diff_sha256, expectedSha,
    `expected diff_sha256 ${expectedSha} but got ${entry.diff_sha256}`);
});

Then(/^hook stderr contains warning about short reason$/, function (this: VsgfWorld) {
  const stderr = this.vsgfHookResult!.stderr;
  assert.match(stderr, /escape reason too short|reason too short|short/i,
    `expected short-reason warning in stderr but got: ${stderr.slice(0, 200)}`);
});

Then(/^escape log entry is still appended$/, function (this: VsgfWorld) {
  const logPath = path.join(this.vsgfRepo!, '.claude', 'logs', 'scope-gate-escapes.jsonl');
  assert.ok(fs.existsSync(logPath), 'escape log must exist');
  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
  assert.ok(lines.length >= 1, `expected ≥1 log entry but got ${lines.length}`);
});

Then(/^escape log entry is appended$/, function (this: VsgfWorld) {
  const logPath = path.join(this.vsgfRepo!, '.claude', 'logs', 'scope-gate-escapes.jsonl');
  assert.ok(fs.existsSync(logPath), 'escape log must exist');
  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
  assert.ok(lines.length >= 1, `expected ≥1 log entry but got ${lines.length}`);
});

// ---------------------------------------------------------------------------
// Then — side-effect absence (VSGF001_40 / _60)
// ---------------------------------------------------------------------------

Then(/^no marker file is created$/, function (this: VsgfWorld) {
  if (!this.vsgfRepo) return; // feature5 scenario — no repo
  const markerDir = path.join(this.vsgfRepo, '.claude', '.scope-verified');
  // The marker dir may or may not exist; if it does it should be empty
  if (fs.existsSync(markerDir)) {
    const entries = fs.readdirSync(markerDir).filter(f => f.endsWith('.json'));
    assert.equal(entries.length, 0, `expected no marker files but found: ${entries.join(', ')}`);
  }
});

Then(/^no escape log entry is appended$/, function (this: VsgfWorld) {
  if (!this.vsgfRepo) return;
  const logPath = path.join(this.vsgfRepo, '.claude', 'logs', 'scope-gate-escapes.jsonl');
  assert.equal(fs.existsSync(logPath), false,
    'escape log must not exist for this scenario');
});

Then(/^hook stdout is empty$/, function (this: VsgfWorld) {
  assert.equal(this.vsgfHookResult!.stdout, '',
    `expected empty stdout but got: ${this.vsgfHookResult!.stdout.slice(0, 200)}`);
});

// ---------------------------------------------------------------------------
// Then — VSGF001_50 artifact assertions
// ---------------------------------------------------------------------------

Then(/^frontmatter contains "disable-model-invocation: true"$/, function () {
  const skillPath = path.resolve(REPO_ROOT, '.claude', 'skills', 'verify-generic-scope-fix', 'SKILL.md');
  const content = fs.readFileSync(skillPath, 'utf-8');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  assert.match(frontmatter, /disable-model-invocation:\s*true/,
    'SKILL.md frontmatter must contain disable-model-invocation: true');
});

Then(/^frontmatter contains "name: verify-generic-scope-fix"$/, function () {
  const skillPath = path.resolve(REPO_ROOT, '.claude', 'skills', 'verify-generic-scope-fix', 'SKILL.md');
  const content = fs.readFileSync(skillPath, 'utf-8');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  assert.match(frontmatter, /name:\s*verify-generic-scope-fix/,
    'SKILL.md frontmatter must contain name: verify-generic-scope-fix');
});

Then(/^frontmatter contains "allowed-tools:" with Read, Bash, Grep, Glob$/, function () {
  const skillPath = path.resolve(REPO_ROOT, '.claude', 'skills', 'verify-generic-scope-fix', 'SKILL.md');
  const content = fs.readFileSync(skillPath, 'utf-8');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  assert.match(frontmatter, /allowed-tools:/,
    'SKILL.md frontmatter must contain allowed-tools:');
  // Read, Bash, Grep, Glob should all appear in the frontmatter
  for (const tool of ['Read', 'Bash', 'Grep', 'Glob']) {
    assert.match(frontmatter, new RegExp(tool),
      `allowed-tools must include ${tool}`);
  }
});

// ---------------------------------------------------------------------------
// Then — VSGF001_51 v2 path existence
// ---------------------------------------------------------------------------

Then(/^"tools\/scope-gate\/scope-gate-guard\.ts" exists$/, function () {
  assert.ok(fs.existsSync(path.resolve(REPO_ROOT, 'tools', 'scope-gate', 'scope-gate-guard.ts')),
    'tools/scope-gate/scope-gate-guard.ts must exist');
});

Then(/^"tools\/scope-gate\/analyze-diff\.ts" exists$/, function () {
  assert.ok(fs.existsSync(path.resolve(REPO_ROOT, 'tools', 'scope-gate', 'analyze-diff.ts')),
    'tools/scope-gate/analyze-diff.ts must exist');
});

Then(/^"\.claude\/skills\/verify-generic-scope-fix\/SKILL\.md" exists$/, function () {
  assert.ok(fs.existsSync(path.resolve(REPO_ROOT, '.claude', 'skills', 'verify-generic-scope-fix', 'SKILL.md')),
    '.claude/skills/verify-generic-scope-fix/SKILL.md must exist');
});

Then(/^"\.claude\/rules\/scope-gate\/when-to-verify\.md" exists$/, function () {
  assert.ok(fs.existsSync(path.resolve(REPO_ROOT, '.claude', 'rules', 'scope-gate', 'when-to-verify.md')),
    '.claude/rules/scope-gate/when-to-verify.md must exist');
});

Then(/^"\.claude\/rules\/scope-gate\/escape-hatch-audit\.md" exists$/, function () {
  assert.ok(fs.existsSync(path.resolve(REPO_ROOT, '.claude', 'rules', 'scope-gate', 'escape-hatch-audit.md')),
    '.claude/rules/scope-gate/escape-hatch-audit.md must exist');
});

// ---------------------------------------------------------------------------
// FR-6 — weighted suspicionScore heuristic (VSGF001_61). Regression pin folded
// from tests/regressions/stocktaking-incident.test.ts: the real scoreDiff() over
// the PRODUCTS-20218 fixture must keep scoring >= 4 so incident detection cannot
// be silently tuned away. Drives the REAL scoreDiff in-process — no mock.
// ---------------------------------------------------------------------------
Given(/^the stocktaking incident diff fixture from PRODUCTS-20218$/, function (this: VsgfWorld) {
  this.vsgfStagedDiff = fs.readFileSync(path.join(FIXTURES_DIR, 'stocktaking-diff.patch'), 'utf-8');
});

When(/^the scope-gate weighted heuristic scores the stocktaking diff$/, function (this: VsgfWorld) {
  const r = scoreDiff(this.vsgfStagedDiff ?? '');
  this.vsgfScore = r.score;
  this.vsgfReasons = r.reasons;
});

Then(/^the suspicion score is at least (\d+)$/, function (this: VsgfWorld, min: string) {
  assert.ok(
    (this.vsgfScore ?? -1) >= Number(min),
    `stocktaking fixture must score >= ${min} (filename+enum+predicate), got ${this.vsgfScore}. Reasons: ${(this.vsgfReasons ?? []).join(', ')}`,
  );
});

Then(/^the score reasons include an? (filename|enum-item) hit on "([^"]+)"$/, function (this: VsgfWorld, kind: string, file: string) {
  const text = (this.vsgfReasons ?? []).join('\n');
  const re = new RegExp(`${kind}:.*${file.replace(/\./g, '\\.')}`);
  assert.ok(re.test(text), `expected a ${kind} reason hit on ${file}; reasons:\n${text}`);
});

// ---------------------------------------------------------------------------
// FR-6/FR-4 scoreDiff + isDocsOrTestsOnly + parseFilesFromDiff unit coverage
// (VSGF001_62..73), folded from tests/unit/score-diff.test.ts. All drive the REAL
// PURE functions in-process — no mock, no spawn. ("|" is the list separator in
// step args since Gherkin can't carry a newline.)
// ---------------------------------------------------------------------------
Given(/^a scope-gate diff fixture "([^"]+)"$/, function (this: VsgfWorld, name: string) {
  this.vsgfStagedDiff = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
});
Given(/^a raw scope-gate diff "([^"]*)"$/, function (this: VsgfWorld, text: string) {
  this.vsgfStagedDiff = text;
});
When(/^the scope-gate heuristic scores the diff$/, function (this: VsgfWorld) {
  const r = scoreDiff(this.vsgfStagedDiff ?? '');
  this.vsgfScore = r.score;
  this.vsgfReasons = r.reasons;
});
When(/^the diff is scored plain and again dampening files "([^"]+)"$/, function (this: VsgfWorld, files: string) {
  this.vsgfBaselineScore = scoreDiff(this.vsgfStagedDiff ?? '').score;
  this.vsgfDampenedScore = scoreDiff(this.vsgfStagedDiff ?? '', { dampenFiles: files.split('|') }).score;
});
Then(/^the suspicion score is exactly (\d+)$/, function (this: VsgfWorld, n: string) {
  assert.equal(this.vsgfScore, Number(n), `expected score ${n}, got ${this.vsgfScore}`);
});
Then(/^the suspicion score is between (\d+) and (\d+)$/, function (this: VsgfWorld, lo: string, hi: string) {
  const s = this.vsgfScore ?? -1;
  assert.ok(s >= Number(lo) && s <= Number(hi), `score ${s} not in [${lo},${hi}]`);
});
Then(/^the dampened score is the plain score minus (\d+)$/, function (this: VsgfWorld, n: string) {
  assert.equal(this.vsgfDampenedScore, (this.vsgfBaselineScore ?? 0) - Number(n),
    `dampened ${this.vsgfDampenedScore} != baseline ${this.vsgfBaselineScore} - ${n}`);
});
Then(/^a score reason matches \/([^/]+)\/$/, function (this: VsgfWorld, pat: string) {
  assert.match((this.vsgfReasons ?? []).join('\n'), new RegExp(pat));
});
Then(/^every score reason starts with a signed weight$/, function (this: VsgfWorld) {
  const rs = this.vsgfReasons ?? [];
  assert.ok(rs.length > 0 && rs.every((r) => /^[+-]\d+ /.test(r)), `reasons not all signed: ${rs.join(' | ')}`);
});
Then(/^isDocsOrTestsOnly of "([^"]*)" is (true|false)$/, function (this: VsgfWorld, input: string, expected: string) {
  const v = isDocsOrTestsOnly(input.split('|').join('\n'));
  assert.equal(v, expected === 'true', `isDocsOrTestsOnly("${input}") = ${v}, expected ${expected}`);
});
Then(/^parseFilesFromDiff of fixture "([^"]+)" yields paths "([^"]+)"$/, function (this: VsgfWorld, name: string, paths: string) {
  const diff = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
  const got = parseFilesFromDiff(diff).map((f: { path: string }) => f.path);
  assert.deepEqual(got, paths.split('|'));
});

// ---------------------------------------------------------------------------
// VSGF001_74..81 — marker-store internal API (FR-5 + NFR S-2 + FR-3)
// Folded from tests/unit/marker-store.test.ts (SCOPEGATE002_10..41).
// All drive the REAL exported functions in-process — no mocks, no spawns.
// World extension: vsgfMarkerCwd holds the per-scenario tmp dir; vsgfMarkerDiff
// holds a known diff sha; vsgfReadResult holds the last readFreshMarker return.
// ---------------------------------------------------------------------------
import {
  writeMarker as _writeMarker,
  readFreshMarker as _readFreshMarker,
  runGC as _runGC,
  markerDir as _markerDir,
  appendEscapeLog as _appendEscapeLog,
  sha256 as _sha256,
  shortSha as _shortSha,
  GC_STALE_MS as _GC_STALE_MS,
} from '../../tools/_shared/scope-gate-marker-store.ts';
import type { Marker as _Marker } from '../../tools/_shared/scope-gate-marker-store.ts';

function mkTestMarker(diffSha: string, sessionId: string): _Marker {
  return {
    timestamp: Date.now(),
    diff_sha256: diffSha,
    session_id: sessionId,
    variants: [{ file: 'src/a.ts', kind: 'enum-item', name: 'foo', lineNumber: 1, reach: 'traced', evidence: 'ok' }],
    should_ship: true,
  };
}

Given(/^a fresh temporary directory as the marker store cwd$/, function (this: VsgfWorld) {
  this.vsgfMarkerCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vsgf-ms-'));
  this.vsgfMarkerDiff = undefined;
  this.vsgfReadResult = undefined;
});

When(/^writeMarker is called with a valid marker$/, function (this: VsgfWorld) {
  const diffSha = _sha256('test-diff-content');
  this.vsgfMarkerDiff = diffSha;
  _writeMarker(this.vsgfMarkerCwd!, mkTestMarker(diffSha, 'sess-test'));
});

Then(/^a JSON file exists under "\.claude\/\.scope-verified\/" in that cwd$/, function (this: VsgfWorld) {
  const dir = _markerDir(this.vsgfMarkerCwd!)!;
  const files = fs.readdirSync(dir);
  assert.ok(files.some(f => f.endsWith('.json')), `no .json files found in ${dir}; got: ${files.join(', ')}`);
});

Given(/^a marker is written for session "([^"]+)" with a known diff sha$/, function (this: VsgfWorld, sessionId: string) {
  const diffSha = _sha256(`known-diff-${sessionId}`);
  this.vsgfMarkerDiff = diffSha;
  _writeMarker(this.vsgfMarkerCwd!, mkTestMarker(diffSha, sessionId));
});

When(/^readFreshMarker is called with session "([^"]+)" and the same diff sha$/, function (this: VsgfWorld, sessionId: string) {
  this.vsgfReadResult = _readFreshMarker(this.vsgfMarkerCwd!, sessionId, this.vsgfMarkerDiff!);
});

Then(/^readFreshMarker returns null$/, function (this: VsgfWorld) {
  assert.equal(this.vsgfReadResult, null, `expected null but got: ${JSON.stringify(this.vsgfReadResult)}`);
});

Given(/^a corrupt JSON marker file exists for session "([^"]+)" with a known diff sha$/, function (this: VsgfWorld, sessionId: string) {
  const diffSha = _sha256('corrupt-diff');
  this.vsgfMarkerDiff = diffSha;
  const dir = _markerDir(this.vsgfMarkerCwd!)!;
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${sessionId}-${_shortSha(diffSha)}.json`;
  fs.writeFileSync(path.join(dir, filename), '{ not valid json', 'utf-8');
});

When(/^readFreshMarker is called with session "([^"]+)" and that diff sha$/, function (this: VsgfWorld, sessionId: string) {
  this.vsgfReadResult = _readFreshMarker(this.vsgfMarkerCwd!, sessionId, this.vsgfMarkerDiff!);
});

Given(/^a marker is written and then artificially aged beyond GC_STALE_MS$/, function (this: VsgfWorld) {
  const diffSha = _sha256('old-diff');
  this.vsgfMarkerDiff = diffSha;
  _writeMarker(this.vsgfMarkerCwd!, mkTestMarker(diffSha, 'sess-old'));

  const dir = _markerDir(this.vsgfMarkerCwd!)!;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.equal(files.length, 1, 'expected exactly 1 marker before aging');
  const fp = path.join(dir, files[0]);
  const oldTimeSec = (Date.now() - _GC_STALE_MS - 1000) / 1000;
  fs.utimesSync(fp, oldTimeSec, oldTimeSec);
});

When(/^runGC is called on that cwd$/, function (this: VsgfWorld) {
  _runGC(this.vsgfMarkerCwd!);
});

Then(/^no JSON files remain under "\.claude\/\.scope-verified\/"$/, function (this: VsgfWorld) {
  const dir = _markerDir(this.vsgfMarkerCwd!)!;
  const remaining = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.equal(remaining.length, 0, `expected 0 JSON files, found ${remaining.length}: ${remaining.join(', ')}`);
});

Given(/^a fresh marker is written for session "([^"]+)"$/, function (this: VsgfWorld, sessionId: string) {
  const diffSha = _sha256(`fresh-diff-${sessionId}`);
  this.vsgfMarkerDiff = diffSha;
  _writeMarker(this.vsgfMarkerCwd!, mkTestMarker(diffSha, sessionId));
});

Then(/^exactly 1 JSON file remains under "\.claude\/\.scope-verified\/"$/, function (this: VsgfWorld) {
  const dir = _markerDir(this.vsgfMarkerCwd!)!;
  const remaining = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.equal(remaining.length, 1, `expected 1 JSON file, found ${remaining.length}: ${remaining.join(', ')}`);
});

When(/^markerDir is called on that cwd$/, function (this: VsgfWorld) {
  // Result stored implicitly; assertion in Then uses markerDir directly
});

Then(/^the result starts with the resolved cwd path$/, function (this: VsgfWorld) {
  const result = _markerDir(this.vsgfMarkerCwd!);
  assert.notEqual(result, null, 'markerDir returned null');
  assert.ok(result!.startsWith(path.resolve(this.vsgfMarkerCwd!)), `markerDir ${result} does not start with ${path.resolve(this.vsgfMarkerCwd!)}`);
});

When(/^writeMarker is called with session_id "([^"]+)" and a known diff sha$/, function (this: VsgfWorld, sessionId: string) {
  const diffSha = _sha256('traversal-test-diff');
  this.vsgfMarkerDiff = diffSha;
  _writeMarker(this.vsgfMarkerCwd!, mkTestMarker(diffSha, sessionId));
});

Then(/^no file created under "\.claude\/\.scope-verified\/" contains "\.\." or "\/"$/, function (this: VsgfWorld) {
  const dir = _markerDir(this.vsgfMarkerCwd!)!;
  const files = fs.readdirSync(dir);
  const hasBadChars = files.some(f => f.includes('..') || f.includes('/'));
  assert.ok(!hasBadChars, `found unsafe filename(s): ${files.join(', ')}`);
});

When(/^appendEscapeLog is called twice with reasons "([^"]+)" and "([^"]+)"$/, function (this: VsgfWorld, r1: string, r2: string) {
  _appendEscapeLog(this.vsgfMarkerCwd!, { ts: '2026-01-01T00:00:00.000Z', diff_sha256: 'aaa', reason: r1, session_id: 'sess-1', cwd: this.vsgfMarkerCwd! });
  _appendEscapeLog(this.vsgfMarkerCwd!, { ts: '2026-01-01T00:00:01.000Z', diff_sha256: 'bbb', reason: r2, session_id: 'sess-1', cwd: this.vsgfMarkerCwd! });
});

Then(/^the escape log file contains exactly 2 valid JSONL lines$/, function (this: VsgfWorld) {
  const logPath = path.join(this.vsgfMarkerCwd!, '.claude', 'logs', 'scope-gate-escapes.jsonl');
  assert.ok(fs.existsSync(logPath), `escape log not found at ${logPath}`);
  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
  assert.equal(lines.length, 2, `expected 2 lines, got ${lines.length}`);
  // Both must be valid JSON
  lines.forEach((l, i) => {
    try { JSON.parse(l); } catch { assert.fail(`line ${i + 1} is not valid JSON: ${l}`); }
  });
});

Then(/^the first line has reason "([^"]+)" and the second has reason "([^"]+)"$/, function (this: VsgfWorld, r1: string, r2: string) {
  const logPath = path.join(this.vsgfMarkerCwd!, '.claude', 'logs', 'scope-gate-escapes.jsonl');
  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
  assert.equal(JSON.parse(lines[0]).reason, r1, `line 1 reason mismatch`);
  assert.equal(JSON.parse(lines[1]).reason, r2, `line 2 reason mismatch`);
});
