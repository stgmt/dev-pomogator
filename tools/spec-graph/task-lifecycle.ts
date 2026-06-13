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
import type { TaskNode } from './types.ts';

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
