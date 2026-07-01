#!/usr/bin/env npx tsx
/**
 * Dogfood for legacy-triage — drives the classifier on the REAL `.specs/` corpus and
 * RECONCILES its output against disk reality, instead of trusting synthetic fixtures.
 *
 * Three invariants the live run must satisfy:
 *   1. NO auto-REMOVED — a missing FILE_CHANGES path is staleness, not proof of deletion
 *      (FR-43a default = DRIFTED). REMOVED would need a git-delete signal we don't have.
 *   2. RECONCILE — every path a DRIFTED candidate cites as "missing" GENUINELY does not
 *      exist on disk (the classifier's claim is true, not a parse artifact — the
 *      verify-against-real-artifact discipline).
 *   3. ANTI-FLOOD — far fewer files are flagged than are merely not_run (the
 *      positive-signal gate works; most not_run features just use a different test config).
 *
 * Run:  node --import tsx tools/specs-generator/evals/legacy-triage-dogfood.ts [corpusRoot]
 * Exit: 0 ⇔ all three invariants hold on the live corpus.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildGraphFromCwd } from '../../spec-graph/builder.ts';
import { computeLegacyTriage } from '../legacy-triage.ts';
import { parseFileChangesTable, checkFcRows } from '../../../.claude/skills/spec-reality-check/scripts/verify.ts';
import type { ScenarioNode } from '../../spec-graph/types.ts';

const root = path.resolve(process.argv[2] ?? process.cwd());
const graph = buildGraphFromCwd(root);
const report = computeLegacyTriage(graph, root);

const by: Record<string, number> = {};
for (const c of report.candidates) by[c.suspected] = (by[c.suspected] ?? 0) + 1;

// total feature files whose scenarios are ALL not_run (the anti-flood denominator)
const byFile = new Map<string, ScenarioNode[]>();
for (const n of graph.nodes.values()) {
  if (n.type !== 'Scenario') continue;
  const f = String((n as ScenarioNode).file).replace(/\\/g, '/');
  (byFile.get(f) ?? byFile.set(f, []).get(f)!).push(n as ScenarioNode);
}
const notRunFeatures = [...byFile.values()].filter((ss) => ss.every((s) => !s.lastResult)).length;

const failures: string[] = [];

// 1) no auto-REMOVED
const removed = report.candidates.filter((c) => c.suspected === 'REMOVED');
if (removed.length > 0) failures.push(`auto-REMOVED claimed for ${removed.length} spec(s) — must be DRIFTED until a git-delete signal exists`);

// 2) reconcile DRIFTED candidates' cited missing paths against disk
let reconciled = 0;
for (const c of report.candidates.filter((x) => x.suspected === 'DRIFTED')) {
  const fcAbs = path.join(root, c.file);
  let rows;
  try { rows = parseFileChangesTable(fs.readFileSync(fcAbs, 'utf8')).rows; } catch { continue; }
  const missing = checkFcRows(rows, root).filter((f) => /FC_(EDIT|DELETE)_MISSING/.test(f.check));
  for (const m of missing) {
    const p = (m as { file?: string }).file;
    if (p && fs.existsSync(path.join(root, p))) failures.push(`${c.spec}: "${p}" claimed MISSING but EXISTS on disk (classifier lied)`);
    else reconciled++;
  }
}

// 3) anti-flood
if (report.candidates.length >= notRunFeatures && notRunFeatures > 5) {
  failures.push(`anti-flood broken: flagged ${report.candidates.length} of ${notRunFeatures} not_run features (gate not narrowing)`);
}

console.log('═══ legacy-triage dogfood (live corpus) ═══');
console.log(`corpus: ${root}`);
console.log(`candidates: ${report.candidates.length} — ${JSON.stringify(by)}`);
console.log(`anti-flood: ${report.candidates.length} flagged of ${notRunFeatures} not_run feature files`);
console.log(`reconcile: ${reconciled} cited-missing paths confirmed absent on disk`);
console.log(failures.length === 0 ? '🟢 PASS — all invariants hold on real data' : `🔴 FAIL (${failures.length}):`);
for (const f of failures) console.log('  - ' + f);
process.exit(failures.length === 0 ? 0 : 1);
