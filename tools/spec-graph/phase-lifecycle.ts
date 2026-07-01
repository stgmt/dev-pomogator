/**
 * Phase lifecycle (FR-48e) — the authored status machine for a SPEC PHASE.
 *
 * A phase (Discovery / Context / Requirements / Finalization) is NOT a graph node
 * and NOT a 5-vocab task. Its single authored field is `stopConfirmed` in
 * `.specs/<slug>/.progress.json`; `completedAt` / `currentPhase` are DERIVED from
 * file existence by the canonical writer (`spec-status -ConfirmStop`,
 * specs-generator-core.mjs). So a phase's authored transition is BINARY — `done`
 * = confirm STOP (the only legal move today; reopen is future work). The 5 task
 * statuses are illegal-for-type on a phase.
 *
 * This module owns the GATE (prior-STOP ordering + the phase's inputs +
 * the phase-specific precondition) that runs BEFORE `set_entity_status` delegates
 * the WRITE to the canonical writer. The CLI confirms `stopConfirmed` WITHOUT
 * checking prior-STOP ordering, so the ordering prohibition — the owner's core
 * value — lives here, in the typed layer, not in the spawned write.
 *
 * @see .specs/spec-generator-v4/FR.md FR-48 (FR-48e all-entities dispatch)
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_176
 * @see tools/specs-validator/phase-constants.ts (PHASE_ORDER / PHASE_FILES / readProgressState)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  PHASE_ORDER,
  PHASE_FILES,
  STOP_LABELS,
  readProgressState,
} from '../specs-validator/phase-constants.ts';

/** The only authored phase transition: confirm the STOP (`done`). */
export const PHASE_CONFIRM = 'done' as const;

/** Build the canonical phase entity id (`<slug>:phase:<Phase>`). */
export function phaseEntityId(slug: string, phase: string): string {
  return `${slug}:phase:${phase}`;
}

/**
 * Parse a phase entity id `<slug>:phase:<Phase>` → `{ slug, phase }` (phase
 * normalised to its canonical PHASE_ORDER casing). Returns null when the id is
 * not a phase handle, so `set_entity_status` can intercept phase ids BEFORE the
 * graph node lookup (phases are not nodes — a graph lookup would 404 them).
 */
export function parsePhaseId(id: string): { slug: string; phase: string } | null {
  const m = /^(.+):phase:([^:]+)$/.exec(id);
  if (!m) return null;
  const slug = m[1];
  const wanted = m[2].toLowerCase();
  const phase = PHASE_ORDER.find((p) => p.toLowerCase() === wanted);
  if (!phase) return null;
  return { slug, phase };
}

/**
 * Is `to` a legal authored move for a PHASE? Only `done` (confirm STOP) today —
 * the 5 task statuses (`ready` / `in-progress` / `blocked` / `todo`) are
 * illegal-for-type (a phase has no such states). `done`→`done` is idempotent.
 */
export function isLegalPhaseTransition(to: string): boolean {
  return to === PHASE_CONFIRM;
}

/**
 * May this phase's STOP be confirmed (FR-48e gate)? The owner's prohibition,
 * enforced in the typed layer ahead of the spawned write:
 *   1. ORDERING — every prior phase's STOP is confirmed (Context skipped: it owns
 *      no files, mirroring phase-gate.ts). The CLI does NOT enforce this.
 *   2. INPUTS — the phase's own input file(s) exist (the phase has begun).
 *   3. PRECONDITION — Requirements additionally needs DESIGN.md's
 *      `## BDD Test Infrastructure` + `**Classification:**` block (mirrors the
 *      CLI's own gate, surfaced here as a typed reason).
 * Returns the missing items so the deny message can name them (FR-48c).
 */
export function canConfirmPhaseStop(
  specAbsDir: string,
  phase: string,
): { allowed: boolean; missing: string[] } {
  const missing: string[] = [];
  const progress = readProgressState(specAbsDir);
  const targetIdx = PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number]);

  // 1. prior STOPs confirmed (ordering)
  for (let i = 0; i < targetIdx; i++) {
    const prior = PHASE_ORDER[i];
    if (prior === 'Context') continue; // no own files — phase-gate.ts skips it too
    if (!progress?.phases?.[prior]?.stopConfirmed) {
      missing.push(`prior STOP ${STOP_LABELS[prior] ?? prior} (${prior}) not confirmed`);
    }
  }

  // 2. the phase's own inputs exist (it has begun)
  const files = PHASE_FILES[phase] ?? [];
  if (files.length > 0 && !files.some((f) => fs.existsSync(path.join(specAbsDir, f)))) {
    missing.push(`no input file of ${phase} present (${files.join(' / ')})`);
  }

  // 3. Requirements precondition — DESIGN.md BDD Test Infrastructure classification
  if (phase === 'Requirements') {
    let design = '';
    try {
      design = fs.readFileSync(path.join(specAbsDir, 'DESIGN.md'), 'utf-8');
    } catch {
      /* absent → fails the checks below */
    }
    const hasSection = /##\s+BDD Test Infrastructure/i.test(design);
    const hasClassification = /\*\*Classification:\*\*\s*(TEST_DATA_ACTIVE|TEST_DATA_NONE)/i.test(design);
    if (!hasSection || !hasClassification) {
      missing.push('DESIGN.md "## BDD Test Infrastructure" Classification (TEST_DATA_ACTIVE|TEST_DATA_NONE)');
    }
  }

  return { allowed: missing.length === 0, missing };
}
