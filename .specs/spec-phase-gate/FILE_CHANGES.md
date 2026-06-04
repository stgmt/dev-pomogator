# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/specs-workflow/tools/specs-validator/phase-constants.ts` | create | [FR-8](FR.md#fr-8-audit-обнаруживает-partial-implementation-feature3): Shared module with PHASE_FILES, PHASE_ORDER, STOP_LABELS, PhaseState, ProgressState, readProgressState() extracted from validate-specs.ts |
| `extensions/specs-workflow/tools/specs-validator/phase-gate.ts` | create | [FR-1](FR.md#fr-1-pretooluse-hook-блокирует-запись-в-файлы-будущих-фаз-feature1), [FR-2](FR.md#fr-2-hook-читает-состояние-из-progressjson-feature1), [FR-3](FR.md#fr-3-hook-возвращает-deny-с-exit-code-2-при-блокировке-feature1), [FR-4](FR.md#fr-4-hook-работает-в-режиме-fail-open-feature1), [FR-5](FR.md#fr-5-hook-пропускает-файлы-вне-specs-feature1), [FR-6](FR.md#fr-6-feature-файл-привязан-к-фазе-requirements-feature1), [FR-7](FR.md#fr-7-userpromptsubmit-hook-инжектирует-статус-фазы-feature2): PreToolUse hook that blocks Write/Edit to future-phase spec files |
| `extensions/specs-workflow/tools/specs-validator/validate-specs.ts` | edit | [FR-8](FR.md#fr-8-audit-обнаруживает-partial-implementation-feature3), [FR-9](FR.md#fr-9-audit-проверяет-task-fr-atomicity-feature3): Import constants from phase-constants.ts, add phase status banner injection |
| `extensions/specs-workflow/tools/specs-generator/audit-spec.ts` | edit | [FR-10](FR.md#fr-10-audit-проверяет-fr-split-consistency-feature3), [FR-11](FR.md#fr-11-audit-проверяет-bdd-scenario-scope-gap-feature3): Add 4 new checks (PARTIAL_IMPL, TASK_ATOMICITY, FR_SPLIT_CONSISTENCY, AC_SCOPE_MATCH). Migrated from .ps1 to .ts during implementation. |
| `extensions/specs-workflow/extension.json` | edit | [FR-14](FR.md#fr-14-правило-ac-scope-match-feature4): Register PreToolUse hook in hooks.claude, add phase-constants.ts and phase-gate.ts to toolFiles, bump version |
| `.claude/skills/create-spec/SKILL.md` | edit | [FR-9](FR.md#fr-9-audit-проверяет-task-fr-atomicity-feature3): Phase-aware instructions reminding Claude to check phase status before writing. (Originally planned as `.claude/commands/create-spec.md`; converted to a skill bundle during implementation — same content, better discovery via skill registry.) |
| `.claude/settings.json` | edit | [FR-1](FR.md#fr-1-pretooluse-hook-блокирует-запись-в-файлы-будущих-фаз-feature1): Register PreToolUse hook with matcher "Write\|Edit" pointing to phase-gate.ts |
| `extensions/specs-workflow/tools/specs-validator/audit-checks.ts` | edit | [FR-12](FR.md#fr-12-правило-fr-variant-decomposition-feature4), [FR-13](FR.md#fr-13-правило-task-completion-integrity-feature4): 3 new rules (FR Decomposition, Task FR-integrity / TASK_ATOMICITY, AC scope match) implemented as programmatic audit checks (FR_SPLIT_CONSISTENCY, TASK_ATOMICITY, AC_SCOPE_MATCH). Originally planned as `.md` rules under `.claude/rules/specs-management.md` + mirror — replaced by machine-enforced checks so violations are caught by `audit-spec.ts` automatically. |
| `.specs/spec-phase-gate/spec-phase-gate.feature` | create | BDD scenarios for phase-gate behaviour (22 scenarios). |
| `tests/features/step_definitions/spec-phase-gate.steps.ts` | create | Reqnroll-style step definitions for the BDD scenarios. (Iteration deferred this — concrete coverage lives in `tests/e2e/phase-gate.test.ts` with the same scenario IDs.) |
