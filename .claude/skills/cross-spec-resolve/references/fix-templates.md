# Fix templates — resolving a finding

How each finding is fixed once `cross-spec-reconcile` has produced the report and the user
walks it via the sibling `cross-spec-resolve` skill (step 5 of its loop). Extracted from
`../../cross-spec-resolve/SKILL.md`; keep in sync with that skill body.

## MCP-rails write rule (applies to EVERY template)

Every write that lands in a `.specs/` doc goes through the mutation door
`apply_spec_change({ spec, doc, old_string, new_string })` — **never** a raw `Edit`/`Write` of
`.specs/`. The ONLY template that uses an ordinary `Edit` is **Path B** (implementation code
lives outside `.specs/`).

## Templates by choice

| User choice | Target | Template | Resulting status |
|---|---|---|---|
| **Apply suggested fix** (mechanical findings) | spec → `apply_spec_change` per `finding.suggested_fix`; code → `Edit` | apply the one-line `suggested_fix` | `resolved` |
| **Path A — update spec** (decision was wrong) | spec doc | `apply_spec_change({ spec, doc, old_string, new_string })` rewriting the FR/AC prose to match reality | `resolved` |
| **Path B — update code** (reality was wrong) | implementation file (non-`.specs/`) | ordinary `Edit` of the code so it matches the locked decision | `resolved` |
| **Path C — defer** | spec doc | append `[OUT_OF_SCOPE: <reason>]` marker via `apply_spec_change` | `deferred` |
| **Acknowledge & override** (CRITICAL only) | YAML + JSONL | stamp `acknowledged_by`/`override_reason`/`override_timestamp` in the report + append a line to `.claude/logs/cross-spec-overrides.jsonl` (`appendOverride`) | `acknowledged` |
| **Abort** | — | exit the loop with a NON-ZERO status (`exitCodeForChoice`) so the STOP gate stays blocked | (loop ends) |

Path A/B/C are offered only for `cross-spec/decision-locked-but-reality-diverges`
(class `architectural-decision-vs-reality`). All other findings go straight to "Apply
suggested fix" → step 6.

## Foreign-spec confirm (extra guard)

If a fix edits **another slug's** `.md` (`explanation.requiresForeignSpecConfirm`), a second
banner fires («⚠️ This edits a foreign spec. Continue?») before committing. "No" downgrades the
status to `deferred`. The foreign write still goes through `apply_spec_change({ spec: <foreign-slug>, … })`,
never a raw `Edit` — the second confirm prevents accidental cross-spec contamination.

## After the batch — re-check (step 7)

Batch fixes make findings stale, so `cross-spec-resolve` re-runs `cross-spec-reconcile (mode: full)`
once and stamps each ORIGINAL finding's `resolution_status` with the OUTCOME:

- `resolved` — the finding's exact key is gone from the fresh run;
- `still_present` — the identical finding is still emitted (the fix didn't take);
- `transformed` — the exact key is gone but a fresh finding shares its `code` (the fix shifted it).

This OUTCOME stamp (from `scripts/recheck.ts`) is distinct from the per-finding DECISION stamp
(`resolved`/`acknowledged`/`deferred`/`skipped`, from `scripts/update-status.ts`) written during
the interactive loop.
