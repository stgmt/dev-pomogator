#!/usr/bin/env npx tsx
/**
 * spec-verdict — the AUTHORITATIVE spec-health verdict entrypoint (FR-37).
 *
 * P14-1 seed: composes the two layers that exist before the FR-36 one-graph
 * lands —
 *   1. `validate-spec` (structure + links) as a PRE-FILTER ONLY. Its pass is
 *      NOT reportable as "valid / clean / done" (FR-37a); structural errors
 *      still make the verdict RED (a broken file can't be healthy either).
 *   2. `audit-spec` as a HARD GATE: every severity=ERROR finding fails the
 *      verdict with a per-class, per-item gap list. A stale FILE_CHANGES path
 *      (FILE_CHANGES_VERIFY) is therefore a hard verdict ERROR (FR-37e) — it
 *      can no longer be bypassed by reading `validate-spec` alone.
 *
 * P14-2 adds the traceability-completeness check (cell→atom invariants),
 * P14-3 composes `conformance_check` + `get_coverage` + FR-8 semantic over the
 * one graph and makes this module THE health entrypoint for skills (P14-4).
 * Until then the verdict carries explicit notes for what is NOT yet checked —
 * fail-loud, never a silent all-clear (FR-37c discipline).
 *
 * @see .specs/spec-generator-v4/FR.md FR-37 (a, b, e)
 * @see .specs/spec-generator-v4/TASKS.md Phase 14 P14-1
 * @see audit-reports/v4-smart-verdict-and-organism-traceability.md
 */

import { execFileSync, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildGraphFromCwd } from '../spec-graph/builder.ts';
import { checkConformance } from '../spec-graph/conformance.ts';
import { computeCoverage, specOf, type ScenarioLike, type TaskLike } from '../spec-graph/coverage.ts';
import {
  gapsFromFindings,
  summariseGaps,
  type TraceabilityGap,
  type TraceabilityGapClass,
} from '../spec-graph/traceability.ts';
import { runJudge, type JudgeResult } from '../spec-llm-judge/index.ts';
import type { FrNode, ScenarioNode, TaskNode } from '../spec-graph/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.join(__dirname, 'specs-generator-core.mjs');

export interface AuditFinding {
  check: string;
  category: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  details?: string;
}

export interface SpecVerdictResult {
  specPath: string;
  /** RED while ANY hard gate holds; GREEN only when every gate passes. */
  verdict: 'RED' | 'GREEN';
  /** Structural pre-filter (validate-spec). Pass is NOT a health verdict. */
  prefilter: {
    structuralErrors: number;
    warnings: number;
    note: string;
  };
  /** audit-spec hard gate: ERROR findings grouped per finding class. */
  auditGate: {
    errorCount: number;
    byClass: Record<string, AuditFinding[]>;
  };
  /**
   * FR-37b (P14-2): cell→atom traceability gate over the ONE graph — the
   * spec-scoped per-item gap list (UNCOVERED_FR / TASK_UNTESTED /
   * UNTAGGED_SCENARIO; stale FILE_CHANGES paths arrive via the audit gate
   * above). ANY gap → RED.
   */
  traceabilityGate: {
    gapCount: number;
    byClass: Record<TraceabilityGapClass, number>;
    gaps: TraceabilityGap[];
  };
  /**
   * P14-3: spec-scoped conformance summary over the one graph. Error-severity
   * findings gate (RED); warnings are surfaced, not blocking (FR-37b
   * enumerates the hard classes — they live in traceabilityGate).
   */
  conformance: {
    errorCount: number;
    warningCount: number;
    byCode: Record<string, number>;
  };
  /**
   * P14-3: FR-32 honesty rollup for this spec — scenario buckets + DONE tasks
   * whose evidence does not verify them. Visible, not gate-blocking (the
   * blocking subset is TASK_UNTESTED in the traceability gate).
   */
  coverage: {
    buckets: Record<string, number>;
    unverifiedDoneTasks: string[];
  };
  /**
   * FR-37c (P14-3): FR-8 semantic drift in the verdict path. `ran` only when
   * a claude binary is present; otherwise an explicit SEMANTIC_SKIPPED note —
   * NEVER a silent "no drift" for unchecked content.
   */
  semantic: {
    ran: boolean;
    binaryPresent: boolean;
    pairsChecked: number;
    drifts: Array<{ frId: string; scenarioId: string; severity: string; explanation: string }>;
    failures: number;
    note?: string;
  };
  /** Actionable per-item gap list (one line per blocking finding). */
  gapList: string[];
  /** Explicit fail-loud notes (FR-37c discipline). */
  notes: string[];
}

interface RunCoreOptions {
  cwd?: string;
  /**
   * FR-8 semantic layer controls (P14-3). `judgeSpawn` injects the
   * subprocess for tests; `semantic: false` forces an explicit skip;
   * `maxPairs` bounds the first uncached run.
   */
  semantic?: boolean;
  judgeSpawn?: (prompt: string) => Promise<string>;
  maxPairs?: number;
}

/** Is a `claude` binary reachable (CLAUDE_BIN or PATH)? Probe, don't assume. */
function claudeBinaryPresent(): boolean {
  const bin = process.env.CLAUDE_BIN ?? 'claude';
  const probe = spawnSync(bin, ['--version'], { stdio: 'ignore', timeout: 10_000, shell: process.platform === 'win32' });
  return probe.status === 0;
}

/** Run a specs-generator-core.mjs command, tolerating non-zero exit (findings ≠ crash). */
function runCoreJson(command: string, specPath: string, opts: RunCoreOptions): any {
  // core.mjs resolves a RELATIVE -Path against ITS OWN repo root (findRepoRoot
  // from the script dir), not the caller's cwd — so pass an absolute path to
  // make fixture/foreign-corpus runs (opts.cwd) actually hit the right spec.
  const absSpecPath = path.resolve(opts.cwd ?? process.cwd(), specPath);
  const args = [corePath, command, '-Path', absSpecPath];
  let stdout: string;
  try {
    stdout = execFileSync('node', args, {
      cwd: opts.cwd ?? process.cwd(),
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000, // a hung core must not hang the verdict (skills import this in P14-4)
      stdio: ['ignore', 'pipe', 'pipe'],
      // Point the generator's repo root at the caller's corpus root, so the
      // verdict works on fixture dirs and foreign repos (FR-37/P14-5), not
      // only on dev-pomogator's own .specs/.
      env: { ...process.env, SPECS_GENERATOR_ROOT: opts.cwd ?? process.cwd() },
    });
  } catch (err: any) {
    // Non-zero exit with JSON on stdout is still a usable result.
    if (err && typeof err.stdout === 'string' && err.stdout.trim().startsWith('{')) {
      stdout = err.stdout;
    } else {
      throw new Error(
        `spec-verdict: \`${command}\` failed for ${specPath}: ${err?.message ?? err}\n${String(err?.stderr ?? '').slice(0, 800)}`,
      );
    }
  }
  const parsed = JSON.parse(stdout);
  // FAIL LOUD on a core-level error object ({error: "Spec folder not found: …"}).
  // Treating it as "no findings" would be a false GREEN — the exact FR-37
  // failure class this entrypoint exists to prevent.
  if (parsed && typeof parsed.error === 'string') {
    throw new Error(`spec-verdict: \`${command}\` errored for ${absSpecPath}: ${parsed.error}`);
  }
  return parsed;
}

/**
 * Compute the authoritative verdict for one spec directory.
 *
 * @param specPath  e.g. ".specs/spec-generator-v4" (relative to opts.cwd)
 * @param opts.cwd  repo root the spec (and its FILE_CHANGES paths) resolve against
 */
export async function runSpecVerdict(
  specPath: string,
  opts: RunCoreOptions = {},
): Promise<SpecVerdictResult> {
  const validation = runCoreJson('validate-spec', specPath, opts);
  const audit = runCoreJson('audit-spec', specPath, opts);

  const structuralErrors: number = Array.isArray(validation.errors) ? validation.errors.length : 0;
  const warnings: number = Array.isArray(validation.warnings) ? validation.warnings.length : 0;

  const errorFindings: AuditFinding[] = (audit.findings ?? []).filter(
    (f: AuditFinding) => f.severity === 'ERROR',
  );
  const byClass: Record<string, AuditFinding[]> = {};
  for (const f of errorFindings) (byClass[f.check] ??= []).push(f);

  // ── The ONE graph (FR-36) + ONE conformance pass — every smart layer below
  // derives from these two (FR-37a composition, P14-3). ─────────────────────
  const cwd = opts.cwd ?? process.cwd();
  const slug = specPath
    .replace(/\\/g, '/')
    .replace(/^\.?\/?\.specs\//, '')
    .replace(/\/+$/, '');
  const graph = buildGraphFromCwd(cwd);
  const allFindings = checkConformance(graph);
  const inSpec = (file: string): boolean =>
    String(file).replace(/\\/g, '/').includes(`.specs/${slug}/`);
  const specFindings = allFindings.filter((f) => inSpec(f.location.file));

  // FR-37b (P14-2): the cell→atom traceability HARD gate.
  const gaps = gapsFromFindings(specFindings, {});

  // P14-3: conformance summary — error-severity gates, warnings surface.
  const confErrors = specFindings.filter((f) => f.severity === 'error');
  const confByCode: Record<string, number> = {};
  for (const f of specFindings) confByCode[f.code] = (confByCode[f.code] ?? 0) + 1;

  // P14-3: FR-32 honesty rollup for this spec.
  const taskLikes: TaskLike[] = [];
  const scenLikes: ScenarioLike[] = [];
  const doneTaskIds = new Set<string>();
  for (const n of graph.nodes.values()) {
    if (!inSpec(n.file)) continue;
    if (n.type === 'Task') {
      const t = n as TaskNode;
      taskLikes.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: specOf(t.file) });
      if (t.status === 'done') doneTaskIds.add(t.id);
    } else if (n.type === 'Scenario') {
      const s = n as ScenarioNode;
      scenLikes.push({ id: s.id, tags: s.tags, result: s.lastResult, spec: specOf(s.file) });
    }
  }
  const cov = computeCoverage(taskLikes, scenLikes);
  const buckets: Record<string, number> = {};
  for (const [b, ids] of Object.entries(cov.buckets)) buckets[b] = ids.length;
  const unverifiedDoneTasks = [...doneTaskIds].filter(
    (id) => cov.tasks[id]?.verified_status !== 'DONE',
  );

  // FR-37c (P14-3): FR-8 semantic drift IN the verdict path — ON when a
  // claude binary is present; explicit skip otherwise. Fail-loud always.
  const semanticWanted = opts.semantic !== false;
  const binaryPresent = opts.judgeSpawn ? true : semanticWanted && claudeBinaryPresent();
  const drifts: SpecVerdictResult['semantic']['drifts'] = [];
  let pairsChecked = 0;
  let judgeFailures = 0;
  let semanticNote: string | undefined;
  if (semanticWanted && binaryPresent) {
    // Pairs = this spec's FR ↔ tested-by Scenario edges (the REAL edges, FR-36c).
    const pairs: Array<{ fr: FrNode; scen: ScenarioNode }> = [];
    for (const e of graph.edges) {
      if (e.type !== 'tested-by') continue;
      const fr = graph.nodes.get(e.from);
      const scen = graph.nodes.get(e.to);
      if (!fr || fr.type !== 'FR' || !scen || scen.type !== 'Scenario') continue;
      if (!inSpec(fr.file)) continue;
      pairs.push({ fr: fr as FrNode, scen: scen as ScenarioNode });
    }
    const limit = opts.maxPairs ?? Number.POSITIVE_INFINITY;
    for (const { fr, scen } of pairs.slice(0, limit)) {
      const res: JudgeResult = await runJudge({
        repoRoot: cwd,
        frId: fr.id,
        frText: `${fr.title}\n${fr.body ?? ''}`,
        scenarioId: scen.id,
        scenarioText: scen.steps.map((s) => `${s.keyword} ${s.text}`).join('\n'),
        spawn: opts.judgeSpawn,
      });
      pairsChecked++;
      if (res.result === 'DRIFT') {
        drifts.push({
          frId: fr.id,
          scenarioId: scen.id,
          severity: res.severity ?? 'warning',
          explanation: res.explanation ?? '',
        });
      } else if (res.result === 'SUBPROCESS_FAILED') {
        judgeFailures++;
      }
    }
    if (pairs.length > pairsChecked) {
      semanticNote = `SEMANTIC_TRUNCATED — ${pairsChecked} of ${pairs.length} FR↔Scenario pairs checked (maxPairs); the rest are UNCHECKED, not "no drift" (FR-37c)`;
    } else if (judgeFailures > 0) {
      semanticNote = `SEMANTIC_DEGRADED — ${judgeFailures} judge subprocess failure(s); those pairs are UNCHECKED, not "no drift" (FR-37c)`;
    }
  } else {
    semanticNote =
      'SEMANTIC_SKIPPED — no claude binary available (or semantic disabled); unchecked content is NOT "no drift" (FR-37c)';
  }

  const gapList: string[] = [
    ...(validation.errors ?? []).map(
      (e: any) => `[STRUCTURAL] ${e.file ?? ''}: ${e.message ?? JSON.stringify(e)}`,
    ),
    ...errorFindings.map((f) => `[${f.check}] ${f.message}`),
    ...gaps.map((g) => `[${g.class}] ${g.file}:${g.line} — ${g.message}`),
    ...confErrors.map((f) => `[CONFORMANCE:${f.code}] ${f.location.file}:${f.location.line} — ${f.message}`),
    ...drifts.map((d) => `[SEMANTIC_DRIFT:${d.severity}] ${d.frId} ↔ ${d.scenarioId} — ${d.explanation}`),
  ];

  const verdict: 'RED' | 'GREEN' =
    structuralErrors > 0 ||
    errorFindings.length > 0 ||
    gaps.length > 0 ||
    confErrors.length > 0 ||
    drifts.length > 0
      ? 'RED'
      : 'GREEN';

  const notes: string[] = [];
  if (semanticNote) notes.push(semanticNote);

  return {
    specPath,
    verdict,
    prefilter: {
      structuralErrors,
      warnings,
      note: 'pre-filter only — a structural pass is NOT reportable as "valid/clean/done" (FR-37a)',
    },
    auditGate: { errorCount: errorFindings.length, byClass },
    traceabilityGate: { gapCount: gaps.length, byClass: summariseGaps(gaps), gaps },
    conformance: {
      errorCount: confErrors.length,
      warningCount: specFindings.filter((f) => f.severity === 'warning').length,
      byCode: confByCode,
    },
    coverage: { buckets, unverifiedDoneTasks },
    semantic: {
      ran: semanticWanted && binaryPresent,
      binaryPresent,
      pairsChecked,
      drifts,
      failures: judgeFailures,
      note: semanticNote,
    },
    gapList,
    notes,
  };
}

/** Render the verdict for humans. GREEN here means "every composed gate passed". */
export function renderVerdict(r: SpecVerdictResult): string {
  const lines: string[] = [];
  lines.push(`═══ spec-verdict (authoritative, FR-37) — ${r.specPath} ═══`);
  lines.push(
    `pre-filter (validate-spec, structural): ${r.prefilter.structuralErrors} errors / ${r.prefilter.warnings} warnings — ${r.prefilter.note}`,
  );
  if (r.auditGate.errorCount === 0) {
    lines.push('audit gate (audit-spec): 0 ERROR findings — gate PASSES');
  } else {
    const classCount = Object.keys(r.auditGate.byClass).length;
    lines.push(`audit gate (audit-spec): ${r.auditGate.errorCount} ERROR across ${classCount} class(es) — gate FAILS:`);
    for (const [cls, findings] of Object.entries(r.auditGate.byClass)) {
      lines.push(`  [${cls}] ×${findings.length}`);
      for (const f of findings) lines.push(`    - ${f.message}`);
    }
  }
  lines.push(
    `conformance (one graph, spec-scoped): ${r.conformance.errorCount} error / ${r.conformance.warningCount} warning — ` +
      Object.entries(r.conformance.byCode)
        .map(([c, n]) => `${c}:${n}`)
        .join(', '),
  );
  lines.push(
    `coverage (FR-32 honesty): buckets ${JSON.stringify(r.coverage.buckets)}` +
      (r.coverage.unverifiedDoneTasks.length
        ? ` — DONE-but-unverified: ${r.coverage.unverifiedDoneTasks.join(', ')}`
        : ''),
  );
  if (r.semantic.ran) {
    lines.push(
      `semantic (FR-8): ${r.semantic.pairsChecked} pair(s) checked — ${r.semantic.drifts.length} drift(s), ${r.semantic.failures} failure(s)` +
        (r.semantic.note ? ` — ${r.semantic.note}` : ''),
    );
  } else {
    lines.push(`semantic (FR-8): ${r.semantic.note}`);
  }
  if (r.traceabilityGate.gapCount === 0) {
    lines.push('traceability gate (FR-37b, cell→atom): 0 gaps — gate PASSES');
  } else {
    const tb = r.traceabilityGate.byClass;
    lines.push(
      `traceability gate (FR-37b, cell→atom): ${r.traceabilityGate.gapCount} gap(s) — gate FAILS ` +
        `(UNCOVERED_FR: ${tb.UNCOVERED_FR}, TASK_UNTESTED: ${tb.TASK_UNTESTED}, UNTAGGED_SCENARIO: ${tb.UNTAGGED_SCENARIO}):`,
    );
    for (const g of r.traceabilityGate.gaps.slice(0, 20)) {
      lines.push(`  [${g.class}] ${g.nodeId} @ ${g.file}:${g.line}`);
    }
    if (r.traceabilityGate.gaps.length > 20) {
      lines.push(`  … and ${r.traceabilityGate.gaps.length - 20} more (see --json for the full list)`);
    }
  }
  lines.push('notes (fail-loud, FR-37c):');
  for (const n of r.notes) lines.push(`  - ${n}`);
  lines.push(`VERDICT: ${r.verdict}${r.verdict === 'RED' ? ` — ${r.gapList.length} blocking item(s) in the gap list above` : ''}`);
  return lines.join('\n');
}

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): {
  specPath: string;
  json: boolean;
  semantic: boolean;
  maxPairs?: number;
} {
  let specPath = '';
  let json = false;
  let semantic = true;
  let maxPairs: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-Path' || a === '--path') specPath = argv[++i] ?? '';
    else if (a === '--json') json = true;
    else if (a === '--no-semantic') semantic = false;
    else if (a === '--max-pairs') maxPairs = Number(argv[++i]);
    else if (!a.startsWith('-') && !specPath) specPath = a;
  }
  if (!specPath) {
    console.error('Usage: spec-verdict.ts -Path .specs/<slug> [--json] [--no-semantic] [--max-pairs N]');
    process.exit(2);
  }
  return { specPath, json, semantic, maxPairs };
}

const isDirectRun =
  process.argv[1]?.endsWith('spec-verdict.ts') || process.argv[1]?.endsWith('spec-verdict.js');
if (isDirectRun) {
  const { specPath, json, semantic, maxPairs } = parseArgs(process.argv.slice(2));
  const result = await runSpecVerdict(specPath, { semantic, maxPairs });
  console.log(json ? JSON.stringify(result, null, 2) : renderVerdict(result));
  process.exit(result.verdict === 'RED' ? 1 : 0);
}
