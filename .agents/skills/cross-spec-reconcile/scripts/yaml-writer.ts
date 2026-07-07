// Minimal YAML writer for `consistency-report.yaml`.
//
// Avoids a YAML dependency — the report has a fixed shape (no nested
// arrays-of-objects-of-arrays, no anchors, no multi-line strings beyond
// suggested_fix). A hand-rolled emitter keeps the skill self-contained
// and the output diff-friendly.
//
// Atomic write per atomic-config-save rule: temp file + rename.

import fs from 'node:fs';
import path from 'node:path';
import type { ReconcileResult } from './reconcile.ts';

function escape(value: string): string {
  if (/[:#\n"'\\&*?{}\[\],]/.test(value) || value.startsWith(' ') || value.endsWith(' ')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

// FR-17 (impl-coverage-summary): a top-level `summary` block — counts by
// severity / class / namespace, run totals, and the top-3 highest-severity
// recommendations. `by_class` reports the REAL FindingClass values (reconcile.ts);
// the FR-17 Done-When's aspirational `{covered,uncovered,orphaned,outdated}`
// taxonomy does not match the implemented classes (verify-divergent-contracts:
// code is the source of truth — the spec Done-When is corrected to match).
function emitSummary(lines: string[], report: ReconcileResult): void {
  const findings = report.findings;
  const sev: Record<string, number> = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  const byClass = new Map<string, number>();
  const byNs = new Map<string, number>();
  for (const f of findings) {
    if (f.severity in sev) sev[f.severity]++;
    byClass.set(f.class, (byClass.get(f.class) ?? 0) + 1);
    const ns = f.code.includes('/') ? f.code.slice(0, f.code.indexOf('/')) : f.code;
    byNs.set(ns, (byNs.get(ns) ?? 0) + 1);
  }
  const emitMap = (label: string, m: Map<string, number>): void => {
    if (m.size === 0) {
      lines.push(`  ${label}: {}`);
      return;
    }
    lines.push(`  ${label}:`);
    for (const [k, n] of [...m].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`    ${escape(k)}: ${n}`);
    }
  };
  lines.push('summary:');
  lines.push('  by_severity:');
  for (const s of ['CRITICAL', 'WARNING', 'INFO']) lines.push(`    ${s}: ${sev[s]}`);
  emitMap('by_class', byClass);
  emitMap('by_namespace', byNs);
  lines.push('  totals:');
  lines.push(`    findings: ${findings.length}`);
  lines.push(`    specs_compared: ${report.specsCompared ?? 0}`);
  lines.push(`    impl_paths_checked: ${report.implPathsChecked ?? 0}`);
  const rank: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  const top = [...findings].sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9)).slice(0, 3);
  if (top.length === 0) {
    lines.push('  top_3_recommendations: []');
    return;
  }
  lines.push('  top_3_recommendations:');
  for (const f of top) {
    lines.push(`    - code: ${escape(f.code)}`);
    lines.push(`      severity: ${escape(f.severity)}`);
    lines.push(`      fix: ${escape(f.suggested_fix ?? f.class)}`);
  }
}

export function emitYaml(report: ReconcileResult): string {
  const lines: string[] = [];
  lines.push(`generated_at: ${report.generatedAt}`);
  lines.push(`mode: ${report.mode}`);
  lines.push(`spec_slug: ${report.specSlug}`);
  lines.push(`total_findings: ${report.findings.length}`);
  emitSummary(lines, report);
  if (report.findings.length === 0) {
    lines.push('findings: []');
    return lines.join('\n') + '\n';
  }
  lines.push('findings:');
  for (const f of report.findings) {
    lines.push(`  - code: ${escape(f.code)}`);
    lines.push(`    class: ${escape(f.class)}`);
    lines.push(`    severity: ${escape(f.severity)}`);
    if (f.referenced_in) lines.push(`    referenced_in: ${escape(f.referenced_in)}`);
    if (f.expected_path) lines.push(`    expected_path: ${escape(f.expected_path)}`);
    if (f.spec_a) lines.push(`    spec_a: ${escape(f.spec_a)}`);
    if (f.spec_b) lines.push(`    spec_b: ${escape(f.spec_b)}`);
    if (f.suggested_fix) lines.push(`    suggested_fix: ${escape(f.suggested_fix)}`);
  }
  return lines.join('\n') + '\n';
}

export function writeReport(repoRoot: string, report: ReconcileResult): string {
  const target = path.join(repoRoot, '.specs', report.specSlug, 'consistency-report.yaml');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, emitYaml(report));
  fs.renameSync(tmp, target);
  return target;
}
