// Integration test for the pre-DONE test-quality Stop-gate (FR-35b). This SPAWNS the
// real hook process (stdin JSON → git status → buildGraphFromCwd → checkConformance →
// decision), not just the pure evaluator — "запускал проверял": the hook is proven to
// actually block, not only its logic. A throwaway git repo with a DONE-but-untested
// spec task is the fixture (the task is added AFTER the initial commit so it shows as
// git-modified → in the gate's scope).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(here, '..', 'test_quality_gate_stop.ts');
const repoRoot = path.resolve(here, '..', '..', '..'); // dev-pomogator root (tsx resolvable here)

const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

/** Run the hook as a real process against `cwd`, with the given stdin + env. */
function runHook(targetRepo: string, stdin: string, env: Record<string, string>) {
  const r = spawnSync('node', ['--import', 'tsx', HOOK], {
    cwd: repoRoot, // tsx is resolvable from the dev-pomogator root
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: '', DEV_POMOGATOR_REPO_ROOT: targetRepo, ...env },
  });
  return { status: r.status ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('test-quality Stop-gate (real hook process)', () => {
  let tmp: string;
  const git = (args: string[]) => spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tqg-it-'));
    git(['init', '-q']);
    git(['config', 'user.email', 't@t']);
    git(['config', 'user.name', 't']);
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"demo"}\n');
    fs.mkdirSync(path.join(tmp, '.specs', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.specs', 'demo', 'FR.md'), '# FR\n\n## FR-1\n\nbody\n');
    fs.writeFileSync(path.join(tmp, '.specs', 'demo', 'TASKS.md'),
      '# Tasks\n\n## Phase 1\n\n- [x] do it -- id: t-x — Status: DONE | Est: 5m\n  **Done When:**\n  - [x] no test\n');
    fs.writeFileSync(path.join(tmp, '.specs', 'demo', 'demo.feature'),
      'Feature: demo\n\n  @feature1\n  Scenario: SPECGEN001_01 p\n    Given x\n');
    git(['add', '-A']);
    git(['commit', '-qm', 'init']);
    // add a second DONE-untested task AFTER the commit → git-modified → in gate scope
    fs.appendFileSync(path.join(tmp, '.specs', 'demo', 'TASKS.md'),
      '\n- [x] two -- id: t-y — Status: DONE | Est: 5m\n  **Done When:**\n  - [x] untested\n');
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it.skipIf(!hasGit)('ENFORCE: a modified spec with a DONE-untested task → blocks', () => {
    const r = runHook(tmp, '{}', { TEST_QUALITY_GATE_ENABLED: 'true' });
    expect(r.status).toBe(0); // gates always exit 0; the block is in stdout JSON
    const out = JSON.parse(r.stdout.trim());
    expect(out.decision).toBe('block');
    expect(out.reason).toMatch(/TASK_UNTESTED/);
  });

  it.skipIf(!hasGit)('SHADOW (default): approves but logs "would block" to stderr', () => {
    const r = runHook(tmp, '{}', {});
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(''); // no block JSON
    expect(r.stderr).toMatch(/shadow: would block/);
  });

  it.skipIf(!hasGit)('stop_hook_active=true → approves (no re-block inside a continuation)', () => {
    const r = runHook(tmp, '{"stop_hook_active":true}', { TEST_QUALITY_GATE_ENABLED: 'true' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it.skipIf(!hasGit)('escape TEST_QUALITY_GATE_SKIP=1 → approves and append-logs the escape', () => {
    const r = runHook(tmp, '{}', { TEST_QUALITY_GATE_ENABLED: 'true', TEST_QUALITY_GATE_SKIP: '1' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
    const log = path.join(tmp, '.claude', 'logs', 'test-quality-escapes.jsonl');
    expect(fs.existsSync(log)).toBe(true);
    expect(fs.readFileSync(log, 'utf8')).toMatch(/TEST_QUALITY_GATE_SKIP/);
  });
});
