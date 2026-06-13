/**
 * set_entity_status core (FR-48d) — the centralized, validated status transition.
 *
 * The «command» half of the hybrid: it READS the entity + its requirement chain,
 * VALIDATES the move (legal transition + — for a working status — the assembled
 * chain, phase-aware), then WRITES the `Status:` marker THROUGH the door's own
 * mutation path (validateSpecChange dry-run + writeDocAtomic). It is STRICTER than
 * the passive conformance gate: it REFUSES a chain-less start outright (the gate is
 * WARNING/detect-first today), so the command actively enforces while the gate is the
 * floor that catches a raw markdown bypass. Tasks first; the signature generalises to
 * other entities later.
 *
 * Kept as a pure(ish) function taking `repoRoot` explicitly so the @feature48 BDD can
 * drive it on a temp repo without chdir; the MCP tool wrapper passes process.cwd().
 *
 * @see .specs/spec-generator-v4/FR.md FR-48 (FR-48d hybrid command + floor)
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_174
 * @see ./mutations.ts (validateSpecChange / writeDocAtomic) · ../spec-graph/task-lifecycle.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SpecGraph, TaskNode } from '../spec-graph/types.ts';
import {
  isLegalTransition,
  canEnterWorkingStatus,
  WORKING_STATUSES,
  type TaskStatus,
} from '../spec-graph/task-lifecycle.ts';
import { validateSpecChange, writeDocAtomic, casCheck } from './mutations.ts';

/** TASKS.md `Status:` token per stored status (the parser maps these back). */
const STATUS_TOKEN: Record<TaskStatus, string> = {
  todo: 'TODO',
  ready: 'READY',
  'in-progress': 'IN_PROGRESS',
  done: 'DONE',
  blocked: 'BLOCKED',
};

const STATUS_TOKEN_RE = /\bStatus:\s*(?:TODO|READY|IN_PROGRESS|DONE|BLOCKED)\b/;

export interface SetStatusResult {
  ok: boolean;
  from?: TaskStatus;
  to?: TaskStatus;
  /** Why the transition was refused (illegal move / chain not assembled / not found / CAS / door). */
  reason?: string;
  /** `<frId>:<leg>` entries when refused for an unassembled chain (FR-48c — name what to author). */
  missing?: string[];
  /** Machine-readable refusal class for the tool wrapper. */
  error?: 'NOT_FOUND' | 'ILLEGAL_TRANSITION' | 'CHAIN_NOT_ASSEMBLED' | 'CAS_MISMATCH' | 'DOOR_REFUSED';
}

/**
 * Transition a task entity to `to`, writing through the door. `frsWithoutResearch`
 * is unused by the start gate (research is not required to START) but threaded for a
 * uniform signature. `expectedSha` (optional) makes the write CAS-conditional.
 */
export function setEntityStatus(
  graph: SpecGraph,
  repoRoot: string,
  args: { id: string; to: TaskStatus; expectedSha?: string },
  frsWithoutResearch?: Set<string>,
): SetStatusResult {
  const node = graph.nodes.get(args.id);
  if (!node || node.type !== 'Task') {
    return { ok: false, error: 'NOT_FOUND', reason: `no task "${args.id}" in the graph` };
  }
  const task = node as TaskNode;
  const from = task.status;

  if (!isLegalTransition(from, args.to)) {
    return {
      ok: false,
      error: 'ILLEGAL_TRANSITION',
      from,
      to: args.to,
      reason: `illegal transition ${from} → ${args.to} (no skip-to-finish; see the lifecycle machine)`,
    };
  }

  // FR-48b: entering a working status (ready/in-progress) needs the assembled chain —
  // impl tasks gate, spec-authoring tasks ([spec-phase]) are exempt (anti-deadlock).
  if (WORKING_STATUSES.includes(args.to)) {
    const gate = canEnterWorkingStatus(graph, task, frsWithoutResearch);
    if (!gate.allowed) {
      return {
        ok: false,
        error: 'CHAIN_NOT_ASSEMBLED',
        from,
        to: args.to,
        reason: `requirement chain not assembled — missing ${gate.missing.join(', ')}. Author the legs, or mark the task [spec-phase] if it authors them.`,
        missing: gate.missing,
      };
    }
  }

  const slug = task.spec ?? '';
  const doc = path.basename(task.file); // .specs/<slug>/TASKS.md → TASKS.md
  const abs = path.join(repoRoot, '.specs', slug, doc);
  if (!slug || !fs.existsSync(abs)) {
    return { ok: false, error: 'NOT_FOUND', from, to: args.to, reason: `TASKS.md not found for spec "${slug}"` };
  }
  const content = fs.readFileSync(abs, 'utf-8');

  if (args.expectedSha) {
    const cas = casCheck(repoRoot, slug, doc, args.expectedSha);
    if (!cas.ok) {
      return { ok: false, error: 'CAS_MISMATCH', from, to: args.to, reason: `doc changed since read (sha ${cas.actualSha})` };
    }
  }

  // Locate the task's header line (the parser's recognition: a `- [..]` line carrying
  // both `id: <localId>` and a `Status:` token) and flip only that line's status +
  // checkbox. The whole line is the unique anchor for the door write.
  const localId = args.id.includes(':') ? args.id.slice(args.id.indexOf(':') + 1) : args.id;
  const idRe = new RegExp(`\\bid:\\s*${localId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const lines = content.split('\n');
  const oldLine = lines.find(
    (l) => /^\s*-\s*\[[ xX~]\]/.test(l) && idRe.test(l) && STATUS_TOKEN_RE.test(l),
  );
  if (!oldLine) {
    return { ok: false, error: 'NOT_FOUND', from, to: args.to, reason: `task header for "${localId}" not found in ${slug}/${doc}` };
  }
  const checkbox = args.to === 'done' ? 'x' : ' ';
  const newLine = oldLine
    .replace(/^(\s*-\s*)\[[ xX~]\]/, `$1[${checkbox}]`)
    .replace(STATUS_TOKEN_RE, `Status: ${STATUS_TOKEN[args.to]}`);

  // Write THROUGH the door's full dry-run (form + anchor + conformance floor) then
  // atomically — so set_entity_status can never bypass what apply_spec_change enforces.
  const r = validateSpecChange(repoRoot, slug, doc, { old_string: oldLine, new_string: newLine });
  if (!r.ok) {
    return {
      ok: false,
      error: 'DOOR_REFUSED',
      from,
      to: args.to,
      reason: `door refused the write: ${r.findings.map((f) => f.message).join('; ')}`,
    };
  }
  writeDocAtomic(repoRoot, slug, doc, r.next!);
  return { ok: true, from, to: args.to };
}
