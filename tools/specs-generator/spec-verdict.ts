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

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildGraphFromCwd } from '../spec-graph/builder.ts';
import {
  checkTraceabilityCompleteness,
  summariseGaps,
  type TraceabilityGap,
  type TraceabilityGapClass,
} from '../spec-graph/traceability.ts';

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
  /** Actionable per-item gap list (one line per blocking finding). */
  gapList: string[];
  /** Explicit fail-loud notes for layers not yet composed (FR-37c). */
  notes: string[];
}

interface RunCoreOptions {
  cwd?: string;
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
export function runSpecVerdict(specPath: string, opts: RunCoreOptions = {}): SpecVerdictResult {
  const validation = runCoreJson('validate-spec', specPath, opts);
  const audit = runCoreJson('audit-spec', specPath, opts);

  const structuralErrors: number = Array.isArray(validation.errors) ? validation.errors.length : 0;
  const warnings: number = Array.isArray(validation.warnings) ? validation.warnings.length : 0;

  const errorFindings: AuditFinding[] = (audit.findings ?? []).filter(
    (f: AuditFinding) => f.severity === 'ERROR',
  );
  const byClass: Record<string, AuditFinding[]> = {};
  for (const f of errorFindings) (byClass[f.check] ??= []).push(f);

  // FR-37b (P14-2): the cell→atom traceability gate over the ONE graph.
  // Scope = this spec (the cell): slug is the dir path under `.specs/`.
  const cwd = opts.cwd ?? process.cwd();
  const slug = specPath
    .replace(/\\/g, '/')
    .replace(/^\.?\/?\.specs\//, '')
    .replace(/\/+$/, '');
  const graph = buildGraphFromCwd(cwd);
  const gaps = checkTraceabilityCompleteness(graph, { spec: slug });

  const gapList: string[] = [
    ...(validation.errors ?? []).map(
      (e: any) => `[STRUCTURAL] ${e.file ?? ''}: ${e.message ?? JSON.stringify(e)}`,
    ),
    ...errorFindings.map((f) => `[${f.check}] ${f.message}`),
    ...gaps.map((g) => `[${g.class}] ${g.file}:${g.line} — ${g.message}`),
  ];

  const verdict: 'RED' | 'GREEN' =
    structuralErrors > 0 || errorFindings.length > 0 || gaps.length > 0 ? 'RED' : 'GREEN';

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
    gapList,
    notes: [
      'SEMANTIC_SKIPPED — FR-8 semantic drift check not yet composed into the verdict (P14-3); unchecked content is NOT "no drift" (FR-37c)',
    ],
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
function parseArgs(argv: string[]): { specPath: string; json: boolean } {
  let specPath = '';
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-Path' || a === '--path') specPath = argv[++i] ?? '';
    else if (a === '--json') json = true;
    else if (!a.startsWith('-') && !specPath) specPath = a;
  }
  if (!specPath) {
    console.error('Usage: spec-verdict.ts -Path .specs/<slug> [--json]');
    process.exit(2);
  }
  return { specPath, json };
}

const isDirectRun =
  process.argv[1]?.endsWith('spec-verdict.ts') || process.argv[1]?.endsWith('spec-verdict.js');
if (isDirectRun) {
  const { specPath, json } = parseArgs(process.argv.slice(2));
  const result = runSpecVerdict(specPath);
  console.log(json ? JSON.stringify(result, null, 2) : renderVerdict(result));
  process.exit(result.verdict === 'RED' ? 1 : 0);
}
