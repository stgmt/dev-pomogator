# File Changes

Список файлов для реализации фичи `skill-listing-budget` (как отдельная extension).

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/skill-listing-budget/extension.json` | create | Manifest plugin-а: tool registration + SessionStart hook + postInstall hook |
| `extensions/skill-listing-budget/README.md` | create | User-facing README для plugin folder (что делает, как откатить, гарантии) |
| `extensions/skill-listing-budget/tools/skill-listing-budget/apply_skill_budget.ts` | create | Self-contained tool — [FR-1](FR.md#fr-1-запись-skilllistingbudgetfraction-10-в-claudesettingsjson)..[FR-3](FR.md#fr-3-bump-существующего-значения--10) логика, idempotent + atomic + fail-open |
| `extensions/skill-listing-budget/tools/skill-listing-budget/README.md` | create | Короткий pointer на родительский README |
| `tests/e2e/skill-listing-budget.test.ts` | create | 10 integration тестов + 1 e2e через `runInstaller` |
| `tests/features/core/CORE023_skill-listing-budget.feature` | create | BDD сценарии 1:1 mapping с тестами |
| `.specs/skill-listing-budget/skill-listing-budget.feature` | edit | Source-of-truth для CORE023 BDD scenarios |
| `.specs/skill-listing-budget/CHANGELOG.md` | edit | История изменений спеки |
| `.specs/skill-listing-budget/README.md` | edit | Spec-level README |
| `.specs/skill-listing-budget/TASKS.md` | edit | Task board (Phase 3) |
| `src/installer/skill-budget.ts` | NOT NEEDED | Логика жила в src/ кратко; перенесена в extension. Удалена |
| `src/installer/index.ts` | NOT NEEDED | Inline вызов удалён — extension сам зарегистрирует postInstall + SessionStart hooks |
| `src/installer/report.ts` | NOT NEEDED | Метод `recordSkillBudget()` удалён — extension пишет в stderr |
