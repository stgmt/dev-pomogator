#!/usr/bin/env -S node --import tsx
/**
 * dogfood-dataset — drive every spec-MCP tool's REAL handler against the REAL .specs/ graph
 * and record what each returns. Produces the runtime "what's live / what's dead" dataset that
 * a v4 scope update should be driven from (evidence, not grep). One-shot; writes JSON to stdout.
 *
 *   node --import tsx tools/spec-mcp-server/dogfood-dataset.ts
 */
import { buildGraphFromCwd } from '../spec-graph/builder.ts';
import { buildToolRegistry } from './tools.ts';

const graph = buildGraphFromCwd();

// Pull realistic inputs straight from the built graph so calls hit real data.
let sampleNodeId = 'FR-1';
let sampleTag = '@feature1';
let samplePhase = '';
let sampleScenarioId = '';
let sampleAnchor = '';
// FR-36c: prefer an FR that HAS a tested-by edge — the first-FR-alphabetically
// may legitimately have zero tagged scenarios (e.g. `# @featureN` comments),
// which reads as a dead get_trace when the tool is fine. The probe must
// exercise the edge path it exists to watch.
const testedByFrom = new Set<string>();
for (const e of graph.edges) if (e.type === 'tested-by') testedByFrom.add(e.from);
let frFallback = '';
for (const node of graph.nodes.values()) {
  const n = node as any;
  if (n.type === 'FR') {
    if (!frFallback) frFallback = n.id;
    if (sampleNodeId === 'FR-1' && testedByFrom.has(n.id)) sampleNodeId = n.id;
  }
  if (n.type === 'Scenario') {
    if (!sampleScenarioId) sampleScenarioId = n.id;
    if (Array.isArray(n.tags) && n.tags.length) sampleTag = n.tags[0];
  }
  if (n.type === 'Task' && n.phase && !samplePhase) samplePhase = n.phase;
}
if (sampleNodeId === 'FR-1' && frFallback) sampleNodeId = frFallback;
for (const a of graph.definitions?.keys?.() ?? []) { sampleAnchor = a; break; }

const inputs: Record<string, any> = {
  get_trace: { node_id: sampleNodeId },
  find_by_tags: { tags: [sampleTag] },
  conformance_check: {},
  search: { query: 'FR' },
  get_node: { node_id: sampleNodeId },
  list_phase_tasks: { phase: samplePhase },
  get_test_result: { scenario_id: sampleScenarioId },
  find_orphans: {},
  get_coverage_summary: {},
  get_coverage: {},
  validate_anchor: { anchor: sampleAnchor },
  list_specs: {},
  find_refs: { node_id: sampleNodeId },
};

/** Did the tool return real data (non-empty), or an empty/ok-false answer? */
function dataSignal(parsed: any): { dataPresent: boolean; size: number; note: string } {
  if (parsed == null) return { dataPresent: false, size: 0, note: 'null' };
  if (parsed.ok === false || parsed.registered === false) return { dataPresent: false, size: 0, note: 'ok:false' };
  for (const k of ['references', 'scenarios', 'specs', 'tasks', 'orphans', 'results', 'findings', 'nodes']) {
    if (Array.isArray(parsed[k])) return { dataPresent: parsed[k].length > 0, size: parsed[k].length, note: `${k}[${parsed[k].length}]` };
  }
  if (typeof parsed.count === 'number') return { dataPresent: parsed.count > 0, size: parsed.count, note: `count=${parsed.count}` };
  if (parsed.perSpec || parsed.node || parsed.trace || parsed.location || parsed.coverage || parsed.tasks) return { dataPresent: true, size: 1, note: 'object' };
  return { dataPresent: true, size: Object.keys(parsed).length, note: 'object?' };
}

const tools = buildToolRegistry(() => graph);
const dataset: any[] = [];
for (const tool of tools) {
  const input = inputs[tool.name] ?? {};
  let parsed: any = null, error = '';
  try {
    const res: any = await (tool as any).handler(input);
    const text = res?.content?.[0]?.text ?? (typeof res === 'string' ? res : JSON.stringify(res));
    parsed = typeof text === 'string' ? JSON.parse(text) : text;
  } catch (e: any) {
    error = e?.message ?? String(e);
  }
  const sig = error ? { dataPresent: false, size: 0, note: 'ERROR' } : dataSignal(parsed);
  dataset.push({ tool: tool.name, input, dataPresent: sig.dataPresent, size: sig.size, note: error || sig.note });
}

process.stdout.write(JSON.stringify({ sampledInputs: { sampleNodeId, sampleTag, samplePhase, sampleScenarioId, sampleAnchor }, dataset }, null, 2) + '\n');
