/**
 * MCP tool registry — all 16 read-only tools (graph queries + the FR-39a read door).
 *
 * Each tool is a thin wrapper over the in-memory `SpecGraph` produced by the
 * Phase 1 builder. Wrappers do exactly two things: pluck the relevant subset
 * out of the graph + format an `explanation_for_agent` summary the agent can
 * paste back into its context.
 *
 * The 14 tools (base set per [SCHEMA Entity 3](../../.specs/spec-generator-v4/spec-generator-v4_SCHEMA.md);
 * + get_coverage FR-32, get_spec_status FR-38 — `buildToolRegistry` below is canonical):
 *
 *   get_trace               primary — structured tree + code_impl + explanation
 *   find_by_tags            scenarios filtered by `@FR/@NFR/@AC` tags
 *   conformance_check       run Phase-1 conformance over current graph
 *   search                  substring scan over node ids + titles
 *   get_node                raw node lookup by canonical id
 *   list_phase_tasks        tasks filtered by phase string
 *   get_test_result         last-result for a scenario id
 *   find_orphans            ORPHAN_* / UNCOVERED_FR findings only
 *   get_coverage            FR-32 — per-scenario buckets + per-task verified_status
 *   get_coverage_summary    per-spec FR/AC/Scenario counts
 *   get_spec_status         FR-38 — lifecycle enum + linked last_run summary
 *   validate_anchor         is anchor alias registered?
 *   list_specs              top-level `.specs/<slug>/` directories
 *   find_refs               incoming references for a node
 *   list_spec_docs          FR-39a — the read_spec_doc inventory of ONE spec
 *   read_spec_doc           FR-39a — whole-document read + spec-access audit log
 *
 * The handler signature is identical to the MCP SDK v1 `server.tool` callback
 * shape — receives the parsed input object, returns `{content: [{type, text}]}`.
 *
 * @see ./server.ts (entry point that wires this registry into McpServer)
 * @see .specs/spec-generator-v4/FR.md FR-4
 */

import { z } from 'zod';
import { checkConformance, type Finding } from '../spec-graph/conformance.ts';
import { gapsFromFindings, summariseGaps } from '../spec-graph/traceability.ts';
import fs from 'node:fs';
import path from 'node:path';
import { logSpecAccess } from './spec-access-log.ts';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateSpecChange, writeDocAtomic, isSafeSlug, resolveSpecDoc, docSha, casCheck, validateTarget, findInboundLinks, rewriteInboundLinks, isArchivedSlug, type SpecChange } from './mutations.ts';
import { writeSpecStatus, readSpecStatus } from '../spec-graph/spec-status-store.ts';
import { withWriteLock, type WriteLockBusyError } from './lock-manager.ts';
import { setEntityStatus } from './set-status.ts';
import { readProgressState, PHASE_ORDER, STOP_LABELS } from '../specs-validator/phase-constants.ts';
import type {
  SpecGraph,
  Node,
  FrNode,
  AcNode,
  DecisionNode,
  StoryNode,
  ScenarioNode,
  TaskNode,
  StepBindingNode,
  Edge,
  EdgeMetadata,
} from '../spec-graph/types.ts';
import {
  computeCoverage,
  bucketScenarios,
  verifiedStatus,
  mapTasksToScenarios,
  specOf,
  type Bucket,
  type ScenarioLike,
  type TaskLike,
} from '../spec-graph/coverage.ts';
import { readVerdicts } from '../spec-graph/test-quality-gate.ts';

/**
 * FR-36d (P13-3): resolve a tool-supplied node reference against the
 * composite-keyed graph. Accepted forms:
 *   - composite `slug:FR-2`              → exact lookup;
 *   - `{spec: 'slug', node_id: 'FR-2'}`  → exact lookup of `slug:FR-2`;
 *   - BARE `FR-2`, defined by ONE spec   → soft-resolved to that node;
 *   - BARE `FR-2`, defined by 2+ specs   → the sorted candidate list of
 *     `slug:id` keys — NEVER one arbitrary node (the bare-id collision used
 *     to silently return the last-writer; that is the FR-36 root bug).
 */
function resolveNodeRef(
  graph: SpecGraph,
  nodeId: string,
  spec?: string,
): { node?: Node; candidates?: string[] } {
  if (spec) {
    const exact = graph.nodes.get(`${spec}:${nodeId}`);
    return exact ? { node: exact } : {};
  }
  const direct = graph.nodes.get(nodeId); // composite form, or a genuine bare node
  if (direct) return { node: direct };
  const matches: Node[] = [];
  for (const n of graph.nodes.values()) {
    if (n.spec && n.id === `${n.spec}:${nodeId}`) matches.push(n);
  }
  if (matches.length === 1) return { node: matches[0] };
  if (matches.length > 1) return { candidates: matches.map((n) => n.id).sort() };
  return {};
}

/** Uniform AMBIGUOUS_BARE_ID envelope for every node-ref tool (FR-36d). */
function ambiguousBareId(nodeId: string, candidates: string[]): ToolResult {
  return asJsonResult({
    ok: false,
    error: 'AMBIGUOUS_BARE_ID',
    node_id: nodeId,
    candidates,
    hint: `Bare id "${nodeId}" is defined by ${candidates.length} specs — qualify as <slug>:${nodeId} or pass {spec: "<slug>"}.`,
  });
}

/** Build every Scenario as a ScenarioLike + an id→bucket index for FR-32 derivation. */
function scenarioCoverageIndex(graph: SpecGraph): { scens: ScenarioLike[]; bucketById: Map<string, Bucket> } {
  const scens: ScenarioLike[] = [];
  for (const n of graph.nodes.values()) {
    if (n.type === 'Scenario') {
      const s = n as ScenarioNode;
      scens.push({ id: s.id, tags: s.tags, result: s.lastResult, spec: specOf(s.file) });
    }
  }
  const bucketById = new Map<string, Bucket>();
  const b = bucketScenarios(scens);
  for (const k of Object.keys(b) as Bucket[]) for (const id of b[k]) bucketById.set(id, k);
  return { scens, bucketById };
}

/** Scenarios linked to a node (FR → @feature<N>, Task → refs map, else tested-by ids). */
function linkedScenarioIds(node: Node, scens: ScenarioLike[], testedByIds: string[]): string[] {
  const nodeSpec = specOf(node.file);
  if (node.type === 'Task') {
    return (
      mapTasksToScenarios(
        [{ id: node.id, doneWhen: '', refs: (node as TaskNode).refs, spec: nodeSpec }],
        scens,
      ).get(node.id) ?? []
    );
  }
  if (node.type === 'FR') {
    const num = node.id.match(/FR-(\d+)/i)?.[1];
    if (!num) return testedByIds;
    const tag = `@feature${num}`;
    // Same-spec scoping (FR-N ↔ @featureN tags collide across specs): an FR is
    // verified only by scenarios in its own spec when the spec is known.
    return scens
      .filter((s) => s.tags.map((t) => t.toLowerCase()).includes(tag))
      .filter((s) => nodeSpec === undefined || s.spec === nodeSpec)
      .map((s) => s.id);
  }
  return testedByIds;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
}

export interface ToolDefinition<TShape extends z.ZodRawShape> {
  name: string;
  description: string;
  inputShape: TShape;
  handler: (args: z.infer<z.ZodObject<TShape>>) => Promise<ToolResult>;
}

/**
 * Format a `ToolResult` from a JSON-stringifiable payload.
 * MCP responses always carry text content; the JSON is the canonical envelope.
 */
function asJsonResult(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/** Truncate a string to ≤max chars, suffixing with `…` when truncated. */
function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

/** Slugify a markdown heading the way the anchor resolver does (lowercase,
 *  non-alnum → `-`, trimmed). Lets `section` match either the heading TEXT
 *  ("## FR-14") or its anchor ("fr-14"). */
function slugifyHeading(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * P21-2: extract ONE markdown section — from the matched heading down to (but
 * not including) the next heading of the SAME-or-higher level — so the agent can
 * pull just `## FR-14` out of a 77KB FR.md instead of the whole doc. `query`
 * matches the heading text or its `#anchor` (leading `#` is tolerated). Returns
 * null when no heading matches.
 */
export function sliceSection(
  lines: readonly string[],
  query: string,
): { heading: string; startLine: number; endLine: number; lines: string[] } | null {
  const q = query.replace(/^#+/, '').trim();
  const qSlug = slugifyHeading(q);
  let startIdx = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (!m) continue;
    const text = m[2].trim();
    if (text === q || slugifyHeading(text) === qSlug) {
      startIdx = i;
      level = m[1].length;
      break;
    }
  }
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= level) {
      endIdx = i;
      break;
    }
  }
  return {
    heading: lines[startIdx].replace(/^#+\s+/, '').trim(),
    startLine: startIdx + 1,
    endLine: endIdx,
    lines: lines.slice(startIdx, endIdx),
  };
}

/** Build the «one-paragraph context for the agent» summary for a single FR. */
function summariseFrTrace(
  fr: FrNode,
  acs: AcNode[],
  scenarios: ScenarioNode[],
  tasks: TaskNode[],
): string {
  const acCount = acs.length;
  const scenCount = scenarios.length;
  const taskCount = tasks.length;
  const passed = scenarios.filter((s) => s.lastResult === 'PASSED').length;
  const failed = scenarios.filter((s) => s.lastResult === 'FAILED').length;
  const failingScenario = scenarios.find((s) => s.lastResult === 'FAILED');
  const failingStep = failingScenario?.failingStep;

  let s = `${fr.id} "${fr.title ?? '(no title)'}"`;
  s += ` — ${acCount} AC, ${scenCount} scenarios (${passed} PASS, ${failed} FAIL), ${taskCount} tasks.`;
  if (failingStep) {
    s += ` Last failure: ${failingScenario!.id} at "${clamp(failingStep.step, 60)}" — ${clamp(failingStep.errorMessage, 80)}.`;
  }
  return clamp(s, 500);
}

/**
 * One `code_impl[]` entry surfaced by `get_trace` per FR-30.
 *
 * Mirrors `EdgeMetadata` for `implements` edges (FR-29) — `file_path` is the
 * repo-relative POSIX path, `source_section` reports whether the linkage came
 * from `FILE_CHANGES.md` or `DESIGN.md`, and `action` is the FILE_CHANGES
 * verb (`create` / `edit` / ...) when available.
 *
 * `action` is omitted (not `null`) when the edge originated from DESIGN.md
 * (no action verb in that source) — matches the on-disk `EdgeMetadata` shape.
 */
interface CodeImplEntry {
  file_path: string;
  action?: EdgeMetadata['action'];
  source_section: NonNullable<EdgeMetadata['source_section']>;
}

/**
 * Compute the `code_impl[]` array surfaced for a given node per FR-30.
 *
 * Rules:
 *  - FR     → all `implements` edges from this FR, in source order.
 *  - AC     → inherits the parent FR's `code_impl` transitively.
 *  - Scenario → StepBinding code-file refs ∪ tagged-FR `code_impl` (deduped
 *               by `file_path`; first-seen entry wins).
 *  - Task   → `task.files[]` ∪ each ref'd FR's `code_impl` (deduped; first
 *             wins). `files[]` is an optional field not yet on TaskNode in
 *             the Phase-1 schema — read defensively.
 *  - Other  → [] (e.g. NFR, UseCase, Risk, File, StepBinding).
 *
 * Empty result is always an array (`[]`, never `undefined`) so the response
 * shape stays stable per FR-30 (AC-30.1 second clause).
 */
function computeCodeImpl(node: Node, graph: SpecGraph): CodeImplEntry[] {
  if (node.type === 'FR') return directImplements(node.id, graph);

  if (node.type === 'AC') {
    const parent = (node as AcNode).parentFr;
    if (!parent) return [];
    return directImplements(parent, graph);
  }

  if (node.type === 'Scenario') {
    const scen = node as ScenarioNode;
    const out: CodeImplEntry[] = [];
    const seen = new Set<string>();

    // StepBinding code files — emit BEFORE inherited FR entries so explicit
    // step bindings win on dedup.
    for (const edge of graph.edges) {
      if (edge.from !== scen.id || edge.type !== 'step-binding') continue;
      const to = graph.nodes.get(edge.to);
      if (!to || to.type !== 'StepBinding') continue;
      const codeFile = (to as StepBindingNode).codeFile;
      if (codeFile && !seen.has(codeFile)) {
        seen.add(codeFile);
        out.push({ file_path: codeFile, source_section: 'DESIGN' });
      }
    }

    // Inherit code_impl from every FR/NFR tagged by the scenario.
    for (const tag of scen.tags) {
      const bare = tag.startsWith('@') ? tag.slice(1) : tag;
      // FR-36a: tags stay bare in .feature files; nodes are spec-qualified.
      // Same-spec lookup first, then bare (hand-built graphs) — mirrors
      // collectImplementsWarnings.
      const tagged =
        (scen.spec ? graph.nodes.get(`${scen.spec}:${bare}`) : undefined) ?? graph.nodes.get(bare);
      if (!tagged) continue;
      if (tagged.type !== 'FR' && tagged.type !== 'NFR') continue;
      for (const entry of directImplements(tagged.id, graph)) {
        if (!seen.has(entry.file_path)) {
          seen.add(entry.file_path);
          out.push(entry);
        }
      }
    }
    return out;
  }

  if (node.type === 'Task') {
    const task = node as TaskNode & { files?: string[] };
    const out: CodeImplEntry[] = [];
    const seen = new Set<string>();

    // task.files[] is not part of the Phase-1 TaskNode schema yet (TASKS.md
    // parser ships in a follow-up sub-PR). Treat as optional — when absent
    // we just fall through to ref'd FR inheritance.
    for (const fp of task.files ?? []) {
      if (typeof fp !== 'string' || !fp) continue;
      if (!seen.has(fp)) {
        seen.add(fp);
        out.push({ file_path: fp, source_section: 'FILE_CHANGES' });
      }
    }

    for (const refId of task.refs ?? []) {
      const ref = graph.nodes.get(refId);
      if (!ref || (ref.type !== 'FR' && ref.type !== 'NFR')) continue;
      for (const entry of directImplements(ref.id, graph)) {
        if (!seen.has(entry.file_path)) {
          seen.add(entry.file_path);
          out.push(entry);
        }
      }
    }
    return out;
  }

  return [];
}

/**
 * Direct `implements` edges from a FR/NFR id → CodeImplEntry[].
 *
 * Walks the edge list once, materialising each `implements` edge into a
 * `code_impl` entry from its `metadata`. Edges without metadata or with no
 * `file_path` fall back to the target node's `path` (FileNode). This keeps
 * the helper robust to edges produced by future parsers that may not always
 * populate metadata.
 */
function directImplements(frId: string, graph: SpecGraph): CodeImplEntry[] {
  const out: CodeImplEntry[] = [];
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.from !== frId || edge.type !== 'implements') continue;
    const entry = edgeToCodeImpl(edge, graph);
    if (!entry) continue;
    if (seen.has(entry.file_path)) continue;
    seen.add(entry.file_path);
    out.push(entry);
  }
  return out;
}

/** Materialise one `implements` edge into a `CodeImplEntry`, or `null` if the edge is malformed. */
function edgeToCodeImpl(edge: Edge, graph: SpecGraph): CodeImplEntry | null {
  const meta = edge.metadata ?? {};
  let filePath = meta.file_path;
  if (!filePath) {
    const target = graph.nodes.get(edge.to);
    if (target?.type === 'File') filePath = (target as { path: string }).path;
  }
  if (!filePath) return null;
  const entry: CodeImplEntry = {
    file_path: filePath,
    source_section: meta.source_section ?? 'FILE_CHANGES',
  };
  if (meta.action) entry.action = meta.action;
  return entry;
}

/**
 * Shape of a malformed-edge warning surfaced inside `get_trace.warnings[]`.
 *
 * Emitted when an `implements` edge resolves to neither a `metadata.file_path`
 * nor a `FileNode.path` target. Per SPECGEN004_64 the field is REQUIRED to be
 * present and actionable — the agent needs the edge's source location to fix
 * the offending FILE_CHANGES/DESIGN row.
 */
interface ImplementsWarning {
  code: 'MALFORMED_IMPLEMENTS_EDGE';
  from: string;
  to: string;
  /**
   * Source location of the offending edge. Falls back to the source FR's file
   * + line when the edge itself carries no anchor; the FR node is always
   * reachable because the edge has a `from` pointing at it.
   */
  source: { file: string; line: number };
  message: string;
}

/**
 * Collect malformed `implements` edges originating from a node or its parent
 * FR (when the node is an AC). Mirrors the dedup/inheritance rules used by
 * `directImplements` / `computeCodeImpl` so the surfaced warnings line up with
 * what the agent would have seen as `code_impl[]` entries had they not been
 * dropped.
 */
function collectImplementsWarnings(node: Node, graph: SpecGraph): ImplementsWarning[] {
  const out: ImplementsWarning[] = [];
  const sources: string[] = [];
  if (node.type === 'FR') sources.push(node.id);
  else if (node.type === 'AC') {
    const parent = (node as AcNode).parentFr;
    if (parent) sources.push(parent);
  } else if (node.type === 'Scenario') {
    for (const tag of (node as ScenarioNode).tags) {
      const bare = tag.startsWith('@') ? tag.slice(1) : tag;
      // FR-36a: tags stay bare in .feature files; nodes are spec-qualified.
      // Resolve same-spec first, then the bare id (hand-built graphs).
      const tagged =
        (node.spec ? graph.nodes.get(`${node.spec}:${bare}`) : undefined) ?? graph.nodes.get(bare);
      if (tagged && (tagged.type === 'FR' || tagged.type === 'NFR')) sources.push(tagged.id);
    }
  }
  if (sources.length === 0) return out;
  const sourceSet = new Set(sources);
  for (const edge of graph.edges) {
    if (edge.type !== 'implements') continue;
    if (!sourceSet.has(edge.from)) continue;
    if (edgeToCodeImpl(edge, graph)) continue;
    const fromNode = graph.nodes.get(edge.from);
    out.push({
      code: 'MALFORMED_IMPLEMENTS_EDGE',
      from: edge.from,
      to: edge.to,
      source: {
        file: fromNode?.file ?? '',
        line: fromNode?.line ?? 0,
      },
      message: `implements edge ${edge.from} -> ${edge.to} is missing file_path metadata and target is not a File node`,
    });
  }
  return out;
}

interface GraphRef {
  id: string;
  type: string;
  file: string;
  line: number;
  relation: string;
  direction: 'incoming' | 'outgoing';
}

/**
 * "Find all references" over the graph's real cross-links: incoming/outgoing
 * edges plus the task→FR refs the edge set doesn't carry. This is SPEC-DOMAIN
 * reference-finding (semantic `covers` / `tested-by` / `implements` / `refs`
 * edges) — distinct from Markdown wiki-link navigation, which Marksman's native
 * LSP owns (FR-7b). Backs the `find_refs` tool.
 */
function collectGraphRefs(graph: SpecGraph, id: string): GraphRef[] {
  const seen = new Set<string>();
  const references: GraphRef[] = [];
  const add = (
    n: { id: string; type: string; file: string; line: number } | undefined,
    relation: string,
    direction: 'incoming' | 'outgoing',
  ): void => {
    if (!n || n.id === id) return;
    const key = `${n.id}|${relation}|${direction}`;
    if (seen.has(key)) return;
    seen.add(key);
    references.push({ id: n.id, type: n.type, file: n.file, line: n.line, relation, direction });
  };
  for (const e of graph.edges) {
    if (e.from === id) add(graph.nodes.get(e.to), e.type, 'outgoing');
    if (e.to === id) add(graph.nodes.get(e.from), e.type, 'incoming');
  }
  for (const n of graph.nodes.values()) {
    if (n.type === 'Task' && (n as TaskNode).refs.includes(id)) add(n, 'refs', 'incoming');
  }
  return references;
}

export interface RegistryOptions {
  /**
   * FR-40c graph freshness after a mutation. Inside the running MCP server the
   * FR-14 watcher patches the graph on the disk write — leave unset there.
   * Watcher-less embedders (tests, one-shot scripts) pass an explicit rebuild.
   */
  refreshGraph?: () => void;
  /**
   * P21-1 multi-session door: when this returns a holder record the server
   * booted READ-ONLY (another live session owns the write-lock). The three
   * write tools (apply_spec_change / delete_spec_doc / create_spec) then refuse
   * with `WRITE_LOCK_HELD`; reads + the `propose_spec_change` dry-run stay live.
   * Unset (or returning null) = this session owns the lock → writes proceed.
   */
  writeLockHeldBy?: () => { pid: number; env: string; started_at: string } | null;
}

export function buildToolRegistry(
  getGraph: () => SpecGraph,
  registryOpts: RegistryOptions = {},
): ToolDefinition<z.ZodRawShape>[] {
  const tools: ToolDefinition<z.ZodRawShape>[] = [];

  // P21-1: when the door is read-only (a sibling session owns the write-lock),
  // every write tool short-circuits here with the holder named. Returns null
  // when writable, so a write handler does `const ro = readOnlyRefusal(...); if
  // (ro) return ro;` as its first line.
  // E-A (FR-8..FR-13, 2026-06-18): the lifetime write-exclusivity is GONE — every session's
  // door can write, serialized per-mutation by the short `withWriteLock` (lock-manager.ts) +
  // the existing optimistic CAS for same-doc conflicts. This refusal is now a NO-OP kept only
  // so the call sites stay structurally identical (returns null → writes proceed). WRITE_LOCK_HELD
  // (lifetime) is replaced by a transient WRITE_LOCK_BUSY raised only DURING another session's
  // in-flight write. (Set TEST_QUALITY... no — controlled solely by the lock now.)
  const readOnlyRefusal = (_tool: string, _args: unknown): ToolResult | null => null;

  // ─── 1) get_trace ───────────────────────────────────────────────────────
  tools.push({
    name: 'get_trace',
    description:
      'Get the full requirement trace for a node id: AC + Scenarios + Tasks + ' +
      'code_impl[] (implements edges per FR-30) + related nodes + a ≤500-char ' +
      'natural-language summary for the agent.',
    inputShape: {
      node_id: z.string(),
      spec: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ node_id, spec }) => {
      const graph = getGraph();
      // FR-36d: slug:id / {spec, node_id} / bare-unique resolve; bare-colliding → candidates.
      const { node, candidates } = resolveNodeRef(graph, node_id as string, spec as string | undefined);
      if (candidates) return ambiguousBareId(node_id as string, candidates);
      if (!node) {
        return asJsonResult({
          ok: false,
          error: 'NODE_NOT_FOUND',
          node_id,
          hint: `No node with id ${node_id}. Try /tools/list_specs to enumerate.`,
        });
      }
      const acs: AcNode[] = [];
      const decisions: DecisionNode[] = [];
      const stories: StoryNode[] = [];
      const scenarios: ScenarioNode[] = [];
      const tasks: TaskNode[] = [];
      const related: Array<{ id: string; type: string; relation: string }> = [];

      for (const edge of graph.edges) {
        if (edge.from === node.id) {
          const to = graph.nodes.get(edge.to);
          if (!to) continue;
          if (edge.type === 'covers' && to.type === 'AC') acs.push(to as AcNode);
          else if (edge.type === 'covers' && to.type === 'Decision') decisions.push(to as DecisionNode);
          else if (edge.type === 'covers' && to.type === 'Story') stories.push(to as StoryNode);
          else if (edge.type === 'tested-by' && to.type === 'Scenario') {
            scenarios.push(to as ScenarioNode);
          } else related.push({ id: to.id, type: to.type, relation: edge.type });
        }
        if (edge.to === node.id && edge.type === 'covers') {
          const from = graph.nodes.get(edge.from);
          if (from?.type === 'FR') related.push({ id: from.id, type: from.type, relation: 'covered-by' });
        }
      }
      // FR-36c (P13-2): the FR→Scenario `tested-by` edges ARE built now — the
      // gherkin parser emits a real same-spec edge for both `@FR-N` and
      // `@featureN` tags, so the edge loop above already collected the
      // scenarios. The old tag-scan workaround (iterate every Scenario node,
      // match `@feature${N}` + same-spec file prefix) is removed: get_trace
      // answers via REAL edges (SPECGEN004_92).
      for (const n of graph.nodes.values()) {
        if (n.type !== 'Task') continue;
        const t = n as TaskNode;
        if (t.refs.includes(node.id)) tasks.push(t);
      }

      const explanation =
        node.type === 'FR'
          ? summariseFrTrace(node as FrNode, acs, scenarios, tasks)
          : `${node.id} (${node.type}) at ${node.file}:${node.line}`;

      const warnings = collectImplementsWarnings(node, graph);
      // FR-32: derive verified_status for this node from the latest run — never
      // reports DONE while a linked scenario is pending/undefined/ambiguous.
      const { scens, bucketById } = scenarioCoverageIndex(graph);
      const verified_status = verifiedStatus(
        linkedScenarioIds(node, scens, scenarios.map((s) => s.id)),
        bucketById,
      );
      return asJsonResult({
        ok: true,
        node: { id: node.id, type: node.type, file: node.file, line: node.line, verified_status },
        acceptance_criteria: acs.map((a) => ({ id: a.id, file: a.file, line: a.line })),
        // FR-47c: the design leg — Decisions covering this FR (real `covers` edges built
        // from explicit `**Требование:**` lines), so the trace web is navigable FR→design.
        design_decisions: decisions.map((d) => ({ id: d.id, file: d.file, line: d.line, parentFr: d.parentFr })),
        // FR-47: the story leg — user Stories motivating this FR (real `covers` edges).
        user_stories: stories.map((s) => ({ id: s.id, file: s.file, line: s.line, parentFr: s.parentFr })),
        scenarios: scenarios.map((s) => ({
          id: s.id,
          file: s.file,
          line: s.line,
          tags: s.tags,
          lastResult: s.lastResult ?? 'UNKNOWN',
          failingStep: s.failingStep ?? null,
          // FR-30/SPECGEN004_19: per-scenario code_impl so step-binding refs
          // (e.g. Reqnroll C# .cs files) surface in the FR's trace tree. Uses
          // the same computeCodeImpl — additive field, node-level code_impl
          // (and FR aggregation for _60-_64) is unchanged.
          code_impl: computeCodeImpl(s, graph),
        })),
        // FR-46d: surface the task's OWN scenario (the specgen004_NN it cites in Done-When)
        // + its last result, so task↔own-scenario traceability is visible, not just task→FR.
        tasks: tasks.map((t) => {
          const m = (t.doneWhen ?? '').match(/s[pc]e[cn]gen004[_-](\d+)/i);
          let own_scenario: { id: string; lastResult: string } | null = null;
          if (m) {
            const sc = [...graph.nodes.values()].find(
              (n) => n.type === 'Scenario' && new RegExp(`specgen004[_-]${m[1]}(?:\\D|$)`, 'i').test(n.id),
            ) as ScenarioNode | undefined;
            own_scenario = sc
              ? { id: sc.id, lastResult: sc.lastResult ?? 'UNKNOWN' }
              : { id: `SPECGEN004_${m[1]}`, lastResult: 'NOT_FOUND' };
          }
          return { id: t.id, status: t.status, file: t.file, line: t.line, own_scenario };
        }),
        code_impl: computeCodeImpl(node, graph),
        warnings,
        related_nodes: related,
        explanation_for_agent: explanation,
      });
    },
  });

  // ─── 2) find_by_tags ────────────────────────────────────────────────────
  tools.push({
    name: 'find_by_tags',
    description: 'List all Scenarios whose tag set contains every supplied tag (AND semantics).',
    inputShape: { tags: z.array(z.string()).min(1) } as const satisfies z.ZodRawShape,
    handler: async ({ tags }) => {
      const required = new Set((tags as string[]).map((t) => t.startsWith('@') ? t : `@${t}`));
      const out: Array<{ id: string; file: string; line: number; tags: string[] }> = [];
      for (const node of getGraph().nodes.values()) {
        if (node.type !== 'Scenario') continue;
        const s = node as ScenarioNode;
        const have = new Set(s.tags);
        let ok = true;
        for (const r of required) if (!have.has(r)) { ok = false; break; }
        if (ok) out.push({ id: s.id, file: s.file, line: s.line, tags: s.tags });
      }
      return asJsonResult({ ok: true, scenarios: out, count: out.length });
    },
  });

  // ─── 3) conformance_check ───────────────────────────────────────────────
  tools.push({
    name: 'conformance_check',
    description:
      'Run the Phase-1 conformance ruleset over the in-memory graph and ' +
      'return Finding[] (UNCOVERED_FR / ORPHAN_TASK / SCENARIO_TAG_ORPHAN / UNTAGGED_SCENARIO).',
    inputShape: {
      scope: z.array(z.string()).optional(),
      severity: z.enum(['error', 'warning', 'info']).optional(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const scope = (args as { scope?: string[] }).scope;
      const severity = (args as { severity?: 'error' | 'warning' | 'info' }).severity;
      let findings: Finding[] = checkConformance(getGraph());
      if (scope?.length) {
        const ids = new Set(scope);
        findings = findings.filter((f) => (f.nodeId && ids.has(f.nodeId)) || (f.relatedId && ids.has(f.relatedId)));
      }
      if (severity) findings = findings.filter((f) => f.severity === severity);
      return asJsonResult({ ok: true, findings, count: findings.length });
    },
  });

  // ─── 4) search ──────────────────────────────────────────────────────────
  tools.push({
    name: 'search',
    description:
      'Substring match across node ids and titles (case-insensitive), returning file:line per hit. ' +
      'Pass coverage:true to also get the `tested-by` Scenario edges + a `covered` flag per result — ' +
      'so "is this covered by a scenario?" is answered in ONE call (which a raw grep cannot do).',
    inputShape: {
      query: z.string().min(1),
      types: z.array(z.string()).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      coverage: z.boolean().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const graph = getGraph();
      const q = (args.query as string).toLowerCase();
      const limit = (args as { limit?: number }).limit ?? 50;
      const types = new Set((args as { types?: string[] }).types ?? []);
      const wantCoverage = (args as { coverage?: boolean }).coverage === true;
      // coverage: index node.id → tested-by Scenario ids ONCE (additive; only when requested).
      const testedBy = new Map<string, string[]>();
      if (wantCoverage) {
        for (const e of graph.edges) {
          if (e.type !== 'tested-by') continue;
          if (graph.nodes.get(e.to)?.type !== 'Scenario') continue;
          const arr = testedBy.get(e.from);
          if (arr) arr.push(e.to);
          else testedBy.set(e.from, [e.to]);
        }
      }
      const out: Array<{ id: string; type: string; file: string; line: number; title?: string; tested_by?: string[]; covered?: boolean }> = [];
      for (const node of graph.nodes.values()) {
        if (types.size > 0 && !types.has(node.type)) continue;
        const titleField = (node as Node & { title?: string }).title;
        const hay = `${node.id} ${titleField ?? ''}`.toLowerCase();
        if (hay.includes(q)) {
          const rec: { id: string; type: string; file: string; line: number; title?: string; tested_by?: string[]; covered?: boolean } =
            { id: node.id, type: node.type, file: node.file, line: node.line, title: titleField };
          if (wantCoverage) {
            const ids = testedBy.get(node.id) ?? [];
            rec.tested_by = ids;
            rec.covered = ids.length > 0;
          }
          out.push(rec);
          if (out.length >= limit) break;
        }
      }
      return asJsonResult({ ok: true, results: out, count: out.length });
    },
  });

  // ─── 5) get_node ────────────────────────────────────────────────────────
  tools.push({
    name: 'get_node',
    description:
      'Raw node lookup by canonical id — accepts `slug:FR-2`, `{spec, node_id}`, ' +
      'or a bare id (unique → resolved; colliding → candidate list, FR-36d).',
    inputShape: {
      node_id: z.string(),
      spec: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ node_id, spec }) => {
      const { node, candidates } = resolveNodeRef(getGraph(), node_id as string, spec as string | undefined);
      if (candidates) return ambiguousBareId(node_id as string, candidates);
      if (!node) return asJsonResult({ ok: false, error: 'NODE_NOT_FOUND', node_id });
      return asJsonResult({ ok: true, node });
    },
  });

  // ─── 6) list_phase_tasks ────────────────────────────────────────────────
  // TaskNode currently has no `phase` field in the Phase-1 schema (the TASKS.md
  // parser ships in a follow-up Phase 2 sub-PR — see the plan). For now the
  // handler filters by string match on any optional `phase` property added by
  // the parser when it lands. Until then the registry returns an empty list
  // with a note, so callers don't get «UnknownTool» but do get truthful state.
  tools.push({
    name: 'list_phase_tasks',
    description:
      'List Task nodes whose `phase` field equals the given phase string. ' +
      'Returns [] until the TASKS.md parser ships (see Phase-2 plan).',
    inputShape: { phase: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ phase }) => {
      const target = phase as string;
      const out: TaskNode[] = [];
      for (const node of getGraph().nodes.values()) {
        if (node.type !== 'Task') continue;
        const t = node as TaskNode & { phase?: string };
        if (t.phase === target) out.push(t);
      }
      return asJsonResult({
        ok: true,
        tasks: out,
        count: out.length,
        note: out.length === 0
          ? 'Task nodes are not produced by the Phase-1 parsers; populated in Phase 2B.'
          : undefined,
      });
    },
  });

  // ─── 7) get_test_result ─────────────────────────────────────────────────
  tools.push({
    name: 'get_test_result',
    description: 'Return the last-result fields for a Scenario id.',
    inputShape: {
      scenario_id: z.string(),
      spec: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ scenario_id, spec }) => {
      const { node, candidates } = resolveNodeRef(getGraph(), scenario_id as string, spec as string | undefined);
      if (candidates) return ambiguousBareId(scenario_id as string, candidates);
      if (!node || node.type !== 'Scenario') {
        return asJsonResult({ ok: false, error: 'SCENARIO_NOT_FOUND', scenario_id });
      }
      const s = node as ScenarioNode;
      return asJsonResult({
        ok: true,
        scenario_id: s.id,
        lastResult: s.lastResult ?? 'UNKNOWN',
        lastRunAt: s.lastRunAt ?? null,
        durationMs: s.durationMs ?? null,
        failingStep: s.failingStep ?? null,
      });
    },
  });

  // ─── 8) find_orphans ────────────────────────────────────────────────────
  tools.push({
    name: 'find_orphans',
    description:
      'Return only orphan-class findings (UNCOVERED_FR / ORPHAN_TASK / ' +
      'SCENARIO_TAG_ORPHAN) — a focused subset of conformance_check.',
    inputShape: {} as const satisfies z.ZodRawShape,
    handler: async () => {
      const orphanCodes = new Set(['UNCOVERED_FR', 'ORPHAN_TASK', 'SCENARIO_TAG_ORPHAN']);
      const findings = checkConformance(getGraph()).filter((f) => orphanCodes.has(f.code));
      return asJsonResult({ ok: true, findings, count: findings.length });
    },
  });

  // ─── 9) get_coverage_summary ────────────────────────────────────────────
  tools.push({
    name: 'get_coverage_summary',
    description:
      'STRUCTURAL counts only — per-spec FR/AC/Scenario/Task tallies grouped by source ' +
      'directory (how many atoms each spec defines). Says NOTHING about test results or ' +
      'done-ness. For the FR-32 honesty / DONE rollup (passed/pending/…, verified_status) ' +
      'use get_coverage instead.',
    inputShape: {} as const satisfies z.ZodRawShape,
    handler: async () => {
      const bySpec = new Map<string, { fr: number; ac: number; scenario: number; task: number }>();
      // One slug-derivation algorithm corpus-wide: coverage.ts::specOf (full
      // dir path under .specs/ — nested `backlog/<name>` specs stay distinct
      // cells per FR-36; the old local regex collapsed them to `backlog`).
      for (const node of getGraph().nodes.values()) {
        const spec = specOf(node.file) ?? '(other)';
        const row = bySpec.get(spec) ?? { fr: 0, ac: 0, scenario: 0, task: 0 };
        if (node.type === 'FR') row.fr++;
        else if (node.type === 'AC') row.ac++;
        else if (node.type === 'Scenario') row.scenario++;
        else if (node.type === 'Task') row.task++;
        bySpec.set(spec, row);
      }
      return asJsonResult({
        ok: true,
        specs: Array.from(bySpec.entries())
          .map(([spec, counts]) => ({ spec, ...counts }))
          .sort((a, b) => a.spec.localeCompare(b.spec)),
      });
    },
  });

  // ─── get_coverage (FR-32) ───────────────────────────────────────────────
  tools.push({
    name: 'get_coverage',
    description:
      'FR-32 honesty rollup from the latest run: per-scenario buckets ' +
      '(passed/pending/undefined/ambiguous/failed/skipped/not_run) + per-task ' +
      'verified_status (DONE only when EVERY mapped scenario is green). ' +
      'Tasks map to scenarios via their FR refs (FR-N ↔ @featureN). Pass `spec` ' +
      'to SCOPE the buckets to one spec (omit → whole-corpus rollup, where every ' +
      'OTHER spec not in the last run shows as not_run — usually pass `spec`). ' +
      'NOT get_coverage_summary — that one is structural atom counts with no test results.',
    inputShape: { spec: z.string().optional() } as const satisfies z.ZodRawShape,
    handler: async ({ spec }) => {
      const graph = getGraph();
      const scenarios: ScenarioLike[] = [];
      const tasks: TaskLike[] = [];
      for (const node of graph.nodes.values()) {
        const nodeSpec = specOf((node as { file: string }).file);
        if (spec && nodeSpec !== spec) continue; // FR-32 scoping: per-spec when asked
        if (node.type === 'Scenario') {
          const s = node as ScenarioNode;
          scenarios.push({ id: s.id, tags: s.tags, result: s.lastResult, spec: nodeSpec });
        } else if (node.type === 'Task') {
          const t = node as TaskNode;
          tasks.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: nodeSpec });
        }
      }
      // FR-35a: apply the per-task test-quality side-channel so a DONE task with a
      // WEAK / FAKE-POSITIVE-RISK test reads IN_PROGRESS here too (absent file → {}).
      const testQualityByTask = readVerdicts(process.cwd());
      return asJsonResult({ ok: true, spec: spec ?? null, scope: spec ? 'spec' : 'corpus', ...computeCoverage(tasks, scenarios, testQualityByTask) });
    },
  });

  // ─── 10) validate_anchor ────────────────────────────────────────────────
  tools.push({
    name: 'validate_anchor',
    description: 'Check whether an anchor alias (compact id OR slug) resolves to a registered definition.',
    inputShape: { anchor: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ anchor }) => {
      const def = getGraph().definitions.get(anchor as string);
      if (!def) return asJsonResult({ ok: false, anchor, registered: false });
      return asJsonResult({ ok: true, anchor, registered: true, location: def });
    },
  });

  // ─── 11) list_specs ─────────────────────────────────────────────────────
  tools.push({
    name: 'list_specs',
    description: 'Enumerate `.specs/<slug>/` specs present in the current graph (slug = FULL nested dir path, e.g. `backlog/honest-status-command`).',
    inputShape: {} as const satisfies z.ZodRawShape,
    handler: async () => {
      const specs = new Set<string>();
      for (const node of getGraph().nodes.values()) {
        // FR-36 slug = full dir path under .specs/ (specOf), NOT the first segment —
        // the old `/^\.specs\/([^/]+)\//` collapsed `backlog/<name>` → `backlog`, so
        // every nested backlog spec was invisible to the inventory (2026-06-08 audit).
        // Exclude artifact/fixture subdirs (a .feature under _artifact/ is NOT a spec).
        const s = specOf(node.file);
        if (s && !/(^|\/)(_artifact|_fixtures|attachments|\.architecture-research)(\/|$)/.test(s)) specs.add(s);
      }
      return asJsonResult({ ok: true, specs: Array.from(specs).sort() });
    },
  });

  // ─── 12) find_refs — spec-domain graph reference-finder (FR-7b) ──────────
  // "Find all references" over the graph's SEMANTIC cross-links: incoming /
  // outgoing edges (covers / tested-by / implements …) plus the task→FR refs the
  // edge set doesn't carry. This is the spec-DOMAIN surface the Markdown LSP has
  // no concept of (an LSP knows text wiki-links, not `tested-by` semantics).
  // Markdown wiki-link navigation itself is owned by Marksman's native LSP
  // (`.lsp.json`), exposed via Claude Code's `LSP` tool — NOT reimplemented here.
  tools.push({
    name: 'find_refs',
    description:
      'Find every spec-domain reference to a node id across the graph: ' +
      'incoming/outgoing semantic edges (covers/tested-by/implements) plus task ' +
      'refs. (Markdown wiki-link nav is the native LSP tool’s job, not this.)',
    inputShape: {
      node_id: z.string(),
      spec: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ node_id, spec }) => {
      const graph = getGraph();
      // FR-36d: refs are collected for the RESOLVED composite id — a bare id
      // that collides must list candidates, not merge unrelated specs' refs.
      const { node, candidates } = resolveNodeRef(graph, node_id as string, spec as string | undefined);
      if (candidates) return ambiguousBareId(node_id as string, candidates);
      // A non-existent id must be NODE_NOT_FOUND (like get_trace/get_node/get_test_result),
      // NOT ok:true with empty refs — that fake-positive reads as "nothing references this"
      // when the truth is "this id does not exist" (2026-06-08 audit).
      if (!node) return asJsonResult({ ok: false, error: 'NODE_NOT_FOUND', node_id: node_id as string });
      const references = collectGraphRefs(graph, node.id);
      return asJsonResult({ ok: true, node_id: node.id, references, count: references.length });
    },
  });

  // ─── 13) get_spec_status — full lifecycle of ONE spec + linked run (FR-38) ─
  tools.push({
    name: 'get_spec_status',
    description:
      'Full lifecycle status of ONE spec: SPEC_ONLY / TESTS_NOT_RUN / RED / ' +
      'PARTIAL / GREEN + the linked last test-run summary (passed/failed/' +
      'pending/undefined counts, run timestamp, NDJSON source), node counts, ' +
      'FR-37b gap counts and an agent hint. The agent-facing READ of the same ' +
      'truth the authoritative verdict gates on (FR-38).',
    inputShape: { spec: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ spec }) => {
      const graph = getGraph();
      const slug = String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
      const inSpec = (file: string): boolean =>
        String(file).replace(/\\/g, '/').includes(`.specs/${slug}/`);

      const counts = { fr: 0, ac: 0, scenarios: 0, tasks: 0 };
      const scens: ScenarioNode[] = [];
      for (const n of graph.nodes.values()) {
        if (!inSpec(n.file)) continue;
        if (n.type === 'FR') counts.fr++;
        else if (n.type === 'AC') counts.ac++;
        else if (n.type === 'Task') counts.tasks++;
        else if (n.type === 'Scenario') {
          counts.scenarios++;
          scens.push(n as ScenarioNode);
        }
      }
      if (counts.fr + counts.ac + counts.scenarios + counts.tasks === 0) {
        return asJsonResult({
          ok: false,
          error: 'SPEC_NOT_FOUND',
          spec: slug,
          hint: `No nodes under .specs/${slug}/ — check list_specs for the loaded slugs.`,
        });
      }

      // FR-38b: the linked last-run summary — ONLY from ingested NDJSON data
      // (lastResult/lastRunAt stamped by the FR-1 pipeline). Never fabricated.
      const summary = { passed: 0, failed: 0, pending: 0, undefined: 0, ambiguous: 0, skipped: 0, touched: 0 };
      let lastAt: string | null = null;
      for (const s of scens) {
        if (!s.lastResult) continue;
        summary.touched++;
        const r = s.lastResult.toUpperCase();
        if (r === 'PASSED') summary.passed++;
        else if (r === 'FAILED') summary.failed++;
        else if (r === 'PENDING') summary.pending++;
        else if (r === 'UNDEFINED') summary.undefined++;
        else if (r === 'AMBIGUOUS') summary.ambiguous++;
        else if (r === 'SKIPPED') summary.skipped++;
        if (s.lastRunAt && (!lastAt || s.lastRunAt > lastAt)) lastAt = s.lastRunAt;
      }
      const last_run =
        summary.touched > 0
          ? { at: lastAt, source: '.dev-pomogator/.last-test-run.ndjson', summary }
          : null;

      // FR-38a: the exhaustive lifecycle enum.
      let lifecycle: 'SPEC_ONLY' | 'TESTS_NOT_RUN' | 'RED' | 'PARTIAL' | 'GREEN';
      if (counts.scenarios === 0) lifecycle = 'SPEC_ONLY';
      else if (!last_run) lifecycle = 'TESTS_NOT_RUN';
      else if (summary.failed > 0 || summary.ambiguous > 0) lifecycle = 'RED';
      else if (summary.pending + summary.undefined + summary.skipped > 0) lifecycle = 'PARTIAL';
      else lifecycle = 'GREEN';

      // FR-38c: the FR-37b gap counts for this cell + an agent hint.
      const gaps = summariseGaps(gapsFromFindings(checkConformance(graph), { spec: slug }));
      const hints: Record<typeof lifecycle, string> = {
        SPEC_ONLY: 'Docs only — no scenarios written yet. Next: author the .feature (FR-38a).',
        TESTS_NOT_RUN: `${counts.scenarios} scenario(s) written but never run/ingested. Next: run the suite so NDJSON lands.`,
        RED: `${summary.failed + summary.ambiguous} failing of ${summary.touched} touched. Next: get_test_result per scenario.`,
        PARTIAL: `${summary.pending + summary.undefined + summary.skipped} scenario(s) undefined/pending/skipped, 0 failed — written but not implemented; NOT green.`,
        GREEN: `All ${summary.touched} touched scenario(s) passed at ${lastAt}.`,
      };

      // FR-48e discoverability: a phase is not a graph node, so publish its
      // settable handle (`<slug>:phase:<Phase>`) + authored state HERE — the only
      // place the agent learns the id to pass to set_entity_status (else the phase
      // authored-path is unusable, violating FR-48c).
      const progress = readProgressState(path.join(process.cwd(), '.specs', slug));
      const phases = PHASE_ORDER.map((name) => ({
        id: `${slug}:phase:${name}`,
        name,
        stop_label: STOP_LABELS[name] ?? null,
        stop_confirmed: progress?.phases?.[name]?.stopConfirmed ?? false,
        completed_at: progress?.phases?.[name]?.completedAt ?? null,
      }));

      return asJsonResult({
        ok: true,
        spec: slug,
        // Explicit SPEC-level marker (set_spec_status). `backlog` ⇒ excluded from the task-census /
        // Stop-gate open-work count — its open tasks are parked by intent, not counted as work due now.
        spec_status: readSpecStatus(process.cwd(), slug),
        lifecycle,
        counts,
        last_run,
        gaps,
        phases,
        hint: hints[lifecycle],
      });
    },
  });

  // ─── 15) list_spec_docs — FR-39a read-sufficiency inventory (P17-1) ──────
  tools.push({
    name: 'list_spec_docs',
    description:
      'FR-39a: enumerate the readable documents of ONE spec (the read_spec_doc ' +
      'inventory): *.md + *.feature + .progress.json + .jira-cache.json (read-only) present ' +
      'in .specs/<spec>/. The agent asks THIS first — read_spec_doc accepts only ' +
      'names from this list. Every call is appended to the spec-access audit log.',
    inputShape: { spec: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ spec }) => {
      const args = { spec };
      const slug = String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
      if (!isSafeSlug(slug)) {
        logSpecAccess('list_spec_docs', args, 'denied');
        return asJsonResult({ ok: false, error: 'UNSAFE_SPEC', spec: slug, hint: 'slug must stay within .specs/ (no traversal)' });
      }
      const dir = path.join(process.cwd(), '.specs', slug);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        logSpecAccess('list_spec_docs', args, 'not_found');
        return asJsonResult({ ok: false, error: 'SPEC_NOT_FOUND', spec: slug });
      }
      // P19-6: recurse into SUBDIRECTORIES (ARCHITECTURE/, attachments/,
      // .architecture-research/) so subdir docs are discoverable. Readable text
      // docs (read_spec_doc) and binary attachments (read_attachment) are listed
      // separately. Relative subpaths use '/'.
      const docs: string[] = [];
      const attachments: string[] = [];
      const ATTACH_RE = /\.(png|jpe?g|gif|webp|bmp|pdf|svg)$/i;
      const walk = (abs: string, rel: string): void => {
        for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
          const childRel = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) {
            walk(path.join(abs, e.name), childRel);
          } else if (e.isFile()) {
            if (/\.(md|feature)$/.test(e.name) || e.name === '.progress.json' || e.name === '.jira-cache.json') docs.push(childRel);
            else if (ATTACH_RE.test(e.name)) attachments.push(childRel);
          }
        }
      };
      walk(dir, '');
      docs.sort();
      attachments.sort();
      logSpecAccess('list_spec_docs', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, docs, count: docs.length, attachments });
    },
  });

  // ─── 16) read_spec_doc — FR-39a whole-document read + audit trail (P17-1) ─
  tools.push({
    name: 'read_spec_doc',
    description:
      'FR-39a: read ONE spec document (prose outside graph nodes included) by a name ' +
      'from list_spec_docs. Unknown name → explicit DOC_NOT_FOUND (never an empty ' +
      'string). Every read lands in the spec-access audit log — the MCP-only ' +
      'replacement for direct Read/Grep over .specs/. P21-2 pagination for big docs ' +
      '(FR.md ≈77KB): pass {section:"FR-14"} for one heading block (down to the next ' +
      'same/higher heading), OR {offset,limit} for a 1-based line window. No paging ' +
      'arg → whole doc. Every reply carries total_lines/total_bytes so you can decide ' +
      'to page; a windowed reply carries truncated + next_offset.',
    inputShape: {
      spec: z.string(),
      doc: z.string(),
      offset: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).optional(),
      section: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ spec, doc, offset, limit, section }) => {
      const args = { spec, doc, offset, limit, section };
      const slug = String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
      if (!isSafeSlug(slug)) {
        logSpecAccess('read_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'UNSAFE_SPEC', spec: slug, hint: 'slug must stay within .specs/ (no traversal)' });
      }
      // P19-6: accept a SUBPATH (ARCHITECTURE/AXIS-1.md) — containment-checked,
      // not basename-flattened. Traversal/abs/drive → TRAVERSAL (denied), never served.
      const resolved = resolveSpecDoc(process.cwd(), slug, String(doc));
      if (!resolved.ok) {
        logSpecAccess('read_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: resolved.reason === 'TRAVERSAL' ? 'DOC_TRAVERSAL' : 'UNSAFE_SPEC', spec: slug, doc: String(doc), hint: 'doc must stay within .specs/<spec>/ (no traversal/abs path)' });
      }
      const rel = resolved.rel;
      const base = path.basename(rel);
      const okName = /\.(md|feature)$/.test(base) || base === '.progress.json' || base === '.jira-cache.json';
      if (!okName || !fs.existsSync(resolved.abs) || !fs.statSync(resolved.abs).isFile()) {
        logSpecAccess('read_spec_doc', args, 'not_found');
        return asJsonResult({
          ok: false,
          error: 'DOC_NOT_FOUND',
          spec: slug,
          doc: rel,
          hint: 'Call list_spec_docs({spec}) for the valid inventory. Binary attachments → read_attachment.',
        });
      }
      const full = fs.readFileSync(resolved.abs, 'utf-8');
      const lines = full.split(/\r?\n/);
      const totalLines = lines.length;
      const totalBytes = full.length;
      // P21-5: whole-doc CAS token — pass it back as apply_spec_change({expected_sha})
      // to make the write conditional (refuses if another session changed the doc).
      const sha = docSha(full);

      // P21-2 (a): section mode — one heading block out of a big doc.
      if (section !== undefined) {
        const sel = sliceSection(lines, String(section));
        if (!sel) {
          logSpecAccess('read_spec_doc', args, 'not_found');
          return asJsonResult({
            ok: false, error: 'SECTION_NOT_FOUND', spec: slug, doc: rel, section,
            total_lines: totalLines, total_bytes: totalBytes,
            hint: 'Pass a heading text ("FR-14") or its #anchor ("fr-14"); omit section to read the whole doc or use {offset,limit}.',
          });
        }
        const content = sel.lines.join('\n');
        logSpecAccess('read_spec_doc', args, 'ok');
        return asJsonResult({
          ok: true, spec: slug, doc: rel, section: sel.heading,
          start_line: sel.startLine, end_line: sel.endLine, lines: sel.lines.length,
          total_lines: totalLines, total_bytes: totalBytes, bytes: content.length, sha, content,
        });
      }

      // P21-2 (b): line-window mode — {offset,limit} (1-based, like the Read tool).
      if (offset !== undefined || limit !== undefined) {
        const startIdx = (offset ?? 1) - 1;
        if (startIdx >= totalLines) {
          logSpecAccess('read_spec_doc', args, 'ok');
          return asJsonResult({
            ok: true, spec: slug, doc: rel, start_line: startIdx + 1, end_line: startIdx + 1,
            lines: 0, total_lines: totalLines, total_bytes: totalBytes, truncated: false,
            next_offset: null, sha, content: '', note: 'offset is past end of file',
          });
        }
        const endIdx = limit !== undefined ? Math.min(startIdx + limit, totalLines) : totalLines;
        const slice = lines.slice(startIdx, endIdx);
        const truncated = endIdx < totalLines;
        const content = slice.join('\n');
        logSpecAccess('read_spec_doc', args, 'ok');
        return asJsonResult({
          ok: true, spec: slug, doc: rel, start_line: startIdx + 1, end_line: endIdx,
          lines: slice.length, total_lines: totalLines, total_bytes: totalBytes,
          truncated, next_offset: truncated ? endIdx + 1 : null, bytes: content.length, sha, content,
        });
      }

      // Default: whole doc (back-compat) + size metadata so the agent can decide to page.
      logSpecAccess('read_spec_doc', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, doc: rel, bytes: totalBytes, total_lines: totalLines, total_bytes: totalBytes, sha, content: full });
    },
  });

  // ─── 16b) read_attachment — FR-39a binary attachment read (P19-6) ────────
  tools.push({
    name: 'read_attachment',
    description:
      'P19-6: read ONE BINARY attachment of a spec (e.g. attachments/diagram.png) ' +
      'by a subpath from list_spec_docs.attachments[]. Returns base64 + mime so a ' +
      'multimodal verify (Jira screenshots, phase2 Step 5c) works under enforce ' +
      'without a raw Read. Text docs → read_spec_doc. Every read is audit-logged.',
    inputShape: { spec: z.string(), path: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ spec, path: docPath }) => {
      const args = { spec, path: docPath };
      const slug = String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
      const resolved = resolveSpecDoc(process.cwd(), slug, String(docPath));
      if (!resolved.ok) {
        logSpecAccess('read_attachment', args, 'denied');
        return asJsonResult({ ok: false, error: resolved.reason === 'TRAVERSAL' ? 'DOC_TRAVERSAL' : 'UNSAFE_SPEC', spec: slug, path: String(docPath), hint: 'path must stay within .specs/<spec>/ (no traversal/abs path)' });
      }
      const rel = resolved.rel;
      const ext = path.extname(rel).toLowerCase();
      const MIME: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
        '.webp': 'image/webp', '.bmp': 'image/bmp', '.pdf': 'application/pdf', '.svg': 'image/svg+xml',
      };
      const mime = MIME[ext];
      if (!mime || !fs.existsSync(resolved.abs) || !fs.statSync(resolved.abs).isFile()) {
        logSpecAccess('read_attachment', args, 'not_found');
        return asJsonResult({ ok: false, error: 'ATTACHMENT_NOT_FOUND', spec: slug, path: rel, hint: 'Call list_spec_docs({spec}).attachments for the valid inventory.' });
      }
      const buf = fs.readFileSync(resolved.abs);
      logSpecAccess('read_attachment', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, path: rel, mime, bytes: buf.length, base64: buf.toString('base64') });
    },
  });

  // ─── 17) propose_spec_change — FR-40 dry-run (P17-2) ─────────────────────
  const CHANGE_SHAPE = {
    spec: z.string(),
    doc: z.string(),
    content: z.string().optional(),
    old_string: z.string().optional(),
    new_string: z.string().optional(),
    replace_all: z.boolean().optional(),
    /** P21-5 optimistic CAS: the `sha` from your read_spec_doc. apply refuses
     *  with CAS_MISMATCH if the doc changed since (another session). Omit to opt out. */
    expected_sha: z.string().optional(),
    reason: z.string(),
  } as const satisfies z.ZodRawShape;
  const toChange = (a: Record<string, unknown>): SpecChange | null | 'ambiguous' => {
    const hasContent = typeof a.content === 'string';
    const hasEdit = typeof a.old_string === 'string' && typeof a.new_string === 'string';
    // Both forms supplied → ambiguous; {content} used to silently win and the
    // Edit intent was dropped (review #11). Refuse instead.
    if (hasContent && hasEdit) return 'ambiguous';
    if (hasContent) return { content: a.content as string };
    if (hasEdit) {
      return { old_string: a.old_string as string, new_string: a.new_string as string, replace_all: a.replace_all === true };
    }
    return null;
  };
  const slugOf = (spec: unknown): string =>
    String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
  // P19-6: keep the SUBPATH (ARCHITECTURE/AXIS-1.md) — validateTarget does the
  // containment check; basename-flattening would lose the subdir target.
  const docOf = (doc: unknown): string => String(doc).replace(/\\/g, '/').replace(/^\/+/, '');

  tools.push({
    name: 'propose_spec_change',
    description:
      'FR-40 DRY-RUN of a spec mutation: applies the change IN MEMORY and runs the ' +
      'full validation (form contracts + anchors + conformance of the affected spec) ' +
      'WITHOUT writing. Same checks as apply_spec_change — propose first, fix the ' +
      'findings, then apply. change = {content} (full replace) OR ' +
      '{old_string, new_string, replace_all?} (Edit-tool semantics).',
    inputShape: CHANGE_SHAPE,
    handler: async (args) => {
      const slug = slugOf(args.spec);
      const doc = docOf(args.doc);
      const change = toChange(args as Record<string, unknown>);
      if (change === 'ambiguous') {
        logSpecAccess('propose_spec_change', args, 'error');
        return asJsonResult({ ok: false, error: 'AMBIGUOUS_CHANGE', hint: 'Pass EITHER {content} OR {old_string,new_string}, not both.' });
      }
      if (!change) {
        logSpecAccess('propose_spec_change', args, 'error');
        return asJsonResult({ ok: false, error: 'BAD_CHANGE', hint: 'Pass {content} or {old_string,new_string}.' });
      }
      const r = validateSpecChange(process.cwd(), slug, doc, change);
      logSpecAccess('propose_spec_change', args, r.ok ? 'ok' : 'denied');
      return asJsonResult({ ok: r.ok, spec: slug, doc, dry_run: true, findings: r.findings });
    },
  });

  // ─── 18) apply_spec_change — FR-40 validated atomic write (P17-2) ────────
  tools.push({
    name: 'apply_spec_change',
    description:
      'FR-40 «живой генератор»: apply a spec mutation THROUGH the server. The change ' +
      'is validated BEFORE touching disk (form contracts + anchors + conformance); any ' +
      'error-severity finding → refusal with the findings list (fix and retry). A clean ' +
      'change is written atomically and audited. Inside the MCP server the FR-14 watcher ' +
      'refreshes the graph; the next read sees the fresh state. P21-5 optimistic CAS: pass ' +
      'expected_sha (the sha from read_spec_doc) to make the write conditional — CAS_MISMATCH ' +
      'if another session changed the doc; the reply returns the new sha for chaining edits.',
    inputShape: CHANGE_SHAPE,
    handler: async (args) => {
      const slug = slugOf(args.spec);
      const doc = docOf(args.doc);
      const change = toChange(args as Record<string, unknown>);
      if (change === 'ambiguous') {
        logSpecAccess('apply_spec_change', args, 'error');
        return asJsonResult({ ok: false, error: 'AMBIGUOUS_CHANGE', hint: 'Pass EITHER {content} OR {old_string,new_string}, not both.' });
      }
      if (!change) {
        logSpecAccess('apply_spec_change', args, 'error');
        return asJsonResult({ ok: false, error: 'BAD_CHANGE', hint: 'Pass {content} or {old_string,new_string}.' });
      }
      const expectedSha = typeof args.expected_sha === 'string' ? args.expected_sha : null;
      // E-A: hold the short write-lock around casCheck→validate→write so the CAS sha-check and the
      // write are atomic versus another session's concurrent write (different specs interleave; the
      // lock is held only for this critical section). writeDocAtomic re-enters the lock as a no-op.
      try {
        return withWriteLock(process.cwd(), () => {
          // P21-5 optimistic CAS — refuse a write against a stale read (another session changed the
          // doc since `expected_sha` was taken). Opt-in: omitted → unconditional.
          if (expectedSha !== null) {
            const cas = casCheck(process.cwd(), slug, doc, expectedSha);
            if (!cas.ok) {
              logSpecAccess('apply_spec_change', args, 'denied');
              return asJsonResult({
                ok: false, error: 'CAS_MISMATCH', spec: slug, doc, expected_sha: expectedSha, actual_sha: cas.actualSha,
                hint: 'The doc changed since you read it (another session?). Re-read with read_spec_doc for the fresh sha, rebase your change, and retry.',
              });
            }
          }
          const r = validateSpecChange(process.cwd(), slug, doc, change);
          if (!r.ok) {
            logSpecAccess('apply_spec_change', args, 'denied');
            return asJsonResult({ ok: false, error: 'VALIDATION_FAILED', spec: slug, doc, findings: r.findings, hint: 'Fix the findings and retry; propose_spec_change is the free dry-run.' });
          }
          const abs = writeDocAtomic(process.cwd(), slug, doc, r.next!);
          registryOpts.refreshGraph?.();
          logSpecAccess('apply_spec_change', args, 'ok');
          return asJsonResult({ ok: true, spec: slug, doc, path: abs, bytes: r.next!.length, sha: docSha(r.next!), findings: [] });
        });
      } catch (e) {
        if ((e as WriteLockBusyError).code === 'WRITE_LOCK_BUSY') {
          logSpecAccess('apply_spec_change', args, 'denied');
          const h = (e as WriteLockBusyError).holder;
          return asJsonResult({
            ok: false, error: 'WRITE_LOCK_BUSY', spec: slug, doc, held_by: h ?? null,
            hint: 'Another session is writing a spec RIGHT NOW; this is a brief transient lock — retry in a moment.',
          });
        }
        throw e;
      }
    },
  });

  // ─── 18b) set_spec_status — explicit SPEC-level backlog marker (no status math) ──
  tools.push({
    name: 'set_spec_status',
    description:
      'Set a SPEC-LEVEL status (active | backlog) EXPLICITLY — not inferred from task states. A ' +
      '`backlog` spec (being built / populated / parked) is EXCLUDED from the task-census, so its ' +
      'open tasks no longer count as "open work" and the claim-evidence Stop-gate (pinator) stops ' +
      'firing on them — you MARK it, the census just reads the marker. `active` (the default) removes ' +
      'the marker. Atomic write of the `.specs/<slug>/.spec-status` sentinel. Takes effect on the next ' +
      'census refresh (any spec edit / door boot).',
    inputShape: {
      spec: z.string(),
      status: z.enum(['active', 'backlog']),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const slug = slugOf(args.spec);
      if (!isSafeSlug(slug)) {
        logSpecAccess('set_spec_status', args, 'error');
        return asJsonResult({ ok: false, error: 'UNSAFE_SPEC', spec: slug, hint: 'slug must stay within .specs/ (no traversal)' });
      }
      try {
        writeSpecStatus(process.cwd(), slug, args.status);
      } catch (e) {
        logSpecAccess('set_spec_status', args, 'error');
        return asJsonResult({ ok: false, error: 'SPEC_NOT_FOUND', spec: slug, hint: String((e as Error).message) });
      }
      registryOpts.refreshGraph?.();
      logSpecAccess('set_spec_status', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, status: args.status });
    },
  });

  // ─── 18a) set_entity_status — FR-48d centralized validated status transition ──
  tools.push({
    name: 'set_entity_status',
    description:
      'FR-48 «жизненный цикл»: transition a task to a new status THROUGH the door. Validates ' +
      'the lifecycle move (todo→ready→in-progress→done + reverse; no skip-to-finish) and, for a ' +
      'WORKING status (ready/in-progress), REFUSES unless the requirement chain is assembled — ' +
      'AC + scenario + design + story (impl tasks); a [spec-phase] task is exempt (anti-deadlock, ' +
      'it authors the legs). On refusal the reply names the missing legs. A valid move flips the ' +
      'Status: marker via the same validated atomic write as apply_spec_change (CAS via expected_sha).',
    inputShape: {
      id: z.string(),
      spec: z.string().optional(),
      to: z.enum(['todo', 'ready', 'in-progress', 'done', 'blocked']),
      expected_sha: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const ro = readOnlyRefusal('set_entity_status', args);
      if (ro) return ro;
      const res = setEntityStatus(getGraph(), process.cwd(), {
        id: args.id as string,
        spec: typeof args.spec === 'string' ? args.spec : undefined,
        to: args.to as 'todo' | 'ready' | 'in-progress' | 'done' | 'blocked',
        expectedSha: typeof args.expected_sha === 'string' ? args.expected_sha : undefined,
      });
      if (!res.ok) {
        logSpecAccess('set_entity_status', args, 'denied');
        return asJsonResult({
          ok: false,
          error: res.error,
          id: args.id,
          from: res.from,
          to: res.to,
          reason: res.reason,
          missing: res.missing,
          // FR-48e: surface the structured refusal — entity_type + the live computed
          // verdict on a STATUS_DERIVED (derived entities are not hand-set).
          entity_type: res.entityType,
          verdict: res.verdict,
          hint: 'Run /task-status: read the trace, assemble the missing legs, then retry — or mark the task [spec-phase] if it authors them.',
        });
      }
      registryOpts.refreshGraph?.();
      logSpecAccess('set_entity_status', args, 'ok');
      return asJsonResult({ ok: true, id: args.id, from: res.from, to: res.to });
    },
  });

  // ─── 18b) delete_spec_doc — the D of the CRUD door (P19-4, FR-40/FR-43) ──
  // Doc-level ONLY: retiring a WHOLE spec stays FR-43 (human-confirmed archive,
  // auto-retire forbidden). Refuses when the doc's graph nodes have LIVE edges
  // from OTHER files — deleting it would strand dangling references.
  tools.push({
    name: 'delete_spec_doc',
    description:
      'P19-4 (FR-40/FR-43): DELETE one spec document/attachment through the door — the D ' +
      'of the CRUD lifecycle. Containment-checked subpath, mandatory reason, audited. ' +
      'REFUSES: a doc whose graph nodes are referenced by edges from other files ' +
      '(would strand dangling refs), .progress.json/.jira-cache.json (single-writer ' +
      'artifacts), and anything outside .specs/<spec>/. Whole-spec retirement is NOT ' +
      'this tool — FR-43 human-confirmed archive only.',
    inputShape: {
      spec: z.string(),
      doc: z.string(),
      reason: z.string(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ spec, doc, reason }) => {
      const args = { spec, doc, reason };
      const ro = readOnlyRefusal('delete_spec_doc', args);
      if (ro) return ro;
      const slug = slugOf(spec);
      if (!isSafeSlug(slug)) {
        logSpecAccess('delete_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'UNSAFE_SPEC', spec: slug });
      }
      const resolved = resolveSpecDoc(process.cwd(), slug, String(doc));
      if (!resolved.ok) {
        logSpecAccess('delete_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: resolved.reason === 'TRAVERSAL' ? 'DOC_TRAVERSAL' : 'UNSAFE_SPEC', spec: slug, doc: String(doc) });
      }
      const rel = resolved.rel;
      const base = path.basename(rel);
      // Deletable: *.md / *.feature + binary attachments. NOT the single-writer
      // artifacts (.progress.json — spec-status owns it; .jira-cache.json — jira-intake).
      const deletable = /\.(md|feature|png|jpe?g|gif|webp|bmp|pdf|svg)$/i.test(base);
      if (!deletable) {
        logSpecAccess('delete_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'NOT_DELETABLE', spec: slug, doc: rel, hint: 'Only *.md/*.feature and binary attachments are agent-deletable; .progress.json/.jira-cache.json are single-writer artifacts.' });
      }
      if (!fs.existsSync(resolved.abs) || !fs.statSync(resolved.abs).isFile()) {
        logSpecAccess('delete_spec_doc', args, 'not_found');
        return asJsonResult({ ok: false, error: 'DOC_NOT_FOUND', spec: slug, doc: rel });
      }
      // Inbound-edge gate: nodes defined in THIS doc referenced by a REAL node
      // living in ANOTHER file → deletion would strand the reference. Synthetic
      // edge targets (RESULT-*) never resolve to nodes, so runs don't block.
      const graph = getGraph();
      const relFile = `.specs/${slug}/${rel}`;
      const docNodeIds = new Set<string>();
      for (const n of graph.nodes.values()) {
        if (String(n.file).replace(/\\/g, '/') === relFile) docNodeIds.add(n.id);
      }
      const blockers: Array<{ edge: string; from: string; to: string }> = [];
      for (const e of graph.edges) {
        const fromIn = docNodeIds.has(e.from);
        const toIn = docNodeIds.has(e.to);
        if (fromIn === toIn) continue; // internal edge or unrelated
        const outsideId = fromIn ? e.to : e.from;
        const outside = graph.nodes.get(outsideId);
        if (!outside) continue; // synthetic target (RESULT-*) — not a real node
        if (String(outside.file).replace(/\\/g, '/') === relFile) continue;
        if (blockers.length < 10) blockers.push({ edge: e.type, from: e.from, to: e.to });
        else break;
      }
      if (blockers.length > 0) {
        logSpecAccess('delete_spec_doc', args, 'denied');
        return asJsonResult({
          ok: false,
          error: 'LIVE_INBOUND_EDGES',
          spec: slug,
          doc: rel,
          blockers,
          hint: 'Nodes in this doc are referenced from other files — retarget/remove those references first (find_refs shows them), or this deletion strands dangling edges.',
        });
      }
      const bytes = fs.statSync(resolved.abs).size;
      fs.unlinkSync(resolved.abs);
      registryOpts.refreshGraph?.();
      logSpecAccess('delete_spec_doc', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, doc: rel, deleted: true, bytes });
    },
  });

  // ─── 18c) rename_spec_doc — anchors-aware rename/move (P21-5) ─────────────
  // Closes the door's last CRUD gap: rename/move a doc WITHOUT silently
  // stranding inbound markdown links. Default = REFUSE with a Decision block
  // listing inbound `[text](…/FR.md#…)` links from OTHER docs; rewrite_inbound
  // opts into atomic retarget. (delete_spec_doc gates on graph EDGES; this gates
  // on literal markdown anchor links — the layer the Done-When names.)
  tools.push({
    name: 'rename_spec_doc',
    description:
      'P21-5: rename or MOVE a spec document (*.md/*.feature) — within a spec or to another ' +
      'spec (to_spec). Anchors-aware: by DEFAULT refuses with a Decision block listing inbound ' +
      'markdown links (`[text](…/FR.md#…)`) from OTHER docs that the rename would strand; pass ' +
      'rewrite_inbound:true to retarget them atomically. Refuses a destination that already ' +
      'exists (no clobber). Validates the moved doc at its new name (a filename carries parser ' +
      'semantics — FR.md→TASKS.md would mis-parse). Optimistic CAS via expected_sha on the ' +
      'source; atomic write+unlink; audited.',
    inputShape: {
      spec: z.string(),
      doc: z.string(),
      to_doc: z.string(),
      to_spec: z.string().optional(),
      reason: z.string(),
      expected_sha: z.string().optional(),
      rewrite_inbound: z.boolean().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const ro = readOnlyRefusal('rename_spec_doc', args);
      if (ro) return ro;
      const cwd = process.cwd();
      const slug = slugOf(args.spec);
      const toSlug = args.to_spec != null ? slugOf(args.to_spec) : slug;
      const doc = docOf(args.doc);
      const toDoc = docOf(args.to_doc);
      const rewriteInbound = args.rewrite_inbound === true;

      // target gates (safe slug + mutable *.md/*.feature) on BOTH ends.
      const srcBad = validateTarget(slug, doc);
      if (srcBad) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'INVALID_SOURCE', spec: slug, doc, finding: srcBad });
      }
      const dstBad = validateTarget(toSlug, toDoc);
      if (dstBad) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'INVALID_DEST', spec: toSlug, doc: toDoc, finding: dstBad });
      }
      const src = resolveSpecDoc(cwd, slug, doc);
      const dst = resolveSpecDoc(cwd, toSlug, toDoc);
      if (!src.ok || !dst.ok) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'DOC_TRAVERSAL', spec: slug, doc });
      }
      if (src.abs === dst.abs) {
        logSpecAccess('rename_spec_doc', args, 'error');
        return asJsonResult({ ok: false, error: 'NOOP_RENAME', hint: 'source and destination resolve to the same path' });
      }
      if (!fs.existsSync(src.abs) || !fs.statSync(src.abs).isFile()) {
        logSpecAccess('rename_spec_doc', args, 'not_found');
        return asJsonResult({ ok: false, error: 'DOC_NOT_FOUND', spec: slug, doc: src.rel });
      }
      if (fs.existsSync(dst.abs)) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'DEST_EXISTS', spec: toSlug, doc: dst.rel, hint: 'destination already exists — pick a free name or delete it first (no silent clobber)' });
      }

      // P21-5 CAS on the SOURCE — refuse a rename against a stale read.
      const expectedSha = typeof args.expected_sha === 'string' ? args.expected_sha : null;
      if (expectedSha !== null) {
        const cas = casCheck(cwd, slug, src.rel, expectedSha);
        if (!cas.ok) {
          logSpecAccess('rename_spec_doc', args, 'denied');
          return asJsonResult({ ok: false, error: 'CAS_MISMATCH', spec: slug, doc: src.rel, expected_sha: expectedSha, actual_sha: cas.actualSha, hint: 'source changed since you read it (another session?) — re-read for the fresh sha and retry' });
        }
      }

      const content = fs.readFileSync(src.abs, 'utf-8');
      const srcRelFile = `.specs/${slug}/${src.rel}`;
      const dstRelFile = `.specs/${toSlug}/${dst.rel}`;

      // Anchors-aware gate (the Done-When): inbound markdown links from OTHER
      // docs would strand on the rename. Default = refuse with a Decision block.
      const inbound = findInboundLinks(cwd, srcRelFile);
      if (inbound.length > 0 && !rewriteInbound) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({
          ok: false,
          error: 'INBOUND_LINKS_PRESENT',
          spec: slug,
          doc: src.rel,
          inbound_count: inbound.length,
          inbound: inbound.slice(0, 20),
          decision: `Renaming ${srcRelFile} → ${dstRelFile} would strand ${inbound.length} inbound markdown link(s) in other docs. Decide: (a) rewrite_inbound:true to retarget them atomically, (b) fix those links first, or (c) keep the name.`,
          hint: 'Nothing was changed. Pass rewrite_inbound:true to auto-retarget, or update the listed links first.',
        });
      }

      // Validate the moved doc at its NEW name (form + anchor + conformance) — a
      // filename carries parser semantics (FR.md→TASKS.md mis-parses).
      const v = validateSpecChange(cwd, toSlug, dst.rel, { content });
      if (v.specMissing) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'DEST_SPEC_MISSING', spec: toSlug, hint: 'destination spec does not exist — create_spec first' });
      }
      if (!v.ok) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'VALIDATION_FAILED', spec: toSlug, doc: dst.rel, findings: v.findings, hint: 'the doc does not validate at its new name/location — fix or pick another target' });
      }

      // Execute: write dest, retarget inbound links (if opted in), delete source.
      // Inbound edits are arbitrary corpus files (other specs), not (slug,doc)
      // pairs — write them directly; the moved doc itself goes atomic.
      writeDocAtomic(cwd, toSlug, dst.rel, content);
      let rewroteFiles = 0;
      if (rewriteInbound && inbound.length > 0) {
        for (const edit of rewriteInboundLinks(cwd, inbound, dstRelFile)) {
          fs.writeFileSync(path.join(cwd, edit.file), edit.content, 'utf-8');
          rewroteFiles++;
        }
      }
      fs.unlinkSync(src.abs);
      registryOpts.refreshGraph?.();
      logSpecAccess('rename_spec_doc', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, from: src.rel, to_spec: toSlug, to: dst.rel, sha: docSha(content), inbound_count: inbound.length, rewrote_inbound_files: rewroteFiles, findings: [] });
    },
  });

  // ─── 19) create_spec — FR-40a scaffold through MCP (P17-2) ───────────────
  tools.push({
    name: 'create_spec',
    description:
      'FR-40a: create a new spec THROUGH the server — wraps the engine scaffold ' +
      '(templates are born verdict-GREEN). kebab-case slug; refuses an existing spec.',
    inputShape: { slug: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ slug }) => {
      const ro = readOnlyRefusal('create_spec', { slug });
      if (ro) return ro;
      const name = String(slug);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        logSpecAccess('create_spec', { slug: name }, 'error');
        return asJsonResult({ ok: false, error: 'BAD_SLUG', hint: 'kebab-case: [a-z0-9-]' });
      }
      // Windows reserved device names collide with real files even with an
      // extension — refuse as a spec slug (review #10).
      if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) {
        logSpecAccess('create_spec', { slug: name }, 'error');
        return asJsonResult({ ok: false, error: 'RESERVED_SLUG', hint: 'slug collides with a Windows reserved device name' });
      }
      if (fs.existsSync(path.join(process.cwd(), '.specs', name))) {
        logSpecAccess('create_spec', { slug: name }, 'denied');
        return asJsonResult({ ok: false, error: 'SPEC_EXISTS', spec: name });
      }
      const core = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'specs-generator', 'specs-generator-core.mjs');
      const r = spawnSync(process.execPath, [core, 'scaffold-spec', '-Name', name], {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 60_000,
        // Without this the core resolves repoRoot from its SCRIPT location and
        // scaffolds into the ENGINE repo, not the server's corpus (caught by
        // the live probe: newborn-mcp landed in the real .specs/).
        env: { ...process.env, SPECS_GENERATOR_ROOT: process.cwd() },
      });
      if (r.status !== 0) {
        logSpecAccess('create_spec', { slug: name }, 'error');
        return asJsonResult({ ok: false, error: 'SCAFFOLD_FAILED', stderr: (r.stderr ?? '').slice(0, 500) });
      }
      registryOpts.refreshGraph?.();
      logSpecAccess('create_spec', { slug: name }, 'ok');
      const docs = fs.readdirSync(path.join(process.cwd(), '.specs', name)).sort();
      return asJsonResult({ ok: true, spec: name, docs, hint: 'Born verdict-GREEN; fill via apply_spec_change.' });
    },
  });

  // ─── 20+21) archival door (FR-45) — proof + gated move ───────────────────
  const normalizeSlug = (s: string): string =>
    String(s).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
  // The DECISIVE safety proof: does any LIVE spec still depend on this one?
  // Two carriers — both must be checked or a still-referenced spec is falsely
  // archived (the "наоборот ошибка" case the user named):
  //   (1) GRAPH EDGES (covers/tested-by/implements) — rare cross-spec, but exact.
  //   (2) MARKDOWN/PATH links in prose — `[text](../<slug>/FR.md#…)`, the COMMON
  //       cross-spec reference (intra-spec edges dominate the graph; prose links
  //       carry the real coupling). Scanned across other live, non-archived specs.
  const liveInboundRefs = (graph: SpecGraph, slug: string): Array<{ from: string; to: string; type: string }> => {
    const out: Array<{ from: string; to: string; type: string }> = [];
    const seen = new Set<string>();
    const add = (from: string, to: string, type: string): void => {
      const k = `${from}|${to}|${type}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ from, to, type });
    };
    // (1) graph edges
    for (const e of graph.edges) {
      if (String(e.to).split(':')[0] !== slug) continue;
      const fromSpec = String(e.from).split(':')[0];
      if (fromSpec === slug || isArchivedSlug(fromSpec)) continue;
      add(e.from, e.to, String(e.type));
    }
    // (2) markdown/path links from OTHER live specs into .specs/<slug>/
    const specsDir = path.join(process.cwd(), '.specs');
    if (fs.existsSync(specsDir)) {
      const linkRe = new RegExp(`(?:\\.specs/|\\.\\./|/|\\]\\()${slug.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}/`);
      const walk = (dir: string, otherSlug: string): void => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, ent.name);
          if (ent.isDirectory()) { walk(abs, otherSlug); continue; }
          if (!/\.(md|feature)$/.test(ent.name)) continue;
          let body = '';
          try { body = fs.readFileSync(abs, 'utf-8'); } catch { continue; }
          if (linkRe.test(body)) {
            add(`.specs/${otherSlug}/${path.relative(path.join(specsDir, otherSlug), abs).replace(/\\/g, '/')}`, `.specs/${slug}/`, 'md-link');
          }
        }
      };
      for (const ent of fs.readdirSync(specsDir, { withFileTypes: true })) {
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
        if (ent.name === slug || isArchivedSlug(ent.name)) continue;
        walk(path.join(specsDir, ent.name), ent.name);
      }
    }
    return out;
  };

  tools.push({
    name: 'get_archival_proof',
    description:
      'FR-45a: graph-derived safety proof for archiving ONE spec — every LIVE inbound ' +
      'reference from OTHER specs to its nodes. Verdict: KEEP_FALSE_POSITIVE (live refs → ' +
      'NOT abandoned), ARCHIVE (no live refs → graph-clear), SPEC_NOT_FOUND / ALREADY_ARCHIVED. ' +
      'Supersession is the agent’s legacy-triage signal, layered on this.',
    inputShape: { slug: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ slug }) => {
      const graph = getGraph();
      const s = normalizeSlug(String(slug));
      if (isArchivedSlug(s)) return asJsonResult({ ok: false, error: 'ALREADY_ARCHIVED', slug: s });
      const hasNodes = [...graph.nodes.values()].some((n) => String(n.file).replace(/\\/g, '/').includes(`.specs/${s}/`));
      if (!hasNodes) return asJsonResult({ ok: false, error: 'SPEC_NOT_FOUND', slug: s, hint: 'check list_specs for loaded slugs' });
      const refs = liveInboundRefs(graph, s);
      const verdict = refs.length > 0 ? 'KEEP_FALSE_POSITIVE' : 'ARCHIVE';
      return asJsonResult({
        ok: true,
        slug: s,
        verdict,
        live_inbound_count: refs.length,
        live_inbound_refs: refs.slice(0, 50),
        note: verdict === 'KEEP_FALSE_POSITIVE'
          ? `${refs.length} live spec ref(s) → ${s} is NOT abandoned; archiving would strand them.`
          : `No live spec references ${s} — graph-clear to archive (combine with the agent's supersession signal).`,
      });
    },
  });

  tools.push({
    name: 'archive_spec',
    description:
      'FR-45b: the sanctioned, gated whole-spec move `.specs/<slug>/` → `.specs/archive/<slug>/`. ' +
      'Re-checks live inbound refs → ARCHIVE_BLOCKED if any; refuses a clobber (DEST_EXISTS); ' +
      'appends an audit line. The builder drops archive/ from the live graph; the move is read ' +
      'back via git history (the archive is then SEALED against the mutation door).',
    inputShape: { slug: z.string(), reason: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ slug, reason }) => {
      const ro = readOnlyRefusal('archive_spec', { slug, reason });
      if (ro) return ro;
      const cwd = process.cwd();
      const s = normalizeSlug(String(slug));
      if (!isSafeSlug(s) || isArchivedSlug(s)) {
        logSpecAccess('archive_spec', { slug: s }, 'denied');
        return asJsonResult({ ok: false, error: 'INVALID_SLUG', slug: s, hint: 'a safe, non-archived slug' });
      }
      const refs = liveInboundRefs(getGraph(), s);
      if (refs.length > 0) {
        logSpecAccess('archive_spec', { slug: s }, 'denied');
        return asJsonResult({ ok: false, error: 'ARCHIVE_BLOCKED', slug: s, live_inbound_count: refs.length, live_inbound_refs: refs.slice(0, 50), hint: 'live specs still reference this — redirect those refs first, or it is a KEEP false positive' });
      }
      const srcAbs = path.join(cwd, '.specs', s);
      const dstAbs = path.join(cwd, '.specs', 'archive', s);
      if (!fs.existsSync(srcAbs) || !fs.statSync(srcAbs).isDirectory()) {
        logSpecAccess('archive_spec', { slug: s }, 'not_found');
        return asJsonResult({ ok: false, error: 'SPEC_NOT_FOUND', slug: s });
      }
      if (fs.existsSync(dstAbs)) {
        logSpecAccess('archive_spec', { slug: s }, 'denied');
        return asJsonResult({ ok: false, error: 'DEST_EXISTS', slug: s, hint: 'already archived (no clobber)' });
      }
      fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
      fs.renameSync(srcAbs, dstAbs);
      try {
        const ledger = path.join(cwd, '.dev-pomogator', 'logs', 'spec-archive.jsonl');
        fs.mkdirSync(path.dirname(ledger), { recursive: true });
        fs.appendFileSync(ledger, JSON.stringify({ ts: new Date().toISOString(), slug: s, reason: String(reason ?? ''), from: `.specs/${s}/`, to: `.specs/archive/${s}/` }) + '\n');
      } catch { /* best-effort */ }
      registryOpts.refreshGraph?.();
      logSpecAccess('archive_spec', { slug: s }, 'ok');
      return asJsonResult({ ok: true, slug: s, from: `.specs/${s}/`, to: `.specs/archive/${s}/`, hint: 'moved out of the live graph; commit the move with git' });
    },
  });

  return tools;
}
