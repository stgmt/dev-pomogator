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
  const home = path.join(this.tempDir, 'home');
  const stateDir = path.join(home, '.claude-mem', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'hook-failures.json'),
    JSON.stringify({ consecutiveFailures: Number(n), lastFailureAt: 1 }),
  );
  this.reaperHome = home;
});

When('the claude-mem reaper hook runs', function (this: ReaperWorld) {
  const snapPath = writeSnapshot(this, this.reaperSnapshot);
  const killRecord = path.join(this.tempDir, 'reaper-kills.json');
  const home = this.reaperHome || path.join(this.tempDir, 'home');
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
        CLAUDE_MEM_REAPER_SNAPSHOT: snapPath,
        CLAUDE_MEM_REAPER_KILL_RECORD: killRecord,
        CLAUDE_MEM_REAPER_HOME: home,
      },
    },
  );
  this.reaperExit = res.status ?? -1;
  this.reaperStdout = res.stdout ?? '';
  this.reaperKills = fs.existsSync(killRecord)
    ? (JSON.parse(fs.readFileSync(killRecord, 'utf-8')) as number[])
    : [];
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
