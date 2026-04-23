/**
 * Shared phase constants for specs-workflow hooks.
 * Used by phase-gate.ts (PreToolUse) and validate-specs.ts (UserPromptSubmit).
 *
 * Extracted from validate-specs.ts to avoid duplication.
 */

import fs from 'fs';
import path from 'path';

/**
 * Phase state in .progress.json
 */
export interface PhaseState {
  completedAt: string | null;
  stopConfirmed: boolean;
  stopConfirmedAt: string | null;
}

/**
 * .progress.json schema
 */
export interface ProgressState {
  version: number;
  featureSlug: string;
  createdAt: string;
  currentPhase: string;
  phases: Record<string, PhaseState>;
}

/**
 * Files belonging to each phase (used for phase gate detection)
 */
export const PHASE_FILES: Record<string, string[]> = {
  Discovery: ['USER_STORIES.md', 'USE_CASES.md', 'RESEARCH.md'],
  Context: [], // sub-check of RESEARCH.md, no additional files
  Requirements: ['REQUIREMENTS.md', 'FR.md', 'NFR.md', 'ACCEPTANCE_CRITERIA.md', 'DESIGN.md', 'FILE_CHANGES.md'],
  Finalization: ['TASKS.md', 'README.md', 'CHANGELOG.md'],
};

/**
 * Phase order for gate checking
 */
export const PHASE_ORDER = ['Discovery', 'Context', 'Requirements', 'Finalization'] as const;

/**
 * STOP point labels per phase
 */
export const STOP_LABELS: Record<string, string> = {
  Discovery: 'STOP #1',
  Context: 'STOP #1.5',
  Requirements: 'STOP #2',
  Finalization: 'STOP #3',
};

/**
 * Current schema version for newly created specs.
 * v1 — original (no version field or version: 1)
 * v2 — bdd-enforcement era
 * v3 — spec-generator-v3 (form-guards + child skills + CHK matrix)
 */
export const PROGRESS_SCHEMA_VERSION = 3;

/**
 * Read .progress.json from a spec directory.
 * Returns null if file doesn't exist or can't be parsed (fail-open).
 */
export function readProgressState(specPath: string): ProgressState | null {
  const progressPath = path.join(specPath, '.progress.json');
  if (!fs.existsSync(progressPath)) return null;
  try {
    let content = fs.readFileSync(progressPath, 'utf-8');
    // Strip UTF-8 BOM (PowerShell writes JSON with BOM on Windows)
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    return JSON.parse(content) as ProgressState;
  } catch {
    return null;
  }
}

/**
 * Return the schema version of a spec's .progress.json.
 * Returns null when file missing OR when `version` field is absent/invalid
 * (pre-v3 specs do not have this field — that's the migration marker).
 *
 * Used by form-guards (spec-generator-v3): if < 3 → hook exits 0
 * without validation (existing specs are grandfathered).
 */
export function getProgressVersion(specPath: string): number | null {
  const progress = readProgressState(specPath);
  if (!progress) return null;
  const v = (progress as { version?: unknown }).version;
  return typeof v === 'number' ? v : null;
}

/**
 * Returns true iff spec was scaffolded with spec-generator-v3 (version ≥ 3).
 * Used as migration guard in every form-guard hook.
 */
export function isV3Spec(specPath: string): boolean {
  const v = getProgressVersion(specPath);
  return v !== null && v >= PROGRESS_SCHEMA_VERSION;
}

/**
 * Map a filename to its phase. Returns null if not a phase-gated file.
 * .feature files are mapped to Requirements phase.
 */
export function fileToPhase(filename: string): string | null {
  if (filename.endsWith('.feature')) return 'Requirements';

  for (const [phase, files] of Object.entries(PHASE_FILES)) {
    if (files.includes(filename)) return phase;
  }
  return null;
}

/**
 * Check if writing to a file's phase is allowed given current progress state.
 * Returns null if allowed, or a deny reason string if blocked.
 */
export function checkPhaseAllowed(
  filename: string,
  progress: ProgressState,
  specName: string,
): string | null {
  const targetPhase = fileToPhase(filename);
  if (!targetPhase) return null; // unknown file, allow

  const targetIdx = PHASE_ORDER.indexOf(targetPhase as typeof PHASE_ORDER[number]);
  if (targetIdx < 0) return null; // unknown phase, allow

  // Check all phases before target have stopConfirmed
  for (let i = 0; i < targetIdx; i++) {
    const phaseName = PHASE_ORDER[i];
    if (phaseName === 'Context') continue; // Context has no own files, skip
    const phaseState = progress.phases[phaseName];
    if (!phaseState || !phaseState.stopConfirmed) {
      const stopLabel = STOP_LABELS[phaseName] || `STOP for ${phaseName}`;
      return (
        `PHASE GATE: Cannot write ${filename} (${targetPhase} phase). ` +
        `${stopLabel} (${phaseName}) has not been confirmed. ` +
        `Run: spec-status.ts -Path ".specs/${specName}" -ConfirmStop ${phaseName}`
      );
    }
  }

  return null; // all prior phases confirmed, allow
}
