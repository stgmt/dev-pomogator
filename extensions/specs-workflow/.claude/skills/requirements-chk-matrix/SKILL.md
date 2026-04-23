---
name: requirements-chk-matrix
description: >
  Builds CHK traceability matrix (CHK-FR{n}-{nn} rows linked to FR + AC/@feature/UC)
  in REQUIREMENTS.md and populates ## Key Decisions with Rationale + Trade-off + Alternatives
  blocks in DESIGN.md. Called by specs-management.md Phase 2 (Requirements + Design)
  step 4b. Preserves Jira trace lines byte-for-byte. Returns JSON summary of CHKs and decisions.
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# Requirements CHK Matrix

## Mission

Fill Phase 2 traceability artifacts of a v3 spec that form-guards enforce:

- `REQUIREMENTS.md` — `## Verification Matrix` section with CHK rows formatted `CHK-FR{n}-{nn}`, each linking to an FR + (AC | @feature | UC) with a Verification Method and lifecycle Status.
- `DESIGN.md` — `## Key Decisions` section with one or more `### Decision:` blocks, each containing **Rationale:**, **Trade-off:**, **Alternatives considered:** (≥2 bullets).

Both outputs pass form-guards `requirements-chk-guard` and `design-decision-guard`.

## Preconditions

- `.specs/{slug}/FR.md` exists with `## FR-N:` headings (parseable).
- `.specs/{slug}/ACCEPTANCE_CRITERIA.md` exists with `## AC-N (FR-N)` headings.
- `.specs/{slug}/.progress.json` has `version >= 3`.
- `.specs/{slug}/DESIGN.md` exists with architecture description (even placeholder).

## Inputs

- `FR.md` — enumerate every `## FR-N:` heading; extract the title + any `@featureN` tag on the heading line.
- `ACCEPTANCE_CRITERIA.md` — enumerate `## AC-N (FR-N)` headings; pair with matching FR.
- `{slug}.feature` — read `# @featureN` comments above scenarios; map scenario IDs.
- `USE_CASES.md` — extract `## UC-N:` for CHK traces that span user-journey level.
- `DESIGN.md` — read existing components/algorithm sections to derive Key Decisions.
- `JIRA_SOURCE.md` (if present) — verbatim Jira quotes must be preserved.

## Execution

### Step 1 — Parse FR / AC / feature / UC

Run reused FR-parsing logic:

```bash
grep -E "^## FR-[0-9]+" .specs/{slug}/FR.md
grep -E "^## AC-[0-9]+ \\(FR-" .specs/{slug}/ACCEPTANCE_CRITERIA.md
grep -E "^# @feature[0-9]+" .specs/{slug}/{slug}.feature
grep -E "^## UC-[0-9]+" .specs/{slug}/USE_CASES.md
```

Build in-memory maps:
- `FRs: { N → title }` from FR.md.
- `ACs: { N → parentFrN }` from AC.md.
- `features: { N → [scenarioIds] }` from .feature.
- `UCs: { N → title }` from USE_CASES.

### Step 2 — Generate CHK rows

For each FR-N, emit at least one CHK row. Format:

| Column | Value |
|---|---|
| `CHK-ID` | `CHK-FR{n}-01`, `-02`, ... (n = FR number, nn = sequence within that FR) |
| `Requirement` | Short restatement of what is being verified (`FR-N covered by AC-N via @featureN`) |
| `Traces To` | Comma-separated: `FR-N, AC-N, @featureN, UC-N` — must include FR + at least one of {AC, @feature, UC}. |
| `Verification Method` | Exactly one of: `BDD scenario`, `Unit test`, `Manual review`, `Integration test`, `N/A`. |
| `Status` | `Draft` initially (lifecycle: `Draft → In Progress → Verified → Blocked`). |
| `Notes` | `—` or short hint (e.g. `regression PLUGIN010_03`). |

If an FR has multiple ACs, emit `CHK-FR{n}-02`, `-03`, etc. If an FR relates to non-functional concerns (NFR), emit an additional `CHK-FR{n}-NFR` row with `Verification Method: Manual review` or `Integration test`.

Write via Edit: anchor on existing `## Verification Matrix` if present, else append after `## Functional Requirements` section.

### Step 3 — Append Verification Process and Summary Counts

Below the CHK table, emit (once per REQUIREMENTS.md):

```markdown
## Verification Process

### How CHKs are verified
1. Each CHK is attached to at least one BDD scenario or unit test by its Traces To.
2. Status transitions only when the linked test passes (manual review records its result in Notes).

### Status lifecycle
`Draft → In Progress → Verified → Blocked` (regression takes Verified → Blocked with issue link in Notes).

### Review cadence
- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: ≥50% of CHKs in `In Progress`.
- Implementation end: 100% `Verified` or `Blocked` with issue link.

## Summary Counts

- Total CHKs: {N}
- Verified: {K}
- In Progress: {L}
- Draft: {M}
- Blocked: {B}
```

Counts are computed from the CHK table just written. Update the counts whenever this skill re-runs.

### Step 4 — Populate Key Decisions in DESIGN.md

Derive decisions from DESIGN.md Components / Algorithm / API sections — look for implicit choices that lack documented alternatives. Typical seeds:

- Choice of technology / framework (e.g. "why vitest, not jest?")
- Structural choices (e.g. "why one manifest per extension, not monorepo-wide?")
- Compatibility / migration decisions
- Naming conventions chosen over others

For each, emit:

```markdown
### Decision: {short, specific title — the outcome, not the question}

**Rationale:** {Why this choice is better for the current context}

**Trade-off:** {What we give up — be honest, name the specific downside}

**Alternatives considered:**
- {Alt 1} — rejected because {specific reason tied to this project, not generic}
- {Alt 2} — rejected because {specific reason}
```

Rules:
- ≥1 Decision block is required (form-guard passes files without any decisions, but Key Decisions section is strongly recommended for Phase 2).
- Each Decision **must** have all three sub-sections: Rationale, Trade-off, Alternatives considered.
- Alternatives section **must** have ≥2 `- {alt}` bullets.
- If you cannot find ≥2 alternatives, ask the user via AskUserQuestion for clarification on what else was considered.

### Step 5 — Dry-run against form-guards (optional)

```bash
npx tsx extensions/specs-workflow/tools/specs-validator/spec-form-parsers.ts \
  --check chk-rows .specs/{slug}/REQUIREMENTS.md

npx tsx extensions/specs-workflow/tools/specs-validator/spec-form-parsers.ts \
  --check decisions .specs/{slug}/DESIGN.md
```

Fix any flagged rows/blocks before returning.

## Jira-mode preservation

When `JIRA_SOURCE.md` is present:

- In CHK Notes column, append `_Jira: {fragment}_` marker when the row traces to a specific Jira imperative.
- For Decisions with Jira-sourced constraints, include `Jira quote: "..."` verbatim on a line after Rationale.
- Never delete or mutate existing `Jira imperative:`, `Jira quote:`, `Evidence:` lines anywhere in REQUIREMENTS.md or DESIGN.md.

## Contract (return value)

```json
{
  "chks_written": 14,
  "chks_per_fr": { "FR-1": 2, "FR-2": 3, "FR-3": 1, ... },
  "fr_count": 14,
  "ac_count": 8,
  "unlinked_frs": [],
  "decisions_written": 4,
  "alternatives_count_per_decision": [2, 3, 2, 4],
  "files_touched": ["REQUIREMENTS.md", "DESIGN.md"],
  "jira_mode": true
}
```

## Fallback

- If FR.md or ACCEPTANCE_CRITERIA.md is empty — emit CHK skeleton with `TBD` traces and flag `"needs_fr_first": true` in JSON; caller should re-invoke after FR is populated.
- If DESIGN.md has no architectural content yet (only Phase 2 early) — skip Step 4 and mark `"decisions_deferred": true`.
- If spec is not v3 — exit early, no-op.
