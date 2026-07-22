/**
 * Pass-2b: for FR-62/63/64 of spec-generator-v4 — what do their scenarios
 * (specgen004-553..561) actually report, and what fields does the builder carry?
 * Same canonical engine; prints only derived answers.
 */
import { buildGraphFromCwd } from '../tools/spec-graph/builder.ts';

const graph = buildGraphFromCwd(process.cwd());
const sg = 'spec-generator-v4';

// dump the raw shape of FR-62 and one scenario (field discovery, one-time)
const fr62 = graph.nodes.get(`${sg}:FR-62`);
console.log('## FR-62 node keys:', fr62 ? Object.keys(fr62).join(',') : 'ABSENT');
if (fr62) console.log('FR-62 JSON:', JSON.stringify(fr62).slice(0, 500));

const scenIds = [...graph.nodes.keys()].filter(
  (id) => id.startsWith(`${sg}:SCEN-specgen004-55`) || id.startsWith(`${sg}:SCEN-specgen004-56`),
).sort();
const first = graph.nodes.get(scenIds[0]);
console.log('\n## scenario node keys:', first ? Object.keys(first).join(',') : 'ABSENT');

console.log('\n## per-scenario result (553..561)');
for (const n of [553, 554, 555, 556, 557, 558, 559, 560, 561]) {
  const id = [...graph.nodes.keys()].find((k) => k.startsWith(`${sg}:SCEN-specgen004-${n}-`));
  if (!id) { console.log(`specgen004-${n}: NODE ABSENT`); continue; }
  const node = graph.nodes.get(id) as Record<string, unknown>;
  const inn = graph.edges.filter((e) => e.to === id).map((e) => `${e.from.split(':').pop()}—${e.type}`);
  const out = graph.edges.filter((e) => e.from === id).map((e) => `${e.type}→${e.to.split(':').pop()}`);
  console.log(`${n}: status=${JSON.stringify(node.status)} result=${JSON.stringify(node.result ?? node.lastResult ?? null)} title=${JSON.stringify(String(node.title ?? node.name ?? '').slice(0, 60))}`);
  console.log(`    in=[${inn.join(' | ')}] out=[${out.slice(0, 6).join(' | ')}]`);
}

// which tasks reference FR-62/63/64 work? tasks whose id/title mentions 62/63/64
console.log('\n## tasks mentioning FR-62/63/64');
for (const [id, node] of graph.nodes) {
  if (!id.startsWith(`${sg}:TASK`) && (node as { type: string }).type !== 'Task') continue;
  const hay = JSON.stringify(node).toLowerCase();
  if (/fr-?6[234]\b/.test(hay)) {
    const t = node as Record<string, unknown>;
    console.log(`- ${id.split(':').pop()} status=${JSON.stringify(t.status)} :: ${String(t.title ?? t.text ?? '').slice(0, 80)}`);
  }
}

// .test-results.ndjson recency for this spec (builder may attach run metadata)
const sgFiles = [...graph.nodes.values()].filter((n) => (n as { type: string }).type === 'File');
console.log(`\n## File nodes in corpus: ${sgFiles.length} (sg sample: ${sgFiles.slice(0, 3).map((f) => JSON.stringify(f).slice(0, 120)).join(' | ')})`);
