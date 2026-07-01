/**
 * @feature13 step definitions — plugin hooks resolve independent of process CWD (FR-13).
 *
 * Migrated from tests/e2e/hooks-cwd-independent.test.ts (PLUGINCWD001_01..04).
 * Spawns the REAL bootstrap require + a REAL hook script (auto_commit_stop.ts) from a
 * foreign CWD, anchored on CLAUDE_PROJECT_DIR / CLAUDE_PLUGIN_ROOT, and asserts no
 * MODULE_NOT_FOUND + exit 0 — the regression the env-anchor fix closes. Scenario 04 is
 * an artifact check on the committed .claude/settings.json hook command shape.
 *
 * @see .specs/dev-pomogator-canonical-plugin/FR.md FR-13
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');

interface HookCwdWorld extends V4World {
  hookRun?: { status: number | null; stderr: string };
  settingsText?: string;
}

When(
  /^the plugin Stop hook is launched from a (repo subdirectory|fresh tmpdir) anchored on (CLAUDE_PROJECT_DIR|CLAUDE_PLUGIN_ROOT)$/,
  function (this: HookCwdWorld, location: string, anchor: string) {
    const cwd =
      location === 'repo subdirectory'
        ? path.join(REPO_ROOT, '.claude', 'skills', 'pomogator-doctor', 'scripts', 'engine')
        : fs.mkdtempSync(path.join(os.tmpdir(), 'hookcwd-'));
    const requireExpr = `require(require('path').join(process.env.${anchor}, 'tools', '_shared', 'bootstrap.cjs'))`;
    const res = spawnSync(
      process.execPath,
      ['-e', requireExpr, '--', 'tools/auto-commit/auto_commit_stop.ts'],
      { cwd, input: '{}', encoding: 'utf-8', env: { ...process.env, [anchor]: REPO_ROOT } },
    );
    this.hookRun = { status: res.status, stderr: res.stderr ?? '' };
    if (location === 'fresh tmpdir') fs.rmSync(cwd, { recursive: true, force: true });
  },
);

Then(/^the hook does not fail with a missing bootstrap module$/, function (this: HookCwdWorld) {
  assert.ok(
    !/Cannot find module.*bootstrap\.cjs/.test(this.hookRun!.stderr),
    `hook must resolve bootstrap from a foreign cwd; stderr=${this.hookRun!.stderr}`,
  );
  assert.ok(!/Cannot find module/.test(this.hookRun!.stderr), `no MODULE_NOT_FOUND; stderr=${this.hookRun!.stderr}`);
});

Then(/^the hook exits 0$/, function (this: HookCwdWorld) {
  assert.equal(this.hookRun!.status, 0, `hook must exit 0; stderr=${this.hookRun!.stderr}`);
});

Given(/^the committed \.claude\/settings\.json$/, function (this: HookCwdWorld) {
  this.settingsText = fs.readFileSync(path.join(REPO_ROOT, '.claude', 'settings.json'), 'utf-8');
});

Then(/^it anchors the bootstrap require on CLAUDE_PROJECT_DIR, not the process cwd$/, function (this: HookCwdWorld) {
  assert.ok(
    !/path'\)\.resolve\('tools\/_shared\/bootstrap\.cjs'\)/.test(this.settingsText!),
    'settings.json must NOT use cwd-relative path.resolve for bootstrap',
  );
  assert.ok(
    /CLAUDE_PROJECT_DIR \|\| '\.', 'tools', '_shared', 'bootstrap\.cjs'/.test(this.settingsText!),
    'settings.json must anchor bootstrap on CLAUDE_PROJECT_DIR',
  );
});
