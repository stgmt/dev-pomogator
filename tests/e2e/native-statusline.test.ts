// Integration tests for the NATIVE statusline domain (.specs/native-statusline/).
// Each it() maps 1:1 to a NSL001 scenario in tests/features/native-statusline.feature.
//
// Integration-first (.claude/rules/integration-tests-first.md): the hook is driven
// via spawnSync exactly as Claude Code invokes it (real stdin + HOME override),
// and the writer/reconciler run against a real temp filesystem — no mocks.
//
// NOTE (verify-against-real-artifact): these tests prove the WRITE to settings.json;
// they do NOT prove Claude Code renders the bar — that needs a real
// install→restart→observe (DESIGN.md "Manual Verification").

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  reconcileStatusLine,
  writeNativeStatusLine,
  DEFAULT_STATUSLINE_COMMAND,
  OWNERSHIP_MARKER,
} from '../../tools/native-statusline/reconcile-statusline.ts';
import {
  ccstatuslineConfigPath,
  writeCcstatuslineWidgets,
  REQUIRED_WIDGET_TYPES,
} from '../../tools/native-statusline/ccstatusline-widgets.ts';
import { statuslineCheck } from '../../.claude/skills/pomogator-doctor/scripts/engine/checks/statusline.ts';
import { statuslineWidgetsCheck } from '../../.claude/skills/pomogator-doctor/scripts/engine/checks/statusline-widgets.ts';
import type { CheckContext } from '../../.claude/skills/pomogator-doctor/scripts/engine/types.ts';

const REPO_ROOT = process.env.DEV_POMOGATOR_REPO_ROOT ?? path.resolve(__dirname, '..', '..');
const HOOK = path.join(REPO_ROOT, 'tools/native-statusline/install_native_statusline.ts');
const APPLY = path.join(REPO_ROOT, 'tools/native-statusline/apply-statusline.ts');

let tmpHome: string;

function settingsPath(): string {
  return path.join(tmpHome, '.claude', 'settings.json');
}
function writeSettings(obj: unknown): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(obj, null, 2), 'utf-8');
}
function writeRawSettings(raw: string): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), raw, 'utf-8');
}
function readSettings(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')) as Record<string, unknown>;
}

function runHook(envOverride: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', HOOK], {
    input: JSON.stringify({ session_id: 'nsl-test', cwd: tmpHome }),
    encoding: 'utf8',
    env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome, ...envOverride },
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

function makeCtx(): CheckContext {
  return {
    config: null,
    configError: null,
    referencedMcpServers: new Set<string>(),
    installedExtensions: [],
    projectRoot: tmpHome,
    homeDir: tmpHome,
    signal: new AbortController().signal,
    packageVersion: null,
  };
}

describe('NSL001: Native Statusline Auto-Install', () => {
  beforeEach(() => {
    tmpHome = path.join(os.tmpdir(), `nsl-${randomUUID()}`);
    fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true });
  });
  afterEach(() => fs.rmSync(tmpHome, { recursive: true, force: true }));

  // @feature1
  it('NSL001_01: reconciler installs into an empty slot', () => {
    expect(reconcileStatusLine(undefined)).toEqual({
      action: 'install',
      command: DEFAULT_STATUSLINE_COMMAND,
    });
    expect(reconcileStatusLine('   ').action).toBe('install');
  });

  // @feature1
  it('NSL001_02: SessionStart hook writes statusLine into a clean settings.json', () => {
    writeSettings({});
    const res = runHook();
    expect(res.status).toBe(0);
    const sl = readSettings().statusLine as { type?: string; command?: string };
    expect(sl?.type).toBe('command');
    expect(sl?.command).toContain(OWNERSHIP_MARKER);
    const out = JSON.parse(res.stdout) as { systemMessage?: string };
    expect(out.systemMessage).toBeTruthy();
  });

  // @feature1
  it('NSL001_03: writer preserves all other settings.json fields', () => {
    writeSettings({ env: { FOO: 'bar' }, permissions: { allow: ['Read(**)'] } });
    const res = writeNativeStatusLine({ home: tmpHome });
    expect(res).toEqual({ changed: true, action: 'install' });
    const s = readSettings();
    expect(s.env).toEqual({ FOO: 'bar' });
    expect(s.permissions).toEqual({ allow: ['Read(**)'] });
    expect(Object.keys(s).sort()).toEqual(['env', 'permissions', 'statusLine']);
  });

  // @feature2
  it('NSL001_04: a user custom statusLine is never overwritten', () => {
    writeSettings({ statusLine: { type: 'command', command: 'my-custom-bar.sh' } });
    const before = fs.readFileSync(settingsPath(), 'utf-8');
    const res = runHook();
    expect(res.status).toBe(0);
    const sl = readSettings().statusLine as { command?: string };
    expect(sl.command).toBe('my-custom-bar.sh');
    expect(fs.readFileSync(settingsPath(), 'utf-8')).toBe(before); // byte-for-byte unchanged
  });

  // @feature2
  it('NSL001_05: our own marked statusLine is recognised as ours (noop)', () => {
    expect(reconcileStatusLine('npx -y ccstatusline@latest').action).toBe('noop');
    expect(reconcileStatusLine('something with ccstatusline inside').action).toBe('noop');
    expect(reconcileStatusLine('other-bar').action).toBe('keep-user');
  });

  // @feature4
  it('NSL001_06: opt-out switch disables all writes', () => {
    writeSettings({});
    const before = fs.readFileSync(settingsPath(), 'utf-8');
    const res = runHook({ DEV_POMOGATOR_STATUSLINE: 'off' });
    expect(res.status).toBe(0);
    expect(readSettings().statusLine).toBeUndefined();
    expect(fs.readFileSync(settingsPath(), 'utf-8')).toBe(before);
  });

  // @feature5
  it('NSL001_07: second run is idempotent (no write)', () => {
    writeSettings({});
    const first = writeNativeStatusLine({ home: tmpHome });
    expect(first).toEqual({ changed: true, action: 'install' });
    const afterFirst = fs.readFileSync(settingsPath(), 'utf-8');
    const second = writeNativeStatusLine({ home: tmpHome });
    expect(second).toEqual({ changed: false, action: 'noop' });
    expect(fs.readFileSync(settingsPath(), 'utf-8')).toBe(afterFirst);
  });

  // @feature5
  it('NSL001_08: corrupt settings.json is handled fail-open', () => {
    writeRawSettings('{ "statusLine": ');
    const res = runHook();
    expect(res.status).toBe(0);
    // not mutated — still the corrupt bytes
    expect(fs.readFileSync(settingsPath(), 'utf-8')).toBe('{ "statusLine": ');
  });

  // @feature1
  it('NSL001_09: missing settings.json is created with our statusLine', () => {
    // ensure no settings.json (beforeEach created .claude dir only)
    expect(fs.existsSync(settingsPath())).toBe(false);
    const res = runHook();
    expect(res.status).toBe(0);
    const s = readSettings();
    const sl = s.statusLine as { command?: string };
    expect(sl?.command).toContain(OWNERSHIP_MARKER);
    expect(Object.keys(s)).toEqual(['statusLine']);
  });

  // @feature3
  it('NSL001_10: pomogator-doctor detects missing statusLine and writer fixes it', async () => {
    writeSettings({});
    const missing = await statuslineCheck.run(makeCtx());
    const m = Array.isArray(missing) ? missing[0] : missing;
    expect(m?.severity).toBe('warning');
    expect(m?.hint).toBeTruthy();

    // apply the REAL doctor fix-action CLI (current session, explicit user action)
    const apply = spawnSync(process.execPath, ['--import', 'tsx', APPLY], {
      input: '',
      encoding: 'utf8',
      env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
    });
    expect(apply.status).toBe(0);
    const ar = JSON.parse((apply.stdout ?? '').trim()) as { changed?: boolean };
    expect(ar.changed).toBe(true);

    const fixed = await statuslineCheck.run(makeCtx());
    const f = Array.isArray(fixed) ? fixed[0] : fixed;
    expect(f?.severity).toBe('ok');
  });

  // @feature3
  it('NSL001_11: doctor check classifies ours/custom/corrupt correctly', async () => {
    const sev = async () => {
      const r = await statuslineCheck.run(makeCtx());
      return (Array.isArray(r) ? r[0] : r)?.severity;
    };
    // ours (marker present) → ok
    writeSettings({ statusLine: { type: 'command', command: 'npx -y ccstatusline@latest' } });
    expect(await sev()).toBe('ok');
    // custom foreign statusLine → ok (preserved, not our concern)
    writeSettings({ statusLine: { type: 'command', command: 'my-custom-bar.sh' } });
    expect(await sev()).toBe('ok');
    // corrupt settings.json → warning (unreadable, not verified)
    writeRawSettings('{ "statusLine": ');
    expect(await sev()).toBe('warning');
  });
});

// ── FR-11: ccstatusline WIDGET config (repo + cwd on the bar) ────────────────

function widgetsConfigPath(): string {
  return ccstatuslineConfigPath(tmpHome);
}
function writeWidgetsConfig(obj: unknown): void {
  fs.mkdirSync(path.dirname(widgetsConfigPath()), { recursive: true });
  fs.writeFileSync(widgetsConfigPath(), JSON.stringify(obj, null, 2), 'utf-8');
}
function readWidgetsConfig(): { lines: Array<Array<{ type: string }>> } & Record<string, unknown> {
  return JSON.parse(fs.readFileSync(widgetsConfigPath(), 'utf-8')) as {
    lines: Array<Array<{ type: string }>>;
  } & Record<string, unknown>;
}
function widgetTypes(lines: Array<Array<{ type: string }>>): string[] {
  return lines.flat().map((w) => w.type);
}

/**
 * Fixture mirroring the REAL ccstatusline stock default config as the producer
 * writes it (captured 2026-06-05 from a live ~/.config/ccstatusline/settings.json;
 * shape = src/types/Settings.ts zod defaults). No invented fields —
 * .claude/rules/testing/verify-against-real-artifact.md.
 */
function stockDefaultConfig(): Record<string, unknown> {
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

describe('NSL001: ccstatusline widget config (repo + cwd)', () => {
  beforeEach(() => {
    tmpHome = path.join(os.tmpdir(), `nsl-${randomUUID()}`);
    fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true });
  });
  afterEach(() => fs.rmSync(tmpHome, { recursive: true, force: true }));

  // @feature6
  it('NSL001_12: hook seeds a missing widget config with repo and cwd', () => {
    writeSettings({});
    expect(fs.existsSync(widgetsConfigPath())).toBe(false);
    const res = runHook();
    expect(res.status).toBe(0);
    const cfg = readWidgetsConfig();
    const types = widgetTypes(cfg.lines);
    for (const required of REQUIRED_WIDGET_TYPES) {
      expect(types).toContain(required);
    }
    // stock widgets are still there too (we extend the default, not replace it)
    expect(types).toContain('model');
    expect(types).toContain('git-branch');
    // canonical 3-line column: repo+cwd get their OWN line (line 1) — a single
    // line truncates at terminal width and swallows tail widgets (2026-06-06)
    expect(cfg.lines[0].map((w) => w.type)).toEqual(['model', 'separator', 'context-length']);
    expect(cfg.lines[1].map((w) => w.type)).toEqual([
      'git-root-dir',
      'separator',
      'current-working-dir',
    ]);
    expect(cfg.lines[2].map((w) => w.type)).toEqual(['git-branch', 'separator', 'git-changes']);
    const out = JSON.parse(res.stdout) as { systemMessage?: string };
    expect(out.systemMessage).toContain('repo + cwd');
  });

  // @feature6
  it('NSL001_13: hook never mutates an existing widget config (install-only)', () => {
    writeSettings({ statusLine: { type: 'command', command: DEFAULT_STATUSLINE_COMMAND } });
    writeWidgetsConfig(stockDefaultConfig());
    const before = fs.readFileSync(widgetsConfigPath(), 'utf-8');
    const res = runHook();
    expect(res.status).toBe(0);
    expect(fs.readFileSync(widgetsConfigPath(), 'utf-8')).toBe(before); // byte-for-byte
  });

  // @feature7
  it('NSL001_14: doctor fix-action enriches a stock-default widget config', () => {
    writeSettings({ statusLine: { type: 'command', command: DEFAULT_STATUSLINE_COMMAND } });
    writeWidgetsConfig(stockDefaultConfig());
    const res = writeCcstatuslineWidgets({ home: tmpHome, enrichExisting: true });
    expect(res.changed).toBe(true);
    expect(res.action).toBe('enrich');
    const cfg = readWidgetsConfig();
    const types = widgetTypes(cfg.lines);
    for (const required of REQUIRED_WIDGET_TYPES) {
      expect(types).toContain(required);
    }
    // normalized to the canonical 3-line column (repo+cwd on their own line —
    // a single line truncates at terminal width, 2026-06-06 incident)
    expect(cfg.lines[0].map((w) => w.type)).toEqual(['model', 'separator', 'context-length']);
    expect(cfg.lines[1].map((w) => w.type)).toEqual([
      'git-root-dir',
      'separator',
      'current-working-dir',
    ]);
    expect(cfg.lines[2].map((w) => w.type)).toEqual(['git-branch', 'separator', 'git-changes']);
    // unrelated config fields preserved (read-modify-write)
    expect(cfg.flexMode).toBe('full-minus-40');
    expect(cfg.gitCacheTtlSeconds).toBe(5);
    // ids stay unique
    const ids = cfg.lines.flat().map((w) => (w as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // @feature7
  it('NSL001_15: a customized widget layout is never enriched', () => {
    const custom = stockDefaultConfig();
    (custom.lines as Array<Array<Record<string, string>>>)[0].push({
      id: '8',
      type: 'custom-text',
    });
    writeWidgetsConfig(custom);
    const before = fs.readFileSync(widgetsConfigPath(), 'utf-8');
    const res = writeCcstatuslineWidgets({ home: tmpHome, enrichExisting: true });
    expect(res).toMatchObject({ changed: false, action: 'keep-user' });
    expect(fs.readFileSync(widgetsConfigPath(), 'utf-8')).toBe(before);
  });

  // @feature7
  it('NSL001_16: widget enrichment is idempotent (second run is noop)', () => {
    writeWidgetsConfig(stockDefaultConfig());
    const first = writeCcstatuslineWidgets({ home: tmpHome, enrichExisting: true });
    expect(first.changed).toBe(true);
    const afterFirst = fs.readFileSync(widgetsConfigPath(), 'utf-8');
    const second = writeCcstatuslineWidgets({ home: tmpHome, enrichExisting: true });
    expect(second).toMatchObject({ changed: false, action: 'noop' });
    expect(fs.readFileSync(widgetsConfigPath(), 'utf-8')).toBe(afterFirst);
  });

  // @feature8
  it('NSL001_17: doctor detects stock config missing repo/cwd; fix-action resolves it', async () => {
    writeSettings({ statusLine: { type: 'command', command: DEFAULT_STATUSLINE_COMMAND } });
    writeWidgetsConfig(stockDefaultConfig());

    const missing = await statuslineWidgetsCheck.run(makeCtx());
    const m = Array.isArray(missing) ? missing[0] : missing;
    expect(m?.severity).toBe('warning');
    expect(m?.message).toContain('git-root-dir');
    expect(m?.message).toContain('current-working-dir');
    expect(m?.hint).toBeTruthy();

    // apply the REAL doctor fix-action CLI (explicit user action → enrich)
    const apply = spawnSync(process.execPath, ['--import', 'tsx', APPLY], {
      input: '',
      encoding: 'utf8',
      env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
    });
    expect(apply.status).toBe(0);
    const ar = JSON.parse((apply.stdout ?? '').trim()) as {
      widgets?: { changed?: boolean; action?: string };
    };
    expect(ar.widgets?.changed).toBe(true);
    expect(ar.widgets?.action).toBe('enrich');

    const fixed = await statuslineWidgetsCheck.run(makeCtx());
    const f = Array.isArray(fixed) ? fixed[0] : fixed;
    expect(f?.severity).toBe('ok');
  });

  // @feature7
  it('NSL001_19: previous dev-pomogator single-line layout migrates to the column', () => {
    // yesterday's revision: our widgets tail-appended to the stock single line
    const old = stockDefaultConfig();
    (old.lines as Array<Array<Record<string, unknown>>>)[0].push(
      { id: '8', type: 'separator' },
      { id: '9', type: 'git-root-dir', color: 'cyan' },
      { id: '10', type: 'separator' },
      { id: '11', type: 'current-working-dir', color: 'blue', metadata: { abbreviateHome: 'true' } },
    );
    writeWidgetsConfig(old);
    const res = writeCcstatuslineWidgets({ home: tmpHome, enrichExisting: true });
    expect(res).toMatchObject({ changed: true, action: 'enrich' });
    const cfg = readWidgetsConfig();
    expect(cfg.lines[1].map((w) => w.type)).toEqual([
      'git-root-dir',
      'separator',
      'current-working-dir',
    ]);
    expect(cfg.flexMode).toBe('full-minus-40'); // other fields preserved
  });

  // @feature8
  it('NSL001_18: widgets check defers to C-NSL and respects custom layouts', async () => {
    const sev = async () => {
      const r = await statuslineWidgetsCheck.run(makeCtx());
      return (Array.isArray(r) ? r[0] : r)?.severity;
    };
    // no statusLine at all → ok here (C-NSL owns that warning — no double-report)
    writeSettings({});
    expect(await sev()).toBe('ok');
    // foreign statusLine → ok (widget config not applicable)
    writeSettings({ statusLine: { type: 'command', command: 'my-custom-bar.sh' } });
    expect(await sev()).toBe('ok');
    // ccstatusline + customized layout missing repo/cwd → ok (left untouched)
    writeSettings({ statusLine: { type: 'command', command: DEFAULT_STATUSLINE_COMMAND } });
    const custom = stockDefaultConfig();
    (custom.lines as Array<Array<Record<string, string>>>)[0].push({
      id: '8',
      type: 'session-clock',
    });
    writeWidgetsConfig(custom);
    expect(await sev()).toBe('ok');
    // ccstatusline + missing config file → warning (stock render has no repo/cwd)
    fs.rmSync(widgetsConfigPath());
    expect(await sev()).toBe('warning');
  });
});
