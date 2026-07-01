// cross-spec-resolve interactive 7-step loop (SPECGEN004_44..47 / FR-18).
//
// Pure-ish: reads `.specs/<slug>/consistency-report.yaml`, groups findings,
// emits the 5-field explanation block per finding, returns a structured
// plan the live skill flow consumes. The actual `AskUserQuestion`
// invocations happen in the skill body — this module shapes the data.

import fs from 'node:fs';
import path from 'node:path';

export type Severity = 'CRITICAL' | 'WARNING' | 'INFO';
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

/** Architectural fork alternative (SCHEMA `PathAlt`) for class
 *  `architectural-decision-vs-reality` findings (SPECGEN004_46 / FR-18). */
export interface PathAlt {
  label: string;
  recommended?: boolean;
  pros?: string[];
  cons?: string[];
  impacted_files?: string[];
}

export interface ReportFinding {
  code: string;
  class: string;
  severity: Severity;
  referenced_in?: string;
  expected_path?: string;
  spec_a?: string;
  spec_b?: string;
  suggested_fix?: string;
  /** Path A/B/C alternatives — only on architectural-decision-vs-reality. */
  path_alternatives?: PathAlt[];
}

export interface ExplanationBlock {
  /** Header line: `code [severity / class]`. */
  header: string;
  /** Files + line numbers (one per row). */
  files: string[];
  /** Plain-language statement of the problem. */
  plain: string;
  /** WHY this matters if shipped. */
  why: string;
  /** Options for the user (default-marked). `description` carries the
   *  pros/cons/impacted_files prose for architectural Path options. */
  options: Array<{ label: string; isDefault?: boolean; description?: string }>;
  /** Whether this finding requires a foreign-spec confirm step. */
  requiresForeignSpecConfirm: boolean;
  /** Literal banner shown when a target path edits a DIFFERENT spec
   *  (SPECGEN004_45). Absent when no foreign-spec path is involved. */
  foreignSpecBanner?: string;
}

/** Minimal YAML reader for the canonical consistency-report shape. */
export function readReport(repoRoot: string, slug: string): { findings: ReportFinding[] } | null {
  const p = path.join(repoRoot, '.specs', slug, 'consistency-report.yaml');
  if (!fs.existsSync(p)) return null;
  const body = fs.readFileSync(p, 'utf8');
  const findings: ReportFinding[] = [];
  // Naive line-based parse — matches the shape our writer produces.
  const lines = body.split(/\r?\n/);
  let current: Partial<ReportFinding> | null = null;
  const flush = (): void => {
    if (current && current.code && current.class && current.severity) {
      findings.push(current as ReportFinding);
    }
    current = null;
  };
  for (const line of lines) {
    const m = line.match(/^\s{2}-\s+code:\s*(.+)$/);
    if (m) {
      flush();
      current = { code: stripQuotes(m[1]) };
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s{4}(\w+):\s*(.+)$/);
    if (!field) continue;
    const [, key, raw] = field;
    const value = stripQuotes(raw);
    if (key === 'class') current.class = value;
    else if (key === 'severity') current.severity = value as Severity;
    else if (key === 'referenced_in') current.referenced_in = value;
    else if (key === 'expected_path') current.expected_path = value;
    else if (key === 'spec_a') current.spec_a = value;
    else if (key === 'spec_b') current.spec_b = value;
    else if (key === 'suggested_fix') current.suggested_fix = value;
  }
  flush();
  return { findings };
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return value;
}

/** Stable dedup key per the SKILL.md spec — (code + spec_a + spec_b + location). */
export function findingKey(f: ReportFinding): string {
  return `${f.code}|${f.spec_a ?? ''}|${f.spec_b ?? ''}|${f.referenced_in ?? ''}`;
}

/** Group findings by severity → class. Stable order: CRITICAL → WARNING → INFO. */
export function groupFindings(findings: ReportFinding[]): ReportFinding[] {
  const seen = new Set<string>();
  const deduped: ReportFinding[] = [];
  for (const f of findings) {
    const k = findingKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(f);
  }
  deduped.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return a.class.localeCompare(b.class) || a.code.localeCompare(b.code);
  });
  return deduped;
}

/** Build the 5-field explanation block per SKILL.md step 3. */
export function buildExplanation(finding: ReportFinding, currentSlug: string): ExplanationBlock {
  const files = [finding.referenced_in, finding.spec_a, finding.spec_b].filter(Boolean) as string[];
  const plain = finding.suggested_fix ?? finding.code;
  const why = whyText(finding.severity, finding.class);
  const options = optionsFor(finding);
  const requiresForeignSpecConfirm =
    finding.class === 'architectural-decision-vs-reality' ||
    !!(finding.spec_a && !finding.spec_a.includes(`.specs/${currentSlug}`)) ||
    !!(finding.spec_b && !finding.spec_b.includes(`.specs/${currentSlug}`));
  // SPECGEN004_45: a target path under a DIFFERENT `.specs/<slug>/` gets a
  // literal banner so the live skill can fire the extra foreign-spec confirm.
  const foreignPath = [finding.referenced_in, finding.spec_a, finding.spec_b].find(
    (p): p is string => !!p && p.startsWith('.specs/') && !p.startsWith(`.specs/${currentSlug}/`),
  );
  return {
    header: `${finding.code} [${finding.severity} / ${finding.class}]`,
    files,
    plain,
    why,
    options,
    requiresForeignSpecConfirm,
    ...(foreignPath ? { foreignSpecBanner: `⚠️ This edits foreign spec: ${foreignPath}` } : {}),
  };
}

function whyText(severity: Severity, klass: string): string {
  if (severity === 'CRITICAL') {
    if (klass === 'runtime-identifier-drift') {
      return 'Shipping two names for the same concept breaks the contract — clients pick one and the other side serves the other.';
    }
    if (klass === 'contradiction') {
      return 'Two specs disagree on the same FR — one of them will get ignored at implementation time.';
    }
    return 'CRITICAL findings block STOP — fixing later is more expensive than aborting now.';
  }
  if (severity === 'WARNING') {
    return 'WARNING surfaces drift the team can ship past, but the audit trail will flag it later.';
  }
  return 'INFO finding — no action required, surfaced so you can decide to address it now.';
}

/** Pros/Cons/Impacted-files prose for a PathAlt option description (SPECGEN004_46). */
function describeAlt(alt: PathAlt): string {
  const join = (xs?: string[]): string => (xs && xs.length ? xs.join('; ') : '—');
  return `Pros: ${join(alt.pros)}. Cons: ${join(alt.cons)}. Impacted files: ${join(alt.impacted_files)}.`;
}

function optionsFor(finding: ReportFinding): ExplanationBlock['options'] {
  if (finding.class === 'architectural-decision-vs-reality') {
    // SPECGEN004_46: when the finding carries concrete path_alternatives,
    // surface each as an option whose description holds pros/cons/impacted_files.
    if (finding.path_alternatives && finding.path_alternatives.length > 0) {
      const opts: ExplanationBlock['options'] = finding.path_alternatives.map((alt) => ({
        label: alt.label,
        isDefault: alt.recommended === true,
        description: describeAlt(alt),
      }));
      opts.push({ label: 'Acknowledge & override (CRITICAL only)' });
      return opts;
    }
    return [
      { label: 'Path A — update spec (decision was wrong)', isDefault: true },
      { label: 'Path B — update code (reality was wrong)' },
      { label: 'Path C — defer with explicit OUT_OF_SCOPE marker' },
      { label: 'Acknowledge & override (CRITICAL only)' },
    ];
  }
  if (finding.severity === 'CRITICAL') {
    return [
      { label: 'Apply suggested fix', isDefault: true },
      { label: 'Acknowledge & override (log + skip)' },
      { label: 'Abort STOP' },
    ];
  }
  return [
    { label: 'Apply suggested fix', isDefault: true },
    { label: 'Skip — leave finding in the report' },
  ];
}

/** Header label for the AskUserQuestion prompt (≤12 chars), by finding severity.
 *  Shared by the live skill body (cross-spec-resolve SKILL.md step 4) and the
 *  SPECGEN004_40 binding so both read ONE source — `⚠️ CRIT` is the header that marks
 *  a hard-conflict STOP-blocker. */
export function promptHeader(severity: Severity): string {
  return severity === 'CRITICAL' ? '⚠️ CRIT' : severity === 'WARNING' ? 'WARN' : 'INFO';
}

/** Process exit code after the user's resolve choice. Any `Abort…` choice aborts the
 *  STOP gate → the loop breaks and the skill exits NON-ZERO (the STOP stays blocked);
 *  every other choice resolves/defers/acknowledges and exits 0. (SPECGEN004_40.) */
export function exitCodeForChoice(choice: string): number {
  return /^Abort/.test(choice) ? 2 : 0;
}

/** Top-level entrypoint for the live skill body. */
export function planResolution(opts: { repoRoot: string; slug: string }): {
  missing?: true;
  hint?: string;
  plan?: Array<{ finding: ReportFinding; explanation: ExplanationBlock }>;
} {
  const report = readReport(opts.repoRoot, opts.slug);
  if (!report) {
    return { missing: true, hint: 'Run /cross-spec-reconcile first' };
  }
  const ordered = groupFindings(report.findings);
  return {
    plan: ordered.map((finding) => ({
      finding,
      explanation: buildExplanation(finding, opts.slug),
    })),
  };
}
