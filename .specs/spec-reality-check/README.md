# Spec Reality Check

Skill `spec-reality-check` — автоматическая проверка соответствия документов спеки реальности кода и файловой системы. Закрывает gap между `audit-spec.ts` (внутренняя согласованность) и реальным состоянием репозитория.

## Ключевые идеи

- **Двойной автотриггер.** Description matching (4 lifecycle-операции: create / modify / supplement / implement) + PreToolUse hook на ExitPlanMode — двойная гарантия что drift поймается до старта работы.
- **Шесть проверок.** FC_CREATE_EXISTS / FC_EDIT_MISSING / FC_DELETE_MISSING / NARRATIVE_PATH_MISSING / CODE_DRIFT_FR_ALREADY_DONE / TASKS_FC_CONSISTENCY покрывают основные классы drift'а обнаруженные при ручном аудите canonical-plugin спеки.
- **Две интеграции.** spec-review category 15 (curative — ловит drift в существующих спеках при ConfirmStop) + create-spec Phase 3 Finalization (preventative — drift не возникает в новых спеках).

## Где лежит реализация

- **App-код**: `.claude/skills/spec-reality-check/scripts/verify.ts` + `verify-hook.ts`
- **Wiring**: `extensions/specs-workflow/extension.json` (skill + hook registration, version 1.20.0 → 1.21.0)
- **Installed dogfood**: `.dev-pomogator/tools/spec-reality-check/`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 6 user stories с EARS scenarios
- [USE_CASES.md](USE_CASES.md) — 7 UCs + 3 edge cases
- [RESEARCH.md](RESEARCH.md) — Risk Assessment + Project Context + Technical findings
- [REQUIREMENTS.md](REQUIREMENTS.md) — Traceability matrix + CHK rows
- [FR.md](FR.md) — 15 FRs
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 15 EARS AC
- [DESIGN.md](DESIGN.md) — 5 Key Decisions + BDD Test Infrastructure
- [FILE_CHANGES.md](FILE_CHANGES.md) — 26 file actions
- [TASKS.md](TASKS.md) — TDD-ordered Phase 0..5 + Phase 6 (shipped)
- [spec-reality-check.feature](spec-reality-check.feature) — 14 BDD scenarios
- [CHANGELOG.md](CHANGELOG.md) — version history
