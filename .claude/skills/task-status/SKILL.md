---
name: task-status
description: Use when you change a spec task's status — ESPECIALLY before starting work (moving a task to `ready`/`in-progress`). It is the centralized, validated path: read the requirement's trace chain, confirm it is assembled, then set the status through the door's `set_entity_status` tool. Explains why a start is refused (which legs are missing) and the two ways to unblock. Trigger phrases: "взять задачу в работу", "поставить задачу in-progress / ready / done", "пометить задачу готовой", "start working on task", "set task status".
allowed-tools: mcp__dev-pomogator-specs__get_trace, mcp__dev-pomogator-specs__get_node, mcp__dev-pomogator-specs__get_spec_status, mcp__dev-pomogator-specs__set_entity_status, mcp__dev-pomogator-specs__read_spec_doc
---

# task-status — set a task's status through the validated door (FR-48)

Status is NOT set by editing `Status:` in TASKS.md by hand. It is set through one
centralized door tool, `set_entity_status`, which validates the move before writing.
This is the **front bracket** of the trace discipline: just as a task cannot be marked
`done` without its own green scenario (FR-46), a task cannot be **started** until its
requirement's chain is assembled.

## The status machine (FR-48a)

`todo → ready → in-progress → done`, with `blocked` reachable from any active state and
`done → in-progress` to reopen. **No skip-to-finish**: `todo → done` and `ready → done`
are rejected — you pass through `in-progress`.

- `ready` = «the requirement chain is assembled + validated, eligible to start».
- Quality labels (done-but-unverified, IMPLEMENTED, …) are NOT statuses — `fr-census`
  derives those from status + scenario result. Don't try to store them.

## Protocol — before moving a task to `ready`/`in-progress`

1. **Read the chain.** `get_trace` for the task (or its requirement): does the FR have
   AC + a scenario + a design Decision + a user Story? (Research is a grounding leg, NOT
   required to start.) `get_spec_status` shows the task's current status.
2. **Assemble what's missing.** If a leg is absent, author it FIRST — a Decision in
   DESIGN.md / a Story in USER_STORIES.md carrying `**Требование:** [FR-N]`, an AC, a
   (failing, TDD-first) scenario. This is the «spec fully, then code» order.
3. **Set the status.** Call `set_entity_status({ id, to })`. It re-validates and writes
   atomically through the same path as `apply_spec_change` (pass `expected_sha` for CAS
   under parallel sessions).

## When a start is refused

`set_entity_status` returns `CHAIN_NOT_ASSEMBLED` with `missing: ["<frId>:design", …]`.
Two honest ways forward — pick by what the task actually is:

- **The task IMPLEMENTS the requirement** → author the missing legs (step 2), then retry.
  Do NOT start coding against a half-specified requirement.
- **The task ITSELF authors a leg** (a spec/discovery/design task) → mark it
  `[spec-phase]` in its TASKS.md block. Such tasks are exempt (anti-deadlock — they
  CREATE the legs, so they cannot be gated on the legs existing). Default is impl
  (gated), so the marker is explicit and opt-in.

`ILLEGAL_TRANSITION` means the move isn't on the machine (e.g. `todo → done`) — go
through `in-progress`.

## The floor (why hand-editing won't help)

Even if you bypass this skill and flip `Status:` in TASKS.md by raw edit, the door's
conformance check raises `TASK_STARTED_WITHOUT_CHAIN` (detect-first WARNING today,
promoted to a hard refusal after the corpus is retrofitted). The command is the
ergonomic path; the conformance gate is the floor. Use the command.

## See also

- `.specs/spec-generator-v4/FR.md` FR-48 (FR-48a machine / FR-48b gate / FR-48d command)
- `tools/spec-graph/task-lifecycle.ts` — the transition table + chain-assembled check
- FR-46 (the back bracket): a task cannot be `done` without its own green scenario.
