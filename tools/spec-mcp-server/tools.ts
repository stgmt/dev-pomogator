/**
 * Phase 2 MCP tool registry — all 11 read-only graph-query tools.
 *
 * Each tool is a thin wrapper over the in-memory `SpecGraph` produced by the
 * Phase 1 builder. Wrappers do exactly two things: pluck the relevant subset
 * out of the graph + format an `explanation_for_agent` summary the agent can
 * paste back into its context.
 *
 * The 11 tools per [SCHEMA Entity 3](../../.specs/spec-generator-v4/spec-generator-v4_SCHEMA.md):
 *
 *   get_trace               primary — structured tree + explanation
 *   find_by_tags            scenarios filtered by `@FR/@NFR/@AC` tags
 *   conformance_check       run Phase-1 conformance over current graph
 *   search                  substring scan over node ids + titles
 *   get_node                raw node lookup by canonical id
 *   list_phase_tasks        tasks filtered by phase string
 *   get_test_result         last-result for a scenario id
 *   find_orphans            ORPHAN_* / UNCOVERED_FR findings only
 *   get_coverage_summary    per-spec FR/AC/Scenario counts
 *   validate_anchor         is anchor alias registered?
 *   list_specs              top-level `.specs/<slug>/` directories
 *
 * The handler signature is identical to the MCP SDK v1 `server.tool` callback
 * shape — receives the parsed input object, returns `{content: [{type, text}]}`.
 *
 * @see ./server.ts (entry point that wires this registry into McpServer)
 * @see .specs/spec-generator-v4/FR.md FR-4
 */

import { z } from 'zod';
import { checkConformance, type Finding } from '../spec-graph/conformance.ts';
import type {
  SpecGraph,
  Node,
  FrNode,
  AcNode,
  ScenarioNode,
  TaskNode,
} from '../spec-graph/types.ts';

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

export function buildToolRegistry(getGraph: () => SpecGraph): ToolDefinition<z.ZodRawShape>[] {
  const tools: ToolDefinition<z.ZodRawShape>[] = [];

  // ─── 1) get_trace ───────────────────────────────────────────────────────
  tools.push({
    name: 'get_trace',
    description:
      'Get the full requirement trace for a node id: AC + Scenarios + Tasks + ' +
      'related nodes + a ≤500-char natural-language summary for the agent.',
    inputShape: { node_id: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ node_id }) => {
      const graph = getGraph();
      const node = graph.nodes.get(node_id as string);
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
      for (const n of graph.nodes.values()) {
        if (n.type !== 'Task') continue;
        const t = n as TaskNode;
        if (t.refs.includes(node.id)) tasks.push(t);
      }

      const explanation =
        node.type === 'FR'
          ? summariseFrTrace(node as FrNode, acs, scenarios, tasks)
          : `${node.id} (${node.type}) at ${node.file}:${node.line}`;

      return asJsonResult({
        ok: true,
        node: { id: node.id, type: node.type, file: node.file, line: node.line },
        acceptance_criteria: acs.map((a) => ({ id: a.id, file: a.file, line: a.line })),
        scenarios: scenarios.map((s) => ({
          id: s.id,
          file: s.file,
          line: s.line,
          tags: s.tags,
          lastResult: s.lastResult ?? 'UNKNOWN',
          failingStep: s.failingStep ?? null,
        })),
        tasks: tasks.map((t) => ({ id: t.id, status: t.status, file: t.file, line: t.line })),
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
    description: 'Raw node lookup by canonical id.',
    inputShape: { node_id: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ node_id }) => {
      const node = getGraph().nodes.get(node_id as string);
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
    inputShape: { scenario_id: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ scenario_id }) => {
      const node = getGraph().nodes.get(scenario_id as string);
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
      const specOf = (filePath: string): string => {
        const m = filePath.match(/^\.specs\/([^/]+)\//);
        return m ? m[1] : '(other)';
      };
      for (const node of getGraph().nodes.values()) {
        const spec = specOf(node.file);
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

  return tools;
}
