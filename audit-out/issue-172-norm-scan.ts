/** Read-only #172 pre-scan: does the LIVE corpus already have case/Unicode
 *  localId collisions WITHIN a namespace? Decides warn-vs-error staging. */
import { buildGraphFromCwd } from '../tools/spec-graph/builder.ts';

function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

const g = buildGraphFromCwd(process.cwd());

const groups = new Map<string, Set<string>>(); // ns::normLocal -> distinct raw locals
const slugs = new Map<string, Set<string>>(); // normSlug -> distinct raw slugs

for (const n of g.nodes.values()) {
  const ns = n.spec || '';
  const local = n.spec ? n.id.slice(n.spec.length + 1) : n.id;
  const k = ns + '::' + norm(local);
  if (!groups.has(k)) groups.set(k, new Set());
  groups.get(k)!.add(local);
  if (ns) {
    const nk = norm(ns);
    if (!slugs.has(nk)) slugs.set(nk, new Set());
    slugs.get(nk)!.add(ns);
  }
}

let localColl = 0;
for (const [k, set] of groups) {
  if (set.size > 1) {
    localColl++;
    console.log('LOCAL_NORM_COLLISION ' + k + ' -> ' + [...set].join(' | '));
  }
}

let nsColl = 0;
for (const [k, set] of slugs) {
  if (set.size > 1) {
    nsColl++;
    console.log('NAMESPACE_NORM_COLLISION norm=' + k + ' -> ' + [...set].join(' | '));
  }
}

console.log('---');
console.log('nodes: ' + g.nodes.size);
console.log('local_norm_collisions: ' + localColl);
console.log('namespace_norm_collisions: ' + nsColl);
