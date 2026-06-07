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
import type {
  SpecGraph,
  Node,
  FrNode,
  AcNode,
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

export function buildToolRegistry(
  getGraph: () => SpecGraph,
): ToolDefinition<z.ZodRawShape>[] {
  const tools: ToolDefinition<z.ZodRawShape>[] = [];

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
      const scenarios: ScenarioNode[] = [];
      const tasks: TaskNode[] = [];
      const related: Array<{ id: string; type: string; relation: string }> = [];

      for (const edge of graph.edges) {
        if (edge.from === node.id) {
          const to = graph.nodes.get(edge.to);
          if (!to) continue;
          if (edge.type === 'covers' && to.type === 'AC') acs.push(to as AcNode);
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
        tasks: tasks.map((t) => ({ id: t.id, status: t.status, file: t.file, line: t.line })),
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
    description: 'Substring match across node ids and titles (case-insensitive).',
    inputShape: {
      query: z.string().min(1),
      types: z.array(z.string()).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const q = (args.query as string).toLowerCase();
      const limit = (args as { limit?: number }).limit ?? 50;
      const types = new Set((args as { types?: string[] }).types ?? []);
      const out: Array<{ id: string; type: string; file: string; line: number; title?: string }> = [];
      for (const node of getGraph().nodes.values()) {
        if (types.size > 0 && !types.has(node.type)) continue;
        const titleField = (node as Node & { title?: string }).title;
        const hay = `${node.id} ${titleField ?? ''}`.toLowerCase();
        if (hay.includes(q)) {
          out.push({ id: node.id, type: node.type, file: node.file, line: node.line, title: titleField });
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
    description: 'Per-spec FR/AC/Scenario/Task counts grouped by source directory.',
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
      '(passed/pending/undefined/ambiguous/failed/skipped) + per-task ' +
      'verified_status (DONE only when EVERY mapped scenario is green). ' +
      'Tasks map to scenarios via their FR refs (FR-N ↔ @featureN).',
    inputShape: {} as const satisfies z.ZodRawShape,
    handler: async () => {
      const graph = getGraph();
      const scenarios: ScenarioLike[] = [];
      const tasks: TaskLike[] = [];
      for (const node of graph.nodes.values()) {
        if (node.type === 'Scenario') {
          const s = node as ScenarioNode;
          scenarios.push({ id: s.id, tags: s.tags, result: s.lastResult, spec: specOf(s.file) });
        } else if (node.type === 'Task') {
          const t = node as TaskNode;
          tasks.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: specOf(t.file) });
        }
      }
      return asJsonResult({ ok: true, ...computeCoverage(tasks, scenarios) });
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
    description: 'Enumerate top-level `.specs/<slug>/` directories present in the current graph.',
    inputShape: {} as const satisfies z.ZodRawShape,
    handler: async () => {
      const specs = new Set<string>();
      for (const node of getGraph().nodes.values()) {
        const m = node.file.match(/^\.specs\/([^/]+)\//);
        if (m) specs.add(m[1]);
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
      const id = node ? node.id : (node_id as string);
      const references = collectGraphRefs(graph, id);
      return asJsonResult({ ok: true, node_id: id, references, count: references.length });
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

      return asJsonResult({
        ok: true,
        spec: slug,
        lifecycle,
        counts,
        last_run,
        gaps,
        hint: hints[lifecycle],
      });
    },
  });

  // ─── 15) list_spec_docs — FR-39a read-sufficiency inventory (P17-1) ──────
  tools.push({
    name: 'list_spec_docs',
    description:
      'FR-39a: enumerate the readable documents of ONE spec (the read_spec_doc ' +
      'inventory): *.md + *.feature + .progress.json (read-only) actually present ' +
      'in .specs/<spec>/. The agent asks THIS first — read_spec_doc accepts only ' +
      'names from this list. Every call is appended to the spec-access audit log.',
    inputShape: { spec: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ spec }) => {
      const args = { spec };
      const slug = String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
      const dir = path.join(process.cwd(), '.specs', slug);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        logSpecAccess('list_spec_docs', args, 'not_found');
        return asJsonResult({ ok: false, error: 'SPEC_NOT_FOUND', spec: slug });
      }
      const docs = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && (/.(md|feature)$/.test(e.name) || e.name === '.progress.json'))
        .map((e) => e.name)
        .sort();
      logSpecAccess('list_spec_docs', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, docs, count: docs.length });
    },
  });

  // ─── 16) read_spec_doc — FR-39a whole-document read + audit trail (P17-1) ─
  tools.push({
    name: 'read_spec_doc',
    description:
      'FR-39a: read ONE whole spec document (prose outside graph nodes included) ' +
      'by a name from list_spec_docs. Unknown name → explicit DOC_NOT_FOUND ' +
      '(never an empty string). Every read lands in the spec-access audit log — ' +
      'this is the MCP-only replacement for direct Read/Grep over .specs/.',
    inputShape: { spec: z.string(), doc: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ spec, doc }) => {
      const args = { spec, doc };
      const slug = String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
      const name = path.basename(String(doc)); // no traversal — inventory names only
      const okName = /\.(md|feature)$/.test(name) || name === '.progress.json';
      const abs = path.join(process.cwd(), '.specs', slug, name);
      if (!okName || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        logSpecAccess('read_spec_doc', args, 'not_found');
        return asJsonResult({
          ok: false,
          error: 'DOC_NOT_FOUND',
          spec: slug,
          doc: name,
          hint: 'Call list_spec_docs({spec}) for the valid inventory.',
        });
      }
      const content = fs.readFileSync(abs, 'utf-8');
      logSpecAccess('read_spec_doc', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, doc: name, bytes: content.length, content });
    },
  });

  return tools;
}
