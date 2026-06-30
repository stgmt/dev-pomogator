# Design

## Реализуемые требования

- [FR-1: {Название}](FR.md#fr-1-название)
- [FR-2: {Название}](FR.md#fr-2-название)
- [FR-6: Context-menu launch entries log every invocation](FR.md#fr-6-context-menu-launch-entries-log-every-invocation)
- [FR-7: Trust auto-grant before bypass-permissions launch](FR.md#fr-7-trust-auto-grant-before-bypass-permissions-launch)

## Компоненты

- `{Компонент 1}` — {описание}
- `{Компонент 2}` — {описание}

## Где лежит реализация

- App-код: `{путь/к/коду}`
- Wiring: `{путь/к/wiring}`

## Директории и файлы

- `{путь/к/файлу1}`
- `{путь/к/файлу2}`

## Алгоритм

1. {Шаг 1}
2. {Шаг 2}
3. {Шаг 3}

## API

### {Endpoint 1}

- Method: `{GET/POST/PUT/DELETE}`
- Path: `{путь}`
- Request: `{описание запроса}`
- Response: `{описание ответа}`

## Key Decisions

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2. Hook `design-decision-guard` enforces format:
> each `### Decision:` block must include **Rationale:**, **Trade-off:**, **Alternatives considered:** with ≥2 `- {alt}` bullets.
> Files without any `### Decision:` heading pass unblocked — section is optional but strongly recommended for Phase 2.

### Decision: Auto-grant workspace trust before YOLO-flagged launches instead of failing or double-prompting

**Rationale:** The user already explicitly selected a context-menu entry literally labeled "YOLO" (`--dangerously-skip-permissions`), which already opts out of Claude Code's interactive permission prompts. Programmatically setting `hasTrustDialogAccepted: true` for that one directory is consistent with — not an expansion of — the consent already implied by choosing that entry, and turns a guaranteed first-click failure (confirmed: every dev-pomogator user's first YOLO right-click into a fresh directory hard-fails per Anthropic's own documented trust-gate behavior — see RESEARCH.md) into a working single click.

**Trade-off:** This silently flips a security-relevant flag in `~/.claude.json` without a per-directory confirmation dialog — a misclick onto the wrong folder gets that folder auto-trusted too. Mitigated by scoping strictly to the exact directory Nilesoft passes via `@sel.dir`, and by never touching trust state for the plain (non-YOLO) entries (FR-7, NFR Security).

**Alternatives considered:**
- Fall back to a plain (non-bypass) `claude` launch on first use so the real interactive trust dialog renders, then ask the user to re-click YOLO — rejected because it doubles the click count for every first-time directory, defeating the point of a one-click "YOLO" entry
- Leave the hard failure as-is but print a clearer in-console explanation instead of relying on Claude Code's own one-liner — kept as a secondary safety net (FR-6 logging covers diagnosability) but rejected as the primary fix because it still requires two separate manual actions on every new directory

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

> Секция НЕ может быть удалена. Агент обязан классифицировать фичу по ДВУМ осям: TEST_DATA (данные) + TEST_FORMAT (формат тестов).
>
> **Step 6.1a — TEST_DATA** (ДА/НЕТ на 4 вопроса):
> 1. Фича создаёт, изменяет или удаляет данные через API/БД/файлы?
> 2. Фича изменяет состояние системы, которое нужно откатить после теста?
> 3. BDD сценарии из .feature требуют предустановленных данных (Given-шаги с данными)?
> 4. Фича взаимодействует с внешними сервисами, требующими mock/stub на уровне теста?
>
> Хотя бы 1 ДА → `TEST_DATA_ACTIVE` (заполнить все подсекции ниже).
> Все НЕТ → `TEST_DATA_NONE` (указать Evidence, подсекции не нужны).
>
> **Step 6.1b — TEST_FORMAT**:
> - `BDD` (дефолт для всех языков) — `.feature` сценарии + step definitions + hooks через BDD framework.
> - `UNIT` — escape hatch, требует непустую `## Risks` секцию с обоснованием. Используется только в крайних случаях (legacy, embedded, framework несовместим).
>
> **Step 6.1c — Framework** (только если TEST_FORMAT=BDD):
> Запустить `bdd-framework-detector` на target test-projects из FILE_CHANGES.md. Записать результат.
> Поддерживаемые: `Reqnroll | SpecFlow` (C#), `Cucumber.js | Playwright BDD` (TS), `Behave | pytest-bdd` (Python).
> Если framework НЕ установлен — это remediation target: TASKS.md Phase 0 будет содержать bootstrap block (install + hooks + fixtures + config).

**TEST_DATA:** {TEST_DATA_ACTIVE | TEST_DATA_NONE}
**TEST_FORMAT:** {BDD | UNIT}
**Framework:** {Reqnroll | SpecFlow | Cucumber.js | Playwright BDD | Behave | pytest-bdd | N/A при UNIT}
**Install Command:** {actual команда, например `dotnet add package Reqnroll` или "already installed"}
**Evidence:** {grep output или detector evidence — путь + строка + snippet, либо reference на RESEARCH.md "Existing Patterns"}
**Verdict:** {Краткий вывод: какие hooks/fixtures нужны; при TEST_DATA_NONE — "no hooks required"}

<!-- Подсекции ниже заполнять ТОЛЬКО при TEST_DATA_ACTIVE. При TEST_DATA_NONE — удалить подсекции. -->

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `{путь}` | {Before/AfterScenario} | {тег} | {описание} | {Да/Нет + причина} |

> Если hooks не найдены в проекте — записать: `Не найдены в проекте`.

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `{путь}` | {AfterScenario} | {тег} | {cleanup} | {существующий hook или N/A} |

> Каждый новый hook ОБЯЗАН быть указан в FILE_CHANGES.md (action=create) и в TASKS.md Phase 0.

### Cleanup Strategy

{Порядок удаления тестовых данных, каскадные зависимости, rollback при ошибках}

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| `{имя}` | `{путь}` | {описание} | {per-scenario/per-feature/shared} |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `{ключ}` | `{тип}` | `{step/hook}` | `{step/hook}` | {описание} |

