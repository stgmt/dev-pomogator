/**
 * process-tree.ts — cross-platform process-tree terminator with graceful-then-force escalation.
 *
 * Purpose (spec: .specs/tui-test-runner FR-16): when the test-runner wrapper is interrupted or
 * its own timeout fires, terminate the WHOLE child process tree — GRACEFULLY first so the test
 * runs its own shutdown (including management of its own docker containers, which are NOT our
 * concern), then FORCEFULLY after a grace window if the child refuses to exit.
 *
 * Two primitives (the wrapper orchestrates the time-based escalation between them):
 *   - signalProcessTree(pid)    — graceful: POSIX SIGTERM to the process group; Windows `taskkill /T`.
 *   - forceKillProcessTree(pid) — forced:   POSIX SIGKILL to the group; Windows `taskkill /T /F`.
 *
 * Why force is required: on Windows `taskkill /T` WITHOUT `/F` refuses to terminate a console
 * process ("This process can only be terminated forcefully (with /F option)"); on POSIX a child
 * that traps or ignores SIGTERM needs SIGKILL. Empirically measured 2026-07-04.
 *
 * We never touch docker. POSIX group signalling requires the child to be spawned `detached: true`
 * (group id == pid); a single-pid fallback covers the non-detached case.
 *
 * Test seam (WRAP001_04): when `TEST_RUNNER_KILL_RECORD` (or opts.recordFile) is set, the INTENT
 * is appended to that JSON file instead of signalling — so both branches are assertable on any OS.
 *
 * Builtins-only (node:child_process / node:fs) and fail-safe: any error is swallowed so a doomed
 * signal can never crash the caller mid-finalize.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

export interface SignalTreeOptions {
  /** POSIX signal for the graceful phase. Default 'SIGTERM'. (Force phase always uses SIGKILL.) */
  signal?: NodeJS.Signals;
  /** Platform override for testability (lets the win32 branch be exercised on Linux). */
  platform?: NodeJS.Platform;
  /** Test seam: record the intent to this JSON file instead of signalling. */
  recordFile?: string;
}

export interface KillIntent {
  pid: number;
  platform: string;
  cmd: string;
  args: string[];
  mode: 'graceful' | 'force';
}

/** Default wrapper self-timeout: 30 minutes (FR-17). */
export const DEFAULT_SELF_TIMEOUT_MS = 1_800_000;

/** Default grace window before a graceful signal escalates to a forced kill (FR-16). */
export const DEFAULT_KILL_GRACE_MS = 3_000;

/**
 * Resolve the wrapper's self-imposed timeout from a raw env value (FR-17).
 * `0` DISABLES the timer (returned as 0); an invalid/negative value falls back to the
 * 30-minute default; any positive finite value is used as-is (milliseconds).
 */
export function resolveSelfTimeoutMs(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SELF_TIMEOUT_MS;
}

/** Resolve the graceful→force escalation grace window (ms) from a raw env value. */
export function resolveKillGraceMs(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_KILL_GRACE_MS;
}

/** Compute the signalling intent for a pid on a given platform, graceful or forced. */
export function killIntent(pid: number, platform: NodeJS.Platform, signal: NodeJS.Signals, force: boolean): KillIntent {
  const mode: KillIntent['mode'] = force ? 'force' : 'graceful';
  if (platform === 'win32') {
    // Graceful: /T (whole tree). Forced: /T /F (Windows console procs require /F).
    const args = force ? ['/PID', String(pid), '/T', '/F'] : ['/PID', String(pid), '/T'];
    return { pid, platform, cmd: 'taskkill', args, mode };
  }
  // POSIX: signal the whole process group (negative pid). Forced uses SIGKILL.
  const sig = force ? 'SIGKILL' : signal;
  return { pid, platform, cmd: 'kill', args: [String(-pid), sig], mode };
}

function apply(pid: number, opts: SignalTreeOptions, force: boolean): void {
  if (!Number.isInteger(pid) || pid <= 0) return;

  const signal = opts.signal ?? 'SIGTERM';
  const platform = opts.platform ?? process.platform;
  const recordFile = opts.recordFile ?? process.env.TEST_RUNNER_KILL_RECORD;
  const intent = killIntent(pid, platform, signal, force);

  if (recordFile) {
    try {
      const prev: KillIntent[] = fs.existsSync(recordFile)
        ? (JSON.parse(fs.readFileSync(recordFile, 'utf-8')) as KillIntent[])
        : [];
      prev.push(intent);
      fs.writeFileSync(recordFile, JSON.stringify(prev));
    } catch {
      /* best-effort — the test seam must never crash the caller */
    }
    return;
  }

  try {
    if (platform === 'win32') {
      spawnSync('taskkill', intent.args, { windowsHide: true, timeout: 5000 });
      return;
    }
    const sig = force ? 'SIGKILL' : signal;
    try {
      process.kill(-pid, sig); // whole process group (detached child → group id == pid)
    } catch {
      process.kill(pid, sig); // group missing (child not detached) — single-pid fallback
    }
  } catch {
    /* best-effort — process may already be gone; never throw from a terminator */
  }
}

/** Graceful phase: SIGTERM to the group / `taskkill /T`. Lets the test run its own cleanup. */
export function signalProcessTree(pid: number, opts: SignalTreeOptions = {}): void {
  apply(pid, opts, false);
}

/** Force phase: SIGKILL to the group / `taskkill /T /F`. Unignorable last resort. */
export function forceKillProcessTree(pid: number, opts: SignalTreeOptions = {}): void {
  apply(pid, opts, true);
}
