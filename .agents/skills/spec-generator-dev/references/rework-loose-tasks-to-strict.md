# Rework a loose `TASKS.md` → strict, parser-trackable format

## Why

The SpecGraph task parser (`tools/spec-graph/parsers/tasks.ts`, `headerOf`)
recognises a task block ONLY when its header line has **both**:

- `— Status: (TODO|IN_PROGRESS|DONE|BLOCKED)`, **and**
- an explicit `— id: <slug>` field.

Specs authored before the strict format (e.g. `session-pilot`) use a `Tnn:`
title prefix and a `— Status:` field but **no `— id:`** — so `headerOf` returns
`null`, the tasks are silently skipped, and the spec is **invisible** to the
task census (P21-6 banner), the FR-32 coverage rollup, and `tested-by`
traceability. That is why the census tracked 1 spec out of 50.

> Scope decision (user, 2026-06-10): loose specs are **not** silently
> half-counted. They get reworked to the strict format — the rest "в конце
> разработки v4", not eagerly.

## Procedure (dogfood-proven on session-pilot)

1. **Read** the spec's `TASKS.md` through the door (enforce-safe):
   `read_spec_doc({spec, doc:'TASKS.md'})` → save the `content`.
2. **Transform** with `scripts/add-task-ids.ts` (pure `addTaskIds(content)` +
   CLI). It inserts `— id: t<nn>` before `— Status:` on every `Tnn:` header
   missing an id. It is:
   - **CRLF-safe** — a RAW-content regex (`[^\r\n]*?`), no split/join reflow
     (a split/join flips the whole file CRLF→LF on autocrlf trees and buries
     the real diff — verify `git diff --stat` is `~headers×2`, not `~lines×2`);
   - **child-safe** — only header lines (those with `— Status:`) are touched,
     never Done-When child checkboxes;
   - **status-preserving + idempotent** — existing `Status:`/`id:` left as-is.
3. **Verify the diff is only id-insertions** before writing (byte-identical
   minus the inserted ids).
4. **Write through the door**: `apply_spec_change({spec, doc:'TASKS.md',
   content})`. A door **refusal** (form-guard / conformance) is a real finding
   — fix the tool or content; never `[skip-spec-access]` a foreign-spec write.
5. **Confirm**: rebuild the graph → the spec now has `N` Task nodes; the census
   shows it.

## Honesty (do NOT overclaim)

Adding ids makes a spec **trackable**, not **verified**. A self-reported `DONE`
task whose scenarios are not in the cucumber suite surfaces as **⏸ done-but-not-run**
(can't confirm) — not as a pass. session-pilot landed as `24 open + 34 ⏸`:
those 34 are tracked-but-unconfirmed, and real reverification is a separate job.
The census re-checks each task against its scenarios, so a falsely-`DONE` task
shows ⏸ / 🔴 regardless of the checkbox — the rework cannot launder status.

## See also

- Parser contract: `tools/spec-graph/parsers/tasks.ts`
- Census consumer: `tools/spec-graph/task-census.ts` + `tools/specs-validator/conformance-summary.ts`
- Helper + tests: `scripts/add-task-ids.ts`, `tests/e2e/add-task-ids.test.ts`
- Incident row: this skill's SKILL.md «Реестр инцидентов»
