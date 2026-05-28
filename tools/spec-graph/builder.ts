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
import type {
  Edge,
  Node,
  SpecGraph,
  BacklinkEntry,
  NodeLocation,
  ScenarioNode,
} from './types.ts';
import { parseMarkdownFile } from './parsers/md.ts';
import { parseGherkinFile } from './parsers/gherkin.ts';
import { parseNdjsonFile, applyTestResults } from './parsers/ndjson.ts';

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

  // 1) MD slices
  const mdFiles = mdRoots.flatMap((root) => walkDir(root, ['.md']));
  for (const abs of mdFiles) {
    let slice;
    try {
      slice = parseMarkdownFile(abs, repoRoot);
    } catch {
      continue;
    }
    for (const node of slice.nodes) {
      if (!nodes.has(node.id)) nodes.set(node.id, node);
    }
    for (const e of slice.edges) edges.push(e);
    for (const a of slice.anchors) {
      if (!definitions.has(a.alias)) definitions.set(a.alias, a.location);
    }
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
    for (const node of slice.nodes) {
      if (!nodes.has(node.id)) nodes.set(node.id, node);
    }
    for (const e of slice.edges) edges.push(e);
    for (const a of slice.anchors) {
      if (!definitions.has(a.alias)) definitions.set(a.alias, a.location);
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
  };
}

/**
 * Convenience entry — build a graph from the current working directory.
 * Useful for CLI / benchmarking. Wraps `buildGraph` with sane defaults.
 */
export function buildGraphFromCwd(cwd: string = process.cwd()): SpecGraph {
  return buildGraph({ repoRoot: cwd, skipNdjson: false });
}
