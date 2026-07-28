import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { forceKillProcessTree } from '../_shared/process-tree.ts';

export const CONTEXT_MODE_WORKER_MARKER = 'tools/context-mode-setup/worker.ts';
export const CONTEXT_MODE_WORKER_DIR_PREFIX = '.ctx-mode-';
export const DEFAULT_STALE_WORKER_AGE_MS = 15 * 60 * 1000;
export const DEFAULT_STALE_WORKER_SCAN_TIMEOUT_MS = 1_500;
/** Keep recovery comfortably below the 30-second SessionStart hook budget. */
export const DEFAULT_STALE_WORKER_SWEEP_DEADLINE_MS = 5_000;
/** A corrupted process snapshot must not multiply the hook's kill latency. */
export const DEFAULT_STALE_WORKER_CANDIDATE_CAP = 3;

export interface ProcessSnapshot {
  pid: number;
  commandLine: string;
  /** POSIX process-group id; only a group leader is safe for group termination. */
  pgid?: number;
}

export interface StaleContextModeWorker {
  pid: number;
  scriptPath: string;
  ageMs: number;
}

export interface StaleWorkerSweepResult {
  scanned: number;
  candidates: number;
  killed: StaleContextModeWorker[];
  skipped: string[];
  failOpen: boolean;
}

function parseWorkerScript(commandLine: string): string | null {
  const marker = commandLine.replace(/\\/g, '/').toLowerCase();
  if (!marker.includes(CONTEXT_MODE_WORKER_MARKER) || !marker.includes(CONTEXT_MODE_WORKER_DIR_PREFIX)) return null;
  const match = commandLine.match(/(?:--worker-script(?:=|\s+))(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
  const script = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!script) return null;
  const normalized = path.normalize(script);
  if (path.basename(normalized) !== 'script' || !path.basename(path.dirname(normalized)).startsWith(CONTEXT_MODE_WORKER_DIR_PREFIX)) return null;
  return normalized;
}

export function findProvablyOwnedStaleWorkers(
  snapshot: ProcessSnapshot[],
  nowMs = Date.now(),
  ageMs = DEFAULT_STALE_WORKER_AGE_MS,
  stat: typeof fs.statSync = fs.statSync,
): { workers: StaleContextModeWorker[]; skipped: string[] } {
  const workers: StaleContextModeWorker[] = [];
  const skipped: string[] = [];
  for (const process of snapshot) {
    if (!Number.isInteger(process.pid) || process.pid <= 0) continue;
    if (process.pgid !== undefined && process.pgid !== process.pid) {
      skipped.push(`owned worker descendant ${process.pid} ignored; group leader is ${process.pgid}`);
      continue;
    }
    const scriptPath = parseWorkerScript(process.commandLine);
    if (!scriptPath) continue;
    try {
      const age = nowMs - stat(scriptPath).mtimeMs;
      if (age >= ageMs) workers.push({ pid: process.pid, scriptPath, ageMs: age });
      else skipped.push(`fresh owned worker ${process.pid}`);
    } catch {
      skipped.push(`owned marker without readable script ${process.pid}`);
    }
  }
  return { workers, skipped };
}

function readProcessSnapshot(platform: NodeJS.Platform = process.platform): ProcessSnapshot[] {
  if (platform === 'win32') {
    const command = 'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress';
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8', windowsHide: true, timeout: DEFAULT_STALE_WORKER_SCAN_TIMEOUT_MS,
    });
    if (result.status !== 0 || !result.stdout) throw new Error('process snapshot unavailable');
    const parsed = JSON.parse(result.stdout) as Array<{ ProcessId?: number; CommandLine?: string }> | { ProcessId?: number; CommandLine?: string };
    return (Array.isArray(parsed) ? parsed : [parsed]).flatMap(item =>
      typeof item.ProcessId === 'number' && typeof item.CommandLine === 'string' ? [{ pid: item.ProcessId, commandLine: item.CommandLine }] : []);
  }
  const result = spawnSync('ps', ['-axo', 'pid=,pgid=,command='], { encoding: 'utf8', timeout: DEFAULT_STALE_WORKER_SCAN_TIMEOUT_MS });
  if (result.status !== 0) throw new Error('process snapshot unavailable');
  return result.stdout.split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    return match ? [{ pid: Number(match[1]), pgid: Number(match[2]), commandLine: match[3] }] : [];
  });
}

export function appendStaleWorkerReport(homeRoot: string, result: StaleWorkerSweepResult): void {
  if (result.killed.length === 0) return;
  try {
    const report = path.join(homeRoot, '.dev-pomogator', 'context-mode-worker-recovery.jsonl');
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.appendFileSync(report, `${JSON.stringify({ timestamp: new Date().toISOString(), ...result })}\n`);
  } catch {
    // Reporting is diagnostic only; SessionStart must stay fail-open.
  }
}

export function sweepStaleContextModeWorkers(options: {
  homeRoot?: string;
  snapshot?: ProcessSnapshot[];
  nowMs?: number;
  ageMs?: number;
  platform?: NodeJS.Platform;
  listProcesses?: (platform: NodeJS.Platform) => ProcessSnapshot[];
  killTree?: (pid: number, options?: { platform?: NodeJS.Platform; timeoutMs?: number }) => void;
  deadlineMs?: number;
  candidateCap?: number;
  clock?: () => number;
} = {}): StaleWorkerSweepResult {
  const platform = options.platform ?? process.platform;
  try {
    const clock = options.clock ?? Date.now;
    const startedAt = clock();
    const deadlineMs = options.deadlineMs ?? DEFAULT_STALE_WORKER_SWEEP_DEADLINE_MS;
    const candidateCap = options.candidateCap ?? DEFAULT_STALE_WORKER_CANDIDATE_CAP;
    const snapshot = options.snapshot ?? (options.listProcesses ?? readProcessSnapshot)(platform);
    const found = findProvablyOwnedStaleWorkers(snapshot, options.nowMs ?? startedAt, options.ageMs);
    const skipped = [...found.skipped];
    // taskkill is synchronous; on Windows a single bounded call preserves the sweep deadline.
    const platformCap = platform === 'win32' ? Math.min(1, Math.max(0, candidateCap)) : Math.max(0, candidateCap);
    const selected = found.workers.slice(0, platformCap);
    if (found.workers.length > selected.length) {
      const capLabel = platform === 'win32' && candidateCap > platformCap ? `Windows candidate cap ${platformCap}` : `candidate cap ${candidateCap}`;
      skipped.push(`${capLabel} reached; ${found.workers.length - selected.length} owned stale worker(s) left untouched`);
    }
    const killed: StaleContextModeWorker[] = [];
    for (let index = 0; index < selected.length; index += 1) {
      if (clock() - startedAt >= deadlineMs) {
        skipped.push(`sweep deadline ${deadlineMs}ms reached; ${selected.length - index} selected owned stale worker(s) left untouched`);
        break;
      }
      const worker = selected[index];
      const remainingMs = Math.max(1, deadlineMs - (clock() - startedAt));
      (options.killTree ?? forceKillProcessTree)(worker.pid, { platform, timeoutMs: remainingMs });
      killed.push(worker);
    }
    const result = { scanned: snapshot.length, candidates: found.workers.length, killed, skipped, failOpen: false };
    appendStaleWorkerReport(options.homeRoot ?? (process.env.CLAUDE_HOME || process.env.USERPROFILE || os.homedir()), result);
    return result;
  } catch (error) {
    return { scanned: 0, candidates: 0, killed: [], skipped: [error instanceof Error ? error.message : String(error)], failOpen: true };
  }
}
