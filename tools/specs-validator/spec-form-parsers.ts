/**
 * Shared regex parsers for spec-generator-v3 form-guards.
 *
 * Each parser takes markdown content and returns an array of block descriptors
 * with line numbers and presence flags for required sub-fields. Used by all
 * five form-guards + meta-guard. Module-cached for performance.
 *
 * Design goals:
 * - Fail-safe: regex exceptions must propagate to caller so hook's
 *   .catch(exit 0) wraps them and logs PARSER_CRASH.
 * - Tolerant: whitespace, Windows line endings, BOM.
 * - Deterministic: identical input → identical output (idempotent).
 *
 * @see .specs/spec-generator-v3/FR.md FR-4..FR-8, FR-11
 */

import fs from 'fs';
import path from 'path';

// --------------------------------------------------------------------------
// User Story blocks (FR-4)
// --------------------------------------------------------------------------

export interface UserStoryBlock {
  /** Line number (1-indexed) of the `### User Story N:` heading. */
  lineNumber: number;
  /** Heading text after `###`. */
  heading: string;
  hasPriority: boolean;
  hasWhy: boolean;
  hasIndependentTest: boolean;
  hasAcceptanceScenarios: boolean;
  /** First missing field name, for error message. null if all present. */
  missingFirst: string | null;
}

const US_HEADING = /^###\s+User Story\s+\d+\b/;
const US_PRIORITY = /\(Priority:\s*P[123]\)/;

export function parseUserStoryBlocks(content: string): UserStoryBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: UserStoryBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!US_HEADING.test(line)) continue;
    // Find next block start (next User Story heading or ##-level heading)
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (US_HEADING.test(lines[j])) break;
      if (/^##\s/.test(lines[j])) break;
    }
    const body = lines.slice(i, j).join('\n');
    const hasPriority = US_PRIORITY.test(line);
    const hasWhy = /\*\*Why:\*\*/.test(body);
    const hasIndependentTest = /\*\*Independent Test:\*\*/.test(body);
    const hasAcceptanceScenarios = /\*\*Acceptance Scenarios:\*\*/.test(body);
    const missingFirst =
      (!hasPriority && 'Priority') ||
      (!hasWhy && 'Why') ||
      (!hasIndependentTest && 'Independent Test') ||
      (!hasAcceptanceScenarios && 'Acceptance Scenarios') ||
      null;
    blocks.push({
      lineNumber: i + 1,
      heading: line.replace(/^###\s+/, ''),
      hasPriority,
      hasWhy,
      hasIndependentTest,
      hasAcceptanceScenarios,
      missingFirst,
    });
  }
  return blocks;
}

// --------------------------------------------------------------------------
// Task blocks (FR-5)
// --------------------------------------------------------------------------

export interface TaskBlock {
  lineNumber: number;
  title: string;
  /** Phase heading enclosing this task, e.g. "Phase 0: BDD Foundation". */
  phase: string;
  hasStatus: boolean;
  hasEst: boolean;
  hasDoneWhen: boolean;
  /** Count of `- [ ]` children under Done When. */
  doneWhenCheckboxes: number;
  /** True if task explicitly marked _waived:_ (skip validation). */
  waived: boolean;
  missingFirst: string | null;
}

const PHASE_HEADING = /^(?:##|###)\s+(Phase\s+[-\d]+\S*.*?)$/i;
const TASK_BULLET = /^-\s+\[[ x]\]\s+(.+)$/;
const TASK_HEADING = /^###\s+📋\s+`([^`]+)`/;
const STATUS_TAG = /Status:\s*(TODO|IN_PROGRESS|DONE|BLOCKED)/;
const EST_TAG = /Est:\s*\d+\s*m/i;

export function parseTaskBlocks(content: string): TaskBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: TaskBlock[] = [];
  let currentPhase = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const phaseMatch = line.match(PHASE_HEADING);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
      continue;
    }
    const bulletMatch = line.match(TASK_BULLET);
    const headingMatch = line.match(TASK_HEADING);
    if (!bulletMatch && !headingMatch) continue;

    const title = bulletMatch ? bulletMatch[1] : headingMatch![1];
    // Gather body until next task boundary or phase heading
    let j = i + 1;
    for (; j < lines.length; j++) {
      const nextLine = lines[j];
      if (PHASE_HEADING.test(nextLine)) break;
      if (bulletMatch && TASK_BULLET.test(nextLine) && !/^\s/.test(nextLine)) break;
      if (headingMatch && TASK_HEADING.test(nextLine)) break;
      // Empty line followed by another same-level bullet = next task
      if (bulletMatch && /^\s*$/.test(nextLine) && j + 1 < lines.length && TASK_BULLET.test(lines[j + 1])) break;
    }
    const body = lines.slice(i, j).join('\n');
    const hasStatus = STATUS_TAG.test(body);
    const hasEst = EST_TAG.test(body);
    const hasDoneWhen = /\*\*Done When:\*\*/.test(body);
    const waived = /_waived:\s*[^_]+_/.test(body);
    // Count `- [ ]` or `- [x]` lines that appear AFTER `**Done When:**` marker
    let doneWhenCheckboxes = 0;
    if (hasDoneWhen) {
      const [, afterDoneWhen = ''] = body.split(/\*\*Done When:\*\*/);
      doneWhenCheckboxes = (afterDoneWhen.match(/^\s*-\s+\[[ x]\]/gm) || []).length;
    }
    const isPhaseMinusOne = /Phase\s+-1/i.test(currentPhase);
    const missingFirst = waived
      ? null
      : isPhaseMinusOne
      ? null // Phase -1 relaxed (WARN, not DENY — enforced by hook, not parser)
      : (!hasDoneWhen && 'Done When block') ||
        (hasDoneWhen && doneWhenCheckboxes === 0 && 'Done When checkbox (at least one - [ ])') ||
        (!hasStatus && 'Status tag') ||
        (!hasEst && 'Est tag') ||
        null;
    blocks.push({
      lineNumber: i + 1,
      title: title.slice(0, 160),
      phase: currentPhase,
      hasStatus,
      hasEst,
      hasDoneWhen,
      doneWhenCheckboxes,
      waived,
      missingFirst,
    });
  }
  return blocks;
}

// --------------------------------------------------------------------------
// Decision blocks (FR-6)
// --------------------------------------------------------------------------

export interface DecisionBlock {
  lineNumber: number;
  heading: string;
  hasRationale: boolean;
  hasTradeoff: boolean;
  hasAlternatives: boolean;
  alternativesCount: number;
  missingFirst: string | null;
}

const DECISION_HEADING = /^###\s+Decision:/;

export function parseDecisionBlocks(content: string): DecisionBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: DecisionBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!DECISION_HEADING.test(line)) continue;
    // Find next ### or ## heading
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (/^###?\s/.test(lines[j])) break;
    }
    const body = lines.slice(i, j).join('\n');
    const hasRationale = /\*\*Rationale:\*\*/.test(body);
    const hasTradeoff = /\*\*Trade-?off:\*\*/.test(body);
    const hasAlternatives = /\*\*Alternatives considered:\*\*/.test(body);
    let alternativesCount = 0;
    if (hasAlternatives) {
      const [, after = ''] = body.split(/\*\*Alternatives considered:\*\*/);
      alternativesCount = (after.match(/^\s*-\s+/gm) || []).length;
    }
    const missingFirst =
      (!hasRationale && 'Rationale') ||
      (!hasTradeoff && 'Trade-off') ||
      (!hasAlternatives && 'Alternatives considered') ||
      (hasAlternatives && alternativesCount < 2 && 'Alternatives bullets (≥2 required)') ||
      null;
    blocks.push({
      lineNumber: i + 1,
      heading: line.replace(/^###\s+/, ''),
      hasRationale,
      hasTradeoff,
      hasAlternatives,
      alternativesCount,
      missingFirst,
    });
  }
  return blocks;
}

// --------------------------------------------------------------------------
// CHK rows (FR-7)
// --------------------------------------------------------------------------

export interface ChkRow {
  lineNumber: number;
  id: string;
  requirement: string;
  tracesTo: string;
  verificationMethod: string;
  status: string;
  notes: string;
  idValid: boolean;
  tracesValid: boolean;
  methodValid: boolean;
  statusValid: boolean;
  missingFirst: string | null;
}

const CHK_ID_VALID = /^CHK-FR\d+-\d{2}$/;
const ALLOWED_METHODS = new Set([
  'BDD scenario',
  'Unit test',
  'Manual review',
  'Integration test',
  'N/A',
]);
const ALLOWED_STATUSES = new Set(['Draft', 'In Progress', 'Verified', 'Blocked']);

export function parseChkRows(content: string): ChkRow[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const rows: ChkRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;
    // skip header row and separator row
    if (/^\|[\s-:|]+\|$/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const [id, requirement, tracesTo, verificationMethod, status, notes = ''] = cells;
    if (!/^CHK-/.test(id)) continue;
    // Skip header row: literal "CHK-ID" column label (appears once per table).
    if (id === 'CHK-ID') continue;

    const idValid = CHK_ID_VALID.test(id);
    const tracesValid =
      /\bFR-\d+/.test(tracesTo) &&
      /(AC-\d+|@feature\d+|UC-\d+)/.test(tracesTo);
    const methodValid = ALLOWED_METHODS.has(verificationMethod);
    const statusValid = ALLOWED_STATUSES.has(status);

    const missingFirst =
      (!idValid && `CHK-ID format must match CHK-FR{n}-{nn} (got "${id}")`) ||
      (!tracesValid && 'Traces To must include FR-N + (AC-N | @featureN | UC-N)') ||
      (!verificationMethod && 'Verification Method (empty)') ||
      (!methodValid && `Verification Method must be one of: ${[...ALLOWED_METHODS].join(', ')} (got "${verificationMethod}")`) ||
      (!statusValid && `Status must be one of: ${[...ALLOWED_STATUSES].join(', ')} (got "${status}")`) ||
      null;

    rows.push({
      lineNumber: i + 1,
      id,
      requirement,
      tracesTo,
      verificationMethod,
      status,
      notes,
      idValid,
      tracesValid,
      methodValid,
      statusValid,
      missingFirst,
    });
  }
  return rows;
}

// --------------------------------------------------------------------------
// Risk Assessment rows (FR-8)
// --------------------------------------------------------------------------

export interface RiskRow {
  lineNumber: number;
  risk: string;
  likelihood: string;
  impact: string;
  mitigation: string;
  isPlaceholder: boolean;
  likelihoodValid: boolean;
  impactValid: boolean;
  mitigationValid: boolean;
}

export interface RiskAssessment {
  headingLineNumber: number | null;
  rows: RiskRow[];
  /** Only non-placeholder, valid rows. */
  validRowCount: number;
}

const RISK_HEADING = /^##\s+Risk Assessment\b/;
const ALLOWED_LEVELS = new Set(['Low', 'Medium', 'High']);
const PLACEHOLDER_MARKERS = /^\{.*\}$|^—$|^-$|^TBD$|^\?+$/;

export function parseRiskRows(content: string): RiskAssessment {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let headingLineNumber: number | null = null;
  let tableStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (RISK_HEADING.test(lines[i])) {
      headingLineNumber = i + 1;
      // Find first table row after heading
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\|/.test(lines[j].trim())) {
          tableStart = j;
          break;
        }
        if (/^##\s/.test(lines[j])) break; // next heading reached without table
      }
      break;
    }
  }
  if (headingLineNumber === null) {
    return { headingLineNumber: null, rows: [], validRowCount: 0 };
  }
  const rows: RiskRow[] = [];
  if (tableStart >= 0) {
    for (let i = tableStart; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('|')) break;
      if (/^\|[\s-:|]+\|$/.test(line)) continue; // separator
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length < 4) continue;
      const [risk, likelihood, impact, mitigation] = cells;
      // header row has "Risk | Likelihood | Impact | Mitigation" — skip
      if (risk === 'Risk' && likelihood === 'Likelihood') continue;
      const isPlaceholder =
        PLACEHOLDER_MARKERS.test(risk) ||
        PLACEHOLDER_MARKERS.test(mitigation) ||
        /\{[^}]*\}/.test(risk) ||
        /\{[^}]*\}/.test(mitigation);
      const likelihoodValid = ALLOWED_LEVELS.has(likelihood);
      const impactValid = ALLOWED_LEVELS.has(impact);
      const mitigationValid = !!mitigation && !PLACEHOLDER_MARKERS.test(mitigation) && !/\{[^}]*\}/.test(mitigation);
      rows.push({
        lineNumber: i + 1,
        risk,
        likelihood,
        impact,
        mitigation,
        isPlaceholder,
        likelihoodValid,
        impactValid,
        mitigationValid,
      });
    }
  }
  const validRowCount = rows.filter(
    (r) => !r.isPlaceholder && r.likelihoodValid && r.impactValid && r.mitigationValid,
  ).length;
  return { headingLineNumber, rows, validRowCount };
}

// --------------------------------------------------------------------------
// Shared filepath helpers
// --------------------------------------------------------------------------

export interface SpecInfo {
  slug: string;
  filename: string;
  specDir: string;
}

/**
 * Re-export of phase-gate's extractor logic (copy to avoid circular import).
 * Returns null if path is not inside .specs/.
 */
export function extractSpecInfo(filePath: string): SpecInfo | null {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/[/\\]?\.specs\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const slug = match[1];
  const filename = match[2];
  const specsIdx = normalized.lastIndexOf('.specs/' + slug);
  if (specsIdx < 0) return null;
  const specDir = filePath.substring(0, specsIdx + '.specs/'.length + slug.length);
  return { slug, filename, specDir };
}

/**
 * Read file content from new_string (Edit) or content (Write) tool_input.
 * Returns empty string if neither available.
 */
export function extractWriteContent(toolInput: Record<string, unknown> | undefined): string {
  if (!toolInput) return '';
  if (typeof toolInput.content === 'string') return toolInput.content;
  if (typeof toolInput.new_string === 'string') return toolInput.new_string;
  return '';
}

/**
 * Read current on-disk content for diff-aware hooks (meta-guard).
 */
export function readCurrentContent(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
