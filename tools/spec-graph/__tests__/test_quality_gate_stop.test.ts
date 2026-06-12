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
import { parseModifiedSpecSlugs } from '../test_quality_gate_stop.ts';

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

  it.skipIf(!hasGit)('ENFORCE is the DEFAULT (FR-7): no env → still blocks the DONE-untested task', () => {
    const r = runHook(tmp, '{}', {}); // no TEST_QUALITY_GATE_ENABLED → default 'true'
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout.trim());
    expect(out.decision).toBe('block');
    expect(out.reason).toMatch(/TASK_UNTESTED/);
  });

  it.skipIf(!hasGit)('SHADOW (explicit opt-in): approves but logs "would block" to stderr', () => {
    const r = runHook(tmp, '{}', { TEST_QUALITY_GATE_ENABLED: 'shadow' });
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

// Root scope-fix (shared working tree): the gate must judge only the SESSION'S OWN
// tracked work, never an untracked parallel-session spec — else arming enforce wedges
// THIS Stop on someone else's spec. Pure-function test → deterministic, no git needed.
describe('parseModifiedSpecSlugs — scope excludes untracked parallel-session specs', () => {
  it('SCOPE_01: untracked (??) specs are NOT counted; tracked edits + staged new specs are', () => {
    const porcelain = [
      '?? .specs/skill-security-scan/',          // parallel session — untracked dir
      '?? .specs/spec-generator-v4/report.yaml', // generated artifact — untracked file
      ' M .specs/mine/FR.md',                     // my tracked edit
      'A  .specs/mine-new/TASKS.md',              // my staged new spec
    ].join('\n');
    expect(parseModifiedSpecSlugs(porcelain).sort()).toEqual(['mine', 'mine-new']);
  });

  it('SCOPE_02: empty / non-spec porcelain → []', () => {
    expect(parseModifiedSpecSlugs('')).toEqual([]);
    expect(parseModifiedSpecSlugs(' M tools/foo.ts\n?? bar.txt')).toEqual([]);
  });
});

// The gate ships to plugin users as a self-contained esbuild bundle (the raw .ts crashes
// on @cucumber/gherkin with no node_modules). These guard the shipped artifact.
describe('test-quality gate distribution bundle', () => {
  const bundle = path.join(here, '..', 'test_quality_gate_stop.bundle.mjs');
  const hooksJson = path.join(repoRoot, '.claude-plugin', 'hooks.json');

  it('committed bundle exists and is non-trivial (gherkin+builder inlined)', () => {
    expect(fs.existsSync(bundle), 'run `npm run build:gate` and commit the bundle').toBe(true);
    expect(fs.statSync(bundle).size).toBeGreaterThan(100_000);
  });

  it('bundle carries the gate logic (stale-bundle guard — re-run build:gate after edits)', () => {
    const t = fs.readFileSync(bundle, 'utf8');
    for (const marker of ['TASK_UNTESTED', 'TASK_TEST_QUALITY', 'skip-test-quality', 'test-quality-escapes']) {
      expect(t, `bundle missing '${marker}' — run \`npm run build:gate\``).toContain(marker);
    }
  });

  it('hooks.json launches the bundle, not the raw .ts (which needs gherkin/node_modules)', () => {
    const h = fs.readFileSync(hooksJson, 'utf8');
    expect(h).toContain('test_quality_gate_stop.bundle.mjs');
    expect(h).not.toContain('test_quality_gate_stop.ts');
    expect(h).toContain('CLAUDE_PLUGIN_ROOT');
  });
});
