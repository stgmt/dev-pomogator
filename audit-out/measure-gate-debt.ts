/**
 * Throwaway measurement: how much debt would the proposed AC/NFR gates surface
 * if they were switched on as ERRORS corpus-wide today?
 *
 * Counts, per spec and in total:
 *   - AC nodes with NO inbound `tested-by` edge of their OWN  → future UNCOVERED_AC
 *   - AC nodes tagged but with no passing `verifies`          → future UNVERIFIED_AC
 *   - NFR nodes with no `tested-by` at all                    → future UNCOVERED_NFR
 *   - NFR nodes tagged but no passing `verifies`              → future UNVERIFIED_NFR
 *
 * Run: node --import tsx audit-out/measure-gate-debt.ts
 */
import { buildGraphFromCwd } from '../tools/spec-graph/builder.ts';

const graph = buildGraphFromCwd(process.cwd());

const testedBy = new Set<string>();
const verifies = new Set<string>();
for (const e of graph.edges) {
  if (e.type === 'tested-by') testedBy.add(e.from);
  if (e.type === 'verifies') verifies.add(e.to);
}

type Row = { untagged: number; unverified: number; total: number };
const bySpec = new Map<string, { ac: Row; nfr: Row }>();
const blank = (): { ac: Row; nfr: Row } => ({
  ac: { untagged: 0, unverified: 0, total: 0 },
  nfr: { untagged: 0, unverified: 0, total: 0 },
});

let acTotal = 0, acUntagged = 0, acUnverified = 0;
let nfrTotal = 0, nfrUntagged = 0, nfrUnverified = 0;

for (const node of graph.nodes.values()) {
  if (node.type !== 'AC' && node.type !== 'NFR') continue;
  const spec = node.spec ?? '(no-spec)';
  if (!bySpec.has(spec)) bySpec.set(spec, blank());
  const row = bySpec.get(spec)![node.type === 'AC' ? 'ac' : 'nfr'];
  row.total++;
  const tagged = testedBy.has(node.id);
  const green = verifies.has(node.id);
  if (!tagged) row.untagged++;
  else if (!green) row.unverified++;

  if (node.type === 'AC') {
    acTotal++;
    if (!tagged) acUntagged++; else if (!green) acUnverified++;
  } else {
    nfrTotal++;
    if (!tagged) nfrUntagged++; else if (!green) nfrUnverified++;
  }
}

const specs = [...bySpec.entries()]
  .map(([spec, v]) => ({ spec, ...v, debt: v.ac.untagged + v.ac.unverified + v.nfr.untagged + v.nfr.unverified }))
  .sort((a, b) => b.debt - a.debt);

console.log(JSON.stringify({
  builtAt: graph.builtAt,
  totals: {
    specs: bySpec.size,
    ac: { total: acTotal, untagged: acUntagged, tagged_but_not_green: acUnverified },
    nfr: { total: nfrTotal, untagged: nfrUntagged, tagged_but_not_green: nfrUnverified },
    would_be_blocking_errors: acUntagged + acUnverified + nfrUntagged + nfrUnverified,
  },
  top_15_specs_by_debt: specs.slice(0, 15),
}, null, 2));
