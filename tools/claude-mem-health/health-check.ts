// SessionStart hook: claude-mem worker REAPER (heals a wedged worker on Windows).
//
// Why this exists (root cause, proven live 2026-07-03):
//   claude-mem runs a background worker on a fixed Windows port (37700 + (getuid ?? 77) % 100
//   → always 37777, because getuid is undefined on Windows). Under load its observer LLM aborts
//   on timeout and returns empty output; after 3 in a row claude-mem declares the SDK session
//   "poisoned" and SIGKILLs the worker's process group. The worker had spawned `chroma-mcp` as a
//   child, which INHERITED the 37777 listening-socket handle (Windows inherits handles by
//   default). SIGKILL kills the worker but the orphaned `chroma-mcp` survives and keeps the socket
//   open under the now-dead worker PID → every new worker fails with "Is port 37777 in use?" →
//   hooks flood `hook-failures.json` → at the fail-loud threshold the plugin does process.exit(2)
//   = a BLOCKING error on every tool call, in every project, until the worker is reachable again.
//
//   Upstream never self-heals this on Windows (issues #415/#1531/#2111/#213/#729), and its own
//   advice is "reboot". But the socket is NOT a true kernel zombie — it is held by a LIVE orphan
//   child. Killing that orphan frees the port immediately, no reboot, no port change. Proven:
//   Get-NetTCPConnection :37777 → dead owner PID; taskkill the orphaned chroma-mcp tree →
//   "PORT 37777 FREE" → next hook lazy-spawns a healthy worker.
//
// What this hook does, on SessionStart:
//   1. Probe the worker's /api/health. Healthy → do nothing (NEVER touch a live worker).
//   2. Unhealthy → snapshot the port owner + claude-mem process table (PowerShell).
//   3. If the port is bound by a DEAD PID (the wedge signature) → kill only the orphaned
//      processes whose command line carries a claude-mem signature AND whose parent is dead.
//      Reset the hook-failures counter so the exit(2) block clears at once.
//
// Contract: FAST, NON-BLOCKING, FAIL-OPEN (any error → {continue:true}, never throws/blocks),
// builtins-only (ships in the plugin, runs with no node_modules — dead-integration-guard),
// surgical matcher (only claude-mem's own orphans holding claude-mem's own wedged port).
//
// (Replaces the former Chroma:8000 heartbeat check, which targeted a pre-v13 architecture the
//  worker no longer uses.)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { log as logShared } from '../_shared/hook-utils.ts';

const LOG_PREFIX = 'claude-mem-reaper';
const VERBOSE = process.env.DEV_POMOGATOR_HOOK_VERBOSE === '1';
const DEFAULT_PORT = 37777;
const HEALTH_TIMEOUT_MS = 1500;
const PS_TIMEOUT_MS = 8000;

function log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', msg: string): void {
  if (level !== 'ERROR' && !VERBOSE) return;
  try {
    logShared(level, LOG_PREFIX, msg);
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// Pure core (the BDD target — zero OS contact, never kills anything)
// ---------------------------------------------------------------------------

export interface ProcRecord {
  pid: number;
  ppid: number;
  parentAlive: boolean;
  cmdline: string;
}

export interface ReaperInput {
  platform: NodeJS.Platform;
  healthOk: boolean;
  portListening: boolean;
  /** Is the process that OWNS the listening socket still alive? */
  portOwnerAlive: boolean;
  procs: ProcRecord[];
}

export type ReaperAction =
  | 'skip-not-windows'
  | 'skip-healthy'
  | 'skip-not-wedged'
  | 'skip-owner-alive'
  | 'reap';

export interface ReaperVerdict {
  action: ReaperAction;
  killPids: number[];
  reason: string;
}

// A process is a claude-mem worker/child ONLY if its command line carries one of these
// signatures. This is the safety boundary: bare `python.exe`/`node.exe` (e.g. an unrelated uv
// tool) never matches — orphaned chroma-mcp children die via the tree-kill of their matched root.
const RE_WORKER = /claude-mem[\\/][^"'\s]*worker-service\.cjs/i; // the bun/node worker daemon
const RE_MEM_DATADIR = /[\\/]\.claude-mem[\\/]/i; // anything pointed at the ~/.claude-mem data dir (chroma-mcp --data-dir)
const RE_CHROMA = /chroma-mcp/i;

export function matchesClaudeMemSignature(cmdline: string): boolean {
  if (!cmdline) return false;
  if (RE_WORKER.test(cmdline)) return true;
  if (RE_MEM_DATADIR.test(cmdline)) return true;
  if (RE_CHROMA.test(cmdline) && /\.claude-mem/i.test(cmdline)) return true;
  return false;
}

/**
 * Decide what to reap from an already-observed OS snapshot. Pure — safe to unit/BDD-test with
 * synthetic process tables; it never touches the OS and never signals a process.
 */
export function reaperDecision(input: ReaperInput): ReaperVerdict {
  if (input.platform !== 'win32') {
    return { action: 'skip-not-windows', killPids: [], reason: 'not Windows' };
  }
  if (input.healthOk) {
    return { action: 'skip-healthy', killPids: [], reason: 'worker healthy — leaving it alone' };
  }
  if (!input.portListening) {
    return { action: 'skip-not-wedged', killPids: [], reason: 'port free — worker just down, will lazy-spawn' };
  }
  if (input.portOwnerAlive) {
    return { action: 'skip-owner-alive', killPids: [], reason: 'port owner alive (may be booting) — not killing' };
  }
  // Wedge signature: port is LISTENING but its owning PID is DEAD → the socket is held by an
  // inherited handle in a live orphan. Kill orphaned processes carrying a claude-mem signature.
  const killPids = input.procs
    .filter((p) => p.parentAlive === false && matchesClaudeMemSignature(p.cmdline))
    .map((p) => p.pid);
  return {
    action: 'reap',
    killPids,
    reason: killPids.length
      ? `wedged: reaping ${killPids.length} orphaned claude-mem holder(s)`
      : 'wedged but no orphaned claude-mem holder found (may need manual restart)',
  };
}

// ---------------------------------------------------------------------------
// OS observation + action (thin main; both sides are env-seamed for tests)
// ---------------------------------------------------------------------------

interface Snapshot {
  portListening: boolean;
  portOwnerPid: number | null;
  portOwnerAlive: boolean;
  procs: ProcRecord[];
}

/**
 * A test snapshot fixture (CLAUDE_MEM_REAPER_SNAPSHOT) may additionally simulate the whole OS —
 * platform + worker health — so integration scenarios can exercise a Windows wedge on a Linux CI.
 */
interface SnapshotFixture extends Snapshot {
  platform?: NodeJS.Platform;
  healthOk?: boolean;
}

const EMPTY_SNAPSHOT: Snapshot = { portListening: false, portOwnerPid: null, portOwnerAlive: false, procs: [] };

/** Home dir for reads/writes — overridable in tests (os.homedir() ignores $HOME on POSIX). */
function resolveHome(explicit?: string): string {
  return explicit || process.env.CLAUDE_MEM_REAPER_HOME || os.homedir();
}

export function readWorkerPort(homeDir: string): number {
  try {
    const raw = fs.readFileSync(path.join(homeDir, '.claude-mem', 'settings.json'), 'utf-8');
    const p = parseInt(String((JSON.parse(raw) as Record<string, unknown>).CLAUDE_MEM_WORKER_PORT), 10);
    if (Number.isFinite(p) && p > 0) return p;
  } catch {
    /* absent/malformed → default */
  }
  return DEFAULT_PORT;
}

function probeHealth(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: HEALTH_TIMEOUT_MS },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function findWindowsPowerShell(): string {
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return 'powershell.exe';
}

function snapshotPowerShell(port: number): string {
  // Emits one JSON line: { portListening, portOwnerPid, portOwnerAlive, procs:[{pid,ppid,parentAlive,cmdline}] }.
  // The proc list is PRE-filtered broadly here for perf/size; the authoritative kill filter is
  // matchesClaudeMemSignature() in JS. -Compress + a forced array keep the shape stable.
  return [
    `$ErrorActionPreference='SilentlyContinue';`,
    `$port=${port};`,
    `$c=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1;`,
    `$ownerPid=if($c){[int]$c.OwningProcess}else{$null};`,
    `$listening=[bool]$c;`,
    `$ownerAlive=if($ownerPid){[bool](Get-Process -Id $ownerPid -ErrorAction SilentlyContinue)}else{$false};`,
    `$procs=@();`,
    `foreach($p in Get-CimInstance Win32_Process -ErrorAction SilentlyContinue){`,
    `  $cl="$($p.CommandLine)";`,
    `  if($cl -match 'claude-mem|chroma-mcp|worker-service\\.cjs'){`,
    `    $pa=[bool](Get-Process -Id $p.ParentProcessId -ErrorAction SilentlyContinue);`,
    `    $procs+=[pscustomobject]@{pid=[int]$p.ProcessId;ppid=[int]$p.ParentProcessId;parentAlive=$pa;cmdline=$cl}`,
    `  }`,
    `};`,
    `[pscustomobject]@{portListening=$listening;portOwnerPid=$ownerPid;portOwnerAlive=$ownerAlive;procs=@($procs)} | ConvertTo-Json -Depth 4 -Compress`,
  ].join(' ');
}

function normalizeProcs(procs: unknown): ProcRecord[] {
  const arr = Array.isArray(procs) ? procs : procs ? [procs] : [];
  return arr
    .map((p) => {
      const r = p as Record<string, unknown>;
      return {
        pid: Number(r.pid),
        ppid: Number(r.ppid),
        parentAlive: Boolean(r.parentAlive),
        cmdline: String(r.cmdline ?? ''),
      };
    })
    .filter((p) => Number.isFinite(p.pid) && p.pid > 0);
}

function gatherSnapshot(port: number): Snapshot {
  // Real Windows OS observation via PowerShell. (Tests inject state via CLAUDE_MEM_REAPER_SNAPSHOT,
  // handled up in reapWedgedWorker, so this path never runs under test.)
  if (process.platform !== 'win32') return EMPTY_SNAPSHOT;
  try {
    const ps = findWindowsPowerShell();
    const r = spawnSync(
      ps,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', snapshotPowerShell(port)],
      { windowsHide: true, timeout: PS_TIMEOUT_MS, encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 },
    );
    if (r.status !== 0 || !r.stdout) return EMPTY_SNAPSHOT;
    const s = JSON.parse(r.stdout.trim()) as Snapshot;
    return { ...EMPTY_SNAPSHOT, ...s, procs: normalizeProcs(s.procs) };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function killTree(pid: number): void {
  // Action seam: tests record the intended kill instead of signalling a real process.
  const record = process.env.CLAUDE_MEM_REAPER_KILL_RECORD;
  if (record) {
    try {
      const prev = fs.existsSync(record) ? (JSON.parse(fs.readFileSync(record, 'utf-8')) as number[]) : [];
      prev.push(pid);
      fs.writeFileSync(record, JSON.stringify(prev));
    } catch {
      /* best-effort */
    }
    return;
  }
  try {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
  } catch {
    /* best-effort */
  }
}

/** FR-7a: clear the fail-loud counter so the exit(2) block lifts immediately. Atomic write. */
function resetHookFailures(homeDir: string): void {
  try {
    const p = path.join(homeDir, '.claude-mem', 'state', 'hook-failures.json');
    if (!fs.existsSync(p)) return;
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ consecutiveFailures: 0, lastFailureAt: 0 }));
    fs.renameSync(tmp, p);
  } catch {
    /* best-effort */
  }
}

async function drainStdin(): Promise<void> {
  try {
    for await (const _chunk of process.stdin) {
      /* consume — hook protocol */
    }
  } catch {
    /* best-effort */
  }
}

function writeContinue(): void {
  try {
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  } catch {
    /* best-effort */
  }
}

/** Exposed for the doctor auto-fix action: run the reaper once and return what it did. */
export async function reapWedgedWorker(homeDir?: string): Promise<ReaperVerdict> {
  const home = resolveHome(homeDir);
  let platform: NodeJS.Platform = process.platform;
  let healthOk: boolean;
  let snap: Snapshot;

  const fixturePath = process.env.CLAUDE_MEM_REAPER_SNAPSHOT;
  if (fixturePath) {
    // Test/simulation mode: the fixture is the entire OS truth (platform, health, port, procs).
    let f: SnapshotFixture;
    try {
      f = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as SnapshotFixture;
    } catch {
      f = { ...EMPTY_SNAPSHOT };
    }
    platform = f.platform ?? 'win32';
    healthOk = f.healthOk ?? false;
    snap = { ...EMPTY_SNAPSHOT, ...f, procs: normalizeProcs(f.procs) };
  } else {
    if (platform !== 'win32') {
      return reaperDecision({ platform, healthOk: true, portListening: false, portOwnerAlive: false, procs: [] });
    }
    const port = readWorkerPort(home);
    healthOk = await probeHealth(port);
    snap = healthOk ? EMPTY_SNAPSHOT : gatherSnapshot(port); // skip PowerShell when the worker is fine
  }

  const verdict = reaperDecision({
    platform,
    healthOk,
    portListening: !!snap.portListening,
    portOwnerAlive: !!snap.portOwnerAlive,
    procs: snap.procs,
  });
  if (verdict.action === 'reap') {
    for (const pid of verdict.killPids) killTree(pid);
    resetHookFailures(home);
  }
  return verdict;
}

async function main(): Promise<void> {
  await drainStdin();

  if ((process.env.DEV_POMOGATOR_CLAUDE_MEM_REAP ?? '').toLowerCase() === 'off') {
    log('DEBUG', 'opt-out (DEV_POMOGATOR_CLAUDE_MEM_REAP=off)');
    return writeContinue();
  }
  // Non-Windows: nothing to reap (the fixed-port/inherited-handle bug is Windows-only).
  if (process.platform !== 'win32' && !process.env.CLAUDE_MEM_REAPER_SNAPSHOT) {
    log('DEBUG', 'not Windows — skipping');
    return writeContinue();
  }

  const verdict = await reapWedgedWorker();
  if (verdict.action === 'reap') {
    log('INFO', `${verdict.reason}; pids=${verdict.killPids.join(',') || '(none)'}`);
  } else {
    log('DEBUG', `no reap: ${verdict.action}`);
  }
  writeContinue();
}

// SessionStart: exit 0 = continue. Never block, never throw.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => {
      log('ERROR', `skipped: ${e && (e as Error).message ? (e as Error).message : e}`);
      writeContinue();
    })
    .finally(() => process.exit(0));
}
