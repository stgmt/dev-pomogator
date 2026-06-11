/**
 * SpecGraph builder — glob → parsers → merge → in-memory graph.
 *
 * Orchestrates the three parser slices (`md` / `gherkin` / `ndjson`) into one
 * SpecGraph value. Phase 1 ships the cold-start path (full rebuild from
 * scratch); the chokidar incremental rebuild + watcher integration follow on
 * the same branch in a later commit.
 *
 * Build order:
 *   1. enumerate `.specs/**\/*.md` + `**\/*.feature` (test-corpus roots)
 *   2. parse every MD file → FrNode / NfrNode / AcNode + `covers` edges
 *   3. parse every .feature file → ScenarioNode + `tested-by` edges
 *   4. ingest NDJSON → patch existing scenarios with last-result fields
 *   5. assemble final SpecGraph with anchor + backlink indices
 *
 * The builder never throws on a per-file failure: each parser slice catches
 * its own errors and returns an empty slice, so a single malformed file
 * cannot DoS the build of an entire corpus.
 *
 * @see .specs/spec-generator-v4/FR.md FR-2 (graph builder), FR-3 (dual-anchor)
 * @see .specs/spec-generator-v4/spec-generator-v4_SCHEMA.md Entity 1
 * @see ../types.ts (SpecGraph)
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  Edge,
  Node,
  SpecGraph,
  BacklinkEntry,
  NodeLocation,
  ScenarioNode,
  FileNode,
} from './types.ts';
import { parseMarkdownFile } from './parsers/md.ts';
import { parseGherkinFile } from './parsers/gherkin.ts';
import { parseNdjsonFile, applyTestResults } from './parsers/ndjson.ts';
import { parseTasksFile } from './parsers/tasks.ts';
import { parseFileChangesFile, type FileChangeRow } from './parsers/file-changes.ts';
import { parseDesignFile, type DesignFileRef } from './parsers/design.ts';
import { specOf } from './coverage.ts';

// FR-36a (P13-2): node/edge qualification lives in the PARSERS now — each
// slice arrives already composite-keyed (`coverage.ts::qualifySlice`). The
// builder only qualifies what it derives itself (implements edges from
// FILE_CHANGES/DESIGN rows) and resolves unambiguous bare edge endpoints
// from slug-less feature files (step 2c below).

export interface BuildOptions {
  /** Repository root (everything resolves relative to this). */
  repoRoot: string;
  /** Glob roots to scan for markdown. Default: `.specs/`. */
  mdRoots?: string[];
  /** Glob roots to scan for `.feature`. Default: `.specs/` + `tests/features/`. */
  featureRoots?: string[];
  /** NDJSON file to ingest. Default: `.dev-pomogator/.last-test-run.ndjson`. */
  ndjsonPath?: string;
  /** Skip the NDJSON ingest step entirely (useful in unit tests). */
  skipNdjson?: boolean;
}

/**
 * Walk a directory recursively, collecting absolute paths whose basename
 * matches one of the given suffixes (e.g. `.md` / `.feature`). Skips common
 * vendored / generated dirs so a single bad fixture cannot pollute the build.
 */
function walkDir(absDir: string, suffixes: string[]): string[] {
  if (!fs.existsSync(absDir)) return [];
  const out: string[] = [];
  const skipDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    '.dev-pomogator-tmp',
    '.stryker-tmp',
    '__pycache__',
    'archive', // FR-43c: `.specs/archive/` holds human-confirmed retired specs — out of the live graph
  ]);
  const stack: string[] = [absDir];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        stack.push(abs);
      } else if (entry.isFile()) {
        if (suffixes.some((s) => entry.name.endsWith(s))) out.push(abs);
      }
    }
  }
  return out;
}

/** Build a fresh SpecGraph from a corpus root. */
export function buildGraph(opts: BuildOptions): SpecGraph {
  const { repoRoot } = opts;
  const mdRoots = (opts.mdRoots ?? ['.specs']).map((r) => path.resolve(repoRoot, r));
  const featureRoots = (opts.featureRoots ?? ['.specs', 'tests/features']).map((r) =>
    path.resolve(repoRoot, r),
  );
  const ndjsonPath = path.resolve(
    repoRoot,
    opts.ndjsonPath ?? '.dev-pomogator/.last-test-run.ndjson',
  );

  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  const definitions = new Map<string, NodeLocation>();
  const backlinks = new Map<string, BacklinkEntry[]>();

  const pushBacklink = (anchorId: string, entry: BacklinkEntry): void => {
    let list = backlinks.get(anchorId);
    if (!list) {
      list = [];
      backlinks.set(anchorId, list);
    }
    list.push(entry);
  };

  // Raw PRE-MAP collision stats (FR-36): every duplicate-id merge attempt is a
  // collision the first-writer-wins dedup would otherwise hide. Collected here
  // for free in the single pass — corpus-health consumes graph.rawCollisions
  // instead of re-parsing the whole corpus a second time.
  let totalRawNodes = 0;
  const rawCollisionList: Array<{ id: string; firstFile: string; secondFile: string }> = [];

  const mergeNode = (node: Node): void => {
    totalRawNodes++;
    const existing = nodes.get(node.id);
    if (existing) {
      rawCollisionList.push({ id: node.id, firstFile: existing.file, secondFile: node.file });
    } else {
      nodes.set(node.id, node);
    }
  };

  /** Merge one parsed slice into the accumulators (first-writer wins per id/alias). */
  const ingestSlice = (slice: {
    nodes: Node[];
    edges: Edge[];
    anchors: Array<{ alias: string; location: NodeLocation }>;
  }): void => {
    for (const node of slice.nodes) mergeNode(node);
    for (const e of slice.edges) edges.push(e);
    for (const a of slice.anchors) {
      if (!definitions.has(a.alias)) definitions.set(a.alias, a.location);
    }
  };

  // 1) MD slices
  const mdFiles = mdRoots.flatMap((root) => walkDir(root, ['.md']));
  for (const abs of mdFiles) {
    let slice;
    try {
      slice = parseMarkdownFile(abs, repoRoot);
    } catch {
      continue;
    }
    ingestSlice(slice);
  }

  // 1b) Task slices — parse every TASKS.md into Task nodes (id/status/refs/doneWhen).
  // NOTE: tasks emit NODES only by design (no edges/anchors) — hence mergeNode
  // instead of ingestSlice(); if the task parser ever emits edges, switch this
  // branch to ingestSlice(taskSlice).
  for (const abs of mdFiles) {
    if (path.basename(abs) !== 'TASKS.md') continue;
    let taskSlice;
    try {
      taskSlice = parseTasksFile(abs, repoRoot);
    } catch {
      continue;
    }
    for (const node of taskSlice.nodes) mergeNode(node);
  }

  // 2) Gherkin slices
  const featureFiles = featureRoots.flatMap((root) => walkDir(root, ['.feature']));
  for (const abs of featureFiles) {
    let slice;
    try {
      slice = parseGherkinFile(abs, repoRoot);
    } catch {
      continue;
    }
    ingestSlice(slice);
  }

  // 2b) FILE_CHANGES.md + DESIGN.md → File nodes + implements edges (FR-29).
  //
  // For every spec directory under any md root, locate `FILE_CHANGES.md`
  // and/or `DESIGN.md` and harvest (FR, path) pairs. Each unique path
  // becomes one File node (deduplicated by path across both sources and
  // across all specs). FILE_CHANGES.md wins on action metadata when both
  // sources reference the same path (AC-29.3).
  //
  // Implementation: spec dirs are inferred from the parents of every
  // markdown file we just scanned — any directory directly containing
  // `FILE_CHANGES.md` or `DESIGN.md` counts as a spec dir.
  const specDirs = new Set<string>();
  for (const abs of mdFiles) {
    const base = path.basename(abs);
    if (base === 'FILE_CHANGES.md' || base === 'DESIGN.md') {
      specDirs.add(path.dirname(abs));
    }
  }

  // Path → File node id mapping, shared across all spec dirs so the same
  // path produces a single File node regardless of how many specs cite it.
  const fileNodeIdByPath = new Map<string, string>();
  // (FR, path) → first metadata seen. FILE_CHANGES.md is processed first
  // for every spec, so its action metadata wins over DESIGN.md.
  const implementsSeen = new Set<string>();
  const warnOnceState = { warned: false };

  const makeFileId = (filePath: string): string => {
    const cached = fileNodeIdByPath.get(filePath);
    if (cached) return cached;
    const sha = createHash('sha256').update(filePath).digest('hex').slice(0, 12);
    const id = `FILE-${sha}`;
    fileNodeIdByPath.set(filePath, id);
    return id;
  };

  const ensureFileNode = (filePath: string, sourceFile: string, line: number): string => {
    const id = makeFileId(filePath);
    if (!nodes.has(id)) {
      const node: FileNode = {
        id,
        type: 'File',
        file: sourceFile,
        line,
        path: filePath,
      };
      nodes.set(id, node);
    }
    return id;
  };

  type ImplementsAction = NonNullable<NonNullable<Edge['metadata']>['action']>;
  const ALLOWED_ACTIONS: ReadonlySet<ImplementsAction> = new Set<ImplementsAction>([
    'create',
    'edit',
    'delete',
    'rename',
    'move',
    'replace',
  ]);

  const emitImplements = (
    fr: string,
    filePath: string,
    sourceSection: 'FILE_CHANGES' | 'DESIGN',
    sourceFile: string,
    line: number,
    action?: string,
  ): void => {
    const key = `${fr}|${filePath}`;
    if (implementsSeen.has(key)) return;
    implementsSeen.add(key);
    const fileId = ensureFileNode(filePath, sourceFile, line);
    const edge: Edge = {
      from: fr,
      to: fileId,
      type: 'implements',
      metadata: {
        file_path: filePath,
        source_section: sourceSection,
      },
    };
    if (action && ALLOWED_ACTIONS.has(action as ImplementsAction)) {
      edge.metadata!.action = action as ImplementsAction;
    }
    edges.push(edge);
  };

  for (const specDir of specDirs) {
    const relDir = path.relative(repoRoot, specDir).split(path.sep).join('/');
    // FR-36a: implements edges must reference the qualified FR key, or they
    // dangle once nodes are composite-keyed. Same-spec by construction.
    const slug = specOf(`${relDir}/FILE_CHANGES.md`);
    const qualifyFr = (fr: string): string => (slug ? `${slug}:${fr}` : fr);

    // FILE_CHANGES.md first (precedence per AC-29.3).
    const fcAbs = path.join(specDir, 'FILE_CHANGES.md');
    if (fs.existsSync(fcAbs)) {
      let rows: FileChangeRow[] = [];
      try {
        rows = parseFileChangesFile(fcAbs, { warnOnceState });
      } catch {
        rows = [];
      }
      const relFile = `${relDir}/FILE_CHANGES.md`;
      for (const row of rows) {
        if (row.frs.length === 0) continue;
        for (const fr of row.frs) {
          emitImplements(qualifyFr(fr), row.file_path, 'FILE_CHANGES', relFile, 1, row.action);
        }
      }
    }

    // DESIGN.md — emits implements edges only for (FR, path) pairs not
    // already seen from FILE_CHANGES.md.
    const dAbs = path.join(specDir, 'DESIGN.md');
    if (fs.existsSync(dAbs)) {
      let refs: DesignFileRef[] = [];
      try {
        refs = parseDesignFile(dAbs);
      } catch {
        refs = [];
      }
      const relFile = `${relDir}/DESIGN.md`;
      for (const ref of refs) {
        if (ref.frs.length === 0) continue;
        for (const fr of ref.frs) {
          emitImplements(qualifyFr(fr), ref.file_path, 'DESIGN', relFile, 1);
        }
      }
    }
  }

  // 2c) FR-36a: resolve dangling BARE edge endpoints, unambiguously.
  //
  // A `.feature` OUTSIDE `.specs/` (slug-less slice — e.g. a fixture
  // materialised at an NDJSON URI, or tests/features/) may carry a bare
  // `@FR-N` tag; its tested-by edge endpoint stays bare while spec nodes are
  // composite-keyed — the edge dangles. When exactly ONE spec defines that
  // localId, rewrite the endpoint to the composite key (soft bare-id
  // resolution, same semantics P13-3 gives the MCP tools). Ambiguous bare
  // refs (defined by 2+ specs) stay dangling — guessing would re-create the
  // cross-spec leak FR-36 exists to kill.
  {
    const byLocalId = new Map<string, string | null>(); // localId → composite (null = ambiguous)
    for (const n of nodes.values()) {
      if (!n.spec) continue;
      const localId = n.id.slice(n.spec.length + 1);
      byLocalId.set(localId, byLocalId.has(localId) ? null : n.id);
    }
    const resolveBare = (id: string): string => {
      if (nodes.has(id)) return id; // already resolves (bare node or composite)
      const unique = byLocalId.get(id);
      return unique ?? id;
    };
    for (const e of edges) {
      e.from = resolveBare(e.from);
      e.to = resolveBare(e.to);
    }
  }

  // 3) NDJSON patch onto the scenarios we just collected.
  if (!opts.skipNdjson) {
    const patch = parseNdjsonFile(ndjsonPath);
    const scenarioIter: ScenarioNode[] = [];
    for (const n of nodes.values()) {
      if (n.type === 'Scenario') scenarioIter.push(n);
    }
    const applied = applyTestResults(scenarioIter, patch);
    if (applied > 0) {
      // Emit a `last-result` edge per patched scenario so downstream tooling
      // can find «what was the last test run for FR-N» without consulting
      // the Scenario node directly.
      for (const s of scenarioIter) {
        if (s.lastResult) {
          edges.push({ from: s.id, to: `RESULT-${s.id}-${s.lastResult}`, type: 'last-result' });
        }
      }
    }
  }

  // 4) Build backlinks from existing edges.
  for (const e of edges) {
    pushBacklink(e.from, { file: '', line: 0, type: e.type });
  }

  return {
    version: 1,
    builtAt: new Date().toISOString(),
    nodes,
    edges,
    definitions,
    backlinks,
    // File nodes (2b) and ndjson patches are EXCLUDED by construction —
    // mergeNode wraps only the parser-slice population, mirroring
    // collision-probe's rawCollisionScan scope.
    rawCollisions: {
      totalRawNodes,
      uniqueIds: totalRawNodes - rawCollisionList.length,
      collisions: rawCollisionList,
    },
  };
}

/**
 * Wipe and recompute `graph.backlinks` from `graph.edges`.
 *
 * Exported for the incremental rebuilder (`./incremental.ts`) so a watcher
 * patch can keep the backlink index consistent without re-running the
 * whole `buildGraph`. The shape matches step 4 of `buildGraph` — same
 * `pushBacklink({file: '', line: 0, type})` placeholder, same dedup-by-id
 * semantics.
 */
export function rebuildBacklinks(graph: SpecGraph): void {
  graph.backlinks.clear();
  for (const e of graph.edges) {
    let list = graph.backlinks.get(e.from);
    if (!list) {
      list = [];
      graph.backlinks.set(e.from, list);
    }
    list.push({ file: '', line: 0, type: e.type });
  }
}

/**
 * Convenience entry — build a graph from the current working directory.
 * Useful for CLI / benchmarking. Wraps `buildGraph` with sane defaults.
 */
export function buildGraphFromCwd(cwd: string = process.cwd()): SpecGraph {
  return buildGraph({ repoRoot: cwd, skipNdjson: false });
}
