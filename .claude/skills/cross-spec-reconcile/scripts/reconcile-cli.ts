// cross-spec-reconcile CLI entry (FR-17 — T7-56 --dry-run + T7-57 summary table).
//
// The engine (reconcileLight / runFullMode) + the writers (writeReport,
// writeSarif) all shipped, but there was NO runnable driver: SKILL.md
// documented `/cross-spec-reconcile` and the `--mode/--dry-run/--sarif/--slug`
// flags, yet nothing parsed them — a documented-but-unwired surface (the exact
// "installed ≠ integrated" class the project guards against). This file is that
// driver, mirroring the sibling `cross-spec-resolve/scripts/resolve-cli.ts`:
// a pure, testable `reconcileCli(...)` + a thin `import.meta.url` main block.
//
// The agent consumes this CLI's stdout; the YAML/SARIF are written in-process
// (engine carve-out, FR-39) — the agent never raw-`Read`s `.specs/`. The
// CRITICAL blocking AskUserQuestion stays AGENT-flow (SKILL.md), not here — the
// CLI is informational and exits 0; it only reports the CRITICAL count so the
// skill body knows to raise the prompt.
//
// @see .specs/spec-generator-v4/FR.md FR-17
// @see .claude/skills/cross-spec-reconcile/SKILL.md (## Flags)

import { pathToFileURL } from 'node:url';
import { reconcileLight, type ReconcileResult, type Severity } from './reconcile.ts';
import { runFullMode } from './full-mode.ts';
import { writeReport } from './yaml-writer.ts';
import { writeSarif } from './sarif.ts';

export interface ReconcileCliArgs {
  mode: 'light' | 'full';
  dryRun: boolean;
  sarif: boolean;
  /** Empty = scan every `.specs/<slug>/`. */
  slugs: string[];
  /** Parse error message (unknown flag / missing value); set → usage + exit 2. */
  error?: string;
}

/**
 * Pure arg parser (testable in isolation). Supports the four documented flags:
 * `--mode light|full`, `--dry-run`, `--sarif`, `--slug <name>` (repeatable).
 */
export function parseReconcileArgs(argv: readonly string[]): ReconcileCliArgs {
  const out: ReconcileCliArgs = { mode: 'light', dryRun: false, sarif: false, slugs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--sarif') out.sarif = true;
    else if (a === '--mode') {
      const v = argv[++i];
      if (v !== 'light' && v !== 'full') return { ...out, error: `--mode expects light|full, got ${v ?? '(missing)'}` };
      out.mode = v;
    } else if (a === '--slug') {
      const v = argv[++i];
      if (!v) return { ...out, error: '--slug expects a spec name' };
      out.slugs.push(v);
    } else {
      return { ...out, error: `unknown argument: ${a}` };
    }
  }
  return out;
}

export interface ReconcileCliResult {
  stdout: string;
  exitCode: number;
  /** Paths of YAML reports written (empty under --dry-run). */
  reportPaths: string[];
  /** Paths of SARIF reports written (only with --sarif, not --dry-run). */
  sarifPaths: string[];
  totalFindings: number;
  bySeverity: Record<Severity, number>;
}

const USAGE =
  'usage: reconcile-cli [--mode light|full] [--dry-run] [--sarif] [--slug <name> ...]\n';

function countSeverity(results: readonly ReconcileResult[]): Record<Severity, number> {
  const by: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const r of results) for (const f of r.findings) by[f.severity]++;
  return by;
}

/** Render the per-spec Coverage Summary Table (T7-57) + a totals row. */
function renderSummaryTable(results: readonly ReconcileResult[]): string {
  const rows = results
    .map((r) => {
      const by: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, INFO: 0 };
      for (const f of r.findings) by[f.severity]++;
      return { slug: r.specSlug, ...by, total: r.findings.length };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  const head = '| spec | CRIT | WARN | INFO | total |\n|------|-----:|-----:|-----:|------:|';
  const body = rows
    .map((r) => `| ${r.slug} | ${r.CRITICAL} | ${r.WARNING} | ${r.INFO} | ${r.total} |`)
    .join('\n');
  const tot = countSeverity(results);
  const grand = tot.CRITICAL + tot.WARNING + tot.INFO;
  const totalRow = `| **all (${results.length} specs)** | ${tot.CRITICAL} | ${tot.WARNING} | ${tot.INFO} | ${grand} |`;
  return rows.length ? `${head}\n${body}\n${totalRow}\n` : `(no findings across ${results.length} specs)\n`;
}

/** Drive the engine, optionally write artifacts, return summary stdout. */
export async function reconcileCli(
  args: ReconcileCliArgs,
  repoRoot: string,
  spawn?: (prompt: string) => Promise<string>,
): Promise<ReconcileCliResult> {
  if (args.error) {
    return {
      stdout: `${args.error}\n${USAGE}`,
      exitCode: 2,
      reportPaths: [],
      sarifPaths: [],
      totalFindings: 0,
      bySeverity: { CRITICAL: 0, WARNING: 0, INFO: 0 },
    };
  }

  const slugs = args.slugs.length ? args.slugs : undefined;
  const results: ReconcileResult[] =
    args.mode === 'full'
      ? await runFullMode({ repoRoot, slugs, spawn })
      : reconcileLight({ repoRoot, slugs });

  const reportPaths: string[] = [];
  const sarifPaths: string[] = [];
  if (!args.dryRun) {
    for (const r of results) {
      reportPaths.push(writeReport(repoRoot, r));
      if (args.sarif) sarifPaths.push(writeSarif(repoRoot, r));
    }
  }

  const bySeverity = countSeverity(results);
  const total = bySeverity.CRITICAL + bySeverity.WARNING + bySeverity.INFO;
  const lines: string[] = [];
  lines.push(`cross-spec-reconcile (${args.mode}) — ${results.length} spec(s), ${total} finding(s)`);
  lines.push(`severity: CRITICAL=${bySeverity.CRITICAL} WARNING=${bySeverity.WARNING} INFO=${bySeverity.INFO}`);
  lines.push('');
  lines.push(renderSummaryTable(results).trimEnd());
  lines.push('');
  if (args.dryRun) {
    lines.push('(--dry-run: no consistency-report.yaml written)');
  } else {
    lines.push(`wrote ${reportPaths.length} consistency-report.yaml${args.sarif ? ` + ${sarifPaths.length} .sarif` : ''}`);
  }
  if (bySeverity.CRITICAL > 0) {
    lines.push(`⚠️  ${bySeverity.CRITICAL} CRITICAL finding(s) — the skill body must raise the blocking AskUserQuestion (SKILL.md).`);
  }

  return {
    stdout: lines.join('\n') + '\n',
    exitCode: 0,
    reportPaths,
    sarifPaths,
    totalFindings: total,
    bySeverity,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd();
  const args = parseReconcileArgs(process.argv.slice(2));
  reconcileCli(args, repoRoot)
    .then((res) => {
      process.stdout.write(res.stdout);
      process.exit(res.exitCode);
    })
    .catch((err) => {
      process.stderr.write(`reconcile-cli failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
