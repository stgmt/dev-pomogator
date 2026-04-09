# Plan Pomogator Plain Language

Добавление обязательной top-level секции `## 💬 Простыми словами` в шапку каждого монстр-плана plan-pomogator. Секция содержит три подсекции (Сейчас / Как должно быть / Правильно понял?) с интерпретацией задачи живым языком — для быстрого human review без чтения 9 технических секций (Context / FR / AC / NFR / Todos / File Changes / ...). AI обязан выводить содержимое секции в чат как обычное сообщение перед ExitPlanMode и дождаться подтверждения от пользователя.

## Ключевые идеи

- **Top-level секция, не subsection** — позиция первая в плане (перед `## 🎯 Context`) для гарантированной видимости при беглом просмотре
- **Phase 1 mandatory error** — добавление новой записи в REQUIRED_SECTIONS массив `validate-plan.ts:20-29` ПЕРВОЙ; отсутствие секции блокирует ExitPlanMode
- **Two-Stage Plan Presentation Workflow** — AI выводит секцию в чат как обычный текст ПЕРЕД ExitPlanMode, ждёт подтверждения от пользователя в свободной форме, потом пишет план-файл

## Где лежит реализация

- **App-код**: `extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts` (REQUIRED_SECTIONS:20-29, validateSections:74-100, validateContextContent:372-413 как паттерн для новой validateHumanSummarySection)
- **Шаблон**: `extensions/plan-pomogator/tools/plan-pomogator/template.md`
- **Фикстура**: `extensions/plan-pomogator/tools/plan-pomogator/fixtures/valid.plan.md`
- **Правило**: `.claude/rules/plan-pomogator/plan-pomogator.md`
- **Canonical spec**: `extensions/plan-pomogator/tools/plan-pomogator/requirements.md`
- **Манифест**: `extensions/plan-pomogator/extension.json`

## Status

**Phase 3 / READY FOR IMPLEMENTATION** — спека полная (USER_STORIES, USE_CASES, RESEARCH с Decisions/Rejected Alternatives, FR (8), NFR, ACCEPTANCE_CRITERIA (8 EARS), REQUIREMENTS traceability, DESIGN с TEST_DATA_NONE classification, FILE_CHANGES (8 файлов реализации), .feature (6 BDD сценариев PLUGIN007_43..48), TASKS (7 phases TDD), CHANGELOG, README). Phase 3+ Audit ещё не запущен.

Реализация — отдельный план/трек после готовности этой спеки.

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 5 stories: ревьюер плана, AI агент, ревьюер с поправкой, ревьюер при неоднозначности, мейнтейнер dev-pomogator
- [USE_CASES.md](USE_CASES.md) — 6 UC: happy path, correction loop, A/B/C variants, backward compat breaking, edge case empty section, edge case wrong order
- [RESEARCH.md](RESEARCH.md) — Decisions D-1..D-6, Rejected Alternatives (subsection / Phase 4 warning / transcript reading), Project Context & Constraints
- [FR.md](FR.md) — 8 функциональных требований
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — EARS формат для каждого FR
- [DESIGN.md](DESIGN.md) — точное описание модификации REQUIRED_SECTIONS массива + 10-step Алгоритм + BDD Test Infrastructure TEST_DATA_NONE
- [FILE_CHANGES.md](FILE_CHANGES.md) — 8 файлов реализации каждый отдельной строкой
- [TASKS.md](TASKS.md) — TDD-порядок: 7 phases (Phase -1 Infrastructure N/A → Phase 0 BDD → Phase 1-4 implementation → Phase 5 refactor)
- [plan-pomogator-plain-language.feature](plan-pomogator-plain-language.feature) — 6 BDD сценариев PLUGIN007_43..48
