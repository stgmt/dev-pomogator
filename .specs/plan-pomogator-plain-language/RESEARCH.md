# Research

## Контекст

Подробные планы plan-pomogator на 9 секций (Context / FR / AC / NFR / Todos / File Changes / ...) технически правильны и нужны AI для исполнения, но человеку их физически тяжело ревьюить. Глаза разбегаются, и непонимание задачи AI обнаруживается слишком поздно — когда AI уже потратил усилия на FR-7 / AC-12 под неправильную интерпретацию. Цель ресерча — найти минимально-инвазивный способ добавить human-friendly summary секцию в шапку каждого монстр-плана.

## Источники

- `extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts` — структура валидатора
- `extensions/plan-pomogator/tools/plan-pomogator/template.md` — текущий 9-секционный шаблон
- `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts` — PreToolUse хук
- `.claude/rules/plan-pomogator/plan-pomogator.md` — текущее правило структуры планов
- Скриншоты пользователя с примером желаемого UX
- Plan agent feedback (отвергнут пользователем — см. Rejected Alternatives ниже)

## Decisions

### D-1: Секция top-level, не subsection

Выбран `## 💬 Простыми словами` как самостоятельная top-level секция первой в плане (перед `## 🎯 Context`), а не subsection внутри Context. Обоснование: пользователь явно требует видимости в шапке. Subsection прячет контент.

### D-2: Phase 1 mandatory error, не Phase 4 warning

Секция добавляется в `REQUIRED_SECTIONS` массив `validate-plan.ts:20-29` первой записью. Отсутствие → Phase 1 error → ExitPlanMode заблокирован. Обоснование: пользователь явно сказал "ВСЕГДА добавлять". Soft enforcement через Phase 4 warning не подходит.

### D-3: Три подсекции, не пять

Секция содержит три подсекции: **Сейчас (как работает)** / **Как должно быть (как я понял)** / **Правильно понял?**. Не пять как в исходном пользовательском скриншоте. Обоснование:
- "Что не нравится" перекрывается с `### Extracted Requirements` в Context — DRY violation
- "Где затык" нужен только при неуверенности AI и складывается в "Правильно понял?" как варианты A/B/C — конситентно с UC-3

### D-4: validateHumanSummarySection включена в MVP

Дополнительная функция `validateHumanSummarySection(lines, indices, errors)` проверяет что секция не пустая (не только heading). Включена в MVP, не отложена. Обоснование: пустая секция (только заголовок) технически проходит REQUIRED_SECTIONS check, но ломает UX — ревьюер не увидит контент. Функция простая (~10 строк) и даёт реальную ценность.

### D-5: No transcript reading

Plan-gate.ts НЕ читает `transcript_path` для верификации что AI вывел секцию в чат как текст. Полагаемся на: (1) Phase 1 mandatory section в файле как audit trail, (2) явная инструкция в правиле plan-pomogator.md "AI ОБЯЗАН выводить в чат перед ExitPlanMode". См. Rejected Alternative C.

### D-6: Major version bump 2.0.0 BREAKING

Существующие планы пользователей без секции сломаются на ExitPlanMode validation. Это явный trade-off: UX > backward compat. Митигация — actionable hint с шаблоном секции для копипасты + явная BREAKING CHANGE запись в CHANGELOG.md.

## Rejected Alternatives

### (A) Subsection inside Context (`### Понимание задачи`)

Предложено Plan agent. Аргумент: backward compatible, не ломает 8-секционный контракт. **Отвергнуто пользователем**: subsection прячет human-friendly content внутри Context — пользователь не увидит при беглом просмотре. Top-level в шапке — единственный способ обеспечить first-visible. Severity: HIGH.

### (B) Phase 4 warning (non-blocking)

Предложено Plan agent для backward compat. Аргумент: soft rollout, не ломает существующие планы. **Отвергнуто пользователем**: "ВСЕГДА добавлять" подразумевает strict enforcement. Phase 4 warning AI может проигнорировать. Severity: MEDIUM (функционально эквивалентно при правильном AI поведении, но Phase 1 даёт жёсткие гарантии).

### (C) Transcript-based enforcement

Изначальная идея — читать `transcript_path` в plan-gate.ts для верификации факта вывода в чат. **Отвергнуто Plan agent**: "(a) fragile parsing of a format Claude Code owns and may change, (b) every check must be fail-open anyway, which gives near-zero enforcement value, (c) the rule-based instruction is stronger than you think". Severity: HIGH (fragile design, нарушение separation of concerns).

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Impacts |
|------|------|---------|---------|
| plan-pomogator | `.claude/rules/plan-pomogator/plan-pomogator.md` | Структура планов 9 секций + Pre-flight Checklist | FR-3 (обновление правила: добавить Two-Stage Workflow секцию + новую секцию в обязательную структуру) |
| plan-freshness | `.claude/rules/plan-pomogator/plan-freshness.md` | Запрет копирования секций между планами | NFR-Reliability (план должен быть свежим даже после добавления новой первой секции) |
| post-edit-verification | `.claude/rules/pomogator/post-edit-verification.md` | После КАЖДОГО изменения кода: build, copy, test, screenshot | TASKS.md Last Phase verify step |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker тесты 7-12 мин — НЕ блокировать сессию | TASKS.md verify steps (background runs) |
| claude-md-glossary | `.claude/rules/claude-md-glossary.md` | При добавлении/удалении правил обновлять CLAUDE.md | NIL (только редактируем существующее правило, не добавляем новое) |
| specs-management | `.claude/rules/specs-workflow/specs-management.md` | 4-phase spec creation workflow с STOPs | Текущий процесс создания этой спеки |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json — source of truth, обновлять при изменениях | FR-7 (bump version 1.8.0 → 2.0.0) |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | В `extensions/**/*.ts` relative imports должны использовать `.ts` | DESIGN.md (validateHumanSummarySection функция в validate-plan.ts) |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты ОБЯЗАНЫ быть интеграционными | TASKS.md Phase 0 (.feature first), Phase 3 (e2e tests) |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| REQUIRED_SECTIONS массив | `extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts:20-29` | Декларативный список 8 обязательных секций с regex | **Точка модификации**: добавить новую запись первой |
| validateSections функция | `extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts:74-100` | Валидация наличия секций + относительный order check `if (index < lastIndex)` (line 85) | Логика автоматически работает для новой секции — менять не нужно, только массив |
| validateContextContent функция | `extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts:372-413` | Паттерн валидации содержимого секции (findIndex + slice + addError) | Шаблон для новой `validateHumanSummarySection` функции (D-4) |
| plan-gate.ts denyAndExit | `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts:212-223` + Phase 1 call site `:275-278` | Автоматически форматирует Phase 1 errors с line numbers и hints | НИКАКИХ изменений не нужно — новая секция автоматически попадёт в deny message |
| template.md embedding | `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts` | plan-gate читает template.md и embedит в deny | Обновление template.md автоматически попадёт в deny output |
| template.md шаблон | `extensions/plan-pomogator/tools/plan-pomogator/template.md` | Текущий шаблон с 9 секциями (Context первая) | Точка модификации: добавить `## 💬 Простыми словами` первой секцией |
| valid.plan.md фикстура | `extensions/plan-pomogator/tools/plan-pomogator/fixtures/valid.plan.md` | Эталонный валидный план для e2e тестов | Точка модификации: добавить новую секцию первой чтобы тесты прошли |
| requirements.md canonical spec | `extensions/plan-pomogator/tools/plan-pomogator/requirements.md` | Формальное описание структуры планов | Точка модификации: документировать новую обязательную секцию |
| e2e тесты валидатора | `tests/e2e/plan-validator.test.ts` | Тесты validateSections, validateRequirements, validateTodos и т.д. | Точка модификации: добавить тесты для новой секции (3 кейса: missing / empty / valid) |
| BDD сценарии PLUGIN007 | `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` | 42+ сценариев для всех аспектов plan-pomogator | Точка модификации: добавить минимум 6 новых сценариев PLUGIN007_43+ |
| analyze-features.ts | `extensions/specs-workflow/tools/specs-generator/analyze-features.ts` | Анализ существующих .feature, Step Dictionary, следующий свободный номер | Использование при создании нового .feature файла спеки и BDD сценариев |
| .specs/personal-pomogator/ | `.specs/personal-pomogator/` | Эталонная спека на 17 файлов | Стилистический референс для структуры файлов |

### Architectural Constraints Summary

Подробное обоснование критических ограничений — см. **Decisions** (D-1..D-6) и **Rejected Alternatives** (A/B/C). TL;DR:

- **Top-level не subsection** (D-1) — override Plan agent recommendation в пользу UX visibility
- **Phase 1 mandatory** (D-2) — override Plan agent recommendation в пользу strict enforcement
- **Три подсекции** (D-3) — упрощение из 5 пользовательских + DRY с Extracted Requirements
- **validateHumanSummarySection в MVP** (D-4) — простая функция для catching empty section
- **No transcript reading** (D-5) — fragile, fail-open даёт near-zero enforcement
- **Major version 2.0.0** (D-6) — breaking change accepted in exchange for UX
- **Реализация работает out of the box благодаря relative order check** (validate-plan.ts:85) — единственная code change это ОДНА запись в REQUIRED_SECTIONS массиве + новая функция validateHumanSummarySection (~10 строк) + обновление template/fixture/rule/manifest/tests
