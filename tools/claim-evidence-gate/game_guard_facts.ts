/**
 * Pure, observable, agent-INDEPENDENT "gaming the gate" facts (FR-26, 2026-06-25), extracted from the
 * Stop-hook so they can be UNIT-TESTED against the REAL tool_use input shapes (apply_spec_change /
 * set_spec_status / Edit). The judge-bench injects these facts as LITERALS — it would stay green even if
 * the regex / `t.input` extraction here were broken (the fact would always be `false` → the WEAKENING rule
 * dead). This module + its test are the dead-integration guard (rule: verify-against-real-artifact):
 * the producer of these tool_use records is the harness, so the test mirrors those exact shapes.
 *
 * @see claim_evidence_gate_stop.ts (consumer — feeds these to the Meridian judge)
 * @see __tests__/claim-evidence-gate.test.ts CEGATE001_42 (tests against real shapes)
 */

/** Real changes attempted this turn (raw executor tools). */
export const MUTATING_TOOL = /^(edit|write|multiedit|notebookedit|bash|powershell)$/i;
/** Spec-door WRITE tools (mutate `.specs/`). NOTE: matches the hook's existing `isDoorWrite` exactly. */
export const isDoorWrite = /^mcp__.*__(apply_spec_change|create_spec|delete_spec_doc|rename_spec_doc|set_entity_status|archive_spec)$/;
/** Files that ARE the pinator — editing them (instead of the assigned task) = weakening the enforcement. */
export const GATE_OWN_FILE = /claim.?evidence.?gate|meridian.?judge|turn_window|claim_classifier|task.?census|spec.?status.?store|judge.?bench|\.spec-status/i;

/** A single tool_use record as the turn-window surfaces it (harness-written). */
export interface ToolUseLite {
  name: string;
  input: unknown;
}

const isMutatingOrDoor = (name: string): boolean => MUTATING_TOOL.test(name) || isDoorWrite.test(name);

/**
 * TRUE when a mutating/door tool THIS turn touched a pinator-own file — its JSON-stringified input
 * matched GATE_OWN_FILE. Covers a raw Edit/Write (`file_path` under the gate) AND a door
 * `apply_spec_change` on the `claim-evidence-gate` spec (`spec`/`doc` args carry the slug).
 */
export function gateSelfEdit(toolUses: ToolUseLite[]): boolean {
  return toolUses.some((t) => isMutatingOrDoor(t.name) && GATE_OWN_FILE.test(JSON.stringify(t.input ?? {})));
}

/**
 * TRUE when this turn SELF-marked the agent's own work blocked/backlog: a `set_spec_status` /
 * `set_entity_status` call with `backlog`, OR a `Status: BLOCKED` hand-set written into a TASKS.md
 * (raw edit or door apply). A self-declared blocker — counted by the judge as the fabricated-blocker class.
 */
export function selfMarkedBlockedOrBacklog(toolUses: ToolUseLite[]): boolean {
  return toolUses.some((t) => {
    const blob = JSON.stringify(t.input ?? {});
    if (/set_(?:spec|entity)_status/i.test(t.name) && /backlog/i.test(blob)) return true; // self-park a spec
    return isMutatingOrDoor(t.name) && /TASKS\.md/i.test(blob) && /Status:\s*BLOCKED/i.test(blob); // self-set a task BLOCKED
  });
}
