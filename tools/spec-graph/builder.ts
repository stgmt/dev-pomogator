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
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  Edge,
  EdgeMetadata,
  ExecutionArtifactIngestion,
  Node,
  NodeType,
  SpecGraph,
  BacklinkEntry,
  NodeLocation,
  ScenarioNode,
  FileNode,
  IdentityCollision,
} from './types.ts';
import { classifyIdentityCollision, identityCollisionKey, localIdOf } from './identity.ts';
import { parseMarkdownFile } from './parsers/md.ts';
import { parseGherkinFile } from './parsers/gherkin.ts';
import { parseNdjsonArtifactFile, applyTestResults } from './parsers/ndjson.ts';
import { parseScenarioOverlayFile, applyScenarioOverlayResults } from './parsers/scenario-overlay.ts';
import { DEFAULT_PYTEST_BDD_REPORT_PATH, parsePytestBddReportFile, PYTEST_BDD_SOURCE } from './parsers/pytest-bdd.ts';
import { parseTasksFile } from './parsers/tasks.ts';
import { parseFileChangesFile, type FileChangeRow } from './parsers/file-changes.ts';
import { parseDesignFile, type DesignFileRef } from './parsers/design.ts';
import { specOf } from './coverage.ts';
import { refreshEndpointViolations } from './edge-schema.ts';

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
  /** Append-only scenario overlay file. Default: `.dev-pomogator/.scenario-results.ndjson`. */
  scenarioOverlayPath?: string;
  /** pytest-bdd `--cucumber-json` report. Default: `.dev-pomogator/pytest-bdd-report.json`. */
  pytestBddPath?: string;
  /** Skip every result ingest step entirely (useful in unit tests). */
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
function featureAliasOwners(
  nodes: ReadonlyMap<string, Node>,
  repoRoot: string,
  spec: string,
  alias: string,
): string[] {
  const owners = new Set<string>();
  for (const node of nodes.values()) {
    if (node.type !== 'FR' || node.spec !== spec) continue;
    const declaredAliases = (node.body ?? '').split(/\r?\n/)
      .filter((line) => /^\s*(?:\*\*(?:Feature|BDD|Executable evidence aliases)(?::)?\*\*:?\s*|Executable evidence aliases\s*:)/i.test(line))
      .join('\n');
    const source = `${node.title ?? ''}\n${declaredAliases}`;
    const aliases = new Set([
      ...(node.featureAliases ?? []),
      ...[...source.matchAll(/@feature(\d+)([a-z]?)/gi)].map((match) => `feature${match[1]}${match[2] ?? ''}`),
    ]);
    if (aliases.has(alias)) owners.add(node.id);
  }
  const requirementsPath = path.join(repoRoot, '.specs', spec, 'REQUIREMENTS.md');
  if (fs.existsSync(requirementsPath)) {
    for (const line of fs.readFileSync(requirementsPath, 'utf8').split(/\r?\n/)) {
      if (![...line.matchAll(/@feature(\d+)([a-z]?)/gi)].some((match) => `feature${match[1]}${match[2] ?? ''}` === alias)) continue;
      for (const match of line.matchAll(/\bFR-(\d+[a-z]?)\b/g)) {
        const owner = nodes.get(`${spec}:FR-${match[1]}`);
        if (owner?.type === 'FR') owners.add(owner.id);
      }
    }
  }
  return [...owners];
}

/**
 * Resolve the builder-owned `@featureN` edges after a cold or incremental parse.
 * FR heading/declared-alias metadata is authoritative; ambiguous aliases are
 * removed rather than falling back to the numeric FR-N node.
 */
export function resolveFeatureTagEdges(
  nodes: ReadonlyMap<string, Node>,
  edges: Edge[],
  repoRoot?: string,
): void {
  const featureOwners = new Map<string, string | null>();
  for (const node of nodes.values()) {
    if (node.type !== 'FR' || !node.spec) continue;
    const declaredAliases = (node.body ?? '').split(/\r?\n/)
      .filter((line) => /^\s*(?:\*\*(?:Feature|BDD|Executable evidence aliases)(?::)?\*\*:?\s*|Executable evidence aliases\s*:)/i.test(line))
      .join('\n');
    const source = `${node.title ?? ''}\n${declaredAliases}`;
    const aliases = new Set(
      [...source.matchAll(/@feature(\d+)([a-z]?)/gi)].map((match) => `feature${match[1]}${match[2] ?? ''}`),
    );
    node.featureAliases = [...aliases];
    for (const alias of aliases) {
      const key = `${node.spec}:${alias}`;
      const previous = featureOwners.get(key);
      featureOwners.set(key, previous === undefined ? node.id : previous === node.id ? node.id : null);
    }
  }
  if (repoRoot) {
    const specs = new Set([...nodes.values()].map((node) => node.spec).filter((spec): spec is string => Boolean(spec)));
    for (const slug of specs) {
      const requirementsPath = path.join(repoRoot, '.specs', slug, 'REQUIREMENTS.md');
      if (!fs.existsSync(requirementsPath)) continue;
      for (const line of fs.readFileSync(requirementsPath, 'utf8').split(/\r?\n/)) {
        const featureTags = [...line.matchAll(/@feature(\d+)([a-z]?)/gi)];
        for (const frMatch of line.matchAll(/\bFR-(\d+[a-z]?)\b/g)) {
          const owner = nodes.get(`${slug}:FR-${frMatch[1]}`);
          if (owner?.type !== 'FR') continue;
          for (const featureTag of featureTags) {
            const alias = `feature${featureTag[1]}${featureTag[2] ?? ''}`;
            owner.featureAliases = [...new Set([...(owner.featureAliases ?? []), alias])];
            const key = `${slug}:${alias}`;
            const previous = featureOwners.get(key);
            featureOwners.set(key, previous === undefined ? owner.id : previous === owner.id ? owner.id : null);
          }
        }
      }
    }
  }
  for (let i = edges.length - 1; i >= 0; i--) {
    const target = nodes.get(edges[i].to);
    if (edges[i].type === 'tested-by' && edges[i].metadata?.producer === 'gherkin-feature-tag' && target?.type === 'Scenario' && target.spec) {
      edges.splice(i, 1);
    }
  }
  const emitted = new Set<string>();
  for (const node of nodes.values()) {
    if (node.type !== 'Scenario' || !node.spec) continue;
    for (const tag of node.tags) {
      const feature = tag.match(/^@feature(\d+)([a-z]?)$/i);
      if (!feature) continue;
      const alias = `feature${feature[1]}${feature[2] ?? ''}`;
      const direct = `${node.spec}:FR-${feature[1]}${feature[2] ?? ''}`;
      const owner = featureOwners.get(`${node.spec}:${alias}`);
      if (owner === null) continue;
      const from = owner ?? (nodes.has(direct) ? direct : undefined);
      if (!from) continue;
      const key = `${from}|${node.id}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      edges.push({ from, to: node.id, type: 'tested-by', metadata: { producer: 'gherkin-feature-tag', version: '1' } });
    }
  }
}

/** Build a fresh SpecGraph from a corpus root. */
export function buildGraph(opts: BuildOptions): SpecGraph {
  const { repoRoot } = opts;
  let currentGitSha: string | undefined;
  try {
    currentGitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', timeout: 5000 }).trim() || undefined;
  } catch {
    // The Docker runtime has no .git, but its launcher stamps the checkout SHA
    // into both the process environment and BDD evidence. Do not apply that SHA
    // to temporary/external corpora built by tests or MCP callers.
    const isRuntimeCorpus = path.resolve(repoRoot) === path.resolve(process.cwd());
    currentGitSha = isRuntimeCorpus ? process.env.DEV_POMOGATOR_GIT_SHA || undefined : undefined;
  }
  const mdRoots = (opts.mdRoots ?? ['.specs']).map((r) => path.resolve(repoRoot, r));
  const featureRoots = (opts.featureRoots ?? ['.specs', 'tests/features']).map((r) =>
    path.resolve(repoRoot, r),
  );
  const ndjsonPath = path.resolve(
    repoRoot,
    opts.ndjsonPath ?? '.dev-pomogator/.last-test-run.ndjson',
  );
  const scenarioOverlayPath = path.resolve(
    repoRoot,
    opts.scenarioOverlayPath ?? '.dev-pomogator/.scenario-results.ndjson',
  );
  const pytestBddPath = path.resolve(
    repoRoot,
    opts.pytestBddPath ?? DEFAULT_PYTEST_BDD_REPORT_PATH,
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
  const normalizationCollisionList: IdentityCollision[] = [];
  const identitiesByKey = new Map<string, Node>();

  const mergeNode = (node: Node): void => {
    totalRawNodes++;
    const existing = nodes.get(node.id);
    if (existing) {
      rawCollisionList.push({ id: node.id, firstFile: existing.file, secondFile: node.file });
      return;
    }
    const normalizedKey = identityCollisionKey({ namespace: node.spec, localId: localIdOf(node.id) });
    const normalizedExisting = identitiesByKey.get(normalizedKey);
    const kind = normalizedExisting
      ? classifyIdentityCollision(normalizedExisting.id, node.id)
      : null;
    if (normalizedExisting && kind && kind !== 'EXACT') {
      normalizationCollisionList.push({
        kind,
        normalizedKey,
        firstId: normalizedExisting.id,
        secondId: node.id,
        firstFile: normalizedExisting.file,
        secondFile: node.file,
      });
    } else if (!normalizedExisting) {
      identitiesByKey.set(normalizedKey, node);
    }
    nodes.set(node.id, node);
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
  const featureFiles = [...new Set(featureRoots.flatMap((root) => walkDir(root, ['.feature'])))];
  const externalFeatureOwners = new Map<string, string | null>();
  const registerExternalFeatureOwner = (featurePath: string, owner: string): void => {
    const previous = externalFeatureOwners.get(featurePath);
    externalFeatureOwners.set(featurePath, previous === undefined || previous === owner ? owner : null);
  };
  for (const changesAbs of mdFiles.filter((file) => path.basename(file) === 'FILE_CHANGES.md')) {
    const relChanges = path.relative(repoRoot, changesAbs).split(path.sep).join('/');
    const owner = specOf(relChanges);
    if (!owner) continue;
    for (const row of parseFileChangesFile(changesAbs)) {
      if (!/\.feature$/i.test(row.file_path)) continue;
      const rowPath = row.file_path.replace(/\\/g, '/');
      const featurePath = rowPath.startsWith('.specs/') || rowPath.startsWith('tests/')
        ? path.posix.normalize(rowPath)
        : path.posix.normalize(`.specs/${owner}/${rowPath}`);
      registerExternalFeatureOwner(featurePath, owner);
    }
  }
  const canonicalScenarioKeys = new Set<string>();
  const canonicalBodyOwners = new Map<string, Set<string>>();
  const artifactMirrorTags = new Map<string, Set<string>>();
  const scenarioBodyKey = (node: ScenarioNode): string =>
    `${node.title}\u0000${node.steps.map((step) => `${step.keyword}:${step.text}`).join('\u0001')}`;
  const scenarioKeyFor = (node: ScenarioNode, owner?: string): string =>
    `${owner ?? node.spec ?? specOf(node.file) ?? ''}\u0002${scenarioBodyKey(node)}`;
  for (const canonicalFile of featureFiles.filter((file) => file.replace(/\\/g, '/').includes('/.specs/'))) {
    const isArtifact = canonicalFile.replace(/\\/g, '/').includes('/_artifact/features/');
    try {
      const canonicalSlice = parseGherkinFile(canonicalFile, repoRoot);
      for (const node of canonicalSlice.nodes) {
        if (node.type !== 'Scenario') continue;
        const key = scenarioKeyFor(node);
        if (isArtifact) {
          const tags = artifactMirrorTags.get(key) ?? new Set<string>();
          for (const tag of node.tags) tags.add(tag);
          artifactMirrorTags.set(key, tags);
        } else {
          canonicalScenarioKeys.add(key);
          const owners = canonicalBodyOwners.get(scenarioBodyKey(node)) ?? new Set<string>();
          owners.add(node.spec ?? specOf(node.file) ?? '');
          canonicalBodyOwners.set(scenarioBodyKey(node), owners);
        }
      }
    } catch {}
  }
  for (const abs of featureFiles) {
    const mirrorHeader = !abs.replace(/\\/g, '/').includes('/.specs/')
      ? fs.readFileSync(abs, 'utf8').slice(0, 500).match(/^#\s*Source:\s+(\.specs\/[^\r\n]+\.feature)\s*$/m)?.[1]
      : undefined;
    const mirrorSlug = mirrorHeader?.match(/^\.specs\/(.+)\/[^/]+\.feature$/)?.[1];
    let slice;
    try {
      slice = parseGherkinFile(abs, repoRoot);
    } catch {
      continue;
    }
    const sourceText = fs.readFileSync(abs, 'utf8');
    const explicitScenarioOwners = new Map<number, string>();
    const sourceLines = sourceText.split(/\r?\n/);
    for (let i = 0; i < sourceLines.length; i++) {
      if (!/^\s*Scenario(?:\s+Outline)?:\s*/.test(sourceLines[i])) continue;
      for (let j = i - 1; j >= 0; j--) {
        if (sourceLines[j].trim() === '') continue;
        if (/^\s*@\S/.test(sourceLines[j])) continue;
        const owner = sourceLines[j].match(/^\s*#\s*Owner:\s*([a-z0-9][a-z0-9/-]*)\s*$/i)?.[1];
        if (owner) explicitScenarioOwners.set(i + 1, owner);
        break;
      }
    }
    const relativeFeature = path.relative(repoRoot, abs).split(path.sep).join('/');
    const hasDeclaredOwner = externalFeatureOwners.has(relativeFeature);
    const declaredOwner = externalFeatureOwners.get(relativeFeature);
    const featureHeader = sourceText.match(/^\s*#\s*Owner:\s*([a-z0-9][a-z0-9/-]*)\s*$/im)?.[1];
    const fallbackOwner = hasDeclaredOwner ? declaredOwner ?? undefined : featureHeader;
    if (fallbackOwner || explicitScenarioOwners.size > 0) {
      for (const edge of slice.edges) {
        if (edge.from.includes(':')) continue;
        const target = slice.nodes.find((node) => node.id === edge.to);
        const owner = target?.type === 'Scenario'
          ? (explicitScenarioOwners.get(target.line) ?? fallbackOwner)
          : fallbackOwner;
        if (owner && nodes.has(`${owner}:${edge.from}`)) edge.from = `${owner}:${edge.from}`;
      }
      for (const node of slice.nodes) {
        if (node.type !== 'Scenario') continue;
        const owner = explicitScenarioOwners.get(node.line) ?? fallbackOwner;
        if (!owner) continue;
        for (const tag of node.tags) {
          const feature = tag.match(/^@feature(\d+)([a-z]?)$/i);
          const requirement = tag.match(/^@((?:FR|NFR|AC)[A-Za-z0-9._-]+)$/i);
          let from: string | undefined;
          if (feature) {
            const alias = `feature${feature[1]}${feature[2] ?? ''}`;
            const aliasOwners = featureAliasOwners(nodes, repoRoot, owner, alias);
            if (aliasOwners.length === 1) from = aliasOwners[0];
            else if (aliasOwners.length === 0 && nodes.has(`${owner}:FR-${feature[1]}${feature[2] ?? ''}`)) from = `${owner}:FR-${feature[1]}${feature[2] ?? ''}`;
          } else if (requirement && nodes.has(`${owner}:${requirement[1]}`)) {
            from = `${owner}:${requirement[1]}`;
          }
          if (!from) continue;
          if (!slice.edges.some((edge) => edge.from === from && edge.to === node.id && edge.type === 'tested-by')) {
            slice.edges.push({ from, to: node.id, type: 'tested-by' });
          }
        }
      }
    }
    const normalizedAbs = abs.replace(/\\/g, '/');
    const isArtifact = normalizedAbs.includes('/_artifact/features/');
    if (isArtifact || !normalizedAbs.includes('/.specs/')) {
      const duplicateScenarioIds = new Set(
        slice.nodes
          .filter((node): node is ScenarioNode => {
            const owner = mirrorSlug ?? fallbackOwner ?? (isArtifact ? node.spec : undefined);
            return owner
              ? canonicalScenarioKeys.has(scenarioKeyFor(node, owner))
              : (canonicalBodyOwners.get(scenarioBodyKey(node))?.size ?? 0) === 1;
          })
          .map((node) => node.id),
      );
      if (duplicateScenarioIds.size > 0) {
        slice.nodes = slice.nodes.filter((node) => !duplicateScenarioIds.has(node.id));
        slice.edges = slice.edges.filter((edge) => !duplicateScenarioIds.has(edge.from) && !duplicateScenarioIds.has(edge.to));
      }
    }
    else {
      for (const node of slice.nodes) {
        if (node.type !== 'Scenario') continue;
        const mirrorTags = artifactMirrorTags.get(scenarioKeyFor(node));
        if (mirrorTags) node.tags = [...new Set([...node.tags, ...mirrorTags])];
      }
    }
    // A declared executable mirror is not assumed byte-identical to the
    // canonical source. Keep its Scenario node, but qualify its explicit FR/
    // AC/NFR edges against the declared owner when that owner node exists.
    if (mirrorSlug) {
      for (const edge of slice.edges) {
        if (!edge.from.includes(':') && nodes.has(`${mirrorSlug}:${edge.from}`)) {
          edge.from = `${mirrorSlug}:${edge.from}`;
        }
      }
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
  // REQUIREMENTS.md BDD Suite Layout is an explicit ownership declaration for
  // feature files that intentionally keep the executable scenarios tag-light.
  // Materialise it as the same tested-by edge used by real Gherkin tags.
  const bddOwnershipSeen = new Set<string>();
  for (const requirementsAbs of mdFiles.filter((file) => path.basename(file) === 'REQUIREMENTS.md')) {
    const relRequirements = path.relative(repoRoot, requirementsAbs).split(path.sep).join('/');
    const slug = specOf(relRequirements);
    if (!slug) continue;
    const requirementsLines = fs.readFileSync(requirementsAbs, 'utf8').split(/\r?\n/);
    let inBddSuiteLayout = false;
    for (let i = 0; i < requirementsLines.length; i++) {
      const line = requirementsLines[i];
      if (/^##\s+/.test(line.trim())) {
        inBddSuiteLayout = /^##\s+BDD Suite Layout\b/i.test(line.trim());
        continue;
      }
      if (!inBddSuiteLayout) continue;
      const link = line.match(/\]\(([^)]+\.feature)\)/i);
      if (!link) continue;
      const frs = [...line.matchAll(/\bFR-(\d+[a-z]?)\b/gi)].map((match) => `FR-${match[1]}`);
      if (frs.length === 0) continue;
      const linkedPath = link[1].replace(/\\/g, '/');
      const featureRel = linkedPath.startsWith('.specs/')
        ? path.posix.normalize(linkedPath)
        : linkedPath.startsWith('tests/')
          ? path.posix.normalize(linkedPath)
          : path.posix.normalize(`.specs/${slug}/${linkedPath}`);
      const scenarios = [...nodes.values()].filter(
        (node): node is ScenarioNode => node.type === 'Scenario' && node.file === featureRel,
      );
      for (const scenario of scenarios) {
        for (const fr of frs) {
          const directId = `${slug}:${fr}`;
          const owner = nodes.has(directId)
            ? directId
            : [...nodes.values()].find(
              (node) => node.type === 'FR' && node.spec === slug && localIdOf(node.id).toLowerCase() === fr.toLowerCase(),
            )?.id;
          if (!owner) continue;
          const key = `${owner}|${scenario.id}`;
          if (bddOwnershipSeen.has(key)) continue;
          bddOwnershipSeen.add(key);
          edges.push({
            from: owner,
            to: scenario.id,
            type: 'tested-by',
            metadata: {
              producer: 'requirements-bdd-layout',
              source_file: relRequirements,
              source_line: i + 1,
              version: '1',
            },
          });
        }
      }
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
        source_file: sourceFile,
        source_line: line,
      },
    };
    if (action && ALLOWED_ACTIONS.has(action as ImplementsAction)) {
      edge.metadata!.action = action as ImplementsAction;
    }
    edges.push(edge);
  };

  for (const specDir of specDirs) {
    const relDir = path.relative(repoRoot, specDir).split(path.sep).join('/');
    const slug = specOf(`${relDir}/FILE_CHANGES.md`);
    // FR-36a: implements edges must reference the qualified FR key, or they
    // dangle once nodes are composite-keyed. Same-spec by construction.
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
          emitImplements(qualifyFr(fr), row.file_path, 'FILE_CHANGES', relFile, row.line ?? 1, row.action);
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

  // 3) Resolve feature-tag aliases before bare-id resolution. The repo-wide
  // `@featureN` convention normally means FR-N, but legacy/spec-domain files
  // legitimately associate a custom feature number with a different FR
  // (`FR-1 ... @feature100` in specs-workflow-jira-mode). The FR heading is
  // the authoritative association. A unique owner wins even when the direct
  // FR-N node exists; an ambiguous alias is removed rather than silently
  // attaching scenarios to FR-N.
  {
    const featureOwners = new Map<string, string | null>();
    for (const node of nodes.values()) {
      if (node.type !== 'FR' || !node.spec) continue;
      const declaredAliases = (node.body ?? '').split(/\r?\n/)
        .filter((line) => /^\s*(?:\*\*(?:Feature|BDD|Executable evidence aliases)(?::)?\*\*:?\s*|Executable evidence aliases\s*:)/i.test(line))
        .join('\n');
      const source = `${node.title ?? ''}\n${declaredAliases}`;
      const aliases = [...source.matchAll(/@feature(\d+)([a-z]?)/gi)].map((match) => `feature${match[1]}${match[2] ?? ''}`);
      node.featureAliases = [...new Set([...(node.featureAliases ?? []), ...aliases])];
      for (const alias of aliases) {
        const key = `${node.spec}:${alias}`;
        const previous = featureOwners.get(key);
        featureOwners.set(key, previous === undefined ? node.id : previous === node.id ? node.id : null);
      }
    }
    for (const specDir of specDirs) {
      const relDir = path.relative(repoRoot, specDir).split(path.sep).join('/');
      const slug = specOf(`${relDir}/FILE_CHANGES.md`);
      if (!slug) continue;
      const requirementsPath = path.join(specDir, 'REQUIREMENTS.md');
      if (!fs.existsSync(requirementsPath)) continue;
      for (const line of fs.readFileSync(requirementsPath, 'utf8').split(/\r?\n/)) {
        const featureTags = [...line.matchAll(/@feature(\d+)([a-z]?)/gi)];
        if (featureTags.length === 0) continue;
        for (const frMatch of line.matchAll(/\bFR-(\d+[a-z]?)\b/g)) {
          const frId = `${slug}:FR-${frMatch[1]}`;
          if (!nodes.has(frId)) continue;
          for (const featureTag of featureTags) {
            const key = `${slug}:feature${featureTag[1]}${featureTag[2] ?? ''}`;
            const ownerNode = nodes.get(frId);
            if (ownerNode?.type === 'FR') {
              ownerNode.featureAliases = [...new Set([...(ownerNode.featureAliases ?? []), `feature${featureTag[1]}${featureTag[2] ?? ''}`])];
            }
            const previous = featureOwners.get(key);
            featureOwners.set(key, previous === undefined ? frId : previous === frId ? frId : null);
          }
        }
      }
    }
    resolveFeatureTagEdges(nodes, edges, repoRoot);
  }

  // 4) FR-36a: resolve dangling BARE edge endpoints, unambiguously.
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
      const localId = localIdOf(n.id);
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

  // 3) Canonical Cucumber NDJSON + first-class pytest-bdd evidence + append-only overlay.
  //
  // Canonical artifact truth is recorded independently from joins: a valid
  // report with no matching authored scenario is INGESTED, while an absent or
  // malformed report is NOT_INGESTED and cannot be rewritten as not_run.
  const executionArtifacts: ExecutionArtifactIngestion[] = [];
  if (opts.skipNdjson) {
    for (const [kind, provenance, artifactPath] of [
      ['cucumber-messages-ndjson', 'cucumber-messages-ndjson', ndjsonPath],
      ['pytest-bdd-cucumber-json', PYTEST_BDD_SOURCE, pytestBddPath],
    ] as const) {
      executionArtifacts.push({
        kind,
        canonical: true,
        state: 'SKIPPED',
        reason: 'INGESTION_SKIPPED',
        provenance,
        path: path.relative(repoRoot, artifactPath).split(path.sep).join('/'),
        run_id: null,
        timestamp: null,
        counts: { parsed: 0, matched: 0, unmatched: 0, malformed: 0 },
      });
    }
  } else {
    const ndjson = parseNdjsonArtifactFile(ndjsonPath);
    const pytestBdd = parsePytestBddReportFile(pytestBddPath, repoRoot);
    const overlay = parseScenarioOverlayFile(scenarioOverlayPath);
    const scenarioIter: ScenarioNode[] = [];
    for (const n of nodes.values()) {
      if (n.type === 'Scenario') scenarioIter.push(n);
    }
    const ndjsonApplied = ndjson.state === 'INGESTED'
      ? applyTestResults(scenarioIter, ndjson.patch)
      : 0;
    executionArtifacts.push({
      kind: 'cucumber-messages-ndjson',
      canonical: true,
      state: ndjson.state,
      reason: ndjson.reason,
      provenance: 'cucumber-messages-ndjson',
      path: path.relative(repoRoot, ndjsonPath).split(path.sep).join('/'),
      run_id: null,
      timestamp: ndjson.timestamp,
      counts: {
        parsed: ndjson.patch.records,
        matched: ndjsonApplied,
        unmatched: Math.max(0, ndjson.patch.records - ndjsonApplied),
        malformed: ndjson.patch.malformed,
      },
    });
    // Preserve the full-run snapshot before a newer filtered overlay replaces
    // the effective result. Readiness uses this field as canonical evidence.
    for (const scenario of scenarioIter) {
      if (scenario.lastResult) {
        scenario.canonicalResult = scenario.lastResult;
        scenario.canonicalRunAt = scenario.lastRunAt;
        scenario.canonicalRunId = scenario.lastResultRunId;
        scenario.canonicalSource = scenario.lastResultSource;
      }
    }
    const pytestBddApplied = pytestBdd.state === 'INGESTED'
      ? applyScenarioOverlayResults(scenarioIter, pytestBdd.patch, { repoRoot, currentGitSha })
      : 0;
    executionArtifacts.push({
      kind: 'pytest-bdd-cucumber-json',
      canonical: true,
      state: pytestBdd.state,
      reason: pytestBdd.reason,
      provenance: PYTEST_BDD_SOURCE,
      path: pytestBdd.reportPath,
      run_id: pytestBdd.runId,
      timestamp: pytestBdd.reportTime,
      counts: {
        parsed: pytestBdd.executed,
        matched: pytestBddApplied,
        unmatched: Math.max(0, pytestBdd.executed - pytestBddApplied),
        malformed: pytestBdd.malformed,
      },
    });
    for (const scenario of scenarioIter) {
      if (scenario.lastResultSource === PYTEST_BDD_SOURCE && scenario.lastResult) {
        scenario.canonicalResult = scenario.lastResult;
        scenario.canonicalRunAt = scenario.lastRunAt;
        scenario.canonicalRunId = scenario.lastResultRunId;
        scenario.canonicalSource = scenario.lastResultSource;
      }
    }
    const overlayApplied = applyScenarioOverlayResults(scenarioIter, overlay, { repoRoot, currentGitSha });
    if (ndjsonApplied > 0 || pytestBddApplied > 0 || overlayApplied > 0) {
      // Emit a `last-result` edge per patched scenario so downstream tooling
      // can find «what was the last test run for FR-N» without consulting
      // the Scenario node directly.
      for (const s of scenarioIter) {
        if (s.lastResult) {
          edges.push({ from: s.id, to: `RESULT-${s.id}-${s.lastResult}`, type: 'last-result' });
        }
        if (s.trace?.traceId) {
          edges.push({ from: s.id, to: `TRACE-${s.trace.traceId}`, type: 'runtime-trace' });
        }
      }
      // `verifies` (#181): the evidence-bearing reverse of `tested-by`. Shared with
      // the incremental `refreshResultEdges` path so both stay consistent.
      edges.push(...verifiesEdgesFor(scenarioIter, testedBySourceMap(edges), (id) => nodes.get(id)?.type));
    }
  }

  // 4) Build backlinks from existing edges.
  for (const e of edges) {
    pushBacklink(e.from, { file: '', line: 0, type: e.type });
  }

  const graph: SpecGraph = {
    version: 1,
    builtAt: new Date().toISOString(),
    nodes,
    edges,
    definitions,
    backlinks,
    executionArtifacts,
    // File nodes (2b) and ndjson patches are EXCLUDED by construction —
    // mergeNode wraps only the parser-slice population, mirroring
    // collision-probe's rawCollisionScan scope.
    rawCollisions: {
      totalRawNodes,
      uniqueIds: totalRawNodes - rawCollisionList.length,
      collisions: rawCollisionList,
      normalizationCollisions: normalizationCollisionList,
    },
    endpointViolations: [],
  };
  refreshEndpointViolations(graph);
  return graph;
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
 * Index `tested-by` edges (FR/NFR/AC → Scenario) by their Scenario target, so a
 * Scenario id resolves to the requirement ids that test it. Shared by the full
 * and incremental `verifies` emitters (#181).
 */
export function testedBySourceMap(edges: readonly Edge[]): Map<string, string[]> {
  const byScenario = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== 'tested-by') continue;
    const list = byScenario.get(e.to) ?? [];
    list.push(e.from);
    byScenario.set(e.to, list);
  }
  return byScenario;
}

/**
 * Derive the `verifies` edges (#181) for a set of scenarios: a scenario that
 * actually PASSED verifies each FR/NFR it is tagged to, carrying producer/version
 * provenance from the run that produced the result. AC sources of `tested-by`
 * are dropped — only FR/NFR are legal `verifies` targets per EDGE_SCHEMA. Deduped
 * per (scenario, requirement) so repeated calls never double-emit.
 */
export function verifiesEdgesFor(
  scenarios: Iterable<ScenarioNode>,
  testedBySources: Map<string, string[]>,
  nodeType: (id: string) => NodeType | undefined,
): Edge[] {
  const out: Edge[] = [];
  const seen = new Set<string>();
  for (const s of scenarios) {
    if (s.lastResult !== 'PASSED') continue;
    const metadata: EdgeMetadata | undefined =
      s.trace?.source || s.trace?.gitSha ? { producer: s.trace?.source, version: s.trace?.gitSha } : undefined;
    for (const reqId of testedBySources.get(s.id) ?? []) {
      const reqType = nodeType(reqId);
      if (reqType !== 'FR' && reqType !== 'NFR') continue;
      const key = `${s.id}\0${reqId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from: s.id, to: reqId, type: 'verifies', ...(metadata ? { metadata } : {}) });
    }
  }
  return out;
}

/**
 * Convenience entry — build a graph from the current working directory.
 * Useful for CLI / benchmarking. Wraps `buildGraph` with sane defaults.
 */
export function buildGraphFromCwd(cwd: string = process.cwd(), opts: Omit<BuildOptions, 'repoRoot'> = {}): SpecGraph {
  return buildGraph({ ...opts, repoRoot: cwd, skipNdjson: opts.skipNdjson ?? false });
}
