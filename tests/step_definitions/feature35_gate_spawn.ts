/**
 * @feature35 step definitions — pre-DONE test-quality Stop-gate SPAWN behaviour
 * and parseModifiedSpecSlugs pure function (FR-35b).
 *
 * SPECGEN004_305..311: These exercise the REAL hook PROCESS (spawned via
 * process.execPath --import tsx) and the REAL exported parseModifiedSpecSlugs
 * function. Distinct from feature35_honesty_hardening.ts which drives the pure
 * in-process evaluateTestQualityGate() decision logic — these test the end-to-end
 * hook binary (env modes, git-repo wiring, scope exclusion of untracked specs).
 *
 * Distribution-bundle artifact tests (bundle exists/size/markers, hooks.json
 * references bundle) remain in the vitest source (static file guards, no prod fn).
 *
 * Step-def signature: function (this: V4World, ...) — `this:` is a TYPE ANNOTATION
 * (TypeScript); the World is BOUND by cucumber, NEVER a real first parameter.
 * Capture groups alone are the real params.
 *
 * @see tools/spec-graph/test_quality_gate_stop.ts (the hook)
 * @see tools/spec-graph/__tests__/test_quality_gate_stop.test.ts (vitest source)
 * @see .specs/spec-generator-v4/FR.md FR-35b
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_305..311
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseModifiedSpecSlugs } from '../../tools/spec-graph/test_quality_gate_stop.ts';
import { V4World } from '../hooks/before-after.ts';

// Absolute path to the hook script — must be absolute for --import tsx spawns.
const HOOK = path.resolve('tools/spec-graph/test_quality_gate_stop.ts');
// Repo root as absolute path.
const REPO_ROOT = path.resolve('.');

/**
 * Helper: make a minimal git repo in `dir` with one DONE-but-untested task so
 * the gate has something to block on.
 *
 * Mirrors the vitest beforeAll fixture in test_quality_gate_stop.test.ts exactly:
 *   - TASKS.md format: `- [x] <title> -- id: <id> — Status: DONE | Est: 5m`
 *   - doneWhen body contains no SPECGEN004 id → coverage.ts finds zero linked
 *     scenarios → verified_status='unverified' → checkConformance → TASK_UNTESTED
 *   - A second DONE-untested task is appended AFTER the initial commit so that
 *     `git status --porcelain` shows .specs/ as M (tracked-modified, in gate scope)
 */
function makeBlockableRepo(dir: string, specSlug = 'test-spec'): void {
  // Initialise a real git repo (matches vitest beforeAll pattern).
  spawnSync('git', ['init', '-q', dir], { encoding: 'utf8' });
  spawnSync('git', ['-C', dir, 'config', 'user.email', 't@t'], { encoding: 'utf8' });
  spawnSync('git', ['-C', dir, 'config', 'user.name', 't'], { encoding: 'utf8' });

  // Minimal package.json so the directory is recognized as a project root.
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"demo"}\n');

  // Create the spec directory structure.
  const specDir = path.join(dir, '.specs', specSlug);
  fs.mkdirSync(specDir, { recursive: true });

  // A minimal FR.md (builder scans for FR nodes).
  fs.writeFileSync(path.join(specDir, 'FR.md'), '# FR\n\n## FR-1\n\nbody\n');

  // A minimal .feature (builder scans for Scenario nodes).
  fs.writeFileSync(
    path.join(specDir, `${specSlug}.feature`),
    `Feature: ${specSlug}\n\n  @feature1\n  Scenario: SPECGEN001_01 a passing test\n    Given the system is ready\n    Then it works\n`,
  );

  // A minimal TASKS.md — one initial DONE task whose doneWhen has NO SPECGEN004 id.
  // (Only SPECGEN004 pattern is recognised by coverage.ts; SPECGEN001 is not scanned.)
  // This task is in the initial commit; TASK_UNTESTED fires because zero scenarios link.
  fs.writeFileSync(
    path.join(specDir, 'TASKS.md'),
    `# Tasks\n\n## Phase 1\n\n- [x] do it -- id: t-x — Status: DONE | Est: 5m\n  **Done When:**\n  - [x] no test\n`,
  );

  // Initial commit.
  spawnSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' });
  spawnSync('git', ['-C', dir, 'commit', '-qm', 'init'], { encoding: 'utf8' });

  // Append a SECOND DONE-untested task AFTER the commit — makes the file appear
  // as M (tracked-modified) in git status → gate includes this spec in its scope.
  fs.appendFileSync(
    path.join(specDir, 'TASKS.md'),
    `\n- [x] two -- id: t-y — Status: DONE | Est: 5m\n  **Done When:**\n  - [x] untested\n`,
  );
}

/** Spawn the Stop hook with given env overrides and a Stop JSON on stdin. */
function runHook(
  repoDir: string,
  env: Record<string, string> = {},
  input = '{}',
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', HOOK],
    {
      cwd: REPO_ROOT,
      input,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: '',
        DEV_POMOGATOR_REPO_ROOT: repoDir,
        ...env,
      },
    },
  );
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// ── World extension ───────────────────────────────────────────────────────────

interface GateWorld {
  hookResult?: { status: number; stdout: string; stderr: string };
  slugs?: string[];
}

// ── SPECGEN004_305 — ENFORCE mode blocks on a DONE-untested task ──────────────

Given(/^a git repo containing a spec with a task marked DONE but with no linked scenario$/, function (this: V4World & GateWorld) {
  makeBlockableRepo(this.tempDir);
});

When(/^the real test-quality Stop hook process runs against that repo in ENFORCE mode$/, function (this: V4World & GateWorld) {
  this.hookResult = runHook(this.tempDir, { TEST_QUALITY_GATE_ENABLED: 'true' });
});

Then(/^the hook exits 0 and the stdout JSON carries decision block with a reason matching TASK_UNTESTED$/, function (this: V4World & GateWorld) {
  assert.strictEqual(this.hookResult!.status, 0, `hook exited ${this.hookResult!.status}`);
  let parsed: { decision?: string; reason?: string };
  try {
    parsed = JSON.parse(this.hookResult!.stdout);
  } catch {
    throw new Error(`stdout was not JSON: ${JSON.stringify(this.hookResult!.stdout)}`);
  }
  assert.strictEqual(parsed.decision, 'block', `expected block, got ${parsed.decision}`);
  assert.ok(
    /TASK_UNTESTED/i.test(parsed.reason ?? ''),
    `reason did not mention TASK_UNTESTED: ${parsed.reason}`,
  );
});

// ── SPECGEN004_306 — DEFAULT mode (no env) also blocks (FR-35b default=enforce) ─

When(/^the real test-quality Stop hook process runs against that repo with no TEST_QUALITY_GATE_ENABLED env$/, function (this: V4World & GateWorld) {
  this.hookResult = runHook(this.tempDir, {});
});

Then(/^the hook exits 0 and the stdout JSON carries decision block even without the env var set$/, function (this: V4World & GateWorld) {
  assert.strictEqual(this.hookResult!.status, 0);
  let parsed: { decision?: string };
  try {
    parsed = JSON.parse(this.hookResult!.stdout);
  } catch {
    throw new Error(`stdout was not JSON: ${JSON.stringify(this.hookResult!.stdout)}`);
  }
  assert.strictEqual(parsed.decision, 'block', `expected default-enforce to block, got ${parsed.decision}`);
});

// ── SPECGEN004_307 — SHADOW mode approves but logs to stderr ─────────────────

When(/^the real test-quality Stop hook process runs against that repo in SHADOW mode$/, function (this: V4World & GateWorld) {
  this.hookResult = runHook(this.tempDir, { TEST_QUALITY_GATE_ENABLED: 'shadow' });
});

Then(/^the hook exits 0 with empty stdout and stderr contains "would block"$/, function (this: V4World & GateWorld) {
  assert.strictEqual(this.hookResult!.status, 0);
  assert.strictEqual(
    this.hookResult!.stdout.trim(),
    '',
    `expected empty stdout but got: ${this.hookResult!.stdout}`,
  );
  assert.ok(
    this.hookResult!.stderr.includes('would block'),
    `stderr did not contain "would block": ${this.hookResult!.stderr}`,
  );
});

// ── SPECGEN004_308 — stop_hook_active=true short-circuits to approve ──────────

When(/^the real test-quality Stop hook process runs against that repo with stop_hook_active true in the input JSON$/, function (this: V4World & GateWorld) {
  this.hookResult = runHook(this.tempDir, { TEST_QUALITY_GATE_ENABLED: 'true' }, JSON.stringify({ stop_hook_active: true }));
});

Then(/^the hook exits 0 with empty stdout and does not emit a block decision$/, function (this: V4World & GateWorld) {
  assert.strictEqual(this.hookResult!.status, 0);
  // approve() calls process.exit(0) with no stdout write
  if (this.hookResult!.stdout.trim() !== '') {
    let parsed: { decision?: string };
    try {
      parsed = JSON.parse(this.hookResult!.stdout);
    } catch {
      return; // non-JSON stdout is fine for an approve
    }
    assert.notStrictEqual(parsed.decision, 'block', 'stop_hook_active=true must not block');
  }
});

// ── SPECGEN004_309 — TEST_QUALITY_GATE_SKIP=1 env escape approves ────────────

When(/^the real test-quality Stop hook process runs against that repo with env escape TEST_QUALITY_GATE_SKIP=1$/, function (this: V4World & GateWorld) {
  this.hookResult = runHook(this.tempDir, {
    TEST_QUALITY_GATE_ENABLED: 'true',
    TEST_QUALITY_GATE_SKIP: '1',
  });
});

Then(/^the hook exits 0 with empty stdout approving the Stop despite the untested task$/, function (this: V4World & GateWorld) {
  assert.strictEqual(this.hookResult!.status, 0);
  // approve() writes nothing to stdout
  if (this.hookResult!.stdout.trim() !== '') {
    let parsed: { decision?: string };
    try {
      parsed = JSON.parse(this.hookResult!.stdout);
    } catch {
      return;
    }
    assert.notStrictEqual(parsed.decision, 'block', 'SKIP escape must not block');
  }
});

// ── SPECGEN004_310 — parseModifiedSpecSlugs excludes untracked specs ─────────

Given(/^a git status porcelain output with an untracked spec, a modified tracked spec, and a new tracked spec$/, function (this: V4World & GateWorld) {
  // Simulate: `?? .specs/skill-security-scan/` excluded; ` M .specs/mine/FR.md` and `A  .specs/mine-new/TASKS.md` included
  const porcelain = [
    '?? .specs/skill-security-scan/',
    ' M .specs/mine/FR.md',
    'A  .specs/mine-new/TASKS.md',
  ].join('\n');
  this.slugs = parseModifiedSpecSlugs(porcelain);
});

Then(/^parseModifiedSpecSlugs returns only the tracked-modified and newly-staged slugs, excluding the untracked one$/, function (this: V4World & GateWorld) {
  assert.deepEqual(
    [...this.slugs!].sort(),
    ['mine', 'mine-new'].sort(),
    `got slugs: ${JSON.stringify(this.slugs)}`,
  );
  assert.ok(!this.slugs!.includes('skill-security-scan'), 'untracked spec must be excluded');
});

// ── SPECGEN004_311 — parseModifiedSpecSlugs returns empty for non-spec lines ──

Given(/^a git status porcelain output with no .specs\/ paths$/, function (this: V4World & GateWorld) {
  const porcelain = ' M tools/foo/bar.ts\nA  README.md\n';
  this.slugs = parseModifiedSpecSlugs(porcelain);
});

Then(/^parseModifiedSpecSlugs returns an empty array$/, function (this: V4World & GateWorld) {
  assert.deepEqual(this.slugs, []);
});
