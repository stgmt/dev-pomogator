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
}

Given<E2EWorld>(/^a clean isolated HOME for a real claude-mem install$/, function () {
  this.e2eHome = path.join(this.tempDir, 'home');
  fs.mkdirSync(this.e2eHome, { recursive: true });
});

When<E2EWorld>(/^the hook's non-interactive claude-mem install command runs for real$/, { timeout: 360_000 }, function () {
  const inv = buildInstallInvocation(process.platform);
  const res = spawnSync(inv.cmd, inv.args, {
    encoding: 'utf-8',
    timeout: 330_000,
    input: '',
    env: { ...process.env, ...inv.env, HOME: this.e2eHome, USERPROFILE: this.e2eHome },
  });
  this.installExit = res.status;
  this.installTail = ((res.stdout || '') + (res.stderr || '')).slice(-600);
});

Then<E2EWorld>(/^claude-mem is registered in installed_plugins\.json with a claude-mem entry$/, function () {
  const manifest = path.join(this.e2eHome, '.claude', 'plugins', 'installed_plugins.json');
  assert.ok(
    fs.existsSync(manifest),
    `installed_plugins.json must exist after a real install. installer exit=${this.installExit}, tail: ${this.installTail}`,
  );
  const data = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { plugins?: Record<string, unknown[]> };
  const keys = Object.keys(data.plugins ?? {});
  const hit = keys.some((k) => k.startsWith('claude-mem@') && Array.isArray(data.plugins![k]) && data.plugins![k].length > 0);
  assert.ok(hit, `expected a claude-mem@* entry, got keys: ${keys.join(', ')}`);
});

Then<E2EWorld>(/^the hook detection reports claude-mem as installed$/, function () {
  assert.strictEqual(
    isClaudeMemInstalled(this.e2eHome),
    true,
    'isClaudeMemInstalled must flip true after the real installer registered the plugin (idempotency FR-3)',
  );
});
