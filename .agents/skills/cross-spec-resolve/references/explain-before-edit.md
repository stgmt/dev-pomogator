# Explain-before-edit protocol

No finding is fixed silently. Before any edit, `cross-spec-resolve` emits a **5-field
explanation block** per finding and asks the user to choose — the block exists to force the
agent to surface trade-offs the user might otherwise miss. Extracted from
`../../cross-spec-resolve/SKILL.md` (steps 2–4) + `scripts/walker.ts`.

## Order of operations

1. **Group** findings: severity → class → dedup by `(code + spec_a + spec_b + location)`.
2. **Explain** each with the 5 fields below (built by `walker.ts::planResolution` — the single
   source, so the skill body and its SPECGEN004_40 test never diverge).
3. **Confirm** via `AskUserQuestion` using the block's `options`. Only after the user picks does
   any edit happen (see [fix-templates.md](fix-templates.md)).

## The 5 fields

| # | Field | Content |
|---|---|---|
| 1 | `code` + `severity` + `class` | what kind of finding, and how serious |
| 2 | `files` + `lines` | concrete navigation anchors — where to look |
| 3 | `plain language` | what the agent thinks the problem actually is |
| 4 | `WHY` | the impact if we ship as-is (the cost of NOT fixing) |
| 5 | `options` | the available paths, with the default highlighted `recommended` |

## Header label

The `AskUserQuestion` header comes from `promptHeader(finding.severity)` (≤12 chars):

| severity | header |
|---|---|
| `CRITICAL` | `⚠️ CRIT` |
| `WARNING` | `WARN` |
| `INFO` | `INFO` |

`promptHeader` is the single source for the label — the SPECGEN004_40 binding asserts the same
function, so the skill and the test can't drift apart.

## Two distinct stamps (do not conflate)

- **DECISION** — written during the interactive loop per finding: `resolved` | `acknowledged` |
  `deferred` | `skipped` (`scripts/update-status.ts`). What the user *chose*.
- **OUTCOME** — written by the step-7 re-check after batch fixes: `resolved` | `still_present` |
  `transformed` (`scripts/recheck.ts`). What actually *happened* when reconcile re-ran.

## Why this protocol exists

A finding's fix often has a real trade-off (update the spec vs the code vs defer; edit a foreign
spec vs not). Emitting `plain language` + `WHY` + explicit `options` BEFORE editing means the user
makes that call with the cost in front of them — instead of the agent picking silently and the
user discovering the consequence later. CRITICAL findings additionally block via the override
path (logged to `.claude/logs/cross-spec-overrides.jsonl`).
