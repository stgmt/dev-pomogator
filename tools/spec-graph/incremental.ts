/**
 * Incremental SpecGraph rebuild via chokidar file watcher (Phase 1, FR-2, NFR-Performance-2).
 *
 * Sits on top of the cold-start `buildGraph()` orchestrator and surgically
 * patches the in-memory graph in response to single-file changes — no full
 * re-glob, no full re-parse. The contract is:
 *
 *   1. `watcher.on('change', f)` → re-parse only `f` via the right parser
 *      slice, drop the file's previous slice from the graph, splice the
 *      new slice in, rebuild only the backlinks that touched those node
 *      ids. Target ≤100ms p95 per single-file change (NFR-Performance-2).
 *
 *   2. `watcher.on('add', f)` → same as change: cold-start parse the new
 *      file, splice nodes + edges, rebuild backlinks.
 *
 *   3. `watcher.on('unlink', f)` → drop all nodes whose `file === f` and
 *      every edge that mentions a dropped id. Definitions table is also
 *      pruned.
 *
 *   4. `watcher.on('error', e)` → never throw out of the watcher; bubble
 *      to the caller-supplied `onError`. The graph stays at the last
 *      consistent state.
 *
 * Polling fallback (NFR-Reliability-4) is automatic — chokidar v4 picks it
 * up via `usePolling: true` when the host filesystem doesn't deliver
 * native events (network mounts, Docker bind mounts on Windows, WSL/CIFS).
 *
 * @see ./builder.ts (full rebuild path — same parsers, glob-driven)
 * @see ./types.ts (SpecGraph, Node, Edge)
 * @see .specs/spec-generator-v4/FR.md FR-2 (graph builder)
 * @see .specs/spec-generator-v4/NFR.md NFR-Performance-2 (≤100ms p95)
 */

import chokidar, { type FSWatcher } from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdownFile } from './parsers/md.ts';
import { parseGherkinFile } from './parsers/gherkin.ts';
import { parseNdjsonFile, applyTestResults } from './parsers/ndjson.ts';
import { rebuildBacklinks } from './builder.ts';
import type { SpecGraph, ScenarioNode, ParserOutput } from './types.ts';

export interface WatchOptions {
  /** Absolute repo root — every emitted path is resolved against it. */
  repoRoot: string;
  /** Markdown roots to watch. Default `['.specs']`. */
  mdRoots?: string[];
  /** Gherkin roots to watch. Default `['.specs', 'tests/features']`. */
  featureRoots?: string[];
  /** Path to the NDJSON last-run file. Default `.dev-pomogator/.last-test-run.ndjson`. */
  ndjsonPath?: string;
  /**
   * Force chokidar's polling backend (NFR-Reliability-4). Auto-detected on
   * Windows + WSL bind mounts; explicit `true` is for tests + Docker.
   */
  usePolling?: boolean;
  /** Called after every successful incremental patch. Optional. */
  onPatch?: (event: PatchEvent) => void;
  /** Called on any watcher-level error. Optional; default = swallow + log. */
  onError?: (err: Error) => void;
}

export interface PatchEvent {
  kind: 'change' | 'add' | 'unlink';
  /** Repo-relative POSIX path. */
  file: string;
  /** Wall-clock ms the patch took, for NFR-Performance-2 telemetry. */
  durationMs: number;
  /** Net `nodes` delta (positive = added, negative = removed). */
  nodesDelta: number;
  /** Net `edges` delta (same convention). */
  edgesDelta: number;
}

/**
 * Strip every node + edge + definition that came from `relativePath`.
 *
 * Exported because the change/add path also calls it before splicing the
 * new slice in — that's how «replace this file's contribution» is spelled
 * in mutation terms over a `SpecGraph`.
 */
export function dropFileSlice(graph: SpecGraph, relativePath: string): {
  removedNodeIds: Set<string>;
} {
  const removedNodeIds = new Set<string>();
  for (const [id, node] of graph.nodes) {
    if (node.file === relativePath) {
      removedNodeIds.add(id);
      graph.nodes.delete(id);
    }
  }
  if (removedNodeIds.size === 0) {
    // Definitions can outlive nodes only via duplicate-anchor discard;
    // either way there's nothing to prune that referenced this file.
    return { removedNodeIds };
  }
  // Drop edges that mention any removed id on either side.
  graph.edges = graph.edges.filter(
    (e) => !removedNodeIds.has(e.from) && !removedNodeIds.has(e.to),
  );
  // Drop anchor aliases that pointed at this file.
  for (const [alias, def] of graph.definitions) {
    if (def.file === relativePath) graph.definitions.delete(alias);
  }
  return { removedNodeIds };
}

/**
 * Splice a freshly-parsed slice into an existing graph in place.
 *
 * Internal to this module — the watcher orchestrator below is the only
 * supported caller. Returns the (Δnodes, Δedges) for telemetry.
 */
function applySlice(
  graph: SpecGraph,
  slice: ParserOutput,
): { nodesDelta: number; edgesDelta: number } {
  let nodesDelta = 0;
  for (const node of slice.nodes) {
    if (graph.nodes.has(node.id)) continue;
    graph.nodes.set(node.id, node);
    nodesDelta++;
  }
  const edgesBefore = graph.edges.length;
  for (const e of slice.edges) {
    graph.edges.push(e);
  }
  for (const a of slice.anchors) {
    if (graph.definitions.has(a.alias)) continue;
    graph.definitions.set(a.alias, a.location);
  }
  return {
    nodesDelta,
    edgesDelta: graph.edges.length - edgesBefore,
  };
}

function classify(relativePath: string): 'md' | 'feature' | 'ndjson' | 'unknown' {
  if (relativePath.endsWith('.feature')) return 'feature';
  if (relativePath.endsWith('.md')) return 'md';
  if (relativePath.endsWith('.ndjson')) return 'ndjson';
  return 'unknown';
}

function toPosixRelative(repoRoot: string, absPath: string): string {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

/**
 * Apply a change/add event in place — exported for tests so they can drive
 * the watcher path synchronously without spinning up chokidar.
 */
export function applyChange(
  graph: SpecGraph,
  repoRoot: string,
  relativePath: string,
): { nodesDelta: number; edgesDelta: number } {
  const absPath = path.resolve(repoRoot, relativePath);
  const kind = classify(relativePath);

  // Drop the old slice first so we don't double-count duplicate-id discards.
  dropFileSlice(graph, relativePath);

  if (kind === 'md') {
    if (!fs.existsSync(absPath)) return { nodesDelta: 0, edgesDelta: 0 };
    const slice = parseMarkdownFile(absPath, repoRoot);
    const delta = applySlice(graph, slice);
    rebuildBacklinks(graph);
    return delta;
  }
  if (kind === 'feature') {
    if (!fs.existsSync(absPath)) return { nodesDelta: 0, edgesDelta: 0 };
    const slice = parseGherkinFile(absPath, repoRoot);
    const delta = applySlice(graph, slice);
    rebuildBacklinks(graph);
    return delta;
  }
  if (kind === 'ndjson') {
    if (!fs.existsSync(absPath)) return { nodesDelta: 0, edgesDelta: 0 };
    const patch = parseNdjsonFile(absPath);
    // NDJSON only mutates existing ScenarioNodes; no node/edge add.
    const scenarios: ScenarioNode[] = [];
    for (const node of graph.nodes.values()) {
      if (node.type === 'Scenario') scenarios.push(node);
    }
    applyTestResults(scenarios, patch);
    rebuildBacklinks(graph);
    return { nodesDelta: 0, edgesDelta: 0 };
  }
  return { nodesDelta: 0, edgesDelta: 0 };
}

/**
 * Apply an unlink event in place. Mirror of `applyChange` for symmetry.
 */
export function applyUnlink(
  graph: SpecGraph,
  relativePath: string,
): { nodesDelta: number; edgesDelta: number } {
  const before = { n: graph.nodes.size, e: graph.edges.length };
  dropFileSlice(graph, relativePath);
  rebuildBacklinks(graph);
  return {
    nodesDelta: graph.nodes.size - before.n,
    edgesDelta: graph.edges.length - before.e,
  };
}

/**
 * Start watching the spec roots. Returns the FSWatcher so the caller can
 * `await watcher.close()` on shutdown.
 *
 * The graph is patched in place — callers hold a stable reference for the
 * lifetime of the watcher.
 */
export function startWatching(graph: SpecGraph, opts: WatchOptions): FSWatcher {
  const repoRoot = opts.repoRoot;
  const mdRoots = opts.mdRoots ?? ['.specs'];
  const featureRoots = opts.featureRoots ?? ['.specs', 'tests/features'];
  const ndjsonPath = opts.ndjsonPath ?? '.dev-pomogator/.last-test-run.ndjson';

  const watched: string[] = [];
  for (const r of mdRoots) {
    const abs = path.resolve(repoRoot, r);
    if (fs.existsSync(abs)) watched.push(abs);
  }
  for (const r of featureRoots) {
    const abs = path.resolve(repoRoot, r);
    if (fs.existsSync(abs)) watched.push(abs);
  }
  watched.push(path.resolve(repoRoot, ndjsonPath));

  const watcher = chokidar.watch(watched, {
    ignored: (p: string) =>
      /(?:^|\/)(?:node_modules|\.git|dist|\.dev-pomogator-tmp|\.stryker-tmp|__pycache__)(?:\/|$)/.test(
        p.split(path.sep).join('/'),
      ) &&
      // Allow the canonical ndjson path even though it lives under .dev-pomogator/.
      !p.endsWith('.last-test-run.ndjson'),
    ignoreInitial: true,
    usePolling: opts.usePolling ?? false,
    interval: 100,
    binaryInterval: 300,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
    persistent: true,
  });

  function handleChange(kind: 'change' | 'add', absPath: string): void {
    const relativePath = toPosixRelative(repoRoot, absPath);
    if (classify(relativePath) === 'unknown') return;
    const start = process.hrtime.bigint();
    try {
      const { nodesDelta, edgesDelta } = applyChange(graph, repoRoot, relativePath);
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      opts.onPatch?.({ kind, file: relativePath, durationMs, nodesDelta, edgesDelta });
    } catch (err) {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  function handleUnlink(absPath: string): void {
    const relativePath = toPosixRelative(repoRoot, absPath);
    if (classify(relativePath) === 'unknown') return;
    const start = process.hrtime.bigint();
    try {
      const { nodesDelta, edgesDelta } = applyUnlink(graph, relativePath);
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      opts.onPatch?.({ kind: 'unlink', file: relativePath, durationMs, nodesDelta, edgesDelta });
    } catch (err) {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  watcher.on('change', (p: string) => handleChange('change', p));
  watcher.on('add', (p: string) => handleChange('add', p));
  watcher.on('unlink', handleUnlink);
  watcher.on('error', (err: unknown) =>
    opts.onError?.(err instanceof Error ? err : new Error(String(err))),
  );

  return watcher;
}
