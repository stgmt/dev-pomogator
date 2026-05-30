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

export function emitYaml(report: ReconcileResult): string {
  const lines: string[] = [];
  lines.push(`generated_at: ${report.generatedAt}`);
  lines.push(`mode: ${report.mode}`);
  lines.push(`spec_slug: ${report.specSlug}`);
  lines.push(`total_findings: ${report.findings.length}`);
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
