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

import type { FSWatcher } from 'chokidar';
import { buildGraph } from '../spec-graph/builder.ts';
import { startWatching, type PatchEvent } from '../spec-graph/incremental.ts';
import { acquireLock, detectEnvironment, type LockHandle, type Environment } from './lock-manager.ts';
import type { SpecGraph } from '../spec-graph/types.ts';

export interface LifecycleOptions {
  repoRoot: string;
  mdRoots?: string[];
  featureRoots?: string[];
  ndjsonPath?: string;
  skipNdjson?: boolean;
  usePolling?: boolean;
  env?: Environment;
  /** Heartbeat interval in ms. Default 15_000. */
  heartbeatMs?: number;
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
  /** Release watcher + heartbeat + lock. Idempotent. */
  shutdown(): Promise<void>;
}

export async function startLifecycle(opts: LifecycleOptions): Promise<LifecycleHandle> {
  // 1) Lock — fail fast if a sibling MCP server owns this repo.
  const lock = acquireLock({ repoRoot: opts.repoRoot, env: opts.env ?? detectEnvironment() });

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
  //    past a deliberate shutdown.
  const intervalMs = opts.heartbeatMs ?? 15_000;
  const heartbeatTimer = setInterval(() => lock.heartbeat(), intervalMs);
  heartbeatTimer.unref?.();

  // 4) Watcher — patches `graph` in place on every change.
  const watcher = startWatching(graph, {
    repoRoot: opts.repoRoot,
    mdRoots: opts.mdRoots,
    featureRoots: opts.featureRoots,
    ndjsonPath: opts.ndjsonPath,
    usePolling: opts.usePolling,
    onPatch: opts.onPatch,
    onError:
      opts.onError ??
      ((err: Error) => process.stderr.write(`[spec-mcp-server][watcher] ${err.message}\n`)),
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(heartbeatTimer);
    try {
      await watcher.close();
    } catch {
      // Best-effort — chokidar throws when closed twice.
    }
    lock.release();
  };

  return { graph, watcher, lock, shutdown };
}
