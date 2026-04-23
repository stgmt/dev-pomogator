import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';

/**
 * E2E for scope-gate-guard hook.
 *
 * Spawns the hook as a child process with crafted stdin JSON (simulating Claude Code
 * PreToolUse invocation), verifies stdout deny JSON + exit code. Each scenario uses a
 * per-test tmp git repository with staged diff applied from tests/fixtures/scope-gate/.
 *
 * 1:1 with .feature scenarios VSGF001_NN per @featureN tags.
 */

const HOOK_PATH = path.resolve('extensions/scope-gate/tools/scope-gate/scope-gate-guard.ts');
const FIXTURES_DIR = path.resolve('tests/fixtures/scope-gate');

let tmpRepo: string;

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function initGitRepo(dir: string): void {
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  // Seed with empty commit so diff --cached works against HEAD
  execSync('git commit --allow-empty -q -m "init"', { cwd: dir });
}

function applyPatch(dir: string, patchName: string): void {
  const patchPath = path.join(FIXTURES_DIR, patchName);
  // Create the base files referenced in patch (minimal mock)
  const patch = fs.readFileSync(patchPath, 'utf-8');
  const fileMatches = [...patch.matchAll(/^diff --git a\/(.+?) b\/.+$/gm)].map(m => m[1]);
  for (const rel of fileMatches) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (!fs.existsSync(full)) fs.writeFileSync(full, '', 'utf-8');
  }
  // Stage files with some content (patch won't apply cleanly on empty but we don't need it to)
  // Approach: write the NEW content directly from patch's + lines, bypass git apply
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
    fs.writeFileSync(full, lines.join('\n') + '\n', 'utf-8');
    execSync(`git add "${rel}"`, { cwd: dir });
  }
}

function getStagedDiff(dir: string): string {
  return execSync('git diff --cached', { cwd: dir, encoding: 'utf-8' });
}

interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  denyJson: { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } } | null;
}

function spawnHook(input: object): HookResult {
  const result = spawnSync('npx', ['tsx', HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: { ...process.env, DEVPOM_ALLOW_HOST_TESTS: '1' },
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  let denyJson = null;
  if (stdout.trim()) {
    try { denyJson = JSON.parse(stdout); } catch { /* not deny */ }
  }
  return { stdout, stderr, exitCode: result.status ?? -1, denyJson };
}

beforeEach(() => {
  tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-gate-e2e-'));
  initGitRepo(tmpRepo);
});

afterEach(() => {
  try { fs.rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('VSGF001: Verify Generic Scope Fix gate (e2e)', () => {
  // @feature1
  it('VSGF001_10: Enum extension in Service file is blocked without marker', () => {
    applyPatch(tmpRepo, 'stocktaking-diff.patch');

    const result = spawnHook({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "fix: add stocktaking"' },
      cwd: tmpRepo,
      session_id: 'sess-test-10',
    });

    expect(result.exitCode).toBe(2);
    expect(result.denyJson?.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.denyJson?.hookSpecificOutput?.permissionDecisionReason).toMatch(/verify-generic-scope-fix/);
  });

  // @feature1
  it('VSGF001_11: Fresh marker with matching diff hash unblocks commit', () => {
    applyPatch(tmpRepo, 'stocktaking-diff.patch');
    const diff = getStagedDiff(tmpRepo);
    const sha = sha256(diff);

    // Write valid fresh marker
    const markerDir = path.join(tmpRepo, '.claude', '.scope-verified');
    fs.mkdirSync(markerDir, { recursive: true });
    const marker = {
      timestamp: Date.now(),
      diff_sha256: sha,
      session_id: 'sess-test-11',
      variants: [{ file: 'x', kind: 'enum-item', name: 'stocktaking', lineNumber: 1, reach: 'traced', evidence: 'ok' }],
      should_ship: true,
    };
    fs.writeFileSync(
      path.join(markerDir, `sess-test-11-${sha.slice(0, 12)}.json`),
      JSON.stringify(marker, null, 2),
    );

    const result = spawnHook({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "fix: add stocktaking after verification"' },
      cwd: tmpRepo,
      session_id: 'sess-test-11',
    });

    expect(result.exitCode).toBe(0);
    expect(result.denyJson).toBeNull();
  });

  // @feature2
  it('VSGF001_20: Stale marker (diff hash mismatch) is ignored', () => {
    applyPatch(tmpRepo, 'stocktaking-diff.patch');
    const diff = getStagedDiff(tmpRepo);
    const currentSha = sha256(diff);

    const markerDir = path.join(tmpRepo, '.claude', '.scope-verified');
    fs.mkdirSync(markerDir, { recursive: true });
    const marker = {
      timestamp: Date.now(),
      diff_sha256: 'old_sha_does_not_match',
      session_id: 'sess-test-20',
      variants: [],
      should_ship: true,
    };
    fs.writeFileSync(
      path.join(markerDir, `sess-test-20-${currentSha.slice(0, 12)}.json`),
      JSON.stringify(marker, null, 2),
    );

    const result = spawnHook({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "fix"' },
      cwd: tmpRepo,
      session_id: 'sess-test-20',
    });

    expect(result.exitCode).toBe(2);
    expect(result.denyJson?.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  // @feature3
  it('VSGF001_30: Explicit escape hatch logs audit entry and passes', () => {
    applyPatch(tmpRepo, 'stocktaking-diff.patch');

    const result = spawnHook({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "chore: refactor [skip-scope-verify: dead-code path confirmed with reviewer evolkov no runtime reach]"' },
      cwd: tmpRepo,
      session_id: 'sess-test-30',
    });

    expect(result.exitCode).toBe(0);

    const logPath = path.join(tmpRepo, '.claude', 'logs', 'scope-gate-escapes.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);

    const content = fs.readFileSync(logPath, 'utf-8').trim();
    const entry = JSON.parse(content.split('\n')[0]);
    expect(entry.reason).toMatch(/dead-code path confirmed/);
    expect(entry.session_id).toBe('sess-test-30');
  });

  // @feature4
  it('VSGF001_40: Docs-only diff is short-circuited without scoring', () => {
    applyPatch(tmpRepo, 'docs-only-diff.patch');

    const result = spawnHook({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "docs: update changelog"' },
      cwd: tmpRepo,
      session_id: 'sess-test-40',
    });

    expect(result.exitCode).toBe(0);
    expect(result.denyJson).toBeNull();
  });

  // @feature1
  it('VSGF001_60: Non-git Bash command passes without side effects', () => {
    const result = spawnHook({
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      cwd: tmpRepo,
      session_id: 'sess-test-60',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    // No marker dir should be created
    expect(fs.existsSync(path.join(tmpRepo, '.claude', '.scope-verified'))).toBe(false);
    // No escape log
    expect(fs.existsSync(path.join(tmpRepo, '.claude', 'logs', 'scope-gate-escapes.jsonl'))).toBe(false);
  });

  // @feature5
  it('VSGF001_50: SKILL.md frontmatter contains disable-model-invocation true', () => {
    const skillPath = path.resolve('extensions/scope-gate/skills/verify-generic-scope-fix/SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf-8');

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = frontmatterMatch![1];

    expect(frontmatter).toMatch(/disable-model-invocation:\s*true/);
    expect(frontmatter).toMatch(/name:\s*verify-generic-scope-fix/);
    expect(frontmatter).toMatch(/allowed-tools:/);
  });

  // @feature5
  it('VSGF001_51: extension.json registers hook with correct matcher', () => {
    const manifestPath = path.resolve('extensions/scope-gate/extension.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    expect(manifest.hooks?.claude?.PreToolUse?.matcher).toBe('Bash');
    expect(manifest.hooks?.claude?.PreToolUse?.command).toMatch(/scope-gate-guard\.ts/);
    expect(manifest.hooks?.claude?.PreToolUse?.timeout).toBeLessThanOrEqual(10);

    expect(manifest.skillFiles?.['verify-generic-scope-fix']).toEqual(
      expect.arrayContaining([
        '.claude/skills/verify-generic-scope-fix/SKILL.md',
      ]),
    );

    expect(manifest.toolFiles?.['scope-gate']).toEqual(
      expect.arrayContaining([
        '.dev-pomogator/tools/scope-gate/scope-gate-guard.ts',
        '.dev-pomogator/tools/scope-gate/analyze-diff.ts',
      ]),
    );
    // _shared/scope-gate-*.ts are auto-copied by installer (no explicit toolFiles listing per convention)

    expect(manifest.ruleFiles?.claude).toEqual(
      expect.arrayContaining([
        '.claude/rules/scope-gate/when-to-verify.md',
        '.claude/rules/scope-gate/escape-hatch-audit.md',
      ]),
    );
  });
});
