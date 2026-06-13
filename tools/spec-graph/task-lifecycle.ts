/**
 * Task lifecycle (FR-48a) — the legal status-transition machine.
 *
 * Stored statuses are todo → ready → in-progress → blocked → done (TaskNode.status).
 * `ready` is the «chain assembled + validated, eligible to start» checkpoint. This
 * module is the single authority on which status→status moves are allowed; the
 * chain-assembled gate (FR-48b, `chainAssembledFor` — added next slice) and the
 * `set_entity_status` command (FR-48d) both consult it. Quality verdicts
 * (IMPLEMENTED / done-unverified / PLANNED) are NOT statuses — fr-census derives
 * them from status + scenario result (one source of truth).
 *
 * @see .specs/spec-generator-v4/FR.md FR-48 (FR-48a vocabulary + transitions)
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_171
 */
import type { SpecGraph, TaskNode } from './types.ts';
import { frLegsOf } from './legs.ts';

export type TaskStatus = TaskNode['status'];

/**
 * Legal next-states per current status. The forward spine is
 * todo→ready→in-progress→done; reverse/recovery edges are deliberate:
 * `done→in-progress` reopens, `blocked→*` recovers, and any active state can step
 * back. `todo→done` and `ready→done` are ABSENT — a task cannot be marked done
 * without passing through `in-progress` (no skip-to-finish, the FR-46 done gate
 * only fires on a real in-progress→done move).
 */
export const LEGAL_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  todo: ['ready', 'in-progress', 'blocked'],
  ready: ['in-progress', 'todo', 'blocked'],
  'in-progress': ['done', 'blocked', 'ready', 'todo'],
  blocked: ['todo', 'ready', 'in-progress'],
  done: ['in-progress'], // reopen only
};

/**
 * Is the move `from → to` legal? A no-op (same status) is always allowed so an
 * idempotent re-write of the current status never trips the machine.
 */
export function isLegalTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Statuses that mean «work is authorised to start». The FR-48b gate guards ENTRY
 * into these — you may only move a task here once its requirement chain is
 * assembled (impl-phase) or it is a spec-authoring task (anti-deadlock).
 */
export const WORKING_STATUSES: readonly TaskStatus[] = ['ready', 'in-progress'];

/**
 * Is the requirement's chain ASSEMBLED enough to START work on it (FR-48b)?
 * «Assembled» = the upstream legs are wired — AC + scenario + design + story. NOT
 * «work done», NOT spec-verdict GREEN. Research is a grounding leg that is NOT
 * required to start (it may land with the work). A failing scenario counts as
 * present (TDD-first): this gate guarantees the chain is WIRED, the FR-46 done gate
 * guarantees it is GREEN — two deliberately different brackets. Returns the missing
 * legs so the deny message can name them (FR-48c).
 */
export function chainAssembledFor(
  graph: SpecGraph,
  frId: string,
  frsWithoutResearch?: Set<string>,
): { assembled: boolean; missing: string[] } {
  const legs = frLegsOf(graph, frId, frsWithoutResearch);
  const missing: string[] = [];
  if (!legs.hasAc) missing.push('AC');
  if (!legs.hasScenario) missing.push('scenario');
  if (!legs.hasDesign) missing.push('design');
  if (!legs.hasStory) missing.push('story');
  return { assembled: missing.length === 0, missing };
}

const SPEC_PHASE_MARKER = /\[spec-phase\]/i;

/**
 * Is this a spec-authoring task (FR-48b anti-deadlock)? Such tasks CREATE the legs,
 * so they must NOT be gated on the legs existing — else the task that authors FR-X's
 * design leg could never start (FR-X has no design leg yet — that is its deliverable).
 * Detection is an EXPLICIT `[spec-phase]` marker in the task block, NOT a fragile text
 * heuristic; the default is impl (GATED), so a forgotten marker fails safe (gated, not
 * silently exempt).
 */
export function isSpecAuthoringPhase(task: Pick<TaskNode, 'doneWhen' | 'phase'>): boolean {
  return SPEC_PHASE_MARKER.test(task.doneWhen ?? '') || SPEC_PHASE_MARKER.test(task.phase ?? '');
}

/**
 * The FR-48b START decision: may this task ENTER a working status (ready / in-progress)?
 * Spec-authoring tasks are always allowed — they CREATE the legs (anti-deadlock). An impl
 * task is allowed only when EVERY requirement it `refs` has its chain assembled. When
 * blocked, `missing` carries `<frId>:<leg>` entries so the gate/command can name exactly
 * what to author (FR-48c). The single decision reused by the conformance gate (FR-48b) and
 * the `set_entity_status` command (FR-48d).
 */
export function canEnterWorkingStatus(
  graph: SpecGraph,
  task: Pick<TaskNode, 'doneWhen' | 'phase' | 'refs'>,
  frsWithoutResearch?: Set<string>,
): { allowed: boolean; missing: string[]; specPhase: boolean } {
  if (isSpecAuthoringPhase(task)) return { allowed: true, missing: [], specPhase: true };
  const missing: string[] = [];
  for (const fr of task.refs ?? []) {
    const r = chainAssembledFor(graph, fr, frsWithoutResearch);
    if (!r.assembled) missing.push(...r.missing.map((m) => `${fr}:${m}`));
  }
  return { allowed: missing.length === 0, missing, specPhase: false };
}
