/**
 * @feature1/@feature2 — native-statusline BDD migration (FR-M1/P3, 3rd spec, batch-rollout slice).
 * NSL001_01 + NSL001_05 migrated: pure reconcileStatusLine() calls (real engine, no spawn/fs).
 * NSL001_02..04, 06..19 stay @wip (driven by the hook/writer/doctor — next slice). Regex steps.
 *
 * @see tools/native-statusline/reconcile-statusline.ts reconcileStatusLine / DEFAULT_STATUSLINE_COMMAND
 */
import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { reconcileStatusLine, DEFAULT_STATUSLINE_COMMAND } from '../../tools/native-statusline/reconcile-statusline.ts';

interface NSLWorld extends V4World {
  nslHome?: string;
  nslExisting?: string;
  nslResult?: { action: string; command?: string };
}

After(function (this: NSLWorld) {
  if (this.nslHome) {
    try {
      fs.removeSync(this.nslHome);
    } catch {
      /* best-effort */
    }
    this.nslHome = undefined;
  }
});

// --- Background ---------------------------------------------------------------
Given(/^dev-pomogator native-statusline tools are available$/, function () {
  assert.equal(typeof reconcileStatusLine, 'function', 'reconcileStatusLine must be importable');
});
Given(/^a temporary HOME with an isolated ~\/\.claude\/settings\.json$/, function (this: NSLWorld) {
  this.nslHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nsl-bdd-'));
  fs.mkdirSync(path.join(this.nslHome, '.claude'), { recursive: true });
});

// --- NSL001_01 (reconciler installs into an empty slot — pure function) -------
Given(/^settings\.json has no statusLine field$/, function (this: NSLWorld) {
  this.nslExisting = undefined;
});
When(/^reconcileStatusLine is called with an undefined existing command$/, function (this: NSLWorld) {
  this.nslResult = reconcileStatusLine(undefined);
});
Then(/^it returns action "install" with command "npx -y ccstatusline@latest"$/, function (this: NSLWorld) {
  assert.equal(this.nslResult!.action, 'install');
  assert.equal(this.nslResult!.command, 'npx -y ccstatusline@latest');
  assert.equal(this.nslResult!.command, DEFAULT_STATUSLINE_COMMAND);
});

// --- NSL001_05 (our own marked statusLine is recognised as ours — pure) -------
Given(/^settings\.json statusLine\.command already contains "ccstatusline"$/, function (this: NSLWorld) {
  this.nslExisting = 'npx -y ccstatusline@latest';
});
When(/^reconcileStatusLine is called with that command$/, function (this: NSLWorld) {
  this.nslResult = reconcileStatusLine(this.nslExisting);
});
Then(/^it returns action "noop"$/, function (this: NSLWorld) {
  assert.equal(this.nslResult!.action, 'noop');
});
