/**
 * Step definitions for CMEM001 @feature7: the claude-mem worker REAPER
 * (tools/claude-mem-health/health-check.ts). Drives REAL code only — no mocks:
 *   - the pure decision fn `reaperDecision` (imported in-process, exercised by a Scenario Outline),
 *   - the real reaper hook spawned through its real bootstrap launcher, using its env seams
 *     (CLAUDE_MEM_REAPER_SNAPSHOT = synthetic OS state, CLAUDE_MEM_REAPER_KILL_RECORD =
 *     record-instead-of-kill, CLAUDE_MEM_REAPER_HOME = fake home) so no real process is signalled.
 * Per-scenario isolation comes from the V4World fresh `tempDir`.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import {
  reaperDecision,
  type ProcRecord,
  type ReaperVerdict,
} from '../../tools/claude-mem-health/health-check.ts';
import {
  assertLegacyTargetContract,
  assertRouteContract,
  loadHookDispatcherContracts,
} from './support/hook-dispatcher.ts';

const REPO = process.env.APP_DIR || process.cwd();
const HOOK_REL = 'tools/claude-mem-health/health-check.ts';

// Real command-line shapes captured live from a wedged Windows host (2026-07-03).
const CHROMA_ORPHAN: ProcRecord = {
  pid: 27200,
  ppid: 36924,
  parentAlive: false,
  cmdline: 'chroma-mcp.exe --client-type persistent --data-dir C:/Users/stigm/.claude-mem/vector-db',
};
const FOREIGN_ORPHAN: ProcRecord = {
  pid: 999,
  ppid: 1,
  parentAlive: false,
  cmdline: 'C:/Users/stigm/AppData/Local/uv/cache/xx/Scripts/python.exe unrelated_tool.py',
};

function procsForName(name: string): ProcRecord[] {
  switch (name) {
    case 'chroma':
      return [CHROMA_ORPHAN];
    case 'foreign':
      return [FOREIGN_ORPHAN];
    case 'chroma+foreign':
      return [CHROMA_ORPHAN, FOREIGN_ORPHAN];
    case 'none':
      return [];
    default:
      return [];
  }
}

interface ReaperWorld extends V4World {
  reaperVerdict: ReaperVerdict;
  reaperSnapshot: Record<string, unknown>;
  reaperKills: number[];
  reaperExit: number;
  reaperStdout: string;
  reaperHome: string;
  reaperExtraEnv: Record<string, string>;
  reaperProbeRecord: string;
  canonicalHooks: Record<string, unknown>;
  dogfoodHooks: Record<string, unknown>;
  codexHooks: Record<string, unknown>;
}

// ---- pure decision (Scenario Outline @feature7) ----

Given(
  /^a reaper snapshot platform=(\S+) healthOk=(\S+) portListening=(\S+) portOwnerAlive=(\S+) procs=(\S+)$/,
  function (this: ReaperWorld, platform: string, healthOk: string, listening: string, ownerAlive: string, procs: string) {
    this.reaperSnapshot = {
      platform,
      healthOk: healthOk === 'true',
      portListening: listening === 'true',
      portOwnerAlive: ownerAlive === 'true',
      procs: procsForName(procs),
    };
  },
);

When('the claude-mem reaper decision is computed', function (this: ReaperWorld) {
  const s = this.reaperSnapshot;
  this.reaperVerdict = reaperDecision({
    platform: s.platform as NodeJS.Platform,
    healthOk: s.healthOk as boolean,
    portListening: s.portListening as boolean,
    portOwnerAlive: s.portOwnerAlive as boolean,
    procs: s.procs as ProcRecord[],
  });
});

Then('the reaper action is {string}', function (this: ReaperWorld, action: string) {
  assert.equal(this.reaperVerdict.action, action);
});

Then('the reaper kills pids {string}', function (this: ReaperWorld, pids: string) {
  const expected = pids.trim() ? pids.split(',').map((x) => Number(x.trim())) : [];
  assert.deepEqual(this.reaperVerdict.killPids, expected);
});

// ---- real hook integration (@feature7) via env seams ----

function writeSnapshot(world: ReaperWorld, snap: Record<string, unknown>): string {
  const p = path.join(world.tempDir, 'reaper-snap.json');
  fs.writeFileSync(p, JSON.stringify(snap));
  return p;
}

function ensureReaperHome(world: ReaperWorld): string {
  if (world.reaperHome) return world.reaperHome;
  world.reaperHome = path.join(world.tempDir, 'home');
  return world.reaperHome;
}

function ensureExtraEnv(world: ReaperWorld): Record<string, string> {
  if (!world.reaperExtraEnv) world.reaperExtraEnv = {};
  return world.reaperExtraEnv;
}

function runReaperHook(world: ReaperWorld, extraEnv: Record<string, string> = {}): void {
  const snapPath = writeSnapshot(world, world.reaperSnapshot);
  const killRecord = path.join(world.tempDir, 'reaper-kills.json');
  const home = ensureReaperHome(world);
  const res = spawnSync(
    process.execPath,
    ['-e', "require(require('path').resolve('tools/_shared/bootstrap.cjs'))", '--', HOOK_REL],
    {
      input: '{}',
      encoding: 'utf-8',
      cwd: REPO,
      timeout: 30000,
      env: {
        ...process.env,
        ...ensureExtraEnv(world),
        ...extraEnv,
        CLAUDE_MEM_REAPER_SNAPSHOT: snapPath,
        CLAUDE_MEM_REAPER_KILL_RECORD: killRecord,
        CLAUDE_MEM_REAPER_HOME: home,
      },
    },
  );
  world.reaperExit = res.status ?? -1;
  world.reaperStdout = res.stdout ?? '';
  world.reaperKills = fs.existsSync(killRecord)
    ? (JSON.parse(fs.readFileSync(killRecord, 'utf-8')) as number[])
    : [];
}

Given('a simulated Windows wedge snapshot with an orphaned chroma-mcp and an unrelated python', function (this: ReaperWorld) {
  this.reaperSnapshot = {
    platform: 'win32',
    healthOk: false,
    portListening: true,
    portOwnerPid: 23892,
    portOwnerAlive: false,
    procs: [CHROMA_ORPHAN, FOREIGN_ORPHAN],
  };
});

Given('a simulated healthy worker snapshot', function (this: ReaperWorld) {
  this.reaperSnapshot = {
    platform: 'win32',
    healthOk: true,
    portListening: true,
    portOwnerPid: 1000,
    portOwnerAlive: true,
    procs: [CHROMA_ORPHAN],
  };
});

Given(/^a fake claude-mem home with (\d+) consecutive hook failures$/, function (this: ReaperWorld, n: string) {
  const home = ensureReaperHome(this);
  const stateDir = path.join(home, '.claude-mem', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'hook-failures.json'),
    JSON.stringify({ consecutiveFailures: Number(n), lastFailureAt: 1 }),
  );
});

Given('a recent mid-session reaper check already ran', function (this: ReaperWorld) {
  const home = ensureReaperHome(this);
  const stateDir = path.join(home, '.claude-mem', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'dev-pomogator-reaper.json'), JSON.stringify({ lastCheckAt: 10_000 }));
  this.reaperProbeRecord = path.join(this.tempDir, 'reaper-probes.json');
  ensureExtraEnv(this).CLAUDE_MEM_REAPER_MID_SESSION = '1';
  ensureExtraEnv(this).CLAUDE_MEM_REAPER_NOW_MS = '10001';
  ensureExtraEnv(this).CLAUDE_MEM_REAPER_DEBOUNCE_MS = '10000';
  ensureExtraEnv(this).CLAUDE_MEM_REAPER_PROBE_RECORD = this.reaperProbeRecord;
});

Given('claude-mem reaping is disabled by environment', function (this: ReaperWorld) {
  ensureExtraEnv(this).DEV_POMOGATOR_CLAUDE_MEM_REAP = 'off';
  ensureExtraEnv(this).CLAUDE_MEM_REAPER_MID_SESSION = '1';
});

Given('a simulated unavailable claude-mem worker has been down longer than the visibility threshold', function (this: ReaperWorld) {
  this.reaperSnapshot = {
    platform: 'win32',
    healthOk: false,
    portListening: false,
    portOwnerAlive: false,
    procs: [],
  };
  const home = ensureReaperHome(this);
  const stateDir = path.join(home, '.claude-mem', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'dev-pomogator-reaper.json'), JSON.stringify({ downSince: 1_000, lastCheckAt: 0 }));
  ensureExtraEnv(this).CLAUDE_MEM_REAPER_MID_SESSION = '1';
  ensureExtraEnv(this).CLAUDE_MEM_REAPER_NOW_MS = '20000';
  ensureExtraEnv(this).CLAUDE_MEM_REAPER_DOWN_VISIBILITY_MS = '10000';
});

Given('the dev-pomogator hook manifests are available', function (this: ReaperWorld) {
  this.canonicalHooks = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'hooks.json'), 'utf-8')) as Record<string, unknown>;
  this.dogfoodHooks = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf-8')) as Record<string, unknown>;
  this.codexHooks = JSON.parse(fs.readFileSync(path.join(REPO, '.codex', 'hooks.json'), 'utf-8')) as Record<string, unknown>;
});

When('the claude-mem reaper hook runs', function (this: ReaperWorld) {
  runReaperHook(this);
});

When('the claude-mem mid-session guard runs before a tool call', function (this: ReaperWorld) {
  runReaperHook(this, { CLAUDE_MEM_REAPER_MID_SESSION: '1' });
});

Then('the recorded kills are exactly the chroma-mcp pid', function (this: ReaperWorld) {
  assert.deepEqual(this.reaperKills, [CHROMA_ORPHAN.pid]);
});

Then('no kills are recorded', function (this: ReaperWorld) {
  assert.deepEqual(this.reaperKills, []);
});

Then('the reaper hook-failures counter is reset to 0', function (this: ReaperWorld) {
  const p = path.join(this.reaperHome, '.claude-mem', 'state', 'hook-failures.json');
  const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as { consecutiveFailures: number };
  assert.equal(data.consecutiveFailures, 0);
});

Then('the reaper hook exits 0 with a continue payload', function (this: ReaperWorld) {
  assert.equal(this.reaperExit, 0);
  assert.match(this.reaperStdout, /"continue"\s*:\s*true/);
});

Then('no worker health probe is attempted', function (this: ReaperWorld) {
  const probes = this.reaperProbeRecord && fs.existsSync(this.reaperProbeRecord)
    ? (JSON.parse(fs.readFileSync(this.reaperProbeRecord, 'utf-8')) as number[])
    : [];
  assert.deepEqual(probes, []);
});

When('the claude-mem hook registrations are inspected', function (this: ReaperWorld) {
  for (const config of [this.canonicalHooks, this.dogfoodHooks, this.codexHooks]) {
    const hooks = config.hooks as Record<string, unknown> | undefined;
    assert.ok(hooks, 'shipped manifest must expose hooks');
    assert.ok(Array.isArray(hooks.SessionStart), 'shipped manifest must expose SessionStart hooks');
  }
});

type HookEntry = { matcher?: string; hooks?: Array<{ command?: string; timeout?: number }> };

function hookEntries(config: Record<string, unknown>, event: 'SessionStart' | 'PreToolUse'): HookEntry[] {
  const hooks = config.hooks as Record<string, unknown> | undefined;
  const entries = hooks?.[event];
  assert.ok(Array.isArray(entries), `${event} registrations must be an array`);
  return entries as HookEntry[];
}

function assertSessionStartLifecycle(config: Record<string, unknown>, rootEnv: 'CLAUDE_PLUGIN_ROOT' | 'CLAUDE_PROJECT_DIR'): void {
  const commands = hookEntries(config, 'SessionStart').flatMap((entry) => entry.hooks ?? []);
  for (const [tool, timeout] of [
    ['tools/claude-mem-health/health-check.ts', 120],
    ['tools/claude-mem-bootstrap/install-claude-mem.ts', 30],
  ] as const) {
    assert.ok(commands.some((hook) =>
      hook.command?.includes(rootEnv) && hook.command.includes(tool) && hook.timeout === timeout,
    ), `SessionStart must register ${tool} through ${rootEnv} with timeout ${timeout}`);
  }
}

function assertReaperPreToolUse(config: Record<string, unknown>, rootEnv: 'CLAUDE_PLUGIN_ROOT' | 'CLAUDE_PROJECT_DIR'): void {
  const entries = hookEntries(config, 'PreToolUse');
  assert.ok(entries.some((entry) =>
    (entry.matcher === '' || entry.matcher === '*') &&
    entry.hooks?.some((hook) =>
      hook.command?.includes(rootEnv) &&
      hook.command.includes('tools/claude-mem-health/health-check.ts') &&
      hook.command.includes('--mid-session') &&
      hook.timeout === 15,
    ),
  ), `PreToolUse must register the mid-session reaper through ${rootEnv}`);
}

function assertManagedSessionStartLifecycle(): void {
  const contracts = loadHookDispatcherContracts(REPO);
  assert.equal(
    contracts.generatedEntries.filter((entry) => entry.event === 'SessionStart').length,
    1,
    'generated manifest must expose one supervised SessionStart bootstrap',
  );
  assert.match(
    contracts.generatedEntries.find((entry) => entry.event === 'SessionStart')?.command ?? '',
    /tools\/hook-service\/session-bootstrap\.mjs/,
  );
  for (const [target, timeout] of [
    ['tools/claude-mem-health/health-check.ts', 120],
    ['tools/claude-mem-bootstrap/install-claude-mem.ts', 30],
  ] as const) {
    assertLegacyTargetContract(contracts, {
      target,
      event: 'SessionStart',
      matcher: '',
      timeout,
      args: [],
    });
  }
}

Then('the canonical plugin manifest registers the SessionStart lifecycle hooks', function (this: ReaperWorld) {
  assertManagedSessionStartLifecycle();
});

Then('the dogfood settings register the SessionStart lifecycle hooks', function (this: ReaperWorld) {
  assertManagedSessionStartLifecycle();
});

Then('the Codex hooks register the SessionStart lifecycle hooks', function (this: ReaperWorld) {
  assertSessionStartLifecycle(this.codexHooks, 'CLAUDE_PROJECT_DIR');
});

function assertManagedReaperPreToolUse(): void {
  const resolved = assertRouteContract(loadHookDispatcherContracts(REPO), {
    target: 'tools/claude-mem-health/health-check.ts',
    event: 'PreToolUse',
    matcher: '',
    timeout: 15,
    args: ['--mid-session'],
  });
  assert.match(resolved.entry.command, /tools\/hook-service\/client\.mjs/);
}

Then('the canonical plugin manifest registers the reaper on PreToolUse', function (this: ReaperWorld) {
  assertManagedReaperPreToolUse();
});

Then('the dogfood settings register the reaper on PreToolUse', function (this: ReaperWorld) {
  assertManagedReaperPreToolUse();
});

Then('the guard emits a visible memory-not-recording warning', function (this: ReaperWorld) {
  assert.match(this.reaperStdout, /claude-mem недоступен/);
  assert.doesNotMatch(this.reaperStdout, /"suppressOutput"\s*:\s*true/);
});
