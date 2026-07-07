---
name: task-board-forms
description: >
  Enriches TASKS.md with Done When / Status / Est fields per task and regenerates
  the ## Task Summary Table header via spec-status.ts -Format task-table. Idempotent
  (replaces auto-generated block between markers). Called by create-spec Phase 3
  (Finalization) step 1b. Returns JSON summary of tasks enriched.
allowed-tools: mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__apply_spec_change, mcp__dev-pomogator-specs__propose_spec_change, Bash, AskUserQuestion
---

# Task Board Forms

> **spec-authoring-steer compliance:** when writing a full `{ content }` document via `apply_spec_change`, include `[skip-spec-steer: task-board-forms autofill]` in the `reason` — this marks the write as sanctioned automation so the steer hook does not flag it as hand-authoring (targeted `old_string`/`new_string` edits need no marker).

## Mission

Fill Phase 3 finalization artifacts of a v3 spec that `task-form-guard` enforces:

- Every task block has `**Done When:**` with ≥1 `- [ ]` child checkbox (binary, observable).
- Every task title line has inline `Status: TODO|IN_PROGRESS|DONE|BLOCKED` and `Est: <N>m` tags.
- `TASKS.md` begins with a `## Task Summary Table` block rendered from all task blocks (auto-generated, bounded by HTML comment markers so re-runs replace it cleanly).

Tasks in Phase -1 (Infrastructure) are exempt from Done When by form-guard design (marked WARN not DENY). Explicit per-task waivers via `_waived: {reason}_` are respected.

## Preconditions

- `.specs/{slug}/TASKS.md` exists with at least one task block (bullet or `### 📋 \`task-id\`` form).
- `.specs/{slug}/.progress.json` has `version >= 3`.
- `.specs/{slug}/FR.md` + `ACCEPTANCE_CRITERIA.md` + `{slug}.feature` exist so Done When checkboxes can reference concrete AC / @feature scenarios.

## Inputs

- `TASKS.md` — all task blocks and their surrounding Phase headings.
- `ACCEPTANCE_CRITERIA.md` — for linking Done When checkboxes to AC IDs where possible.
- `{slug}.feature` — for linking to `@featureN` scenarios.
- `FR.md` — for task `_Requirements:_` back-references.

## Execution

> **MCP-rails (FR-39/40):** parsing TASKS.md via `spec-form-parsers.ts` and
> regenerating the table via `spec-status.ts -Format task-table` are engine-CLI
> calls (carve-out — allowed over `.specs/`). Any doc the agent reads itself
> (ACCEPTANCE_CRITERIA / {slug}.feature / FR for Done-When refs) goes through
> `read_spec_doc`, and the WRITE to TASKS.md goes through `apply_spec_change`
> ({ old_string, new_string }) — the mutation door re-checks the task form
> (Status/Est/Done When) before the disk write. Never a raw `Edit`/`Write`/`grep`
> of `.specs/`.

### Step 1 — Parse existing task blocks

Use the shared parser in `tools/specs-validator/spec-form-parsers.ts` (`parseTaskBlocks`) to get the current shape:

- Title, enclosing Phase, current Status/Est/Done When flags, waiver flag.
- Detect both formats: `- [ ] ...` bullets and `### 📋 \`task-id\`` headings.

### Step 2 — Derive Done When criteria

For each task missing Done When (and not waived, not Phase -1), synthesize 1–3 binary checkboxes from:

1. `_Requirements:_` back-ref (e.g. `FR-4`) → `[ ] FR-4 acceptance criterion met (AC-4 in ACCEPTANCE_CRITERIA.md)`.
2. `-- @featureN` tag → `[ ] @featureN scenario passes (Red → Green)`.
3. Title keywords mapped to observable outcomes:
   - "create X.ts" → `[ ] X.ts exists and exports expected API`
   - "test X" → `[ ] X test passes`
   - "update X" → `[ ] X reflects new structure (grep-verifiable)`

If the title gives no useful signal, ask the user via AskUserQuestion before falling back to a generic `[ ] Outcome verifiable`.

### Step 3 — Derive Status and Est tags

- `Status:` defaults to `TODO` for all tasks at creation. If the bullet is already `- [x]`, use `DONE`. Preserve existing `Status:` tags if present.
- `Est:` heuristic when missing:
  - Single-file bullet task → `15m`
  - Multi-file or cross-module task → `45m`
  - Integration/E2E/regression task → `90m`
  - Phase 0 BDD foundation tasks → `30m` each
- Show the estimation inline; the user can override via AskUserQuestion when skill is run interactively.

### Step 4 — Rewrite each task block

Target bullet shape:

```markdown
- [ ] {Task title} -- @featureN — Status: TODO | Est: 30m
  _Requirements: [FR-N](FR.md#fr-n-name)_
  **Done When:**
  - [ ] {Binary observable 1}
  - [ ] {Binary observable 2}
  - [ ] @featureN scenario passes
```

Target heading shape (used in Jira-mode or when task-id matters):

```markdown
### 📋 `block-picking-over-limit`
> {One-line description} — Status: TODO | Est: 45m
- **files:** `src/foo.ts` *(edit)*
- **refs:** FR-1, AC-1
- **deps:** *none*
**Done When:**
  - [ ] {Binary observable 1}
  - [ ] @feature1 scenario passes
```

> ⚠️ Маркеры РЕГИСТРО-ЗАВИСИМЫ под `task-form-guard` (spec-form-parsers.ts):
> ровно `Status:` (TODO|IN_PROGRESS|DONE|BLOCKED), `Est: <N>m`, `**Done When:**`.
> Lowercase `**status:**` / `**done when:**` guard НЕ распознаёт → DENY на Write
> (поймано ревью 2026-06-07: скилл рекомендовал форму, которую его же guard режет).

Use `apply_spec_change({ spec, doc: "TASKS.md", old_string, new_string })` (MCP-rails — not a raw Edit) to preserve unrelated content (Phase descriptions, notes, Jira trace lines): anchor `old_string` on the specific task block / table marker you're changing.

### Step 5 — Regenerate Task Summary Table

Invoke the shared script and splice its stdout into TASKS.md:

```bash
npx tsx tools/specs-generator/spec-status.ts \
  -Path .specs/{slug} \
  -Format task-table
```

Wrap the output with idempotent markers so re-runs do not append duplicates:

```markdown
# Tasks

## Task Summary Table

<!-- auto-generated by spec-status.ts -Format task-table; do not edit manually -->
| ID | Title | Status | Depends | Phase | Est. |
|----|-------|--------|---------|-------|------|
| ... | ... | ... | ... | ... | ... |
<!-- end auto-generated -->

## TDD Workflow
...
```

If the markers exist, replace the block between them. If they don't, insert the block immediately after `# Tasks` heading.

### Step 6 — Dry-run against task-form-guard

```bash
npx tsx tools/specs-validator/spec-form-parsers.ts \
  --check tasks .specs/{slug}/TASKS.md
```

Fix any flagged task blocks before returning.

## Idempotency guarantees

- Summary table block is bounded by HTML comments; re-runs replace between markers.
- Existing Done When blocks are preserved — skill only adds when missing, never replaces existing checkboxes.
- Status transitions are preserved: if a task is already `Status: DONE`, the skill does not downgrade to `TODO`.
- Est values are preserved: only filled when missing.

## Contract (return value)

```json
{
  "tasks_total": 32,
  "done_when_added": 14,
  "status_added": 9,
  "est_added": 19,
  "summary_table_regenerated": true,
  "files_touched": ["TASKS.md"],
  "waived_tasks": 2,
  "phase_minus_one_tasks_exempt": 3
}
```

## Fallback

- Spec not v3 → no-op.
- `spec-status.ts -Format task-table` fails (tool not yet updated) → skip Step 5, leave a WARN in the returned JSON (`"summary_table_regenerated": false`).
- `.specs/{slug}/{slug}.feature` missing → skip `@featureN` links in Done When checkboxes; use FR refs only.
