/**
 * MCP server lifecycle orchestrator — cold-start, watcher, lock, shutdown.
 *
 * The MCP entrypoint imports `startLifecycle(opts)`, awaits it, and then
 * hooks the returned `LifecycleHandle` into `process.on('SIGTERM'|'SIGINT')`
 * for graceful shutdown. Each phase here is observable + cancellable:
 *
 *   1. Acquire the on-disk lock (per FR-4 + FR-14)
 *   2. Cold-build the SpecGraph via `buildGraph`
 *   3. Start the chokidar watcher and patch the graph in place on change
 *   4. Run periodic lock heartbeats so a sibling session can see we're alive
 *
 * The lifecycle is parameterised so unit tests can spin one up against a
 * tmp dir without depending on real `.specs/` content.
 *
 * @see ./server.ts (the MCP `register` site that consumes the graph handle)
 * @see ../spec-graph/builder.ts (cold-start)
 * @see ../spec-graph/incremental.ts (watcher)
 * @see ./lock-manager.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FSWatcher } from 'chokidar';
import { buildGraph } from '../spec-graph/builder.ts';
import { startWatching, type PatchEvent } from '../spec-graph/incremental.ts';
import {
  acquireLock,
  acquireLockOrReadOnly,
  detectEnvironment,
  type LockHandle,
  type LockRecord,
  type Environment,
} from './lock-manager.ts';
import type { SpecGraph } from '../spec-graph/types.ts';

/** Resolved watch backend after the optional touch-test probe. */
export type WatchMode = 'native' | 'polling';

/**
 * Touch-test probe (SPECGEN004_32): watch `.dev-pomogator` natively, write a
 * sentinel, and resolve `true` if chokidar surfaces the event within
 * `timeoutMs`. On a Docker-Desktop-on-Windows bind mount native inotify events
 * don't propagate, so the event never arrives → resolve `false` → caller falls
 * back to polling. Best-effort: any setup failure resolves `false` (prefer the
 * reliable-but-slower polling backend over a silently dead watcher).
 */
export async function probeNativeEvents(repoRoot: string, timeoutMs: number): Promise<boolean> {
  const dir = path.join(repoRoot, '.dev-pomogator');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return false;
  }
  const sentinel = path.join(dir, `.watch-probe-${process.pid}-${Date.now()}`);
  const chokidar = await import('chokidar');
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const probe = chokidar.watch(dir, { usePolling: false, ignoreInitial: true, depth: 0 });
    const cleanup = (): void => {
      probe.close().catch(() => {});
      try {
        fs.unlinkSync(sentinel);
      } catch {
        /* already gone */
      }
    };
    const settle = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(ok);
    };
    const timer = setTimeout(() => settle(false), timeoutMs);
    timer.unref?.();
    probe.on('add', () => settle(true));
    probe.on('change', () => settle(true));
    probe.on('error', () => settle(false));
    probe.on('ready', () => {
      try {
        fs.writeFileSync(sentinel, String(Date.now()));
      } catch {
        settle(false);
      }
    });
  });
}

/** Append a one-line watch-mode decision to `.dev-pomogator/logs/watcher.log`. */
function logWatcherDecision(repoRoot: string, message: string): void {
  try {
    const logDir = path.join(repoRoot, '.dev-pomogator', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'watcher.log'),
      `${new Date().toISOString()} [watch-mode] ${message}\n`,
    );
  } catch {
    // Best-effort telemetry — never block startup on a log write.
  }
}

export interface LifecycleOptions {
  repoRoot: string;
  mdRoots?: string[];
  featureRoots?: string[];
  ndjsonPath?: string;
  skipNdjson?: boolean;
  /**
   * Force the chokidar backend. `true` = polling, `false` = native. When
   * omitted AND {@link LifecycleOptions.autoDetectWatchMode} is set, the
   * touch-test probe decides; otherwise defaults to native.
   */
  usePolling?: boolean;
  /**
   * SPECGEN004_32: when `usePolling` is undefined, run the touch-test probe and
   * fall back to polling if native events are unreliable. Opt-in so existing
   * tests keep their deterministic native/explicit-polling behaviour; the real
   * server entrypoint enables it.
   */
  autoDetectWatchMode?: boolean;
  /** Inject the probe result (tests simulate an unreliable bind mount). */
  watchProbe?: (ctx: { repoRoot: string; timeoutMs: number }) => Promise<boolean>;
  /** Touch-test timeout before declaring native events unreliable. Default 500. */
  probeTimeoutMs?: number;
  /** Polling interval (ms) used when the watcher runs in polling mode. Default 1000. */
  pollIntervalMs?: number;
  env?: Environment;
  /** Heartbeat interval in ms. Default 15_000. */
  heartbeatMs?: number;
  /**
   * P21-1 multi-session door: how to handle an alive-owner lock collision.
   * `'throw'` (default) preserves the FR-14 singleton gate the lock tests pin.
   * `'readonly'` boots a READ-ONLY door instead — graph + watcher come up so
   * reads stay fresh, but the write tools refuse with the holder named. The
   * real server entrypoint passes `'readonly'` so every session keeps a live
   * door for reads while writes serialise to the single lock owner.
   */
  onLockContention?: 'throw' | 'readonly';
  /** Optional sink for watcher patch events — telemetry / logs. */
  onPatch?: (e: PatchEvent) => void;
  /** Optional sink for watcher errors. Default: log to stderr. */
  onError?: (err: Error) => void;
}

export interface LifecycleHandle {
  /** The cold-built, in-place-mutated SpecGraph. Stable reference. */
  graph: SpecGraph;
  /** The chokidar watcher — closed in {@link shutdown}. */
  watcher: FSWatcher;
  /** The lock owned by this process — released in {@link shutdown}. */
  lock: LockHandle;
  /** Resolved watch backend (after the optional touch-test probe). */
  watchMode: WatchMode;
  /** Polling interval (ms) active when `watchMode === 'polling'`. */
  pollIntervalMs: number;
  /**
   * P21-1: `true` when another live session owns the write-lock and this door
   * booted read-only. Reads + the `propose_spec_change` dry-run stay available;
   * the write tools refuse.
   */
  readOnly: boolean;
  /** P21-1: the owning session's lock record — present only when {@link readOnly}. */
  lockHolder?: LockRecord;
  /** Release watcher + heartbeat + lock. Idempotent. */
  shutdown(): Promise<void>;
}

export async function startLifecycle(opts: LifecycleOptions): Promise<LifecycleHandle> {
  // 1) Lock. Default `'throw'` keeps the FR-14 singleton gate (fail fast if a
  //    sibling MCP server owns this repo). `'readonly'` (P21-1) instead boots a
  //    read-only door on contention so every session keeps a live door for
  //    reads while writes serialise to the single lock owner.
  const env = opts.env ?? detectEnvironment();
  let lock: LockHandle;
  let readOnly = false;
  let lockHolder: LockRecord | undefined;
  if ((opts.onLockContention ?? 'throw') === 'readonly') {
    const acq = acquireLockOrReadOnly({ repoRoot: opts.repoRoot, env });
    lock = acq.lock;
    if (acq.mode === 'reader') {
      readOnly = true;
      lockHolder = acq.holder;
      logWatcherDecision(
        opts.repoRoot,
        `write-lock held by pid ${acq.holder?.pid} (env ${acq.holder?.env}) — booting READ-ONLY door (P21-1); reads + dry-runs live, mutations refuse`,
      );
    }
  } else {
    lock = acquireLock({ repoRoot: opts.repoRoot, env });
  }

  // 2) Cold-build graph.
  const graph = buildGraph({
    repoRoot: opts.repoRoot,
    mdRoots: opts.mdRoots,
    featureRoots: opts.featureRoots,
    ndjsonPath: opts.ndjsonPath,
    skipNdjson: opts.skipNdjson,
  });

  // 3) Heartbeat — refresh `last_heartbeat` every N ms so a sibling can
  //    detect a stalled owner. Unref so it doesn't keep the event loop alive
  //    past a deliberate shutdown. A read-only door owns no lock, so it skips
  //    the heartbeat entirely (its `lock.heartbeat()` is a no-op regardless).
  const intervalMs = opts.heartbeatMs ?? 15_000;
  const heartbeatTimer = readOnly ? undefined : setInterval(() => lock.heartbeat(), intervalMs);
  heartbeatTimer?.unref?.();

  // 3b) Resolve the watch backend. Explicit `usePolling` wins; otherwise the
  //     opt-in touch-test probe (SPECGEN004_32) decides between native events
  //     and a polling fallback, logging the decision for the operator.
  const pollIntervalMs = opts.pollIntervalMs ?? 1000;
  let usePolling: boolean;
  let watchMode: WatchMode;
  if (opts.usePolling !== undefined) {
    usePolling = opts.usePolling;
    watchMode = usePolling ? 'polling' : 'native';
  } else if (opts.autoDetectWatchMode) {
    const timeoutMs = opts.probeTimeoutMs ?? 500;
    const probe = opts.watchProbe ?? ((ctx) => probeNativeEvents(ctx.repoRoot, ctx.timeoutMs));
    const nativeOk = await probe({ repoRoot: opts.repoRoot, timeoutMs });
    usePolling = !nativeOk;
    watchMode = nativeOk ? 'native' : 'polling';
    logWatcherDecision(
      opts.repoRoot,
      nativeOk
        ? `native fs events confirmed via touch test (≤${timeoutMs}ms) — using native watcher`
        : `touch event not received within ${timeoutMs}ms — falling back to polling mode (${pollIntervalMs}ms interval)`,
    );
  } else {
    usePolling = false;
    watchMode = 'native';
  }

  // 4) Watcher — patches `graph` in place on every change.
  const watcher = startWatching(graph, {
    repoRoot: opts.repoRoot,
    mdRoots: opts.mdRoots,
    featureRoots: opts.featureRoots,
    ndjsonPath: opts.ndjsonPath,
    usePolling,
    interval: usePolling ? pollIntervalMs : undefined,
    onPatch: opts.onPatch,
    onError:
      opts.onError ??
      ((err: Error) => process.stderr.write(`[spec-mcp-server][watcher] ${err.message}\n`)),
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    try {
      await watcher.close();
    } catch {
      // Best-effort — chokidar throws when closed twice.
    }
    lock.release();
  };

  return { graph, watcher, lock, watchMode, pollIntervalMs, readOnly, lockHolder, shutdown };
}
