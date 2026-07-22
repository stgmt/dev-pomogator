/**
 * Deep corpus audit — same engines as corpus-health.ts / the MCP door, but prints
 * the FULL lists for the two acute classes (UNCOVERED_FR, TASK_UNTESTED) and
 * per-spec attribution for every debt class. Full detail → corpus-deep.json.
 */
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { buildGraphFromCwd } from '../tools/spec-graph/builder.ts';
import { checkTraceabilityCompleteness, summariseGaps } from '../tools/spec-graph/traceability.ts';
import { findFrsWithoutResearch } from '../tools/spec-graph/research-trace.ts';
import { findUnlinkedUpstream } from '../tools/spec-graph/upstream-trace.ts';

const ROOT = path.resolve('.');
const SYNTHETIC_TARGET = /^RESULT-/; // mirror corpus-health.ts:78

const graph = buildGraphFromCwd(ROOT);
const slugOf = (id: string): string => id.split(':')[0] || '?';

// 1) untraced atoms — full lists for the acute classes
const gaps = checkTraceabilityCompleteness(graph);
const byClass = summariseGaps(gaps);
const uncovered = gaps.filter((g) => g.class === 'UNCOVERED_FR');
const untested = gaps.filter((g) => g.class === 'TASK_UNTESTED');
const untaggedBySpec: Record<string, number> = {};
for (const g of gaps) {
  if (g.class !== 'UNTAGGED_SCENARIO') continue;
  const s = slugOf(g.nodeId);
  untaggedBySpec[s] = (untaggedBySpec[s] ?? 0) + 1;
}

// 2) dangling edges — per-spec owner + per-type (exact corpus-health condition)
const dangBySpec: Record<string, number> = {};
const dangByType: Record<string, number> = {};
let dangling = 0;
for (const e of graph.edges) {
  const fromMissing = !graph.nodes.has(e.from);
  const toMissing = !graph.nodes.has(e.to) && !SYNTHETIC_TARGET.test(e.to);
  if (!fromMissing && !toMissing) continue;
  dangling++;
  const s = slugOf(e.from);
  dangBySpec[s] = (dangBySpec[s] ?? 0) + 1;
  dangByType[e.type] = (dangByType[e.type] ?? 0) + 1;
}

// 3) INFO-class debt rollups
const frsNoRes = findFrsWithoutResearch(ROOT);
const upstream = findUnlinkedUpstream(ROOT);
const rollup = (arr: Array<{ nodeId: string }>): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const x of arr) {
    const s = slugOf(x.nodeId);
    m[s] = (m[s] ?? 0) + 1;
  }
  return m;
};
const top = (m: Record<string, number>, n: number): Array<[string, number]> =>
  Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);

console.log('# DEEP CORPUS AUDIT (engines: builder + traceability + research/upstream-trace)');
console.log(`graph: ${graph.nodes.size} nodes / ${graph.edges.length} edges | dangling(recomputed)=${dangling}`);
console.log(`untraced atoms: ${JSON.stringify(byClass)}`);

console.log('\n## UNCOVERED_FR — requirements with NO covering AC/scenario (FULL LIST)');
for (const g of uncovered) console.log(`- ${g.nodeId} @ ${g.file}:${g.line}`);

console.log('\n## TASK_UNTESTED — tasks with NO mapped scenario (FULL LIST)');
for (const g of untested) console.log(`- ${g.nodeId} @ ${g.file}:${g.line}`);

console.log('\n## UNTAGGED_SCENARIO — top 10 owning specs (of ' + Object.keys(untaggedBySpec).length + ')');
for (const [s, c] of top(untaggedBySpec, 10)) console.log(`- ${s}: ${c}`);

console.log('\n## dangling edges — top 10 owning specs');
for (const [s, c] of top(dangBySpec, 10)) console.log(`- ${s}: ${c}`);
console.log('## dangling edges — by edge type');
for (const [s, c] of top(dangByType, 12)) console.log(`- ${s}: ${c}`);

console.log('\n## FRs citing no RESEARCH.md — top 10 owning specs (total ' + frsNoRes.length + ')');
for (const [s, c] of top(rollup(frsNoRes), 10)) console.log(`- ${s}: ${c}`);

console.log('\n## unlinked upstream (story/use-case/decision → no FR) — top 10 owning specs (total ' + upstream.length + ')');
for (const [s, c] of top(rollup(upstream), 10)) console.log(`- ${s}: ${c}`);

writeFileSync(
  path.join('audit-reports', 'corpus-deep.json'),
  JSON.stringify({ byClass, uncovered, untested, untaggedBySpec, dangBySpec, dangByType }, null, 1),
);
console.log('\nfull detail: audit-reports/corpus-deep.json');
