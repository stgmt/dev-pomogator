import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// Regression: hooks must resolve regardless of the process CWD. The dogfood hook
// command in .claude/settings.json used `path.resolve('tools/_shared/bootstrap.cjs')`,
// which is relative to process.cwd(); when Claude Code spawned a Stop hook with the
// shell CWD left inside a subdirectory, every hook died with
// `Cannot find module '<subdir>/tools/_shared/bootstrap.cjs'` (MODULE_NOT_FOUND).
// Fix: anchor the bootstrap require on CLAUDE_PROJECT_DIR and resolve the script arg
// against CLAUDE_PROJECT_DIR/CLAUDE_PLUGIN_ROOT inside tsx-runner.resolveScriptPath.

const REPO_ROOT = process.cwd();
// The exact (anchored) command shape committed to .claude/settings.json.
const BOOTSTRAP_REQUIRE =
  "require(require('path').join(process.env.CLAUDE_PROJECT_DIR || '.', 'tools', '_shared', 'bootstrap.cjs'))";

function runHookFrom(cwd: string, env: Record<string, string | undefined>) {
  return spawnSync(
    process.execPath,
    ['-e', BOOTSTRAP_REQUIRE, '--', 'tools/auto-commit/auto_commit_stop.ts'],
    { cwd, input: '{}', encoding: 'utf-8', env: { ...process.env, ...env } },
  );
}

describe('HOOKSCWD001 — hooks resolve independent of CWD', () => {
  let tmp: string | null = null;
  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  });

  it('HOOKSCWD001_01: anchored hook runs from a foreign CWD (subdir) with CLAUDE_PROJECT_DIR', () => {
    const subdir = path.join(REPO_ROOT, '.claude', 'skills', 'pomogator-doctor', 'scripts', 'engine');
    const res = runHookFrom(subdir, { CLAUDE_PROJECT_DIR: REPO_ROOT });
    expect(res.stderr).not.toMatch(/Cannot find module.*bootstrap\.cjs/);
    expect(res.status).toBe(0);
  });

  it('HOOKSCWD001_02: anchored hook runs from an unrelated tmpdir CWD', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hookcwd-'));
    const res = runHookFrom(tmp, { CLAUDE_PROJECT_DIR: REPO_ROOT });
    expect(res.stderr).not.toMatch(/Cannot find module.*bootstrap\.cjs/);
    expect(res.status).toBe(0);
  });

  it('HOOKSCWD001_03: CLAUDE_PLUGIN_ROOT also anchors script resolution in tsx-runner', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hookcwd-'));
    // bootstrap is required via CLAUDE_PROJECT_DIR; the script arg is resolved by
    // tsx-runner — here only CLAUDE_PLUGIN_ROOT points at the tree, proving the
    // resolveScriptPath env-anchor (not the .git walk) finds the script.
    const res = spawnSync(
      process.execPath,
      [
        '-e',
        "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT, 'tools', '_shared', 'bootstrap.cjs'))",
        '--',
        'tools/auto-commit/auto_commit_stop.ts',
      ],
      { cwd: tmp, input: '{}', encoding: 'utf-8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO_ROOT } },
    );
    expect(res.stderr).not.toMatch(/Cannot find module/);
    expect(res.status).toBe(0);
  });

  it('HOOKSCWD001_04: settings.json declares no cwd-relative bootstrap resolve', () => {
    const settings = fs.readFileSync(path.join(REPO_ROOT, '.claude', 'settings.json'), 'utf-8');
    expect(settings).not.toMatch(/path'\)\.resolve\('tools\/_shared\/bootstrap\.cjs'\)/);
    expect(settings).toMatch(/CLAUDE_PROJECT_DIR \|\| '\.', 'tools', '_shared', 'bootstrap\.cjs'/);
  });
});
