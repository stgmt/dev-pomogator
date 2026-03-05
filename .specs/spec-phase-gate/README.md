# Spec Phase Gate

Anti-hallucination architecture for the `/create-spec` workflow: physically blocks Claude from writing future-phase spec files until the current STOP point is confirmed.

**Status:** In Progress

## 3-Layer Architecture

```
Layer 2 (UserPromptSubmit)   -- advisory: inject phase status into prompt
Layer 1 (PreToolUse)         -- enforcement: deny Write/Edit to future-phase files
Layer 3 (Audit + Rules)      -- retrospective: detect partial impl, FR split gaps, AC scope mismatch
```

- **Layer 1 -- PreToolUse Hook** (`phase-gate.ts`): Intercepts Write/Edit tool calls for `.specs/` files, reads `.progress.json`, blocks writes to files belonging to unconfirmed phases (exit code 2). Fail-open on errors.
- **Layer 2 -- UserPromptSubmit Enhancement** (`validate-specs.ts`): Injects phase status banner (current phase, allowed/blocked files) into each prompt so Claude has context before acting.
- **Layer 3 -- Audit Checks + Rules** (`audit-spec.ps1`, `specs-management.md`): 4 new audit checks (PARTIAL_IMPL, TASK_ATOMICITY, FR_SPLIT_CONSISTENCY, AC_SCOPE_MATCH) and 3 new rules (FR Decomposition, Task Completion Integrity, AC Scope Match).

## Feature Groups

| Tag | Name | Scope |
|-----|------|-------|
| @feature1 | PreToolUse Hook | `phase-gate.ts`, `phase-constants.ts`, extension.json, settings.json |
| @feature2 | Phase Status Injection | `validate-specs.ts`, `create-spec.md` |
| @feature3 | Audit Checks | `audit-spec.ps1` (4 new checks) |
| @feature4 | Spec Quality Rules | `specs-management.md` (3 new rules) |

## Spec Files

| File | Description |
|------|-------------|
| [USER_STORIES.md](USER_STORIES.md) | 4 user stories (one per feature group) |
| [USE_CASES.md](USE_CASES.md) | 8 use cases (happy path + edge cases) |
| [RESEARCH.md](RESEARCH.md) | Technical research, 9 sources, project context analysis |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Traceability matrix: 14 FR, 14 AC, 10 NFR |
| [FR.md](FR.md) | 14 functional requirements (FR-1..FR-14) |
| [NFR.md](NFR.md) | Non-functional: Performance, Reliability, Usability |
| [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | 14 acceptance criteria in EARS format |
| [DESIGN.md](DESIGN.md) | 3-layer architecture, hook flow, shared module, audit checks |
| [TASKS.md](TASKS.md) | TDD tasks: Phase 0 (Red) + Phases 1-5 (Green + Refactor) |
| [FILE_CHANGES.md](FILE_CHANGES.md) | 9 files: 2 create, 7 edit |
| [CHANGELOG.md](CHANGELOG.md) | Change history |
| [spec-phase-gate.feature](spec-phase-gate.feature) | 23 BDD scenarios across 4 feature groups |

## Where Implementation Lives

- **Hook source:** `extensions/specs-workflow/tools/specs-validator/phase-gate.ts`
- **Shared module:** `extensions/specs-workflow/tools/specs-validator/phase-constants.ts`
- **Existing hook:** `extensions/specs-workflow/tools/specs-validator/validate-specs.ts`
- **Audit script:** `extensions/specs-workflow/tools/specs-generator/audit-spec.ps1`
- **Extension manifest:** `extensions/specs-workflow/extension.json`
- **Hook registration:** `.claude/settings.json`
- **Rules:** `.claude/rules/specs-management.md`, `.claude/rules/pomogator/specs-management.md`
