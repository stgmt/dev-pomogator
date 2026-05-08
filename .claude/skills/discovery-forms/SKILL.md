---
name: discovery-forms
description: >
  Populates USER_STORIES.md with v3-form blocks (Priority + Why + Independent Test + Acceptance Scenarios)
  and appends ## Risk Assessment to RESEARCH.md. Called by specs-management.md Phase 1 (Discovery) step 3.
  Returns structured JSON summary listing stories populated, risks added, and files touched.
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# Discovery Forms

## Mission

Fill Phase 1 artifacts of a v3 spec with required form fields that form-guards enforce:

- `USER_STORIES.md` — one or more `### User Story N (Priority: P1|P2|P3)` blocks, each with **Why:**, **Independent Test:**, **Acceptance Scenarios:** (inline Given/When/Then).
- `RESEARCH.md` — append `## Risk Assessment` table with ≥2 non-placeholder rows (Risk, Likelihood, Impact, Mitigation).

Both outputs pass the matching form-guards (`user-story-form-guard`, `risk-assessment-guard`).

## Preconditions

- `.specs/{slug}/` exists with `.progress.json` where `version >= 3`.
- Feature slug is known (caller's `$ARGUMENTS` or passed inline).

If `.progress.json` is missing or pre-v3, exit early with a note — form-guards will not fire, skill is unnecessary.

## Inputs

- `.specs/{slug}/USER_STORIES.md` — read current state (may be empty template).
- `.specs/{slug}/USE_CASES.md` — extract roles/actors and edge cases to seed stories and risks.
- `.specs/{slug}/RESEARCH.md` — if present, note existing `## Problem`/`## Project Context` for Risk Assessment context.
- Conversation history — user intent, domain vocabulary.
- `JIRA_SOURCE.md` (if present) — verbatim Jira text for preservation.

## Execution

### Step 1 — Inventory existing content

Read USER_STORIES.md. If it contains only template bullets (`- Как {роль}...`), treat as empty and proceed to fresh population.

If stories already exist in v3 form (presence of `(Priority: Pn)` + Why + IT + AC), verify completeness block-by-block and emit only missing fields — do not rewrite.

### Step 2 — Gather stories from the user (when needed)

If fewer than one viable story is present, ask the user (via AskUserQuestion) for the top 3–5 stories. Prompt format:

> "For `{slug}`, list 3–5 user stories you want captured. For each, state the role, goal, value, and a rough priority (P1 must-have, P2 should-have, P3 nice-to-have)."

If the answer is terse, expand by inference and show the expanded draft to the user for confirmation inline (conversational, not another AskUserQuestion call).

### Step 3 — Emit User Story blocks

For each story, emit:

```markdown
### User Story N: {Short title} (Priority: P1|P2|P3)

As a {role}, I want {goal}, so that {value}.

**Why:** {1-sentence rationale tying to business impact or user pain}

**Independent Test:** {How to verify this story in isolation — a single BDD scenario label @featureN, a manual walkthrough, or a smoke check; must be self-contained}

**Acceptance Scenarios:**

Given {precondition}
When {action}
Then {outcome}

Given {alternate precondition}
When {action}
Then {alternate outcome}
```

Rules:
- Priority **must** be inside the H3 heading as `(Priority: P1|P2|P3)` — form-guard checks exactly this pattern.
- Each of `**Why:**`, `**Independent Test:**`, `**Acceptance Scenarios:**` must appear as bold markers on their own line.
- Write via Edit (anchor on `# User Stories` or previous block) to preserve any existing Jira trace lines (`Jira quote: "..."`, `Evidence: ...`).

### Step 4 — Append Risk Assessment to RESEARCH.md

Check for `## Risk Assessment` heading. If absent, append at end of file:

```markdown

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| {Risk 1 — concrete, not placeholder} | Low|Medium|High | Low|Medium|High | {Mitigation specific to this risk} |
| {Risk 2 — concrete} | ... | ... | ... |
```

Source the risks from:
- USE_CASES.md edge cases (each edge case → likely risk)
- Architectural constraints in RESEARCH.md `## Project Context` (tech debt, external dependencies, migration burden)
- USER_STORIES.md "Independent Test" sections — failure modes of each test

Rules:
- Exactly four columns: `Risk | Likelihood | Impact | Mitigation`.
- ≥2 rows with non-placeholder content.
- Likelihood and Impact are one of `Low`, `Medium`, `High`.
- Mitigation is a concrete action (not `TBD`, `-`, or `{placeholder}`).

If heading already exists with ≥2 valid rows, do not touch it — exit with a log note.

### Step 5 — Verify against form-guards (optional dry-run)

Simulate the form-guards to catch any format slip before returning control. This is informational, not a hard prerequisite:

```bash
# dry-run parser on the generated content
npx tsx extensions/specs-workflow/tools/specs-validator/spec-form-parsers.ts \
  --check user-stories .specs/{slug}/USER_STORIES.md
```

If any block is flagged, correct in place and re-emit.

## Jira-mode preservation

When `JIRA_SOURCE.md` is present in `.specs/{slug}/`:

- Preserve any existing `Jira quote: "..."` / `Evidence: {file}` lines byte-for-byte. Never rewrite.
- When creating new stories derived from Jira imperatives, include a `Jira quote: "{verbatim}"` line below the `As a ...` sentence.
- For Risk Assessment rows derived from Jira comments, tag the row with a trailing `_Jira: {fragment}_` marker.

## Contract (return value to caller)

After all edits, emit a JSON block on stdout so the parent skill can audit completeness:

```json
{
  "stories_written": 4,
  "stories_priority": { "P1": 2, "P2": 1, "P3": 1 },
  "risks_added": 3,
  "risks_total": 5,
  "files_touched": ["USER_STORIES.md", "RESEARCH.md"],
  "jira_mode": false
}
```

## Fallback

- If the spec is not v3 (version missing or < 3) — exit with message `spec not v3; discovery-forms no-op` and no file writes.
- If USE_CASES.md is empty or missing — skip Step 4 (Risk Assessment sourcing) and emit placeholder risks flagged for user review in the JSON summary.
- If AskUserQuestion is unavailable (non-interactive session) — proceed with best-effort inference; mark the JSON summary with `"needs_user_review": true`.
