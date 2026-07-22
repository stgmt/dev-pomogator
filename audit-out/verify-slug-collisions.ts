/**
 * Pass-2c: bare-slug-id collision census for spec-generator-v4 scenarios.
 * Slug id (SPECGEN004_NN) is the reconciliation key per the cucumber rule —
 * two distinct scenarios sharing one slug number = ambiguous traceability.
 * Full detail for 553..561 + corpus-wide duplicate-slug census.
 */
import { buildGraphFromCwd } from '../tools/spec-graph/builder.ts';

const graph = buildGraphFromCwd(process.cwd());
const sg = 'spec-generator-v4';

const scens = [...graph.nodes.entries()].filter(([id, n]) =>
  id.startsWith(`${sg}:SCEN-`) && (n as { type: string }).type === 'Scenario',
);

// slug number → nodes
const bySlug = new Map<number, Array<{ id: string; node: Record<string, unknown> }>>();
for (const [id, node] of scens) {
  const m = id.match(/specgen004-(\d+)-/);
  if (!m) continue;
  const num = Number(m[1]);
  (bySlug.get(num) ?? bySlug.set(num, []).get(num)!).push({ id, node: node as Record<string, unknown> });
}

console.log(`## spec-generator-v4 scenarios: ${scens.length}, distinct slug numbers: ${bySlug.size}`);

// full detail for the FR-62/63/64 window
for (const n of [553, 554, 555, 556, 557, 558, 559, 560, 561]) {
  const group = bySlug.get(n) ?? [];
  console.log(`\n--- slug ${n}: ${group.length} node(s)`);
  for (const { id, node } of group) {
    const short = id.slice(`${sg}:SCEN-specgen004-${n}-`.length);
    const testedBy = graph.edges.filter((e) => e.to === id && e.type === 'tested-by').map((e) => e.from.split(':').pop());
    console.log(`  [${short}] result=${JSON.stringify(node.result ?? null)} stale=${JSON.stringify(node.resultStale ?? null)} tested-by=[${testedBy.join(',')}]`);
  }
}

// corpus-wide duplicate-slug census (per spec)
const allBySlug = new Map<string, number>();
for (const [id] of [...graph.nodes.entries()].filter(([, n]) => (n as { type: string }).type === 'Scenario')) {
  const m = id.match(/:SCEN-([a-z]+\d+)-(\d+)-/); // SCEN-<series><NNN>-<num>-<slug>
  if (!m) continue;
  const spec = id.slice(0, id.indexOf(':'));
  const key = `${spec}:${m[1]}-${m[2]}`;
  allBySlug.set(key, (allBySlug.get(key) ?? 0) + 1);
}
const dups = [...allBySlug.entries()].filter(([, c]) => c > 1);
console.log(`\n## duplicate slug ids (same spec, same slug number, >1 node): ${dups.length}`);
for (const [k, c] of dups.slice(0, 40)) console.log(`  ${k} ×${c}`);

// max slug in sg + any gaps in 553..561
const sgNums = [...bySlug.keys()].sort((a, b) => a - b);
console.log(`\n## sg slug range: ${Math.min(...sgNums)}..${Math.max(...sgNums)}`);
