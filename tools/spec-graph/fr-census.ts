/**
 * fr-census — a DETERMINISTIC per-FR roll-call over the one graph (FR-37).
 *
 * Closes META-finding #0 (audit-reports/v4-deep-gap-analysis-2026-06-10.md):
 * an LLM "FR census" lied in BOTH directions — it reported "all 44 FR + 27
 * sub-items IMPLEMENTED, 0 gaps" while FR-43's implementing tasks were still
 * `todo`, and a sibling agent called freshly-closed work "forgotten". A
 * roll-call that decides FR status by narration is a false-green machine. This
 * derives every FR's status from graph EVIDENCE only — covering AC/Scenario
 * edges (FR-37b traceability) + the implementing Task's `status` + that task's
 * scenario results via `computeCoverage` (FR-32) — so the census cannot lie.
 * It is the FR-37 honesty discipline ("a structural pass is never clean; GREEN
 * must trace to the atom") applied at per-FR granularity.
 *
 * Reuses `computeCoverage` (FR-32 — the task→scenario→result join, the SINGLE
 * source of verified_status) and the same `covers`/`tested-by` edge semantics
 * as `conformance.ts::UNCOVERED_FR` — it does NOT re-derive task verification or
 * coverage. Pure function + render + CLI, mirroring `corpus-health.ts`.
 *
 * Verdict per FR (deterministic, evidence-only):
 *   IMPLEMENTED    ≥1 implementing Task is `done` AND verified (every mapped
 *                  scenario PASSED — the honest "truly done").
 *   DONE_UNTESTED  ≥1 implementing Task is `done` but NONE verify (scenario
 *                  failed / not_run / missing). The optimistic false-green this
 *                  tool exists to surface — a DONE claim no test backs.
 *   IN_PROGRESS    an implementing Task is `in-progress` (none done).
 *   PLANNED        implementing Task(s) exist but all `todo`/`blocked` — the
 *                  FR-43 case an LLM census mislabelled IMPLEMENTED.
 *   UNIMPLEMENTED  NO Task references this FR — nobody is building it.
 *
 * Run:  node --import tsx tools/spec-graph/fr-census.ts [--spec <slug>] [--json] [--strict] [corpusRoot]
 * Exit: 0 ⇔ no FR is DONE_UNTESTED (no unproven DONE claim). --strict also
 *       gates on UNIMPLEMENTED (an FR nobody is building).
 *
 * @see .specs/spec-generator-v4/FR.md FR-37 (smart verdict / honesty)
 * @see .specs/spec-generator-v4/TASKS.md P21-5 (fr-census sub-item)
 * @see audit-reports/v4-deep-gap-analysis-2026-06-10.md META-finding #0
 */

import path from 'node:path';
import { buildGraphFromCwd } from './builder.ts';
import { computeCoverage, specOf, type ScenarioLike, type TaskLike } from './coverage.ts';
import { findFrsWithoutResearch } from './research-trace.ts';
import type { SpecGraph, FrNode, ScenarioNode, TaskNode } from './types.ts';

export type FrCensusVerdict =
  | 'IMPLEMENTED'
  | 'DONE_UNTESTED'
  | 'IN_PROGRESS'
  | 'PLANNED'
  | 'UNIMPLEMENTED';

export interface FrCensusRow {
  /** Composite FR id (`<slug>:FR-N`), or bare for non-.specs graphs. */
  frId: string;
  /** Owning spec slug (FR-36a), if any. */
  spec?: string;
  title: string;
  file: string;
  line: number;
  /** ≥1 `covers` edge from this FR (an AC covers it). */
  hasAc: boolean;
  /** ≥1 `tested-by` edge from this FR (a Scenario tests it directly). */
  hasScenario: boolean;
  /** Ids of Tasks whose `refs` include this FR. */
  taskIds: string[];
  /** Hand-set statuses of those tasks (TASKS.md `Status:`). */
  taskStatuses: Array<'todo' | 'in-progress' | 'done' | 'blocked'>;
  /** ≥1 implementing Task verifies (verified_status DONE — its scenarios passed). */
  tested: boolean;
  verdict: FrCensusVerdict;
  /** ≥1 `covers` edge to a Decision node (FR-47 design leg). */
  hasDesign: boolean;
  /** ≥1 `covers` edge to a Story node (FR-47 story leg). */
  hasStory: boolean;
  /** FR cites a RESEARCH.md finding (FR-47 research leg). N/A → true for a spec with no RESEARCH.md. */
  hasResearch: boolean;
  /**
   * ALL six trace-web legs attached: AC + scenario + task + design + story +
   * research (FR-47b). AND-aggregation, not OR — one missing leg ⇒ not 100%
   * (rollup-completeness-all-not-any). This is the literal "доводят до 100%?"
   * answer: a feature is web-complete only when every leg is wired.
   */
  webComplete: boolean;
  /** Which of the six legs are absent — empty ⇔ webComplete. */
  missingLegs: string[];
}

export interface FrCensusReport {
  corpusRoot: string;
  /** Spec slug scope, or 'ALL' for the whole corpus. */
  scope: string;
  rows: FrCensusRow[];
  /** Count per verdict (conservation: Σ === rows.length). */
  byVerdict: Record<FrCensusVerdict, number>;
  /** FRs with ALL six trace-web legs attached (FR-47b webComplete count). */
  webCompleteCount: number;
  /** FRs claimed DONE with no passing scenario — the false-green class. */
  falseGreen: string[];
  /** 🟢 ⇔ no DONE_UNTESTED (no unproven DONE). */
  verdict: 'GREEN' | 'RED';
  /** 🟢 ⇔ also no UNIMPLEMENTED FR. */
  strictVerdict: 'GREEN' | 'RED';
}

const ALL_VERDICTS: readonly FrCensusVerdict[] = [
  'IMPLEMENTED',
  'DONE_UNTESTED',
  'IN_PROGRESS',
  'PLANNED',
  'UNIMPLEMENTED',
];

/**
 * Deterministic per-FR roll-call. `opts.spec` scopes the REPORTED rows to one
 * spec slug (the cell); coverage is always computed corpus-wide so the
 * task→scenario join (`mapTasksToScenarios`, same-spec scoped internally) stays
 * correct regardless of the report scope.
 */
export function computeFrCensus(
  graph: SpecGraph,
  opts: { spec?: string; frsWithoutResearch?: Set<string> } = {},
): FrCensusReport {
  // Edge indices — same semantics as conformance.ts::UNCOVERED_FR. `covers`
  // carries FR→AC AND FR→Decision AND FR→Story since FR-47, so SPLIT by target
  // type: a design/story edge must NOT count as AC coverage (else an FR with a
  // Decision but no AC would read AC:✓). Mirrors conformance.ts edge pre-compute.
  const acCovers = new Set<string>();
  const designCovers = new Set<string>(); // FR→Decision (FR-47 design leg)
  const storyCovers = new Set<string>(); // FR→Story (FR-47 story leg)
  const directlyTested = new Set<string>();
  for (const e of graph.edges) {
    if (e.type === 'covers') {
      const toType = graph.nodes.get(e.to)?.type;
      if (toType === 'Decision') designCovers.add(e.from);
      else if (toType === 'Story') storyCovers.add(e.from);
      else acCovers.add(e.from);
    } else if (e.type === 'tested-by') directlyTested.add(e.from);
  }

  // FR-32 coverage over the WHOLE corpus — the single source of verified_status
  // (a task is verified iff every mapped scenario PASSED). Filtering FRs by
  // scope must NOT narrow this input, or a cross-spec scenario mapping is lost.
  const taskLikes: TaskLike[] = [];
  const scenLikes: ScenarioLike[] = [];
  for (const n of graph.nodes.values()) {
    if (n.type === 'Task') {
      const t = n as TaskNode;
      taskLikes.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: specOf(t.file) });
    } else if (n.type === 'Scenario') {
      const s = n as ScenarioNode;
      scenLikes.push({ id: s.id, tags: s.tags, result: s.lastResult, spec: specOf(s.file) });
    }
  }
  const cov = computeCoverage(taskLikes, scenLikes);

  // Tasks indexed by the FR ids they implement (TaskNode.refs are composite-keyed
  // exactly like the FR node id — FR-36a qualifySlice — so the match is direct).
  const tasksByFr = new Map<string, TaskNode[]>();
  for (const n of graph.nodes.values()) {
    if (n.type !== 'Task') continue;
    const t = n as TaskNode;
    for (const ref of t.refs) {
      const list = tasksByFr.get(ref);
      if (list) list.push(t);
      else tasksByFr.set(ref, [t]);
    }
  }

  const rows: FrCensusRow[] = [];
  for (const n of graph.nodes.values()) {
    if (n.type !== 'FR') continue;
    const fr = n as FrNode;
    if (opts.spec && fr.spec !== opts.spec) continue;

    const tasks = tasksByFr.get(fr.id) ?? [];
    const taskStatuses = tasks.map((t) => t.status);

    // Anti-false-green aggregation (this is the META-#0 disease itself): a
    // SINGLE done task among `todo`s must NOT read IMPLEMENTED — that is exactly
    // the lie an LLM census tells (it reported FR-43 IMPLEMENTED while P18-1/2
    // were still todo, because ONE tangential done task referenced FR-43).
    // IMPLEMENTED therefore requires EVERY implementing task done AND verified;
    // any open task ⇒ IN_PROGRESS (started) or PLANNED (none started).
    const allDone = tasks.length > 0 && tasks.every((t) => t.status === 'done');
    const allVerified = allDone && tasks.every((t) => cov.tasks[t.id]?.verified_status === 'DONE');
    const noneStarted = tasks.length > 0 && tasks.every((t) => t.status === 'todo' || t.status === 'blocked');

    let verdict: FrCensusVerdict;
    if (tasks.length === 0) verdict = 'UNIMPLEMENTED';
    else if (allDone) verdict = allVerified ? 'IMPLEMENTED' : 'DONE_UNTESTED';
    else if (noneStarted) verdict = 'PLANNED';
    else verdict = 'IN_PROGRESS'; // a mix of done/in-progress and open tasks

    // FR-47b trace-web legs. Research is N/A (→ true) for a spec with no
    // RESEARCH.md: research-trace skips those entirely, so we must not flag
    // their FRs as research-incomplete here either.
    const hasAc = acCovers.has(fr.id);
    const hasScenario = directlyTested.has(fr.id);
    const hasDesign = designCovers.has(fr.id);
    const hasStory = storyCovers.has(fr.id);
    const hasResearch = !(opts.frsWithoutResearch?.has(fr.id) ?? false);
    const hasTask = tasks.length > 0;
    // AND-aggregation (rollup-completeness-all-not-any): one missing leg ⇒ not 100%.
    const missingLegs: string[] = [];
    if (!hasAc) missingLegs.push('AC');
    if (!hasScenario) missingLegs.push('scenario');
    if (!hasTask) missingLegs.push('task');
    if (!hasDesign) missingLegs.push('design');
    if (!hasStory) missingLegs.push('story');
    if (!hasResearch) missingLegs.push('research');

    rows.push({
      frId: fr.id,
      spec: fr.spec,
      title: fr.title,
      file: fr.file,
      line: fr.line,
      hasAc,
      hasScenario,
      taskIds: tasks.map((t) => t.id),
      taskStatuses,
      tested: allVerified,
      verdict,
      hasDesign,
      hasStory,
      hasResearch,
      webComplete: missingLegs.length === 0,
      missingLegs,
    });
  }

  // Stable order: by spec then by numeric FR id, so the report is diff-friendly.
  rows.sort((a, b) => {
    const sa = a.spec ?? '';
    const sb = b.spec ?? '';
    if (sa !== sb) return sa.localeCompare(sb);
    const na = Number(a.frId.match(/FR-(\d+)/i)?.[1] ?? 0);
    const nb = Number(b.frId.match(/FR-(\d+)/i)?.[1] ?? 0);
    return na - nb || a.frId.localeCompare(b.frId);
  });

  const byVerdict = Object.fromEntries(ALL_VERDICTS.map((v) => [v, 0])) as Record<FrCensusVerdict, number>;
  for (const r of rows) byVerdict[r.verdict]++;
  const falseGreen = rows.filter((r) => r.verdict === 'DONE_UNTESTED').map((r) => r.frId);

  return {
    corpusRoot: '',
    scope: opts.spec ?? 'ALL',
    rows,
    byVerdict,
    webCompleteCount: rows.filter((r) => r.webComplete).length,
    falseGreen,
    verdict: byVerdict.DONE_UNTESTED > 0 ? 'RED' : 'GREEN',
    strictVerdict: byVerdict.DONE_UNTESTED > 0 || byVerdict.UNIMPLEMENTED > 0 ? 'RED' : 'GREEN',
  };
}

const VERDICT_ICON: Record<FrCensusVerdict, string> = {
  IMPLEMENTED: '🟢',
  DONE_UNTESTED: '🔴',
  IN_PROGRESS: '🟡',
  PLANNED: '⚪',
  UNIMPLEMENTED: '⚫',
};

export function renderFrCensus(r: FrCensusReport): string {
  const lines: string[] = [];
  lines.push(`═══ fr-census (deterministic per-FR roll-call, FR-37) — ${r.corpusRoot} [scope: ${r.scope}] ═══`);
  lines.push(`${r.rows.length} FR(s): ` + ALL_VERDICTS.map((v) => `${VERDICT_ICON[v]} ${v}:${r.byVerdict[v]}`).join('  '));
  lines.push(
    `🕸️  web-complete (ALL 6 legs AC+Scen+Task+Design+Story+Research): ${r.webCompleteCount}/${r.rows.length} — FR-47b "доводят до 100%?" verdict (AND, not OR)`,
  );
  for (const row of r.rows) {
    const tick = (b: boolean): string => (b ? '✓' : '✗');
    const ev =
      `AC:${tick(row.hasAc)} Scen:${tick(row.hasScenario)} D:${tick(row.hasDesign)} St:${tick(row.hasStory)} R:${tick(row.hasResearch)} tasks:[${row.taskStatuses.join(',') || '—'}]`;
    const web = row.webComplete ? '🕸️100%' : `⚠️missing[${row.missingLegs.join(',')}]`;
    lines.push(`  ${VERDICT_ICON[row.verdict]} ${row.frId}  ${row.verdict.padEnd(13)} ${ev} ${web}  ${row.title}`);
  }
  if (r.falseGreen.length) {
    lines.push(`⚠️ FALSE-GREEN — ${r.falseGreen.length} FR(s) marked DONE with no passing scenario (claim no test backs):`);
    for (const id of r.falseGreen) lines.push(`   ${id}`);
  }
  const icon = (v: 'GREEN' | 'RED'): string => (v === 'GREEN' ? '🟢' : '🔴');
  lines.push(
    `VERDICT: ${icon(r.verdict)} ${r.verdict} (hard: no DONE_UNTESTED) | strict: ${icon(r.strictVerdict)} ${r.strictVerdict} (also no UNIMPLEMENTED)`,
  );
  lines.push('A census verdict is derived from graph evidence (task status + scenario results), never from narration — it cannot false-green.');
  return lines.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isDirectRun =
  process.argv[1]?.endsWith('fr-census.ts') || process.argv[1]?.endsWith('fr-census.js');
if (isDirectRun) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const strict = argv.includes('--strict');
  let spec: string | undefined;
  const specIdx = argv.indexOf('--spec');
  if (specIdx !== -1) spec = argv[specIdx + 1];
  const rootArg = argv.find((a, i) => !a.startsWith('-') && argv[i - 1] !== '--spec') ?? process.cwd();
  const corpusRoot = path.resolve(rootArg);
  // Research leg (FR-47b): the existing text detector (research stays a detector,
  // not a graph node — prose has no clean per-finding unit). Composite FR ids
  // lacking a RESEARCH.md citation, only for specs that HAVE a RESEARCH.md.
  const frsWithoutResearch = new Set(findFrsWithoutResearch(corpusRoot).map((f) => f.nodeId));
  const report = computeFrCensus(buildGraphFromCwd(corpusRoot), { spec, frsWithoutResearch });
  report.corpusRoot = corpusRoot;
  console.log(json ? JSON.stringify(report, null, 2) : renderFrCensus(report));
  const gate = strict ? report.strictVerdict : report.verdict;
  process.exit(gate === 'GREEN' ? 0 : 1);
}
