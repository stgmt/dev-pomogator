// SessionStart + PreToolUse + UserPromptSubmit hook: claude-mem worker REAPER (heals a wedged worker on Windows).
//
// Why this exists (root cause, proven live 2026-07):
//   claude-mem injects memory via hooks that call a background worker on a fixed Windows port
//   (37700 + (getuid ?? 77) % 100 → 37777 on Windows). When that worker is unavailable but the
//   port is still held, the upstream hook can wait until Claude Code's 60s hook budget expires.
//   The recurring live triggers were version-mismatch worker recycle plus fixed-port rebind
//   failure: the successor worker cannot start (`Is port 37777 in use?`) while an orphaned
//   claude-mem child such as `chroma-mcp` still owns the socket handle.
//
//   Upstream never self-heals this on Windows. Rebooting is not a fix: the socket is usually held
//   by a LIVE orphan child, not by an unfixable kernel zombie. Killing only that claude-mem orphan
//   frees the port immediately; the next hook lazy-spawns a healthy worker.
//
// What this hook does:
//   1. Probe the worker's /api/health. Healthy → do nothing (NEVER touch a live worker).
//   2. Unhealthy → snapshot the port owner + claude-mem process table (PowerShell).
//   3. If the port is bound by a DEAD PID (the wedge signature) → kill only the orphaned
//      processes whose command line carries a claude-mem signature AND whose parent is dead, or
//      the proven blank-command-line chroma root with a direct Python child. Reset the
//      hook-failures counter only after the SAME configured port is observed free.
//   4. In PreToolUse/UserPromptSubmit mode, debounce normal full checks, force a bounded prompt
//      preflight, and emit a visible, non-blocking warning if memory stays down across checks.
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { log as logShared } from '../_shared/hook-utils.ts';

const LOG_PREFIX = 'claude-mem-reaper';
const VERBOSE = process.env.DEV_POMOGATOR_HOOK_VERBOSE === '1';
const DEFAULT_PORT = 37777;
const HEALTH_TIMEOUT_MS = 1500;
const PS_TIMEOUT_MS = 8000;
const DEFAULT_MID_SESSION_DEBOUNCE_MS = 10_000;
const DEFAULT_DOWN_VISIBILITY_MS = 5 * 60_000;
const DEFAULT_ELEVATION_COOLDOWN_MS = 2 * 60_000;
const ELEVATED_REAPER_HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'elevated-reaper.ps1');

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
  /** Process image name. Present even when Windows denies CommandLine inspection. */
  name?: string;
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
  /** Recovery is true only after the originally configured port is observed free. */
  recovery?: 'verified' | 'unverified' | 'elevation-requested';
}

export type MidSessionAction =
  | 'skip-debounce'
  | 'skip-opt-out'
  | 'skip-not-windows'
  | 'checked';

export interface MidSessionVerdict {
  action: MidSessionAction;
  reaper?: ReaperVerdict;
  notice?: string;
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
 * Windows can hide CommandLine for an elevated process. The observed claude-mem failure shape is
 * still specific enough to recover safely: an orphaned `chroma-mcp.exe` root plus its direct
 * Python worker child, while the configured listener reports a dead owner. Do not select a bare
 * chroma binary, generic Python, console host, or any process with an alive parent.
 */
function isBlankCommandLineChromaRoot(proc: ProcRecord, procs: ProcRecord[]): boolean {
  return proc.parentAlive === false
    && proc.cmdline.trim() === ''
    && proc.name?.toLowerCase() === 'chroma-mcp.exe'
    && procs.some((child) => child.ppid === proc.pid && /^python(?:w)?\.exe$/i.test(child.name ?? ''));
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
  // inherited handle in a live orphan. Command-line signature is preferred; a deliberately narrow
  // image-name + dead-parent + Python-child predicate handles unreadable elevated command lines.
  const killPids = input.procs
    .filter((p) => p.parentAlive === false
      && (matchesClaudeMemSignature(p.cmdline) || isBlankCommandLineChromaRoot(p, input.procs)))
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
  /** Test-only post-action observation; production always re-observes the socket. */
  portReleasedAfterKill?: boolean;
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
  // Emits one JSON line: { portListening, portOwnerPid, portOwnerAlive,
  // procs:[{pid,ppid,parentAlive,cmdline,name}] }. The list remains bounded: known claude-mem
  // command-line candidates, every chroma-mcp root (including unreadable command lines), and only
  // direct Python children of those roots. Image name is intentionally retained because an elevated
  // process may expose no CommandLine to a normal user.
  return [
    `$ErrorActionPreference='SilentlyContinue';`,
    `$port=${port};`,
    `$c=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1;`,
    `$ownerPid=if($c){[int]$c.OwningProcess}else{$null};`,
    `$listening=[bool]$c;`,
    `$ownerAlive=if($ownerPid){[bool](Get-Process -Id $ownerPid -ErrorAction SilentlyContinue)}else{$false};`,
    `$procs=@();$seen=@{};$all=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue);$rootIds=@();`,
    `foreach($p in $all){`,
    `  $cl="$($p.CommandLine)";$name="$($p.Name)";`,
    `  if($cl -match 'claude-mem|chroma-mcp|worker-service\\.cjs' -or $name -ieq 'chroma-mcp.exe'){`,
    `    $pa=[bool](Get-Process -Id $p.ParentProcessId -ErrorAction SilentlyContinue);`,
    `    $procs+=[pscustomobject]@{pid=[int]$p.ProcessId;ppid=[int]$p.ParentProcessId;parentAlive=$pa;cmdline=$cl;name=$name};`,
    `    $seen[[string]$p.ProcessId]=$true;$rootIds+=[int]$p.ProcessId`,
    `  }`,
    `};`,
    `foreach($p in $all){`,
    `  $name="$($p.Name)";if($rootIds -contains [int]$p.ParentProcessId -and $name -match '^python(?:w)?\\.exe$' -and -not $seen.ContainsKey([string]$p.ProcessId)){`,
    `    $cl="$($p.CommandLine)";$pa=[bool](Get-Process -Id $p.ParentProcessId -ErrorAction SilentlyContinue);`,
    `    $procs+=[pscustomobject]@{pid=[int]$p.ProcessId;ppid=[int]$p.ParentProcessId;parentAlive=$pa;cmdline=$cl;name=$name}`,
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
        name: String(r.name ?? ''),
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

interface KillResult {
  pid: number;
  succeeded: boolean;
  accessDenied: boolean;
}

function appendRecord(record: string, value: unknown): void {
  try {
    const prev = fs.existsSync(record) ? (JSON.parse(fs.readFileSync(record, 'utf-8')) as unknown[]) : [];
    prev.push(value);
    fs.writeFileSync(record, JSON.stringify(prev));
  } catch {
    /* best-effort */
  }
}

function killTree(pid: number): KillResult {
  // Action seam: tests record the intended kill instead of signalling a real process.
  const record = process.env.CLAUDE_MEM_REAPER_KILL_RECORD;
  if (record) {
    appendRecord(record, pid);
    const denied = process.env.CLAUDE_MEM_REAPER_KILL_RESULT === 'access-denied';
    return { pid, succeeded: !denied, accessDenied: denied };
  }
  try {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf-8',
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const accessDenied = /access\s+is\s+denied|access\s+denied/i.test(output) || result.error?.code === 'EPERM';
    return { pid, succeeded: result.status === 0, accessDenied };
  } catch {
    return { pid, succeeded: false, accessDenied: false };
  }
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * The normal hook deliberately stays unprivileged. If Windows refuses the constrained tree kill,
 * request a one-time UAC launch of a fixed, self-validating helper. It receives no PID: the helper
 * independently verifies the same-port dead-owner wedge and only then kills a chroma root.
 */
function requestElevatedReap(homeDir: string, port: number): boolean {
  if ((process.env.DEV_POMOGATOR_CLAUDE_MEM_REAP_ELEVATION ?? '').toLowerCase() === 'off') return false;

  const state = readMidSessionState(homeDir);
  const now = nowMs();
  const cooldown = readNumberEnv('CLAUDE_MEM_REAPER_ELEVATION_COOLDOWN_MS', DEFAULT_ELEVATION_COOLDOWN_MS);
  if (typeof state.lastElevationRequestAt === 'number' && now - state.lastElevationRequestAt >= 0
    && now - state.lastElevationRequestAt < cooldown) return false;
  const record = process.env.CLAUDE_MEM_REAPER_ELEVATION_RECORD;
  if (record) {
    appendRecord(record, { port });
    writeMidSessionState(homeDir, { ...state, lastElevationRequestAt: now });
    return true;
  }
  if (!fs.existsSync(ELEVATED_REAPER_HELPER)) return false;

  try {
    const ps = findWindowsPowerShell();
    const helperArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ELEVATED_REAPER_HELPER,
      '-HomeDir', homeDir, '-Port', String(port)].map(psQuote).join(' ');
    const command = `Start-Process -FilePath ${psQuote(ps)} -ArgumentList ${psQuote(helperArgs)} -Verb RunAs`;
    const result = spawnSync(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true,
      timeout: 3000,
      encoding: 'utf-8',
    });
    if (result.status !== 0 || result.error) return false;
    writeMidSessionState(homeDir, { ...state, lastElevationRequestAt: now });
    return true;
  } catch {
    return false;
  }
}

function portReleasedAfterReap(port: number, fixture?: SnapshotFixture): boolean {
  if (typeof fixture?.portReleasedAfterKill === 'boolean') return fixture.portReleasedAfterKill;
  // Test kill records stand in for an already-completed successful tree kill. Production always
  // re-queries the port on Windows; it never trusts taskkill's exit status alone.
  if (process.env.CLAUDE_MEM_REAPER_KILL_RECORD) return true;
  return !gatherSnapshot(port).portListening;
}

/** FR-7a: clear the fail-loud counter so the exit(2) block lifts immediately. Atomic write. */
function resetHookFailures(homeDir: string): void {
  try {
    const p = path.join(homeDir, '.claude-mem', 'state', 'hook-failures.json');
    if (!fs.existsSync(p)) return;
    writeJsonAtomic(p, { consecutiveFailures: 0, lastFailureAt: 0 });
  } catch {
    /* best-effort */
  }
}

function stateDir(homeDir: string): string {
  return path.join(homeDir, '.claude-mem', 'state');
}

function midSessionStateFile(homeDir: string): string {
  return path.join(stateDir(homeDir), 'dev-pomogator-reaper.json');
}

function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function nowMs(): number {
  const raw = process.env.CLAUDE_MEM_REAPER_NOW_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return Date.now();
}

interface MidSessionState {
  lastCheckAt?: number;
  downSince?: number;
  lastNoticeAt?: number;
  lastElevationRequestAt?: number;
}

function readMidSessionState(homeDir: string): MidSessionState {
  try {
    const p = midSessionStateFile(homeDir);
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as MidSessionState;
  } catch {
    return {};
  }
}

function writeMidSessionState(homeDir: string, state: MidSessionState): void {
  try {
    writeJsonAtomic(midSessionStateFile(homeDir), state);
  } catch {
    /* best-effort */
  }
}

function shouldDebounce(state: MidSessionState, now: number, windowMs: number): boolean {
  return typeof state.lastCheckAt === 'number' && now - state.lastCheckAt >= 0 && now - state.lastCheckAt < windowMs;
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

function writeContinue(additionalContext?: string): void {
  try {
    const payload = additionalContext
      ? { continue: true, additionalContext }
      : { continue: true, suppressOutput: true };
    process.stdout.write(JSON.stringify(payload) + '\n');
  } catch {
    /* best-effort */
  }
}

function updateDownNotice(
  homeDir: string,
  state: MidSessionState,
  now: number,
  workerHealthy: boolean,
): { state: MidSessionState; notice?: string } {
  if (workerHealthy) {
    const next = { lastCheckAt: state.lastCheckAt };
    writeMidSessionState(homeDir, next);
    return { state: next };
  }

  const downSince = state.downSince ?? now;
  const visibilityMs = readNumberEnv('CLAUDE_MEM_REAPER_DOWN_VISIBILITY_MS', DEFAULT_DOWN_VISIBILITY_MS);
  const downFor = Math.max(0, now - downSince);
  const lastNoticeAt = state.lastNoticeAt ?? 0;
  const shouldNotice = downFor >= visibilityMs && now - lastNoticeAt >= visibilityMs;
  const next = { ...state, downSince, lastNoticeAt: shouldNotice ? now : state.lastNoticeAt };
  const minutes = Math.max(1, Math.round(downFor / 60_000));
  const notice = shouldNotice
    ? `⚠️ claude-mem недоступен уже ~${minutes} мин: память может не записываться. Инструмент не блокирую; dev-pomogator попробовал авто-уборку.`
    : undefined;
  writeMidSessionState(homeDir, next);
  return { state: next, notice };
}

/** Exposed for the doctor auto-fix action: run the reaper once and return what it did. */
export async function reapWedgedWorker(homeDir?: string): Promise<ReaperVerdict> {
  const probeRecord = process.env.CLAUDE_MEM_REAPER_PROBE_RECORD;
  if (probeRecord) {
    try {
      const prev = fs.existsSync(probeRecord) ? (JSON.parse(fs.readFileSync(probeRecord, 'utf-8')) as number[]) : [];
      prev.push(nowMs());
      writeJsonAtomic(probeRecord, prev);
    } catch {
      /* best-effort */
    }
  }
  const home = resolveHome(homeDir);
  const port = readWorkerPort(home);
  let platform: NodeJS.Platform = process.platform;
  let healthOk: boolean;
  let snap: Snapshot;
  let fixture: SnapshotFixture | undefined;

  const fixturePath = process.env.CLAUDE_MEM_REAPER_SNAPSHOT;
  if (fixturePath) {
    // Test/simulation mode: the fixture is the entire OS truth (platform, health, port, procs).
    let f: SnapshotFixture;
    try {
      f = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as SnapshotFixture;
    } catch {
      f = { ...EMPTY_SNAPSHOT };
    }
    fixture = f;
    platform = f.platform ?? 'win32';
    // A snapshot models Windows-only process inspection in cross-platform BDD.
    // Omitting healthOk deliberately preserves the real HTTP probe, so the fixture
    // cannot fake a refused, non-200, or stalled worker into a green health result.
    healthOk = typeof f.healthOk === 'boolean' ? f.healthOk : await probeHealth(port);
    snap = { ...EMPTY_SNAPSHOT, ...f, procs: normalizeProcs(f.procs) };
  } else {
    if (platform !== 'win32') {
      return reaperDecision({ platform, healthOk: true, portListening: false, portOwnerAlive: false, procs: [] });
    }
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
    const results = verdict.killPids.map((pid) => killTree(pid));
    const released = results.length > 0 && portReleasedAfterReap(port, fixture);
    if (released) {
      resetHookFailures(home);
      return {
        ...verdict,
        recovery: 'verified',
        reason: `${verdict.reason}; configured port ${port} released and failure counter reset`,
      };
    }
    const elevationRequested = results.some((result) => result.accessDenied) && requestElevatedReap(home, port);
    const failed = results.filter((result) => !result.succeeded).map((result) => result.pid);
    return {
      ...verdict,
      recovery: elevationRequested ? 'elevation-requested' : 'unverified',
      reason: elevationRequested
        ? `${verdict.reason}; taskkill denied for ${failed.join(',') || 'selected root'}; requested UAC recovery, port not yet verified free`
        : `${verdict.reason}; port ${port} still occupied or release unverified; failure counter preserved`,
    };
  }
  return verdict;
}

export async function runMidSessionGuard(homeDir?: string, options: { force?: boolean } = {}): Promise<MidSessionVerdict> {
  const home = resolveHome(homeDir);
  const now = nowMs();
  const state = readMidSessionState(home);
  const debounceMs = readNumberEnv('CLAUDE_MEM_REAPER_DEBOUNCE_MS', DEFAULT_MID_SESSION_DEBOUNCE_MS);

  if ((process.env.DEV_POMOGATOR_CLAUDE_MEM_REAP ?? '').toLowerCase() === 'off') {
    return { action: 'skip-opt-out', reason: 'opt-out' };
  }
  if (process.platform !== 'win32' && !process.env.CLAUDE_MEM_REAPER_SNAPSHOT) {
    return { action: 'skip-not-windows', reason: 'not Windows' };
  }
  if (!options.force && shouldDebounce(state, now, debounceMs)) {
    return { action: 'skip-debounce', reason: 'debounce window' };
  }

  const checkedState = { ...state, lastCheckAt: now };
  writeMidSessionState(home, checkedState);
  const reaper = await reapWedgedWorker(home);
  // Only a successful health probe clears the outage marker. A reap is a repair attempt, not proof
  // that memory is recording again; the next debounced check will observe the healed worker.
  const workerHealthy = reaper.action === 'skip-healthy';
  // reapWedgedWorker may persist an elevation cooldown; re-read rather than overwriting it with
  // the pre-action snapshot, otherwise every blocked prompt could trigger another UAC request.
  const notice = updateDownNotice(home, readMidSessionState(home), now, workerHealthy).notice;
  return { action: 'checked', reaper, notice, reason: reaper.reason };
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

  const hookEvent = process.env.CLAUDE_HOOK_EVENT_NAME || process.env.CLAUDE_CODE_HOOK_EVENT_NAME;
  const promptPreflight = hookEvent === 'UserPromptSubmit' || process.argv.includes('--prompt-preflight');
  const midSession = promptPreflight || hookEvent === 'PreToolUse'
    || process.env.CLAUDE_MEM_REAPER_MID_SESSION === '1' || process.argv.includes('--mid-session');
  if (midSession) {
    const verdict = await runMidSessionGuard(undefined, { force: promptPreflight });
    if (verdict.reaper?.action === 'reap') {
      log('INFO', `${verdict.reaper.reason}; pids=${verdict.reaper.killPids.join(',') || '(none)'}`);
    } else {
      log('DEBUG', `mid-session no reap: ${verdict.action}${verdict.reaper ? `/${verdict.reaper.action}` : ''}`);
    }
    return writeContinue(verdict.notice);
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
