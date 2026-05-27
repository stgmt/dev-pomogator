/**
 * VARIANT_COVERAGE audit — 8th category для Phase 3+ Audit.
 *
 * Iteration-2 enhancements:
 *   - Emit MATRIX_COMPLETE INFO finding для polymorphic FRs с complete matrix (positive signal).
 *   - Emit HARD_OUT_DETECTED INFO finding для FRs где hard-OUT killed detection (debug visibility).
 *   - Include `triggers` array + `axis` в AuditFinding shape (debug + observability).
 *   - Append JSONL escape log при ANY escape hatch (FR-7 contract).
 *   - Richer message text с axis identification + matched phrase samples.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  detectPolymorphicFRs,
  type TriggerMatch,
} from './trigger-phrases.ts';
import {
  parseDecisionTable,
  parseExamplesTable,
  parseVariantTasks,
} from './parsers.ts';
import { appendEscapeLogSync } from './escape-log.ts';

export interface AuditFinding {
  category: 'VARIANT_COVERAGE';
  code: string;
  severity: 'WARNING' | 'INFO';
  message: string;
  frId?: string;
  file?: string;
  line?: number;
  triggers?: TriggerMatch[];
  axis?: string;
}

const ESCAPE_HATCH_RE = /\[skip-variant-matrix:\s*([^\]]*)\]/gi;
const MIN_REASON_LENGTH = 8;

function safeRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function findFeatureFile(specPath: string): string | null {
  try {
    const entries = fs.readdirSync(specPath);
    const featureFile = entries.find((e) => e.endsWith('.feature'));
    return featureFile ? path.join(specPath, featureFile) : null;
  } catch {
    return null;
  }
}

function frTagFromId(frId: string): string {
  const match = /FR-(\d+)/i.exec(frId);
  return match ? `@feature${match[1]}` : '@feature';
}

function summarizeTriggers(triggers: TriggerMatch[]): string {
  const sample = triggers
    .slice(0, 3)
    .map((t) => `"${t.phrase.trim()}"`)
    .join(', ');
  const more = triggers.length > 3 ? `, +${triggers.length - 3} more` : '';
  return sample + more;
}

function specSlugFromPath(specPath: string): string {
  return path.basename(specPath);
}

/**
 * Run VARIANT_COVERAGE checks against spec directory.
 * Returns AuditFinding[]. Severity ≥ WARNING blocks STOP #3; INFO is observability-only.
 */
export function checkVariantCoverage(specPath: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const frContent = safeRead(path.join(specPath, 'FR.md'));
  if (!frContent) return findings;

  const acContent =
    safeRead(path.join(specPath, 'ACCEPTANCE_CRITERIA.md')) ?? '';
  const featurePath = findFeatureFile(specPath);
  const featureContent = featurePath ? (safeRead(featurePath) ?? '') : '';
  const tasksContent = safeRead(path.join(specPath, 'TASKS.md')) ?? '';

  const polymorphicFRs = detectPolymorphicFRs(frContent);
  const specSlug = specSlugFromPath(specPath);
  const sessionId = process.env.CLAUDE_SESSION_ID ?? 'audit-cli';
  const ts = new Date().toISOString();

  // Process each polymorphic FR.
  const lines = frContent.split('\n');

  for (const fr of polymorphicFRs) {
    const triggerSummary = summarizeTriggers(fr.triggers);
    const axisLabel = fr.axis ? ` по axis '${fr.axis}'` : '';

    // Hard-OUT path: emit INFO finding for visibility (NEW в iteration-2).
    if (fr.hardOut) {
      findings.push({
        category: 'VARIANT_COVERAGE',
        code: 'HARD_OUT_DETECTED',
        severity: 'INFO',
        message: `${fr.frId}${axisLabel} имеет polymorphic-trigger phrases (${triggerSummary}) НО hard-OUT signal в same section override-нул detection. STOP #3 не блокирован. Verify hard-OUT scope intentional (см. .claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md hard-OUT signals).`,
        frId: fr.frId,
        file: 'FR.md',
        line: fr.lineNumber,
        triggers: fr.triggers,
        axis: fr.axis,
      });
      continue;
    }

    // Detect escape hatch within FR section.
    const frEnd = findNextFRStart(lines, fr.lineNumber);
    const frBody = lines.slice(fr.lineNumber - 1, frEnd).join('\n');

    ESCAPE_HATCH_RE.lastIndex = 0;
    const escapeMatch = ESCAPE_HATCH_RE.exec(frBody);
    if (escapeMatch) {
      const reason = (escapeMatch[1] ?? '').trim();
      // ALWAYS append JSONL log entry для escape hatch (FR-7 contract).
      // Log goes to project-root .claude/logs/ (per FR-7), not spec dir.
      // Override через VARIANT_MATRIX_LOG_DIR env var для tests.
      const logCwd = process.env.VARIANT_MATRIX_LOG_DIR ?? process.cwd();
      try {
        appendEscapeLogSync(logCwd, {
          ts,
          spec: specSlug,
          fr: fr.frId,
          reason,
          session_id: sessionId,
        });
      } catch (err) {
        // Fail-open: log write failure не должен блокировать audit.
        process.stderr.write(
          `[variant-matrix-audit] escape-log write failed: ${(err as Error).message}\n`,
        );
      }

      if (reason.length < MIN_REASON_LENGTH) {
        findings.push({
          category: 'VARIANT_COVERAGE',
          code: 'WARNING_REASON_TOO_SHORT',
          severity: 'INFO',
          message: `${fr.frId}: escape hatch reason "${reason}" (${reason.length} chars) < ${MIN_REASON_LENGTH}. Substantive rationale required для audit trail. См. .claude/rules/specs-workflow/variant-matrix/escape-hatch-audit.md anti-gaming guidance.`,
          frId: fr.frId,
          file: 'FR.md',
          triggers: fr.triggers,
          axis: fr.axis,
        });
        // Short reason не bypass-ит downstream checks — продолжаем enforce.
      } else {
        // Valid escape — emit INFO finding для visibility, skip downstream checks.
        findings.push({
          category: 'VARIANT_COVERAGE',
          code: 'ESCAPE_HATCH_USED',
          severity: 'INFO',
          message: `${fr.frId}${axisLabel}: escape hatch invoked с reason "${reason.slice(0, 80)}${reason.length > 80 ? '...' : ''}". Audit trail logged в .claude/logs/spec-variant-matrix-escapes.jsonl. Reviewer должен audit reason vs FR content (см. escape-hatch-audit.md red flags).`,
          frId: fr.frId,
          file: 'FR.md',
          triggers: fr.triggers,
          axis: fr.axis,
        });
        continue;
      }
    }

    // Check 1: AC Decision Table presence.
    const decisionRows = parseDecisionTable(acContent, fr.frId);
    if (decisionRows.length === 0) {
      findings.push({
        category: 'VARIANT_COVERAGE',
        code: 'AC_DECISION_TABLE_MISSING',
        severity: 'WARNING',
        message: `${fr.frId} полиморфный${axisLabel} (${fr.triggers.length} triggers: ${triggerSummary}) но AC Decision Table отсутствует или incomplete. Build matrix через Skill("variant-matrix-build") OR add escape hatch [skip-variant-matrix: <reason ≥8 chars>].`,
        frId: fr.frId,
        file: 'ACCEPTANCE_CRITERIA.md',
        triggers: fr.triggers,
        axis: fr.axis,
      });
      continue;
    }

    // Check 2: AC covered count vs Examples count.
    const coveredRows = decisionRows.filter((r) => r.coverage === 'covered');
    let examplesRowsCount = 0;
    if (featureContent && coveredRows.length > 0) {
      const examplesRows = parseExamplesTable(
        featureContent,
        frTagFromId(fr.frId),
      );
      examplesRowsCount = examplesRows.length;
      if (examplesRows.length > 0 && examplesRows.length !== coveredRows.length) {
        findings.push({
          category: 'VARIANT_COVERAGE',
          code: 'AC_EXAMPLES_ROW_MISMATCH',
          severity: 'WARNING',
          message: `${fr.frId}${axisLabel}: AC Decision Table covered rows=${coveredRows.length}, Examples block rows=${examplesRows.length}. Counts must match (excluding OUT_OF_SCOPE rows).`,
          frId: fr.frId,
          file: featurePath ? path.basename(featurePath) : '*.feature',
          triggers: fr.triggers,
          axis: fr.axis,
        });
        continue;
      }
    }

    // Check 3: pending AC rows must have variant tasks.
    const pendingRows = decisionRows.filter((r) => r.coverage === 'pending');
    if (pendingRows.length > 0 && tasksContent) {
      const tasks = parseVariantTasks(tasksContent, frTagFromId(fr.frId));
      const missingTasks = pendingRows.filter(
        (r) => !tasks.some((t) => t.value === r.variant),
      );
      if (missingTasks.length > 0) {
        findings.push({
          category: 'VARIANT_COVERAGE',
          code: 'MISSING_VARIANT_TASK',
          severity: 'WARNING',
          message: `${fr.frId}${axisLabel}: ${missingTasks.length} pending variants без TASKS.md entries: ${missingTasks.map((r) => r.variant).join(', ')}`,
          frId: fr.frId,
          file: 'TASKS.md',
          triggers: fr.triggers,
          axis: fr.axis,
        });
        continue;
      }
    }

    // All checks passed — emit MATRIX_COMPLETE INFO finding (positive signal, iteration-2).
    findings.push({
      category: 'VARIANT_COVERAGE',
      code: 'MATRIX_COMPLETE',
      severity: 'INFO',
      message: `${fr.frId}${axisLabel}: variant matrix complete (${decisionRows.length} AC rows, ${coveredRows.length} covered, ${decisionRows.length - coveredRows.length} excluded/pending; Examples rows=${examplesRowsCount}). All checks passed.`,
      frId: fr.frId,
      file: 'ACCEPTANCE_CRITERIA.md',
      triggers: fr.triggers,
      axis: fr.axis,
    });
  }

  return findings;
}

function findNextFRStart(lines: string[], fromLine: number): number {
  const headerRe = /^##\s+FR-\d+[:\s]/;
  for (let i = fromLine; i < lines.length; i++) {
    if (headerRe.test(lines[i])) return i;
  }
  return lines.length;
}
