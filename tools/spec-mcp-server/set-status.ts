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
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import type { SpecGraph, TaskNode, Node } from '../spec-graph/types.ts';
import {
  isLegalTransition,
  canEnterWorkingStatus,
  WORKING_STATUSES,
  type TaskStatus,
} from '../spec-graph/task-lifecycle.ts';
import { computeFrCensus } from '../spec-graph/fr-census.ts';
import { parsePhaseId, canConfirmPhaseStop, isLegalPhaseTransition } from '../spec-graph/phase-lifecycle.ts';
import { validateSpecChange, writeDocAtomic, casCheck } from './mutations.ts';
import { WAIVED_RE } from '../specs-validator/spec-form-parsers.ts';

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
  /** `<frId>:<leg>` entries when refused for an unassembled chain (FR-48c — name what to author). Also an FR's missing legs on a STATUS_DERIVED refusal. */
  missing?: string[];
  /** FR-48e: on STATUS_DERIVED, the entity's graph type (FR / Story / Decision / AC / Scenario). */
  entityType?: string;
  /** FR-48e: on STATUS_DERIVED for an FR, the live `fr-census` verdict — the computed status the caller tried to hand-set. */
  verdict?: string;
  /** Machine-readable refusal class for the tool wrapper. */
  error?: 'NOT_FOUND' | 'ILLEGAL_TRANSITION' | 'CHAIN_NOT_ASSEMBLED' | 'CAS_MISMATCH' | 'DOOR_REFUSED' | 'STATUS_DERIVED' | 'WAIVED';
}

/**
 * FR-50b: scan TASKS.md for a task block with `id: <localId>` carrying a `_waived:`
 * marker, returning the waiver reason (or null). Used ONLY on the close/NOT_FOUND path —
 * a waived task with a non-enum status (WONT-VERIFY) is INVISIBLE to the graph (the
 * parser drops a non-enum header), so the node lookup misses it; this surfaces the
 * waiver reason for a clean WAIVED refusal instead of a confusing 404 (the motivating
 * verify-phase0-red case). Scans the given spec's TASKS.md when `spec` is known, else
 * every spec's TASKS.md (error path — cost acceptable). Mirrors the parser's block
 * recognition (a `- [..]` header carrying `id:`) then matches the shared WAIVED_RE.
 */
function findWaivedBlock(repoRoot: string, id: string, spec?: string): string | null {
  const localId = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  const idRe = new RegExp(`\\bid:\\s*${localId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const specsRoot = path.join(repoRoot, '.specs');
  let slugs: string[];
  if (spec) slugs = [spec];
  else {
    try {
      slugs = fs.readdirSync(specsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return null;
    }
  }
  for (const slug of slugs) {
    let content: string;
    try {
      content = fs.readFileSync(path.join(specsRoot, slug, 'TASKS.md'), 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*-\s*\[[ xX~]\]/.test(lines[i]) || !idRe.test(lines[i])) continue;
      const body: string[] = [lines[i]];
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*-\s*\[[ xX~]\]/.test(lines[j]) || /^#{1,6}\s/.test(lines[j]) || /^---\s*$/.test(lines[j])) break;
        body.push(lines[j]);
      }
      const wm = body.join('\n').match(WAIVED_RE);
      if (wm) return wm[1].trim();
    }
  }
  return null;
}

/**
 * FR-48e: refuse to hand-set a DERIVED entity's status and return the live
 * COMPUTED verdict instead. An FR carries its `fr-census` verdict + missing
 * legs (its real per-FR status); any other derived node gets the typed refusal
 * + the pointer to where its status IS computed. So every entity routes through
 * the one door, and content never carries a fake stored status (FR-48a
 * single-source — «вердикт не хранится, выводится»).
 */
function refuseDerived(graph: SpecGraph, node: Node, frsWithoutResearch?: Set<string>): SetStatusResult {
  if (node.type === 'FR') {
    const report = computeFrCensus(graph, { spec: node.spec, frsWithoutResearch });
    const row = report.rows.find((r) => r.frId === node.id);
    if (row) {
      const legs = row.missingLegs.length ? `, не хватает ног: ${row.missingLegs.join(', ')}` : '';
      return {
        ok: false,
        error: 'STATUS_DERIVED',
        entityType: 'FR',
        verdict: row.verdict,
        missing: row.missingLegs,
        reason: `${node.id}: статус ВЫВОДИТСЯ (вердикт ${row.verdict}${legs}) — не ставится руками. Изменить: собери недостающие ноги и прогони сценарий; см. fr-census (per-FR) / get_spec_status (per-spec).`,
      };
    }
  }
  return {
    ok: false,
    error: 'STATUS_DERIVED',
    entityType: node.type,
    reason: `${node.id} (${node.type}): статус ВЫВОДИТСЯ из покрытия и прогона тестов, не ставится руками; см. fr-census (per-FR) / get_spec_status (per-spec). Руками через дверь ставятся только задачи и фазы.`,
  };
}

/**
 * FR-48e: confirm a PHASE's STOP through the door. A phase is authored (not derived)
 * but is NOT a 5-vocab task — the only legal move is `done` (= confirm STOP). The
 * GATE (prior-STOP ordering + inputs + Requirements precondition) runs HERE, in the
 * typed layer (the owner's prohibition the CLI does not enforce); the WRITE is then
 * delegated to the canonical single writer by spawning `node specs-generator-core.mjs
 * spec-status -ConfirmStop` — the SAME plain-ESM engine create_spec already spawns
 * (tools.ts), so there is no second `.progress.json` writer (FR-48a single-source) and
 * no tsx dependency for users. SPECS_GENERATOR_ROOT pins the corpus root so a non-cwd
 * repo (the @feature48 temp repo) resolves correctly.
 */
function setPhaseStatus(repoRoot: string, ph: { slug: string; phase: string }, to: TaskStatus): SetStatusResult {
  if (!isLegalPhaseTransition(to)) {
    return {
      ok: false,
      error: 'ILLEGAL_TRANSITION',
      to,
      entityType: 'Phase',
      reason: `phase status is binary — only "done" (confirm STOP) is settable; "${to}" is illegal-for-type (a phase has no todo/ready/in-progress/blocked).`,
    };
  }
  const specAbsDir = path.join(repoRoot, '.specs', ph.slug);
  if (!fs.existsSync(specAbsDir)) {
    return { ok: false, error: 'NOT_FOUND', to, entityType: 'Phase', reason: `no spec "${ph.slug}" at .specs/${ph.slug}` };
  }
  const gate = canConfirmPhaseStop(specAbsDir, ph.phase);
  if (!gate.allowed) {
    return {
      ok: false,
      error: 'CHAIN_NOT_ASSEMBLED',
      to,
      entityType: 'Phase',
      missing: gate.missing,
      reason: `cannot confirm ${ph.phase} STOP — ${gate.missing.join('; ')}. Confirm the prior STOP / author the inputs, then retry.`,
    };
  }
  const core = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'specs-generator', 'specs-generator-core.mjs');
  const r = spawnSync(
    process.execPath,
    [core, 'spec-status', '-Path', `.specs/${ph.slug}`, '-ConfirmStop', ph.phase, '-Format', 'json'],
    { cwd: repoRoot, env: { ...process.env, SPECS_GENERATOR_ROOT: repoRoot }, encoding: 'utf-8' },
  );
  if (r.status !== 0) {
    const why = (r.stderr || r.stdout || '').toString().trim();
    return { ok: false, error: 'DOOR_REFUSED', to, entityType: 'Phase', reason: `the spec-status writer refused: ${why || `exit ${r.status}`}` };
  }
  return { ok: true, to, entityType: 'Phase' };
}

/**
 * Transition a task entity to `to`, writing through the door. `frsWithoutResearch`
 * is unused by the start gate (research is not required to START) but threaded for a
 * uniform signature. `expectedSha` (optional) makes the write CAS-conditional.
 */
export function setEntityStatus(
  graph: SpecGraph,
  repoRoot: string,
  args: { id: string; to: TaskStatus; expectedSha?: string; spec?: string },
  frsWithoutResearch?: Set<string>,
): SetStatusResult {
  // FR-48e: a PHASE is not a graph node — intercept its id first (a node lookup
  // would 404 it) and route to the phase authored-path (gate → canonical write).
  const ph = parsePhaseId(args.id);
  if (ph) return setPhaseStatus(repoRoot, ph, args.to);

  // Resolve the node like the sibling node-ref tools (resolveNodeRef): accept a composite
  // `slug:localId`, OR a bare local id + the optional `spec`, OR a bare id that is unique
  // across the corpus. Task nodes are keyed composite (`<spec>:<localId>`), so a raw
  // graph.nodes.get(bareId) used to 404 every natural `id:` from TASKS.md (incident 2026-06-14).
  let node = graph.nodes.get(args.id);
  if (!node && !args.id.includes(':')) {
    if (args.spec) node = graph.nodes.get(`${args.spec}:${args.id}`);
    if (!node) {
      const matches = [...graph.nodes.values()].filter((n) => n.id.endsWith(`:${args.id}`));
      if (matches.length === 1) node = matches[0];
      else if (matches.length > 1) {
        return {
          ok: false,
          error: 'NOT_FOUND',
          reason: `ambiguous bare id "${args.id}" across ${matches.length} specs (${matches.map((m) => m.spec).join(', ')}) — pass spec, or use slug:id`,
        };
      }
    }
  }
  if (!node) {
    // FR-50b: a waived task may be INVISIBLE (a non-enum waiver status like WONT-VERIFY
    // makes the parser drop the block). On a CLOSE attempt, scan TASKS.md for a `_waived:`
    // block with this id so the agent gets the WAIVED reason, not a confusing NOT_FOUND.
    if (args.to === 'done') {
      const waivedReason = findWaivedBlock(repoRoot, args.id, args.spec);
      if (waivedReason) {
        return {
          ok: false,
          error: 'WAIVED',
          to: args.to,
          reason: `task ${args.id} is deliberately waived (${waivedReason}) — it is kept open on purpose and must not be closed. Remove the _waived: marker to un-waive before closing.`,
        };
      }
    }
    return { ok: false, error: 'NOT_FOUND', reason: `no entity "${args.id}" in the graph${args.spec ? ` (spec "${args.spec}")` : ''}` };
  }
  // FR-48e: a derived entity (FR / Story / Decision / AC / Scenario / …) carries a
  // COMPUTED status — refuse the hand-set and return the live verdict instead.
  if (node.type !== 'Task') {
    return refuseDerived(graph, node, frsWithoutResearch);
  }
  const task = node as TaskNode;
  const from = task.status;

  // FR-50b: a deliberately-waived task (carries a `_waived:` marker) must not be CLOSED
  // via the command. The conformance floor (TASK_WAIVED_CLOSED) is the un-bypassable
  // guarantee; this is the clean early message naming the waiver reason. Un-waiving is a
  // deliberate edit removing the _waived: marker, never a status flip.
  if (task.waived && args.to === 'done') {
    return {
      ok: false,
      error: 'WAIVED',
      from,
      to: args.to,
      reason: `task ${args.id} is deliberately waived (${task.waived}) — it is kept open on purpose and must not be closed. Remove the _waived: marker in a deliberate edit to un-waive before closing.`,
    };
  }

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
