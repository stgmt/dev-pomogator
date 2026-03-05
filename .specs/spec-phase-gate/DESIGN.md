# Design

## Реализуемые требования

- [FR-1: PreToolUse Hook Registration](FR.md#fr-1-pretooluse-hook-registration)
- [FR-2: Stdin Parsing](FR.md#fr-2-stdin-parsing)
- [FR-3: Spec Path Detection](FR.md#fr-3-spec-path-detection)
- [FR-4: File-to-Phase Mapping](FR.md#fr-4-file-to-phase-mapping)
- [FR-5: Phase Gate Decision](FR.md#fr-5-phase-gate-decision)
- [FR-6: Deny Response Format](FR.md#fr-6-deny-response-format)
- [FR-7: Fail-Open Error Handling](FR.md#fr-7-fail-open-error-handling)
- [FR-8: Shared Phase Constants Module](FR.md#fr-8-shared-phase-constants-module)
- [FR-9: Phase Status Injection](FR.md#fr-9-phase-status-injection)
- [FR-10: Partial Implementation Detection](FR.md#fr-10-partial-implementation-detection)
- [FR-11: Task Atomicity Check](FR.md#fr-11-task-atomicity-check)
- [FR-12: FR Decomposition Rule](FR.md#fr-12-fr-decomposition-rule)
- [FR-13: AC Scope Match Rule](FR.md#fr-13-ac-scope-match-rule)
- [FR-14: Extension Manifest Update](FR.md#fr-14-extension-manifest-update)

## 3-Layer Architecture

```
                         User Prompt
                              |
                              v
  +---------------------------------------------------------+
  | LAYER 2: UserPromptSubmit (validate-specs.ts)           |
  |                                                         |
  |  1. Read .progress.json for each spec                   |
  |  2. Inject phase status banner:                         |
  |     [specs-validator] Phase: Discovery                  |
  |     Allowed: USER_STORIES.md, USE_CASES.md, RESEARCH.md |
  |     Blocked: FR.md, NFR.md, TASKS.md, ...               |
  |  3. Existing @featureN validation (unchanged)           |
  +---------------------------------------------------------+
                              |
                         Claude thinks
                              |
                              v
  +---------------------------------------------------------+
  | LAYER 1: PreToolUse (phase-gate.ts)                     |
  |                                                         |
  |  Triggered on: Write | Edit                             |
  |  1. Parse stdin -> extract file_path                    |
  |  2. Check if path is inside .specs/                     |
  |  3. Extract feature slug + filename                     |
  |  4. Read .progress.json                                 |
  |  5. Map filename -> phase                               |
  |  6. Check if phase is allowed                           |
  |  7. Deny (exit 2) or Allow (exit 0)                    |
  +---------------------------------------------------------+
                              |
                         Tool executes
                              |
                              v
  +---------------------------------------------------------+
  | LAYER 3: Audit (audit-spec.ps1) + Rules                |
  |                                                         |
  |  New checks:                                            |
  |  - PARTIAL_IMPL: FR "NOT IMPLEMENTED" + task [x]        |
  |  - TASK_ATOMICITY: task references >3 files             |
  |  - FR_SPLIT_CONSISTENCY: decomposed FR without siblings |
  |  - AC_SCOPE_MATCH: AC covers more than parent FR        |
  |                                                         |
  |  New rules in specs-management.md:                      |
  |  - FR Decomposition with AC/BDD/Task per variant        |
  |  - Task FR-integrity (1 task = 1 FR scope)              |
  |  - AC scope must match FR scope                         |
  +---------------------------------------------------------+
```

## Компоненты

- `phase-constants.ts` -- shared constants module extracted from validate-specs.ts
- `phase-gate.ts` -- PreToolUse hook, blocks Write/Edit to future-phase spec files
- `validate-specs.ts` -- enhanced UserPromptSubmit hook, imports from phase-constants.ts, injects phase status
- `audit-spec.ps1` -- extended with 4 new checks (PARTIAL_IMPL, TASK_ATOMICITY, FR_SPLIT_CONSISTENCY, AC_SCOPE_MATCH)

## Где лежит реализация

- Hook source: `extensions/specs-workflow/tools/specs-validator/phase-gate.ts`
- Shared module: `extensions/specs-workflow/tools/specs-validator/phase-constants.ts`
- Existing hook: `extensions/specs-workflow/tools/specs-validator/validate-specs.ts`
- Audit script: `extensions/specs-workflow/tools/specs-generator/audit-spec.ps1`
- Extension manifest: `extensions/specs-workflow/extension.json`
- Hook registration: `.claude/settings.json`

## Директории и файлы

- `extensions/specs-workflow/tools/specs-validator/` -- all TypeScript hook files
- `extensions/specs-workflow/tools/specs-generator/` -- PowerShell audit/scaffold scripts
- `.claude/settings.json` -- hook registration
- `.claude/rules/specs-management.md` -- updated rules
- `.claude/rules/pomogator/specs-management.md` -- mirrored rules

## Phase-Gate Hook Flow (phase-gate.ts)

```
stdin (JSON)
  |
  v
Parse JSON
  |-- parse error --> exit(0)  [fail-open]
  |
  v
Extract tool_input.file_path (Write) or tool_input.file_path (Edit)
  |
  v
Does path contain ".specs/" ?
  |-- NO --> exit(0)  [pass-through, not a spec file]
  |
  v
Extract: featureSlug, filename
  e.g. ".specs/my-feature/FR.md" -> slug="my-feature", file="FR.md"
  |
  v
Read .specs/<slug>/.progress.json
  |-- not found --> exit(0)  [fail-open, old/manual spec]
  |-- parse error --> exit(0)  [fail-open]
  |
  v
Map filename -> targetPhase (PHASE_FILES lookup)
  |-- not found --> exit(0)  [unknown file, e.g. SCHEMA.md]
  |
  v
Determine currentPhase from progress.currentPhase
  |
  v
Is targetPhase <= currentPhase? (by PHASE_ORDER index)
  |-- YES --> exit(0)  [allow: current or previous phase]
  |
  v
Is the current phase stopConfirmed?
  |-- YES --> Is targetPhase == currentPhase + 1?
  |           |-- YES --> exit(0)  [allow: next phase unlocked]
  |           |-- NO --> continue checking chain
  |-- NO --> DENY
  |
  v
Check full chain: all phases from current to targetPhase-1 must be stopConfirmed
  |-- all confirmed --> exit(0)  [allow]
  |-- any not confirmed --> DENY
  |
  v
DENY:
  stdout: { hookSpecificOutput: { permissionDecision: "deny", ... } }
  exit(2)
```

## File-to-Phase Mapping

| Phase | Files | STOP Point |
|-------|-------|------------|
| Discovery | `USER_STORIES.md`, `USE_CASES.md`, `RESEARCH.md` | STOP #1 |
| Context | _(sub-check of RESEARCH.md, no additional files)_ | STOP #1.5 |
| Requirements | `REQUIREMENTS.md`, `FR.md`, `NFR.md`, `ACCEPTANCE_CRITERIA.md`, `DESIGN.md`, `FILE_CHANGES.md`, `*.feature` | STOP #2 |
| Finalization | `TASKS.md`, `README.md`, `CHANGELOG.md` | STOP #3 |

Note: `.feature` files are mapped to Requirements phase. `*.progress.json`, `validation-report.md`, `AUDIT_REPORT.md` are not phase-gated (internal/generated files).

## hookSpecificOutput Format (Deny)

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "PHASE GATE: Cannot write FR.md (Requirements phase). Current phase: Discovery. STOP #1 (Discovery) has not been confirmed. Run: spec-status.ps1 -Path \".specs/my-feature\" -ConfirmStop Discovery"
  }
}
```

Exit code: `2` (not 1 -- Claude Code convention for PreToolUse denial).

## Error Handling: Fail-Open

All error paths exit with code 0 (allow). The hook must never block legitimate work due to its own bugs.

```typescript
try {
  // main logic: phase gate check
} catch (_e) {
  // Log to stderr for diagnostics, but never block
  process.stderr.write("[phase-gate] Error: " + _e + "\n");
  process.exit(0);
}
```

Fail-open scenarios:
1. stdin parse error (invalid JSON)
2. `.progress.json` not found (manual/old spec)
3. `.progress.json` parse error (corrupted file)
4. Unknown filename (not in PHASE_FILES, e.g. SCHEMA.md)
5. Unknown tool_name (not Write/Edit)
6. Missing tool_input or file_path

## Shared Module: phase-constants.ts

Extracted from `validate-specs.ts` lines 71-91. Shared by both `phase-gate.ts` and `validate-specs.ts`.

```typescript
// phase-constants.ts

export const PHASE_FILES: Record<string, string[]> = {
  Discovery: ['USER_STORIES.md', 'USE_CASES.md', 'RESEARCH.md'],
  Context: [],
  Requirements: ['REQUIREMENTS.md', 'FR.md', 'NFR.md', 'ACCEPTANCE_CRITERIA.md',
                  'DESIGN.md', 'FILE_CHANGES.md'],
  Finalization: ['TASKS.md', 'README.md', 'CHANGELOG.md'],
};

export const PHASE_ORDER = ['Discovery', 'Context', 'Requirements', 'Finalization'] as const;

export const STOP_LABELS: Record<string, string> = {
  Discovery: 'STOP #1',
  Context: 'STOP #1.5',
  Requirements: 'STOP #2',
  Finalization: 'STOP #3',
};

export interface PhaseState {
  completedAt: string | null;
  stopConfirmed: boolean;
  stopConfirmedAt: string | null;
}

export interface ProgressState {
  version: number;
  featureSlug: string;
  createdAt: string;
  currentPhase: string;
  phases: Record<string, PhaseState>;
}
```

## Reuse Plan

| What | From | To | Action |
|------|------|----|--------|
| `PHASE_FILES`, `PHASE_ORDER`, `STOP_LABELS` | `validate-specs.ts:71-91` | `phase-constants.ts` | Extract to shared module |
| `PhaseState`, `ProgressState` interfaces | `validate-specs.ts:46-66` | `phase-constants.ts` | Extract to shared module |
| `readProgressState()` function | `validate-specs.ts:205-214` | `phase-constants.ts` | Extract to shared module |
| stdin reading pattern | `validate-specs.ts:127-149` | `phase-gate.ts` | Copy + adapt for PreToolUse input |
| `logError()` pattern | `validate-specs.ts:110-122` | `phase-gate.ts` | Copy pattern, separate log file |
| Warning format `[specs-validator]` | `reporter.ts` | `phase-gate.ts` | Reuse prefix convention |
| `checkPhaseGate()` | `validate-specs.ts:220-253` | Keep in validate-specs.ts | Refactor to import shared constants |
| `isDisabledByConfig()` | `validate-specs.ts:154-174` | Keep in validate-specs.ts | No change needed |

### What NOT to reuse

- `findSpecsFolder()`, `findCompleteSpecs()` -- only needed by UserPromptSubmit, not by PreToolUse (PreToolUse gets exact file_path from stdin)
- `parseMdFiles()`, `parseFeatureFile()`, `matchTags()` -- @featureN validation, orthogonal to phase gating

## Phase Status Injection (Layer 2 Enhancement)

Enhanced `validate-specs.ts` output when `.progress.json` exists:

```
[specs-validator] SPEC: my-feature | Phase: Discovery | STOP #1 not confirmed
  Allowed files: USER_STORIES.md, USE_CASES.md, RESEARCH.md
  Blocked files: FR.md, NFR.md, ACCEPTANCE_CRITERIA.md, DESIGN.md, FILE_CHANGES.md, REQUIREMENTS.md, *.feature, TASKS.md, README.md, CHANGELOG.md
  Confirm: spec-status.ps1 -Path ".specs/my-feature" -ConfirmStop Discovery
```

This is advisory (exit 0), providing context before Claude even starts thinking. The PreToolUse hook (Layer 1) is the enforcement mechanism.

## Audit Checks (Layer 3)

### New checks added to audit-spec.ps1:

| Check ID | Name | Severity | Description |
|----------|------|----------|-------------|
| CHECK-9 | PARTIAL_IMPL | ERROR | FR has "NOT IMPLEMENTED" / "NE REALIZOVANO" marker but corresponding task is checked `[x]` |
| CHECK-10 | TASK_ATOMICITY | WARNING | A single task in TASKS.md references more than 3 files (violates atomic task requirement) |
| CHECK-11 | FR_SPLIT_CONSISTENCY | INFO | FR-N has sub-variants (FR-Na, FR-Nb) but sibling FR-(N+1) with similar complexity has none |
| CHECK-12 | AC_SCOPE_MATCH | WARNING | AC text covers functionality beyond its parent FR scope |

### Detection patterns:

**PARTIAL_IMPL**: Scan FR.md for markers (`НЕ РЕАЛИЗОВАНО`, `NOT IMPLEMENTED`, `PARTIAL`, `TODO: implement`). Cross-reference FR-N ID with TASKS.md checkboxes. If task `[x]` but FR has marker -- ERROR.

**TASK_ATOMICITY**: Parse TASKS.md task descriptions. Count `files:` entries per task. If count > 3 -- WARNING.

**FR_SPLIT_CONSISTENCY**: Extract all FR IDs. If `FR-4a` exists (sub-variant pattern `FR-\d+[a-z]`), check if similar-complexity FRs also have sub-variants. INFO level -- advisory only.

**AC_SCOPE_MATCH**: Compare AC heading/content keywords with parent FR keywords. If AC introduces entities/actions not present in FR -- WARNING.

## BDD Test Infrastructure

N/A -- This feature modifies tool/hook code and audit scripts. It does not create or modify test data, does not require setup/teardown hooks, and does not use shared fixtures. Classification: `TEST_DATA_NONE`.

BDD scenarios in `spec-phase-gate.feature` test the hook behavior via feature-level integration scenarios (file system setup + hook invocation + exit code/output assertions). No custom BDD hooks needed.

## Algorithm: phase-gate.ts Main Logic

1. Read all stdin into a string buffer
2. Parse as JSON; on error -> `exit(0)`
3. Extract `tool_name`; if not `Write` or `Edit` -> `exit(0)`
4. Extract `file_path` from `tool_input.file_path`; if missing -> `exit(0)`
5. Normalize path separators (Windows backslash to forward slash)
6. Match path against `.specs/<slug>/<filename>` pattern; if no match -> `exit(0)`
7. Read `.specs/<slug>/.progress.json`; if not found or parse error -> `exit(0)`
8. Look up `filename` in `PHASE_FILES` to get `targetPhase`; if not found -> `exit(0)`
9. Handle `.feature` file: if filename ends with `.feature`, set `targetPhase = 'Requirements'`
10. Get `currentPhaseIdx` = index of `progress.currentPhase` in `PHASE_ORDER`
11. Get `targetPhaseIdx` = index of `targetPhase` in `PHASE_ORDER`
12. If `targetPhaseIdx <= currentPhaseIdx` -> `exit(0)` (current or past phase)
13. Check chain: for each phase from `currentPhaseIdx` to `targetPhaseIdx - 1`, verify `stopConfirmed === true`
14. If all confirmed -> `exit(0)` (phase unlocked)
15. Otherwise -> output deny JSON, `exit(2)`

## Security Considerations

- The hook reads `.progress.json` as read-only; it never modifies state
- Path extraction uses `path.resolve` + relative check to prevent path traversal in slug detection
- The hook does NOT block `Bash` tool -- only `Write` and `Edit` (consistent with Claude Code convention; Bash blocking would need separate `no-bash-file-write` rule from agentlint pattern)
- Fail-open design means a bug in the hook cannot cause a denial-of-service for the user
