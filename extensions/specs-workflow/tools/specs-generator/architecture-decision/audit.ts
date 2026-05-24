/**
 * ARCHITECTURE_COVERAGE audit (FR-9). 9th create-spec Phase 3+ audit category.
 * Pending axes at STOP → WARNING (blocks). Escape-hatch [skip-architecture-axis: <reason>]
 * → ESCAPE_HATCH_USED INFO (reason ≥12) or WARNING_REASON_TOO_SHORT INFO (reason <12),
 * both logged to JSONL. All-accepted → MATRIX_COMPLETE INFO (positive signal).
 * Mirror variant-matrix/audit.ts finding shape.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { collectRows } from './index-compiler.ts';
import { appendEscapeLogSync, COMPLETENESS_LOG_FILENAME } from './escape-log.ts';

export interface ArchFinding {
  category: 'ARCHITECTURE_COVERAGE';
  code:
    | 'AXIS_PENDING'
    | 'MATRIX_COMPLETE'
    | 'ESCAPE_HATCH_USED'
    | 'WARNING_REASON_TOO_SHORT';
  severity: 'WARNING' | 'INFO';
  message: string;
  axis_id?: string;
}

const ESCAPE_RE = /\[skip-architecture-axis:\s*([^\]]*)\]/gi;
const MIN_REASON = 12;

function scanEscapeHatches(specDir: string, findings: ArchFinding[]): void {
  if (!fs.existsSync(specDir)) return;
  const files = fs
    .readdirSync(specDir)
    .filter((f) => /\.md$/.test(f));
  const slug = path.basename(specDir);
  for (const f of files) {
    const content = fs.readFileSync(path.join(specDir, f), 'utf-8');
    let m: RegExpExecArray | null;
    ESCAPE_RE.lastIndex = 0;
    while ((m = ESCAPE_RE.exec(content)) !== null) {
      const reason = m[1].trim();
      const axisId = f.replace(/^AXIS-|\.md$/g, '');
      appendEscapeLogSync(process.cwd(), {
        ts: new Date().toISOString(),
        spec: slug,
        axis_id: axisId,
        reason,
        session_id: process.env.CLAUDE_SESSION_ID ?? 'unknown',
      });
      if (reason.length < MIN_REASON) {
        findings.push({
          category: 'ARCHITECTURE_COVERAGE',
          code: 'WARNING_REASON_TOO_SHORT',
          severity: 'INFO',
          message: `Escape-hatch reason "${reason}" < ${MIN_REASON} chars in ${f}`,
          axis_id: axisId,
        });
      } else {
        findings.push({
          category: 'ARCHITECTURE_COVERAGE',
          code: 'ESCAPE_HATCH_USED',
          severity: 'INFO',
          message: `Escape-hatch used in ${f}: ${reason}`,
          axis_id: axisId,
        });
      }
    }
  }
}

export function checkArchitectureCoverage(specDir: string): ArchFinding[] {
  const findings: ArchFinding[] = [];
  const rows = collectRows(specDir);

  for (const r of rows) {
    if (r.status === 'pending') {
      findings.push({
        category: 'ARCHITECTURE_COVERAGE',
        code: 'AXIS_PENDING',
        severity: 'WARNING',
        message: `Axis "${r.axis_name}" is still pending — resolve or escape before STOP`,
        axis_id: r.axis_id,
      });
    }
  }

  scanEscapeHatches(specDir, findings);

  // Positive signal: axes exist and none pending → MATRIX_COMPLETE INFO.
  if (rows.length > 0 && findings.every((f) => f.code !== 'AXIS_PENDING')) {
    findings.push({
      category: 'ARCHITECTURE_COVERAGE',
      code: 'MATRIX_COMPLETE',
      severity: 'INFO',
      message: `All ${rows.length} architecture axes resolved`,
    });
  }

  return findings;
}

// ---- FR-12: COMPLETENESS_COVERAGE (system-completeness layer, rubric R13-R20) ----

/**
 * 8 system-completeness dimensions. Map 1:1 to rubric R13-R20 (FR-11). Derived from the
 * 12 real scenario-bhph gaps → AWS Well-Architected pillars. Closed list — the ledger
 * (COMPLETENESS.md) must mark each addressed / out-of-scope / pending before STOP.
 */
export const COMPLETENESS_DIMENSIONS = [
  'internal-consistency', // R13 — diagrams/tables/prose vs accepted decisions
  'flow-completeness', // R14 — every integration: inbound+outbound+status+error+trigger
  'compliance-privacy', // R15 — opt-out/TCPA, CAN-SPAM, PII enforcement point
  'auth-secrets', // R16 — authn per public endpoint + secret storage
  'observability', // R17 — error/violation surfacing + alerting
  'data-lifecycle', // R18 — retention/cleanup for unbounded growth
  'cost-quota', // R19 — per-unit variable cost + provider quotas (set BEFORE axis lock)
  'deploy-ops', // R20 — local dev / migrations / seed / staging / CI-CD / backups
] as const;

export type CompletenessDimension = (typeof COMPLETENESS_DIMENSIONS)[number];
export type CompletenessStatus = 'addressed' | 'out-of-scope' | 'pending';

export interface CompletenessFinding {
  category: 'COMPLETENESS_COVERAGE';
  code: 'DIMENSION_PENDING' | 'COMPLETENESS_COMPLETE' | 'WARNING_REASON_TOO_SHORT';
  severity: 'WARNING' | 'INFO';
  message: string;
  dimension_id?: string;
}

const COMPLETENESS_ESCAPE_RE = /\[skip-completeness-dimension:\s*([^\]]*)\]/gi;
const LEDGER_FILENAME = 'COMPLETENESS.md';

/**
 * Parse the COMPLETENESS.md ledger table → dimension → status. CRLF-tolerant, regex-based
 * (mirror index-compiler parseFrontmatter). Rows for unknown dimension keys are ignored;
 * known dimensions absent from the table are treated as `pending` by the caller.
 */
export function collectCompletenessRows(specDir: string): Map<string, CompletenessStatus> {
  const out = new Map<string, CompletenessStatus>();
  const ledgerPath = path.join(specDir, LEDGER_FILENAME);
  if (!fs.existsSync(ledgerPath)) return out;
  const content = fs.readFileSync(ledgerPath, 'utf-8');
  const known = COMPLETENESS_DIMENSIONS as readonly string[];
  for (const line of content.split(/\r?\n/)) {
    // | dimension | status | reason |
    const m = line.match(/^\|\s*([a-z-]+)\s*\|\s*(addressed|out-of-scope|pending)\s*\|/i);
    if (m) {
      const dim = m[1].trim().toLowerCase();
      if (known.includes(dim)) {
        out.set(dim, m[2].trim().toLowerCase() as CompletenessStatus);
      }
    }
  }
  return out;
}

function scanCompletenessEscapes(specDir: string, findings: CompletenessFinding[]): void {
  const ledgerPath = path.join(specDir, LEDGER_FILENAME);
  if (!fs.existsSync(ledgerPath)) return;
  const slug = path.basename(specDir);
  const content = fs.readFileSync(ledgerPath, 'utf-8');
  let m: RegExpExecArray | null;
  COMPLETENESS_ESCAPE_RE.lastIndex = 0;
  while ((m = COMPLETENESS_ESCAPE_RE.exec(content)) !== null) {
    const reason = m[1].trim();
    appendEscapeLogSync(
      process.cwd(),
      {
        ts: new Date().toISOString(),
        spec: slug,
        axis_id: 'completeness-dimension',
        reason,
        session_id: process.env.CLAUDE_SESSION_ID ?? 'unknown',
      },
      COMPLETENESS_LOG_FILENAME,
    );
    if (reason.length < MIN_REASON) {
      findings.push({
        category: 'COMPLETENESS_COVERAGE',
        code: 'WARNING_REASON_TOO_SHORT',
        severity: 'INFO',
        message: `Completeness escape reason "${reason}" < ${MIN_REASON} chars`,
      });
    }
  }
}

/**
 * FR-12 deterministic gate: each of the 8 completeness dimensions must be `addressed` or
 * `out-of-scope` in COMPLETENESS.md before STOP. `pending` (or missing ledger = all pending)
 * → DIMENSION_PENDING WARNING (blocks). All resolved → one COMPLETENESS_COMPLETE INFO.
 * Presence/status check only — quality of each dimension is the qualitative rubric R13-R20.
 */
export function checkCompletenessCoverage(specDir: string): CompletenessFinding[] {
  const findings: CompletenessFinding[] = [];
  const rows = collectCompletenessRows(specDir);

  for (const dim of COMPLETENESS_DIMENSIONS) {
    const status = rows.get(dim) ?? 'pending';
    if (status === 'pending') {
      findings.push({
        category: 'COMPLETENESS_COVERAGE',
        code: 'DIMENSION_PENDING',
        severity: 'WARNING',
        message: `Completeness dimension "${dim}" is pending — address or mark out-of-scope before STOP`,
        dimension_id: dim,
      });
    }
  }

  scanCompletenessEscapes(specDir, findings);

  // Positive signal: every dimension addressed/out-of-scope → COMPLETENESS_COMPLETE INFO.
  if (!findings.some((f) => f.code === 'DIMENSION_PENDING')) {
    findings.push({
      category: 'COMPLETENESS_COVERAGE',
      code: 'COMPLETENESS_COMPLETE',
      severity: 'INFO',
      message: `All ${COMPLETENESS_DIMENSIONS.length} completeness dimensions addressed or out-of-scope`,
    });
  }

  return findings;
}
