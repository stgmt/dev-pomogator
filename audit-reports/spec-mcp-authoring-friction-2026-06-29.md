# Spec-MCP authoring friction — bdd-test-scanner session (2026-06-29)

**Context:** authored `.specs/bdd-test-scanner` end-to-end through the `dev-pomogator-specs`
MCP door (`create_spec`, `apply_spec_change`, `read_spec_doc`, `set_spec_status`). The spec
reached verdict GREEN, but the *experience* was a manual slog of repeated door rejections and
hand de-anchor/re-anchor dances. Owner pushback: "MCP should automate all this nicely; analyze
and report the friction." This is that report.

> Fact check: every document write WAS an MCP-door call — nothing bypassed the door. The
> problem is not "didn't use MCP"; it is "the door is a validator+atomic-writer, the *authoring
> automation* lives in workflow sub-skills I skipped, AND the scaffold has real DX defects."

## Root cause 1 — process (mine): bypassed the workflow automation sub-skills

`create-spec` ships sub-skills that auto-fill forms + wire traceability links:
- `discovery-forms` → USER_STORIES v3-forms + RESEARCH risk table
- `requirements-chk-matrix` → REQUIREMENTS CHK matrix + DESIGN Key Decisions (with the
  `**Требование:** [FR-N]` covers lines)
- `task-board-forms` → TASKS Done-When/Status/Est

I hand-wrote every doc via raw `apply_spec_change` instead of invoking these, so I fought every
form + anchor by hand. **Action: drive create-spec via its sub-skills, or have `create_spec`
invoke them.**

## Root cause 2 — real scaffold/door DX defects (bite even when done right)

### D1 — scaffold seeds placeholder cross-doc anchors that break on first authoring (HIGH)
`create_spec` is "born verdict-GREEN" with cross-links to placeholder headings
(`USE_CASES.md#uc-1-название`, `FR.md#fr-1-название`) from FR/AC/DESIGN/FILE_CHANGES/
REQUIREMENTS/TASKS. The moment you write real headings, EVERY inbound link dangles and the door
refuses (delta-only anchor check). I had to "de-anchor → write → re-anchor" across 6 docs, 3
separate times (UC headings, FR headings, AC↔FR cycle). Evidence: VALIDATION_FAILED anchor
findings on USE_CASES.md (5×), FR.md (12× across DESIGN/FILE_CHANGES/REQUIREMENTS/TASKS).
**Fix options:** scaffold with stable bare-id anchors (`## FR-1` → `#fr-1`, requirement text on
a body line — the convention spec-generator-v4 already uses); OR a door op "rename heading +
rewrite inbound links" (anchor-fix exists for repair but not inline on authoring); OR seed NO
cross-links until headings are authored.

### D2 — scaffold `.feature` template tag convention contradicts the corpus (MEDIUM)
The scaffold `.feature` comment mandates `@FR-N`, but all 30+ corpus specs and the
`extension-test-quality` / `bdd-only` rules use `@featureN`. Conformance accepts BOTH, so it does
NOT catch the deviation — the scaffold silently steers new specs to the minority convention.
Evidence: `cucumber.json` paths + `spec-generator-v4.feature` scenarios tagged `@feature1..`.
**Fix:** decide the canonical tag (owner call — see Open question) and make the scaffold comment
+ conformance enforce ONE form.

### D3 — verdict reports warning COUNTS, not remediation (MEDIUM)
`spec-verdict` printed `conformance: 0 error / 19 warning — FR_NO_DESIGN:6, FR_NO_STORY:6,
TOOTHLESS_DECISION:3, TOOTHLESS_STORY:4`. To learn the fix I had to read `conformance.ts:219-251`
and discover the covers edge is built ONLY from a `**Требование:** [FR-N]` line inside each
`### User Story` / `### Decision` block, and only the FIRST FR per block is credited. The finding
objects already carry `suggestions`/`action` (e.g. `link_story`) — the verdict just drops them.
**Fix:** surface per-finding remediation hints in the verdict output, not only counts.

### D4 — task-form guard validates the WHOLE doc on any edit (LOW)
Even de-anchoring one FR link in TASKS.md was refused because the scaffold's placeholder tasks
lack `**Done When:**` blocks (the guard re-validates every task block on any write). I had to
replace TASKS with a minimal stub first. **Fix:** scaffold tasks should be born form-valid (or
the guard should scope to the edited block).

## Residual non-gating warnings (by design, not a defect)
After adding `**Требование:**` lines, warnings dropped 19→5 (`FR_NO_DESIGN:3`, `FR_NO_STORY:2`).
The residual is structural: the spec has 4 broad stories / 3 decisions for 6 FRs, and the parser
credits one FR per block. Splitting stories/decisions 1:1 with FRs purely to zero the counter
would be gaming the metric and would hurt readability — left as documented warnings.

## Open question for the owner (blocks D2 fix)
Canonical scenario tag: `@featureN` (current corpus + rules) or `@FR-N` (current scaffold
comment)? They conflict; conformance accepts both. The scaffold and the corpus must agree before
D2 is "fixed" — changing the shared scaffold blind risks breaking the established convention.

## Recommended order
1. (process) route create-spec through its sub-skills — biggest friction removed, no engine risk.
2. D1 (stable anchors) — removes the bulk of the manual dance; engine change, needs the Docker
   suite to confirm the 30-spec corpus still validates.
3. D3 (verdict remediation output) — contained, but `spec-verdict` output may be asserted by
   tests; verify under Docker.
4. D2 — after the owner picks the canonical tag.
5. D4 — scaffold born-valid tasks.

Cross-ref: `spec-generator-dev` skill (subsystem maintenance), `spec-mcp-usability-dogfood`
(systematic friction harvesting from transcripts).

## Resolution (2026-06-29, same day)

The root cause (process: going manual instead of the sub-skills) was fixed by a NEW enforcement
mechanism rather than by smoothing the manual path — which turned out to obviate most of part Б:

- **Process fix (DONE, shipped):** new PreToolUse hook `tools/spec-authoring-steer/steer.ts`
  steers/blocks full-doc hand-authoring of form docs to the automator sub-skills (shadow→enforce;
  6 legitimate authors marked with `[skip-spec-steer:]`). Rule: `.claude/rules/spec-authoring-via-subskills.md`.
- **D1 / D2 / D4 (OBVIATED):** these "smooth the *manual* path" fixes are moot now the manual path
  is discouraged — the sub-skill path (which already wires anchors + valid forms) is the only path.
  Left as future polish, NOT blockers.
- **D3 (DONE, verifying):** `spec-verdict` now prints a per-code `fix <CODE>: <how>` remediation
  line under the conformance count (additive). In-session GREEN; a full Docker BDD run is verifying
  no scenario asserts the old verdict output before the change is committed.
- **D2 tag canon** (still open, owner call): scaffold `.feature` comment says `@FR-N`, corpus uses
  `@featureN`; conformance accepts both. Needs an owner decision before the scaffold is changed.
