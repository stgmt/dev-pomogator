/**
 * Strict-auditor verification pass — 2026-07-22 (pass 2).
 * Drives the SAME canonical engine the MCP `conformance_check` door wraps
 * (buildGraphFromCwd + checkConformance) over the CURRENT working tree, then:
 *   A. cross-checks the earlier report's (spec-conformance-audit-2026-07-22.md) claims,
 *   B. closes the gap that report missed: FR-62/63/64 of spec-generator-v4
 *      (the branch this session is named after),
 *   C. verifies session-pilot «all TASK_UNTESTED» and the UNCOVERED_FR table.
 * Prints ONLY derived aggregates; full detail → audit-out/verify-2026-07-22.json.
 */
import { writeFileSync } from 'node:fs';
import { buildGraphFromCwd } from '../tools/spec-graph/builder.ts';
import { checkConformance, type Finding } from '../tools/spec-graph/conformance.ts';

const REPORT_CENSUS = {
  specs: 60, nodes: 5640, Scenario: 2541, AC: 789, FR: 717, File: 606, Task: 556,
  Story: 195, Decision: 178, NFR: 58, edges: 3550,
};
const REPORT_CODES: Record<string, number> = {
  UNTAGGED_SCENARIO: 847, FR_NO_STORY: 634, FR_NO_DESIGN: 626,
  TASK_STATUS_UNVERIFIED: 274, TASK_NO_OWN_SCENARIO: 108, TOOTHLESS_STORY: 101,
  TOOTHLESS_DECISION: 81, TASK_UNTESTED: 34, TASK_NO_REQUIREMENT: 28,
  UNCOVERED_FR: 22, ORPHAN_TASK: 2, TAG_BULK_SUSPECT: 2, TASK_STARTED_WITHOUT_CHAIN: 1,
};

const graph = buildGraphFromCwd(process.cwd());
const findings: Finding[] = checkConformance(graph);

// ---------- A. census cross-check ----------
const specOf = (id: string) => (id.includes(':') ? id.slice(0, id.indexOf(':')) : '');
const byType: Record<string, number> = {};
const specsSeen = new Set<string>();
for (const [id, n] of graph.nodes) {
  byType[n.type] = (byType[n.type] ?? 0) + 1;
  const s = specOf(id) || (n as { spec?: string }).spec || '';
  if (s) specsSeen.add(s);
}
const census = {
  specs: specsSeen.size, nodes: graph.nodes.size, edges: graph.edges.length, byType,
};
const censusDrift: string[] = [];
if (census.specs !== REPORT_CENSUS.specs) censusDrift.push(`specs ${REPORT_CENSUS.specs}→${census.specs}`);
if (census.nodes !== REPORT_CENSUS.nodes) censusDrift.push(`nodes ${REPORT_CENSUS.nodes}→${census.nodes}`);
if (census.edges !== REPORT_CENSUS.edges) censusDrift.push(`edges ${REPORT_CENSUS.edges}→${census.edges}`);
for (const t of ['Scenario', 'AC', 'FR', 'File', 'Task', 'Story', 'Decision', 'NFR']) {
  const now = byType[t] ?? 0;
  const was = (REPORT_CENSUS as Record<string, number>)[t];
  if (now !== was) censusDrift.push(`${t} ${was}→${now}`);
}

// ---------- B. findings-by-code cross-check ----------
const byCode: Record<string, number> = {};
const bySev: Record<string, number> = {};
for (const f of findings) {
  byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  bySev[f.severity] = (bySev[f.severity] ?? 0) + 1;
}
const codeDrift: string[] = [];
const allCodes = new Set([...Object.keys(REPORT_CODES), ...Object.keys(byCode)]);
for (const c of [...allCodes].sort()) {
  const was = REPORT_CODES[c] ?? 0;
  const now = byCode[c] ?? 0;
  if (was !== now) codeDrift.push(`${c} ${was}→${now}`);
}

// ---------- C. session-pilot: every TASK_UNTESTED belongs to it? ----------
const untested = findings.filter((f) => f.code === 'TASK_UNTESTED');
const untestedSpecs: Record<string, number> = {};
for (const f of untested) {
  const s = specOf(f.nodeId ?? f.location.file);
  untestedSpecs[s] = (untestedSpecs[s] ?? 0) + 1;
}

// ---------- D. UNCOVERED_FR table re-derivation ----------
const uncovered = findings.filter((f) => f.code === 'UNCOVERED_FR');
const uncoveredBySpec: Record<string, string[]> = {};
for (const f of uncovered) {
  const s = specOf(f.nodeId ?? '');
  const local = (f.nodeId ?? '').includes(':') ? f.nodeId!.slice(f.nodeId!.indexOf(':') + 1) : (f.nodeId ?? '?');
  (uncoveredBySpec[s] ??= []).push(local);
}

// ---------- E. THE GAP: FR-62/63/64 in spec-generator-v4 ----------
const sg = 'spec-generator-v4';
const sgFrNums = [...graph.nodes.keys()]
  .filter((id) => id.startsWith(`${sg}:FR-`))
  .map((id) => Number(id.slice(`${sg}:FR-`.length).split(/[^0-9]/)[0]))
  .filter((n) => Number.isFinite(n));
const sgFrMax = sgFrNums.length ? Math.max(...sgFrNums) : 0;
const fr6264: Record<string, unknown> = {};
for (const n of [62, 63, 64]) {
  const id = `${sg}:FR-${n}`;
  const node = graph.nodes.get(id);
  const out = graph.edges.filter((e) => e.from === id).map((e) => `${e.type}→${e.to}`);
  const inn = graph.edges.filter((e) => e.to === id).map((e) => `${e.from}—${e.type}→`);
  const relFindings = findings.filter((f) => (f.nodeId ?? '') === id).map((f) => f.code);
  fr6264[`FR-${n}`] = {
    exists: Boolean(node),
    title: node ? (node as { title?: string }).title ?? (node as { text?: string }).text ?? null : null,
    outEdges: out.slice(0, 15), outEdgeCount: out.length,
    inEdges: inn.slice(0, 15), inEdgeCount: inn.length,
    findings: relFindings,
  };
}
// are there FR ids above the max that look like 62-64 aliases (FR-62a etc.)?
const sgFrAll = [...graph.nodes.keys()].filter((id) => id.startsWith(`${sg}:FR-`)).sort();

// ---------- F. spec-generator-v4 own findings ----------
const sgFindings: Record<string, number> = {};
for (const f of findings) {
  const s = specOf(f.nodeId ?? f.location.file);
  if (s === sg) sgFindings[f.code] = (sgFindings[f.code] ?? 0) + 1;
}

// ---------- G. error-severity check ----------
const errors = findings.filter((f) => f.severity === 'error');

const report = {
  census, censusDrift,
  totalFindings: findings.length, bySev, byCode, codeDrift,
  sessionPilotUntested: { total: untested.length, bySpec: untestedSpecs },
  uncoveredFR: { total: uncovered.length, bySpec: uncoveredBySpec },
  fr6264: { sgFrMax, sgFrCount: sgFrAll.length, sgFrIds: sgFrAll, detail: fr6264 },
  specGeneratorV4Findings: sgFindings,
  errorFindings: errors.map((f) => ({ code: f.code, nodeId: f.nodeId, msg: f.message })),
};
writeFileSync('audit-out/verify-2026-07-22.json', JSON.stringify(report, null, 1));

// ---------- compact console (enters conversation) ----------
console.log('## CENSUS (now) vs report');
console.log(`specs=${census.specs} nodes=${census.nodes} edges=${census.edges}`);
console.log(`byType=${JSON.stringify(byType)}`);
console.log(`drift: ${censusDrift.length ? censusDrift.join(' | ') : 'NONE'}`);
console.log('\n## FINDINGS (now) vs report');
console.log(`total=${findings.length} sev=${JSON.stringify(bySev)}`);
console.log(`codeDrift: ${codeDrift.length ? codeDrift.join(' | ') : 'NONE'}`);
console.log('\n## TASK_UNTESTED by spec');
console.log(JSON.stringify(untestedSpecs));
console.log('\n## UNCOVERED_FR by spec');
for (const [s, frs] of Object.entries(uncoveredBySpec).sort()) console.log(`${s}: ${frs.join(',')}`);
console.log('\n## FR-62/63/64 (spec-generator-v4)');
console.log(`max FR num in spec = ${sgFrMax}, total FR ids = ${sgFrAll.length}`);
console.log(`all sg FR ids: ${sgFrAll.join(' ')}`);
for (const [k, v] of Object.entries(fr6264)) console.log(`${k}: ${JSON.stringify(v)}`);
console.log('\n## spec-generator-v4 findings by code');
console.log(JSON.stringify(sgFindings));
console.log(`\n## error-severity findings: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log(`- ${e.code} ${e.nodeId}: ${e.msg}`);
