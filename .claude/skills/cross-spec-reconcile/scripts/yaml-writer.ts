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
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

function rankedFindings(report: ReconcileResult): ReconcileResult['findings'] {
  return [...report.findings].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
  );
}

function recommendationPriority(severity: string): string {
  if (severity === 'CRITICAL') return 'P0';
  if (severity === 'WARNING') return 'P1';
  return 'P2';
}

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
  const top = rankedFindings(report).slice(0, 3);
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

function emitRecommendations(lines: string[], report: ReconcileResult): void {
  const top = rankedFindings(report).slice(0, 3);
  if (top.length === 0) {
    lines.push('recommendations: []');
    return;
  }
  lines.push('recommendations:');
  for (const f of top) {
    lines.push(`  - priority: ${recommendationPriority(f.severity)}`);
    lines.push(`    action: ${escape(f.suggested_fix ?? f.class)}`);
    lines.push(`    impact: ${escape(`${f.code} in ${report.specSlug}`)}`);
  }
}

const PRESERVED_FINDING_FIELDS = new Set([
  'acknowledged_by',
  'override_reason',
  'override_timestamp',
  'resolution_status',
  'resolved_at',
  'defer_reason',
]);

function parseScalar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return trimmed;
}

function parseBlockFields(headerLine: string, block: readonly string[]): Record<string, string> {
  const fields: Record<string, string> = {
    code: parseScalar(headerLine.replace(/^\s{2}-\s+code:\s+/, '')),
    spec_a: '',
    spec_b: '',
    referenced_in: '',
    expected_path: '',
  };
  for (const line of block) {
    const m = line.match(/^\s{4}([\w_]+):\s*(.+)$/);
    if (!m) continue;
    fields[m[1]] = parseScalar(m[2]);
  }
  return fields;
}

function findingKey(fields: Record<string, string>): string {
  return [fields.code, fields.spec_a ?? '', fields.spec_b ?? '', fields.referenced_in ?? '', fields.expected_path ?? ''].join('|');
}

function preservedFieldsByFinding(yaml: string): Map<string, string[]> {
  const lines = yaml.split(/\r?\n/);
  const out = new Map<string, string[]>();
  for (let cursor = 0; cursor < lines.length; cursor++) {
    const line = lines[cursor];
    if (!/^\s{2}-\s+code:\s+/.test(line)) continue;
    const block: string[] = [];
    let next = cursor + 1;
    while (next < lines.length && !/^\s{2}-\s+code:\s+/.test(lines[next])) {
      block.push(lines[next]);
      next++;
    }
    const preserved = block.filter((blkLine) => {
      const m = blkLine.match(/^\s{4}([\w_]+):\s*/);
      return Boolean(m && PRESERVED_FINDING_FIELDS.has(m[1]));
    });
    if (preserved.length) out.set(findingKey(parseBlockFields(line, block)), preserved);
    cursor = next - 1;
  }
  return out;
}

function mergePreservedFindingFields(nextYaml: string, previousYaml: string): string {
  const previous = preservedFieldsByFinding(previousYaml);
  if (previous.size === 0) return nextYaml;
  const lines = nextYaml.split(/\r?\n/);
  const out: string[] = [];
  for (let cursor = 0; cursor < lines.length; cursor++) {
    const line = lines[cursor];
    out.push(line);
    if (!/^\s{2}-\s+code:\s+/.test(line)) continue;
    const block: string[] = [];
    let next = cursor + 1;
    while (next < lines.length && !/^\s{2}-\s+code:\s+/.test(lines[next])) {
      block.push(lines[next]);
      next++;
    }
    out.push(...block);
    const blockFields = parseBlockFields(line, block);
    const existingFieldNames = new Set(
      block
        .map((blkLine) => blkLine.match(/^\s{4}([\w_]+):\s*/)?.[1])
        .filter((name): name is string => Boolean(name)),
    );
    for (const preservedLine of previous.get(findingKey(blockFields)) ?? []) {
      const name = preservedLine.match(/^\s{4}([\w_]+):\s*/)?.[1];
      if (name && !existingFieldNames.has(name)) out.push(preservedLine);
    }
    cursor = next - 1;
  }
  return out.join('\n');
}

export function emitYaml(report: ReconcileResult): string {
  const lines: string[] = [];
  lines.push(`generated_at: ${report.generatedAt}`);
  lines.push(`mode: ${report.mode}`);
  lines.push(`spec_slug: ${report.specSlug}`);
  if (report.partial === true) {
    lines.push('partial: true');
    if (report.partialReasons?.length) {
      lines.push('partial_reasons:');
      for (const reason of report.partialReasons) lines.push(`  - ${escape(reason)}`);
    }
  }
  lines.push(`total_findings: ${report.findings.length}`);
  emitSummary(lines, report);
  emitRecommendations(lines, report);
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
  const body = fs.existsSync(target)
    ? mergePreservedFindingFields(emitYaml(report), fs.readFileSync(target, 'utf8'))
    : emitYaml(report);
  const tmp = `${target}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, target);
  return target;
}
