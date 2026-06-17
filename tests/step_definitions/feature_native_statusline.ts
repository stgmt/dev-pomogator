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
import { statuslineCheck } from '../../.claude/skills/pomogator-doctor/scripts/engine/checks/statusline.ts';
import type { CheckContext } from '../../.claude/skills/pomogator-doctor/scripts/engine/types.ts';
import { ccstatuslineConfigPath, writeCcstatuslineWidgets, REQUIRED_WIDGET_TYPES } from '../../tools/native-statusline/ccstatusline-widgets.ts';
import { statuslineWidgetsCheck } from '../../.claude/skills/pomogator-doctor/scripts/engine/checks/statusline-widgets.ts';

const NSL_HOOK = path.resolve(process.cwd(), 'tools/native-statusline/install_native_statusline.ts');
const NSL_APPLY = path.resolve(process.cwd(), 'tools/native-statusline/apply-statusline.ts');
function nslCtx(home: string): CheckContext {
  return {
    config: null,
    configError: null,
    referencedMcpServers: new Set<string>(),
    installedExtensions: [],
    projectRoot: home,
    homeDir: home,
    signal: new AbortController().signal,
    packageVersion: null,
  } as unknown as CheckContext;
}
async function nslCheckRun(home: string): Promise<{ severity?: string; hint?: string }> {
  const r = await statuslineCheck.run(nslCtx(home));
  return (Array.isArray(r) ? r[0] : r) ?? {};
}
function nslWidgetsPath(home: string): string {
  return ccstatuslineConfigPath(home);
}
function nslWriteWidgets(home: string, obj: unknown): void {
  fs.mkdirSync(path.dirname(nslWidgetsPath(home)), { recursive: true });
  fs.writeFileSync(nslWidgetsPath(home), JSON.stringify(obj, null, 2), 'utf-8');
}
function nslReadWidgets(home: string): { lines: Array<Array<{ type: string }>> } & Record<string, unknown> {
  return JSON.parse(fs.readFileSync(nslWidgetsPath(home), 'utf-8')) as { lines: Array<Array<{ type: string }>> } & Record<string, unknown>;
}
function nslWidgetTypes(lines: Array<Array<{ type: string }>>): string[] {
  return lines.flat().map((w) => w.type);
}
// Mirrors the REAL ccstatusline stock-default config (verify-against-real-artifact).
function nslStockWidgets(): Record<string, unknown> {
  return {
    version: 3,
    lines: [
      [
        { id: '1', type: 'model', color: 'cyan' },
        { id: '2', type: 'separator' },
        { id: '3', type: 'context-length', color: 'brightBlack' },
        { id: '4', type: 'separator' },
        { id: '5', type: 'git-branch', color: 'magenta' },
        { id: '6', type: 'separator' },
        { id: '7', type: 'git-changes', color: 'yellow' },
      ],
      [],
      [],
    ],
    flexMode: 'full-minus-40',
    compactThreshold: 60,
    colorLevel: 2,
    inheritSeparatorColors: false,
    globalBold: false,
    gitCacheTtlSeconds: 5,
    minimalistMode: false,
  };
}
async function nslWidgetsCheckRun(home: string): Promise<{ severity?: string; message?: string; hint?: string }> {
  const r = await statuslineWidgetsCheck.run(nslCtx(home));
  return (Array.isArray(r) ? r[0] : r) ?? {};
}
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
  nslCheck?: { severity?: string; hint?: string };
  nslWidgetRes?: { changed: boolean; action: string };
  nslWidgetBefore?: string;
  nslWidgetCheck?: { severity?: string; message?: string; hint?: string };
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

// --- NSL001_10 / _11 (pomogator-doctor statusline check + real apply fix-action) ---
Given(/^pomogator-doctor runs against a HOME whose settings\.json has no statusLine$/, function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, {});
});
When(/^the statusline check executes$/, async function (this: NSLWorld) {
  this.nslCheck = await nslCheckRun(this.nslHome!);
});
Then(/^the check is reported as needing a fix$/, function (this: NSLWorld) {
  assert.equal(this.nslCheck!.severity, 'warning');
  assert.ok(this.nslCheck!.hint, 'a fix hint must be present');
});
Then(/^applying the fix-action writes the ccstatusline command immediately$/, async function (this: NSLWorld) {
  const apply = spawnSync(process.execPath, ['--import', 'tsx', NSL_APPLY], {
    input: '',
    encoding: 'utf8',
    env: { ...process.env, HOME: this.nslHome!, USERPROFILE: this.nslHome! },
  });
  assert.equal(apply.status, 0);
  const ar = JSON.parse((apply.stdout ?? '').trim()) as { changed?: boolean };
  assert.equal(ar.changed, true);
  assert.equal((await nslCheckRun(this.nslHome!)).severity, 'ok');
});
Given(/^a HOME whose settings\.json statusLine\.command contains "ccstatusline"$/, function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, { statusLine: { type: 'command', command: 'npx -y ccstatusline@latest' } });
});
Then(/^the check severity is "ok"$/, function (this: NSLWorld) {
  assert.equal(this.nslCheck!.severity, 'ok');
});
Then(/^a HOME with a custom non-ccstatusline statusLine also reports "ok" \(preserved\)$/, async function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, { statusLine: { type: 'command', command: 'my-custom-bar.sh' } });
  assert.equal((await nslCheckRun(this.nslHome!)).severity, 'ok');
});
Then(/^a HOME with corrupt settings\.json reports "warning" \(unreadable, not verified\)$/, async function (this: NSLWorld) {
  fs.writeFileSync(nslSettingsPath(this.nslHome!), '{ "statusLine": ', 'utf-8');
  assert.equal((await nslCheckRun(this.nslHome!)).severity, 'warning');
});

// --- NSL001_12 (hook seeds a missing widget config with repo + cwd) ---
Given(/^~\/\.config\/ccstatusline\/settings\.json does not exist$/, function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, {}); // clean statusLine settings; widget config still absent
  assert.equal(fs.existsSync(nslWidgetsPath(this.nslHome!)), false);
});
Then(/^a widget config is created as a 3-line column whose line 1 contains "git-root-dir" and "current-working-dir"$/, function (this: NSLWorld) {
  const cfg = nslReadWidgets(this.nslHome!);
  assert.equal(cfg.lines.length, 3);
  const types = nslWidgetTypes(cfg.lines);
  for (const req of REQUIRED_WIDGET_TYPES) assert.ok(types.includes(req), `required widget ${req}`);
  assert.deepEqual(cfg.lines[1].map((w) => w.type), ['git-root-dir', 'separator', 'current-working-dir']);
});

// --- NSL001_13 (hook never mutates an existing widget config — install-only) ---
Given(/^a stock-default ccstatusline widget config without repo and cwd widgets$/, function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, { statusLine: { type: 'command', command: DEFAULT_STATUSLINE_COMMAND } });
  nslWriteWidgets(this.nslHome!, nslStockWidgets());
  this.nslWidgetBefore = fs.readFileSync(nslWidgetsPath(this.nslHome!), 'utf-8');
});
Then(/^the widget config file is byte-for-byte unchanged$/, function (this: NSLWorld) {
  assert.equal(fs.readFileSync(nslWidgetsPath(this.nslHome!), 'utf-8'), this.nslWidgetBefore);
});

// --- NSL001_14 (doctor fix-action enriches a stock-default widget config) ---
Given(/^a stock-default ccstatusline widget config mirroring the real producer output$/, function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, { statusLine: { type: 'command', command: DEFAULT_STATUSLINE_COMMAND } });
  nslWriteWidgets(this.nslHome!, nslStockWidgets());
});
When(/^the apply-statusline fix-action runs$/, function (this: NSLWorld) {
  this.nslWidgetRes = writeCcstatuslineWidgets({ home: this.nslHome!, enrichExisting: true });
});
Then(/^the layout is normalized to a 3-line column with "git-root-dir" and "current-working-dir" on their own line \(a single line truncates at terminal width\)$/, function (this: NSLWorld) {
  assert.equal(this.nslWidgetRes!.changed, true);
  assert.equal(this.nslWidgetRes!.action, 'enrich');
  const cfg = nslReadWidgets(this.nslHome!);
  assert.equal(cfg.lines.length, 3);
  assert.deepEqual(cfg.lines[1].map((w) => w.type), ['git-root-dir', 'separator', 'current-working-dir']);
  for (const req of REQUIRED_WIDGET_TYPES) assert.ok(nslWidgetTypes(cfg.lines).includes(req));
});
Then(/^the original stock widgets and all other config fields are preserved$/, function (this: NSLWorld) {
  const cfg = nslReadWidgets(this.nslHome!);
  assert.equal(cfg.flexMode, 'full-minus-40');
  assert.equal(cfg.gitCacheTtlSeconds, 5);
  const types = nslWidgetTypes(cfg.lines);
  assert.ok(types.includes('model') && types.includes('git-branch'));
});

// --- NSL001_15 (a customized widget layout is never enriched) ---
Given(/^a ccstatusline widget config containing a non-stock widget type$/, function (this: NSLWorld) {
  const custom = nslStockWidgets();
  (custom.lines as Array<Array<Record<string, string>>>)[0].push({ id: '8', type: 'custom-text' });
  nslWriteWidgets(this.nslHome!, custom);
  this.nslWidgetBefore = fs.readFileSync(nslWidgetsPath(this.nslHome!), 'utf-8');
});

// --- NSL001_16 (widget enrichment is idempotent) ---
Given(/^a widget config already containing repo and cwd widgets$/, function (this: NSLWorld) {
  nslWriteWidgets(this.nslHome!, nslStockWidgets());
  writeCcstatuslineWidgets({ home: this.nslHome!, enrichExisting: true }); // first enrich adds repo+cwd
  this.nslWidgetBefore = fs.readFileSync(nslWidgetsPath(this.nslHome!), 'utf-8');
});
When(/^the apply-statusline fix-action runs again$/, function (this: NSLWorld) {
  this.nslWidgetRes = writeCcstatuslineWidgets({ home: this.nslHome!, enrichExisting: true });
});
Then(/^no write occurs and the action is "noop"$/, function (this: NSLWorld) {
  assert.equal(this.nslWidgetRes!.changed, false);
  assert.equal(this.nslWidgetRes!.action, 'noop');
  assert.equal(fs.readFileSync(nslWidgetsPath(this.nslHome!), 'utf-8'), this.nslWidgetBefore);
});

// --- NSL001_19 (previous single-line layout migrates to the column) ---
Given(/^a widget config in the previous dev-pomogator revision \(our widgets tail-appended to the stock single line\)$/, function (this: NSLWorld) {
  const old = nslStockWidgets();
  (old.lines as Array<Array<Record<string, unknown>>>)[0].push(
    { id: '8', type: 'separator' },
    { id: '9', type: 'git-root-dir', color: 'cyan' },
    { id: '10', type: 'separator' },
    { id: '11', type: 'current-working-dir', color: 'blue', metadata: { abbreviateHome: 'true' } },
  );
  nslWriteWidgets(this.nslHome!, old);
});
Then(/^the layout is normalized to the canonical 3-line column with repo and cwd on their own line$/, function (this: NSLWorld) {
  assert.equal(this.nslWidgetRes!.changed, true);
  assert.equal(this.nslWidgetRes!.action, 'enrich');
  const cfg = nslReadWidgets(this.nslHome!);
  assert.deepEqual(cfg.lines[1].map((w) => w.type), ['git-root-dir', 'separator', 'current-working-dir']);
});
Then(/^all other config fields are preserved$/, function (this: NSLWorld) {
  assert.equal(nslReadWidgets(this.nslHome!).flexMode, 'full-minus-40');
});

// --- NSL001_17 / _18 (pomogator-doctor statusline-widgets check) ---
Given(/^ccstatusline is the configured statusLine$/, function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, { statusLine: { type: 'command', command: DEFAULT_STATUSLINE_COMMAND } });
});
Given(/^the widget config is stock-default without repo and cwd widgets$/, function (this: NSLWorld) {
  nslWriteWidgets(this.nslHome!, nslStockWidgets());
});
When(/^the statusline-widgets check executes$/, async function (this: NSLWorld) {
  this.nslWidgetCheck = await nslWidgetsCheckRun(this.nslHome!);
});
Then(/^the check severity is "warning" naming the missing widget types$/, function (this: NSLWorld) {
  assert.equal(this.nslWidgetCheck!.severity, 'warning');
  assert.match(String(this.nslWidgetCheck!.message), /git-root-dir/);
  assert.match(String(this.nslWidgetCheck!.message), /current-working-dir/);
});
Then(/^after the apply-statusline fix-action the check reports "ok"$/, async function (this: NSLWorld) {
  const apply = spawnSync(process.execPath, ['--import', 'tsx', NSL_APPLY], {
    input: '',
    encoding: 'utf8',
    env: { ...process.env, HOME: this.nslHome!, USERPROFILE: this.nslHome! },
  });
  assert.equal(apply.status, 0);
  const ar = JSON.parse((apply.stdout ?? '').trim()) as { widgets?: { changed?: boolean; action?: string } };
  assert.equal(ar.widgets?.changed, true);
  assert.equal(ar.widgets?.action, 'enrich');
  assert.equal((await nslWidgetsCheckRun(this.nslHome!)).severity, 'ok');
});

// --- NSL001_18 (widgets check defers to C-NSL + respects custom layouts) ---
Given(/^a HOME without any statusLine configured$/, function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, {});
});
Then(/^the check severity is "ok" \(not applicable — C-NSL's domain\)$/, function (this: NSLWorld) {
  assert.equal(this.nslWidgetCheck!.severity, 'ok');
});
Then(/^a HOME with a customized widget layout missing repo\/cwd also reports "ok" \(left untouched\)$/, async function (this: NSLWorld) {
  nslWriteSettings(this.nslHome!, { statusLine: { type: 'command', command: DEFAULT_STATUSLINE_COMMAND } });
  const custom = nslStockWidgets();
  (custom.lines as Array<Array<Record<string, string>>>)[0].push({ id: '8', type: 'session-clock' });
  nslWriteWidgets(this.nslHome!, custom);
  assert.equal((await nslWidgetsCheckRun(this.nslHome!)).severity, 'ok');
});
