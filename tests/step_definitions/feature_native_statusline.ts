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
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';
import {
  reconcileStatusLine,
  DEFAULT_STATUSLINE_COMMAND,
  writeNativeStatusLine,
  OWNERSHIP_MARKER,
} from '../../tools/native-statusline/reconcile-statusline.ts';

const NSL_HOOK = path.resolve(process.cwd(), 'tools/native-statusline/install_native_statusline.ts');
function nslSettingsPath(home: string): string {
  return path.join(home, '.claude', 'settings.json');
}
function nslWriteSettings(home: string, obj: unknown): void {
  fs.mkdirSync(path.dirname(nslSettingsPath(home)), { recursive: true });
  fs.writeFileSync(nslSettingsPath(home), JSON.stringify(obj, null, 2), 'utf-8');
}
function nslReadSettings(home: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(nslSettingsPath(home), 'utf-8')) as Record<string, unknown>;
}
function nslRunHook(home: string, envOverride: Record<string, string> = {}): { stdout: string; status: number | null } {
  const r = spawnSync(process.execPath, ['--import', 'tsx', NSL_HOOK], {
    input: JSON.stringify({ session_id: 'nsl-bdd', cwd: home }),
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, ...envOverride },
  });
  return { stdout: r.stdout ?? '', status: r.status };
}

interface NSLWorld extends V4World {
  nslHome?: string;
  nslExisting?: string;
  nslResult?: { action: string; command?: string };
  nslHookOut?: { stdout: string; status: number | null };
  nslWriteResult?: { changed: boolean; action: string };
  nslBefore?: string;
  nslEnv?: Record<string, string>;
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
  this.nslExisting = undefined; // for _01's reconcile call
  nslWriteSettings(this.nslHome!, {}); // and a real empty file for the hook scenarios (_06) reusing this step
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

// --- NSL001_02 (SessionStart hook writes statusLine into a clean settings.json) ---
Given(/^a settings\.json with no statusLine field$/, function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, {});
});
When(/^the native-statusline SessionStart hook runs with a session-start stdin JSON$/, function (this: NSLWorld) {
  this.nslHookOut = nslRunHook(this.nslHome!);
});
Then(/^settings\.json gains statusLine\.command containing "ccstatusline" with type "command"$/, function (this: NSLWorld) {
  const sl = nslReadSettings(this.nslHome!).statusLine as { type?: string; command?: string };
  assert.equal(sl?.type, 'command');
  assert.match(String(sl?.command), /ccstatusline/);
  assert.ok(String(sl?.command).includes(OWNERSHIP_MARKER), 'command carries the ownership marker');
});
Then(/^the hook exits with code 0$/, function (this: NSLWorld) {
  assert.equal(this.nslHookOut!.status, 0);
});

// --- NSL001_03 (writer preserves all other fields) ---
Given(/^a settings\.json with env and permissions fields and no statusLine$/, function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, { env: { FOO: 'bar' }, permissions: { allow: ['Read(**)'] } });
});
When(/^the writer installs the native statusLine$/, function (this: NSLWorld) {
  this.nslWriteResult = writeNativeStatusLine({ home: this.nslHome! });
});
Then(/^the env and permissions fields are preserved unchanged$/, function (this: NSLWorld) {
  const s = nslReadSettings(this.nslHome!);
  assert.deepEqual(s.env, { FOO: 'bar' });
  assert.deepEqual(s.permissions, { allow: ['Read(**)'] });
});
Then(/^only the statusLine field was added$/, function (this: NSLWorld) {
  assert.deepEqual(Object.keys(nslReadSettings(this.nslHome!)).sort(), ['env', 'permissions', 'statusLine']);
});

// --- NSL001_07 (second run is idempotent — no write) ---
Given(/^the hook already installed the native statusLine in a previous run$/, function (this: NSLWorld) {
  writeNativeStatusLine({ home: this.nslHome! });
  this.nslBefore = fs.readFileSync(nslSettingsPath(this.nslHome!), 'utf-8');
});
When(/^the hook runs again with no other changes$/, function (this: NSLWorld) {
  this.nslWriteResult = writeNativeStatusLine({ home: this.nslHome! });
});
Then(/^no write to settings\.json occurs and the file mtime is unchanged$/, function (this: NSLWorld) {
  assert.deepEqual(this.nslWriteResult, { changed: false, action: 'noop' });
  assert.equal(fs.readFileSync(nslSettingsPath(this.nslHome!), 'utf-8'), this.nslBefore);
});

// --- NSL001_09 (missing settings.json is created with only our statusLine) ---
Given(/^~\/\.claude\/settings\.json does not exist$/, function (this: NSLWorld) {
  assert.equal(fs.existsSync(nslSettingsPath(this.nslHome!)), false);
});
When(/^the native-statusline hook runs with default-on behavior$/, function (this: NSLWorld) {
  this.nslHookOut = nslRunHook(this.nslHome!);
});
Then(/^a valid settings\.json is created containing only the statusLine field$/, function (this: NSLWorld) {
  assert.deepEqual(Object.keys(nslReadSettings(this.nslHome!)), ['statusLine']);
});

// --- shared When for the hook scenarios NSL001_04/_06/_08 (captures before-bytes + env) ---
When(/^the native-statusline hook runs$/, function (this: NSLWorld) {
  const p = nslSettingsPath(this.nslHome!);
  this.nslBefore = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
  this.nslHookOut = nslRunHook(this.nslHome!, this.nslEnv ?? {});
});

// --- NSL001_04 (a user's custom statusLine is never overwritten) ---
Given(/^settings\.json has a custom statusLine\.command without the ccstatusline marker$/, function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, { statusLine: { type: 'command', command: 'my-custom-bar.sh' } });
});
Then(/^the existing statusLine\.command is left unchanged$/, function (this: NSLWorld) {
  const sl = nslReadSettings(this.nslHome!).statusLine as { command?: string };
  assert.equal(sl.command, 'my-custom-bar.sh');
});
Then(/^no write to settings\.json occurs$/, function (this: NSLWorld) {
  assert.equal(fs.readFileSync(nslSettingsPath(this.nslHome!), 'utf-8'), this.nslBefore);
});

// --- NSL001_06 (opt-out switch disables all writes) ---
Given(/^the env var DEV_POMOGATOR_STATUSLINE is set to "off"$/, function (this: NSLWorld) {
  this.nslEnv = { DEV_POMOGATOR_STATUSLINE: 'off' };
});
Then(/^settings\.json is left unchanged and no statusLine is added$/, function (this: NSLWorld) {
  assert.equal(nslReadSettings(this.nslHome!).statusLine, undefined);
  assert.equal(fs.readFileSync(nslSettingsPath(this.nslHome!), 'utf-8'), this.nslBefore);
});

// --- NSL001_08 (corrupt settings.json handled fail-open) ---
Given(/^settings\.json contains invalid JSON$/, function (this: NSLWorld) {
  fs.mkdirSync(path.dirname(nslSettingsPath(this.nslHome!)), { recursive: true });
  fs.writeFileSync(nslSettingsPath(this.nslHome!), '{ "statusLine": ', 'utf-8');
});
Then(/^the hook exits with code 0 without throwing$/, function (this: NSLWorld) {
  assert.equal(this.nslHookOut!.status, 0);
});
Then(/^settings\.json is not mutated$/, function (this: NSLWorld) {
  assert.equal(fs.readFileSync(nslSettingsPath(this.nslHome!), 'utf-8'), '{ "statusLine": ');
});
