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

// NOTE (review 2026-06-07): incremental patches do NOT update graph.rawCollisions —
// the pre-map collision stats stay at their cold-build value. corpus-health and
// collision-probe always cold-build, so this is safe today; a long-running MCP
// server wanting fresh collision stats after watcher patches must rebuild.
import chokidar, { type FSWatcher } from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdownFile } from './parsers/md.ts';
import { parseGherkinFile } from './parsers/gherkin.ts';
import { parseNdjsonFile, applyTestResults } from './parsers/ndjson.ts';
import { parseScenarioOverlayFile, applyScenarioOverlayResults } from './parsers/scenario-overlay.ts';
import { parseTasksFile } from './parsers/tasks.ts';
import { rebuildBacklinks } from './builder.ts';
import type { Edge, SpecGraph, ScenarioNode, ParserOutput } from './types.ts';

export interface WatchOptions {
  /** Absolute repo root — every emitted path is resolved against it. */
  repoRoot: string;
  /** Markdown roots to watch. Default `['.specs']`. */
  mdRoots?: string[];
  /** Gherkin roots to watch. Default `['.specs', 'tests/features']`. */
  featureRoots?: string[];
  /** Path to the NDJSON last-run file. Default `.dev-pomogator/.last-test-run.ndjson`. */
  ndjsonPath?: string;
  /** Path to the append-only scenario overlay. Default `.dev-pomogator/.scenario-results.ndjson`. */
  scenarioOverlayPath?: string;
  /**
   * Force chokidar's polling backend (NFR-Reliability-4). Auto-detected on
   * Windows + WSL bind mounts; explicit `true` is for tests + Docker.
   */
  usePolling?: boolean;
  /**
   * Polling interval in ms when `usePolling` is active. Default 100. The
   * lifecycle auto-fallback path raises this to 1000 (1s) per SPECGEN004_32
   * so a Docker-Desktop bind mount isn't hammered every 100ms.
   */
  interval?: number;
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

function classify(relativePath: string): 'md' | 'feature' | 'ndjson' | 'overlay' | 'unknown' {
  if (relativePath.endsWith('.feature')) return 'feature';
  if (relativePath.endsWith('.md')) return 'md';
  if (relativePath.endsWith('.scenario-results.ndjson')) return 'overlay';
  if (relativePath.endsWith('.ndjson')) return 'ndjson';
  return 'unknown';
}

function toPosixRelative(repoRoot: string, absPath: string): string {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

function refreshResultEdges(graph: SpecGraph, scenarios: ScenarioNode[]): void {
  const scenarioIds = new Set(scenarios.map((s) => s.id));
  graph.edges = graph.edges.filter(
    (e) => (e.type !== 'last-result' && e.type !== 'runtime-trace') || !scenarioIds.has(e.from),
  );
  const emitted = new Set<string>();
  const additions: Edge[] = [];
  for (const s of scenarios) {
    if (s.lastResult) {
      const key = `${s.id}|result|${s.lastResult}`;
      if (!emitted.has(key)) {
        emitted.add(key);
        additions.push({ from: s.id, to: `RESULT-${s.id}-${s.lastResult}`, type: 'last-result' });
      }
    }
    if (s.trace?.traceId) {
      const key = `${s.id}|trace|${s.trace.traceId}`;
      if (!emitted.has(key)) {
        emitted.add(key);
        additions.push({ from: s.id, to: `TRACE-${s.trace.traceId}`, type: 'runtime-trace' });
      }
    }
  }
  graph.edges.push(...additions);
}

interface ResultPathOptions {
  ndjsonPath?: string;
  scenarioOverlayPath?: string;
}

function collectScenarios(graph: SpecGraph): ScenarioNode[] {
  const scenarios: ScenarioNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type === 'Scenario') scenarios.push(node);
  }
  return scenarios;
}

function clearResultEvidence(scenario: ScenarioNode): void {
  delete scenario.lastResult;
  delete scenario.lastRunAt;
  delete scenario.resultStale;
  delete scenario.canonicalResult;
  delete scenario.canonicalRunAt;
  delete scenario.trace;
  delete scenario.durationMs;
  delete scenario.failingStep;
}

/**
 * Re-apply canonical NDJSON + filtered overlay evidence to the current scenario set.
 * Mirrors the cold-build semantics: a scenario absent from the current result files
 * becomes `not_run`, never a stale in-memory result from a prior run.
 */
export function refreshResultFiles(graph: SpecGraph, repoRoot: string, opts: ResultPathOptions = {}): void {
  const scenarios = collectScenarios(graph);
  for (const scenario of scenarios) clearResultEvidence(scenario);
  applyTestResults(scenarios, parseNdjsonFile(path.resolve(repoRoot, opts.ndjsonPath ?? '.dev-pomogator/.last-test-run.ndjson')));
  applyScenarioOverlayResults(scenarios, parseScenarioOverlayFile(path.resolve(repoRoot, opts.scenarioOverlayPath ?? '.dev-pomogator/.scenario-results.ndjson')), { repoRoot });
  refreshResultEdges(graph, scenarios);
  rebuildBacklinks(graph);
}

/**
 * Apply a change/add event in place — exported for tests so they can drive
 * the watcher path synchronously without spinning up chokidar.
 */
export function applyChange(
  graph: SpecGraph,
  repoRoot: string,
  relativePath: string,
  resultPaths: ResultPathOptions = {},
): { nodesDelta: number; edgesDelta: number } {
  const absPath = path.resolve(repoRoot, relativePath);
  const kind = classify(relativePath);

  // Drop the old slice first so we don't double-count duplicate-id discards.
  dropFileSlice(graph, relativePath);

  if (kind === 'md') {
    if (!fs.existsSync(absPath)) return { nodesDelta: 0, edgesDelta: 0 };
    // FR-36a (P13-2): the parsers self-qualify — a live patch carries the
    // same composite keys as the cold build by construction.
    const slice = parseMarkdownFile(absPath, repoRoot);
    const delta = applySlice(graph, slice);
    // The cold build (builder.ts step 1b) parses TASKS.md with BOTH
    // parseMarkdownFile AND parseTasksFile. The incremental path must mirror
    // that — otherwise dropFileSlice() removes every Task node for the file and
    // parseMarkdownFile (which emits no Task nodes) never re-adds them, so the
    // live graph loses ALL tasks for a spec after ANY TASKS.md edit (e.g. a
    // set_entity_status write) until a full restart. Bug found 2026-06-15:
    // back-to-back set_entity_status → second call NOT_FOUND on a node a cold
    // rebuild still has.
    if (path.basename(absPath) === 'TASKS.md') {
      const taskSlice = parseTasksFile(absPath, repoRoot);
      const taskDelta = applySlice(graph, taskSlice);
      delta.nodesDelta += taskDelta.nodesDelta;
      delta.edgesDelta += taskDelta.edgesDelta;
    }
    rebuildBacklinks(graph);
    return delta;
  }
  if (kind === 'feature') {
    if (!fs.existsSync(absPath)) return { nodesDelta: 0, edgesDelta: 0 };
    const slice = parseGherkinFile(absPath, repoRoot);
    const delta = applySlice(graph, slice);
    // A feature edit replaces Scenario nodes; re-apply the persisted result
    // files so the live graph keeps the same effective evidence as a cold build
    // (and can mark once-passing overlay rows stale after the source mtime bump).
    refreshResultFiles(graph, repoRoot, resultPaths);
    return delta;
  }
  if (kind === 'ndjson' || kind === 'overlay') {
    if (!fs.existsSync(absPath)) return { nodesDelta: 0, edgesDelta: 0 };
    // Result files are replace-current-state inputs. Rebuild their effective view
    // from scratch so removed/filtered-away scenarios become not_run just like a
    // cold build, instead of retaining stale lastResult fields in the live MCP graph.
    refreshResultFiles(graph, repoRoot, resultPaths);
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
  const scenarioOverlayPath = opts.scenarioOverlayPath ?? '.dev-pomogator/.scenario-results.ndjson';

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
  watched.push(path.resolve(repoRoot, scenarioOverlayPath));

  const watcher = chokidar.watch(watched, {
    ignored: (p: string) =>
      /(?:^|\/)(?:node_modules|\.git|dist|\.dev-pomogator-tmp|\.stryker-tmp|__pycache__)(?:\/|$)/.test(
        p.split(path.sep).join('/'),
      ) &&
      // Allow the canonical ndjson + overlay paths even though they live under .dev-pomogator/.
      !p.endsWith('.last-test-run.ndjson') &&
      !p.endsWith('.scenario-results.ndjson'),
    ignoreInitial: true,
    usePolling: opts.usePolling ?? false,
    interval: opts.interval ?? 100,
    binaryInterval: 300,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
    persistent: true,
  });

  function handleChange(kind: 'change' | 'add', absPath: string): void {
    const relativePath = toPosixRelative(repoRoot, absPath);
    if (classify(relativePath) === 'unknown') return;
    const start = process.hrtime.bigint();
    try {
      const { nodesDelta, edgesDelta } = applyChange(graph, repoRoot, relativePath, { ndjsonPath, scenarioOverlayPath });
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
