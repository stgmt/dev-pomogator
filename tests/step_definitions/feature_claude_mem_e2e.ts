/**
 * @e2e step-defs for CMEME2E: the REAL claude-mem install end-to-end (no stub, no mock).
 * Drives the ACTUAL installer using the hook's OWN `buildInstallInvocation` + `INSTALL_ENV`
 * (so what is proven is exactly the command the bootstrap hook issues), then asserts the real
 * installer wrote `installed_plugins.json` AND the hook's own `isClaudeMemInstalled` flips true.
 * Needs network + ~1-2min — run only inside Docker/Linux with `--tags @e2e`.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import {
  buildInstallInvocation,
  isClaudeMemInstalled,
} from '../../tools/claude-mem-bootstrap/install-claude-mem.ts';

// NOTE: the long timeout is scoped to the real-install step only (below) — NOT a global
// setDefaultTimeout, which would mask hangs in the rest of the suite.

interface E2EWorld extends V4World {
  e2eHome: string;
  installExit: number | null;
  installTail: string;
  installEnv: NodeJS.ProcessEnv;
  installedPluginKey?: string;
  installedVersion?: string;
}

function prepareRealInstall(world: E2EWorld): void {
  world.e2eHome = path.join(world.tempDir, 'home');
  fs.mkdirSync(world.e2eHome, { recursive: true });
  world.installEnv = { ...process.env, HOME: world.e2eHome, USERPROFILE: world.e2eHome };
}

function runRealInstall(world: E2EWorld): void {
  const inv = buildInstallInvocation(process.platform);
  const res = spawnSync(inv.cmd, inv.args, {
    encoding: 'utf-8',
    timeout: 330_000,
    input: '',
    env: { ...world.installEnv, ...inv.env },
  });
  world.installExit = res.status;
  world.installTail = ((res.stdout || '') + (res.stderr || '')).slice(-600);
}

Given<E2EWorld>(/^a clean isolated HOME for a real claude-mem install$/, function () {
  prepareRealInstall(this);
});

Given<E2EWorld>(/^the network-enabled real-install profile and an isolated fake home$/, function () {
  prepareRealInstall(this);
  assert.strictEqual(this.installEnv.CLAUDE_MEM_INSTALL_LAUNCHER, undefined, 'recorded launcher must not be inherited by real-install');
});

When<E2EWorld>(/^the hook's non-interactive claude-mem install command runs for real$/, { timeout: 360_000 }, function () {
  runRealInstall(this);
});

When<E2EWorld>(/^claude-mem is explicitly installed and verified$/, { timeout: 360_000 }, function () {
  runRealInstall(this);
  assert.strictEqual(this.installExit, 0, `real claude-mem install must succeed: ${this.installTail}`);
});

Then<E2EWorld>(/^claude-mem is registered in installed_plugins\.json with a claude-mem entry$/, function () {
  const manifest = path.join(this.e2eHome, '.claude', 'plugins', 'installed_plugins.json');
  assert.ok(
    fs.existsSync(manifest),
    `installed_plugins.json must exist after a real install. installer exit=${this.installExit}, tail: ${this.installTail}`,
  );
  const data = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { plugins?: Record<string, unknown[]> };
  const keys = Object.keys(data.plugins ?? {});
  const hit = keys.find((k) => k.startsWith('claude-mem@') && Array.isArray(data.plugins![k]) && data.plugins![k].length > 0);
  assert.ok(hit, `expected a claude-mem@* entry, got keys: ${keys.join(', ')}`);
  this.installedPluginKey = hit;
  this.installedVersion = hit.slice('claude-mem@'.length);
});

Then<E2EWorld>(/^the hook detection reports claude-mem as installed$/, function () {
  assert.strictEqual(
    isClaudeMemInstalled(this.e2eHome),
    true,
    'isClaudeMemInstalled must flip true after the real installer registered the plugin (idempotency FR-3)',
  );
});

Then<E2EWorld>(/^the report identifies manifest, MCP registration, worker result, and version independently$/, function () {
  assert.strictEqual(this.installExit, 0, `real claude-mem installation must succeed: ${this.installTail}`);
  const manifest = path.join(this.e2eHome, '.claude', 'plugins', 'installed_plugins.json');
  assert.ok(fs.existsSync(manifest), 'real install must write the Claude Code plugin manifest');
  const plugins = (JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { plugins?: Record<string, unknown[]> }).plugins ?? {};
  const pluginKey = Object.keys(plugins).find((key) => key.startsWith('claude-mem@') && Array.isArray(plugins[key]) && plugins[key].length > 0);
  assert.ok(pluginKey, `manifest must contain a non-empty claude-mem entry; got ${Object.keys(plugins).join(', ')}`);
  assert.notStrictEqual(pluginKey, 'claude-mem@', 'manifest entry must include an installed marketplace/version identifier');
  assert.strictEqual(isClaudeMemInstalled(this.e2eHome), true, 'production installation detector must accept the real manifest');
  const globalConfig = path.join(this.e2eHome, '.claude.json');
  assert.strictEqual(fs.existsSync(globalConfig), false, 'plugin install alone must not falsely claim a global claude-mem MCP registration');
  const workerDir = path.join(this.e2eHome, '.claude-mem');
  assert.strictEqual(fs.existsSync(workerDir), true, 'real install must create claude-mem worker state');
  assert.strictEqual(fs.existsSync(path.join(workerDir, 'settings.json')), true, 'worker state must include its settings artifact');
});

Then<E2EWorld>(/^the real-install profile does not use a recorded launcher$/, function () {
  assert.strictEqual(this.installEnv.CLAUDE_MEM_INSTALL_LAUNCHER, undefined, 'real install must invoke npx directly, never the recorder seam');
});
