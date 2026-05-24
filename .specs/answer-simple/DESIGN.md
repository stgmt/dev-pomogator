# Design

## Реализуемые требования

- [FR-1: Always-apply self-check template](FR.md#fr-1-always-apply-шаблон-самопроверки-агента-перед-отправкой-ответа)
- [FR-2: Slash /answer-simple draft audit](FR.md#fr-2-slash-команда-answer-simple-для-ручного-аудита-черновика)
- [FR-3: Extension follows extension-layout](FR.md#fr-3-extension-следует-конвенциям-extension-layout)
- [FR-4: Incident trigger no-new-question branch](FR.md#fr-4-триггер-инцидента-—-запрет-нового-вопроса-при-сигнале-непонимания)
- [FR-5: Rule migration with glossary update](FR.md#fr-5-миграция-существующего-rule-с-обновлением-claude-md-глоссария)

## Компоненты

- `rule markdown файл` — содержит 5-шаговый шаблон самопроверки + триггер инцидента + связь с octocode MCP. Living artifact, переезжает в `.claude/rules/answer-simple/clear-questions-to-user.md`. Загружается каждый turn через стандартный CLAUDE.md context-loading механизм Claude Code (always-apply rules pattern).
- `skill SKILL.md` — определяет slash-команду `/answer-simple` + workflow аудита черновика. Frontmatter: `name: answer-simple`, `description: <triggers RU+EN>`, `allowed-tools: Read`. Body содержит mission, two-mode workflow (silent always-apply via rule + explicit slash invocation), examples input/output, output format с фиксированными заголовками "Переформулировано:" и "Найдено проблем:".
- `extension manifest JSON` — `extensions/answer-simple/extension.json`. Перечисляет `ruleFiles.claude[]` (SOURCE path к rule), `skills."answer-simple"` (SOURCE dir к skill), `skillFiles."answer-simple"[]` (TARGET paths для managed tracking installer'ом). Никаких `tools`, `toolFiles`, `hooks` — extension чисто декларативный.
- `CLAUDE.md глоссарий-строка` — обновлённая запись в always-apply rules секции с указанием на новый путь rule (`.claude/rules/answer-simple/clear-questions-to-user.md` вместо `.claude/rules/clear-questions-to-user.md`).
- `Memory cross-reference` — поле "See" в `feedback_no-jargon-questions-to-user.md` обновляется на новый путь rule.

## Где лежит реализация

- App-код: нет TypeScript кода в extension. Чисто декларативные markdown + JSON artifacts.
- Rule (target): `.claude/rules/answer-simple/clear-questions-to-user.md` (мигрирует из `.claude/rules/clear-questions-to-user.md`)
- Skill: `.claude/skills/answer-simple/SKILL.md` (новый)
- Manifest: `extensions/answer-simple/extension.json` (новый)
- CLAUDE.md edit: 1 строка в always-apply rules таблице (path обновляется)
- Memory edit: 1 cross-reference в `~/.claude/projects/D--repos-dev-pomogator/memory/feedback_no-jargon-questions-to-user.md`
- Tests: `tests/e2e/answer-simple.test.ts` (новый, vitest e2e, 5 it'ов 1:1 с .feature scenarios)

## Директории и файлы

- `extensions/answer-simple/` (новая директория)
  - `extension.json` (новый файл, manifest)
- `.claude/rules/answer-simple/` (новая директория)
  - `clear-questions-to-user.md` (мигрирует с `.claude/rules/clear-questions-to-user.md`)
- `.claude/skills/answer-simple/` (новая директория)
  - `SKILL.md` (новый файл)
- `CLAUDE.md` (edit — 1 строка в always-apply таблице)
- `tests/e2e/answer-simple.test.ts` (новый — vitest e2e)
- `~/.claude/projects/D--repos-dev-pomogator/memory/feedback_no-jargon-questions-to-user.md` (edit — cross-reference)

## Алгоритм (always-apply rule, для агента)

1. **Перед каждым turn-ответом** агент видит запись о rule answer-simple в CLAUDE.md глоссарии → правило `.claude/rules/answer-simple/clear-questions-to-user.md` загружается в reasoning context (стандартный always-apply механизм).
2. **Перед эмитом content** агент молча прогоняет 5 шагов шаблона (что я понял → черновик → самооценка → шаблон микроистории → переписать если плохо). Это reasoning, не tool calls — никаких user-visible loops.
3. **Если шаг 3 (самооценка) детектит проблему** — агент пишет переписанный ответ вместо исходного черновика.
4. **Если последний user-message содержит триггер инцидента** ("не понял" / "сложно" / "что это" / "ты не понял") — агент входит в спец-ветку (FR-4): no new question, re-read context за последние 2-3 turn, действовать из контекста или задать одну свободную фразу без multi-select.

## Алгоритм (slash-команда /answer-simple)

1. Пользователь набирает `/answer-simple <черновик>` в чате Claude Code.
2. Claude Code находит `.claude/skills/answer-simple/SKILL.md` через skill discovery → активирует skill.
3. Skill парсит черновик из ARGUMENTS строки.
4. Если черновик пустой — skill возвращает usage-summary (1-2 предложения что делает + 1-2 примера вызова), exit.
5. Skill анализирует черновик по 4 критериям (выполняется в reasoning, не через tools):
   - (a) есть ли 5 опорных точек микроистории — паттерн вида "после X → я Y → потому что Z → сейчас W → дальше V"
   - (b) есть ли внутренние коды без расшифровки — упоминания "Wave N", "FR-N", "AC-N", "CHK-FRn-nn", уникальные library/api names без объяснения
   - (c) есть ли multi-select с >3 опциями — bullet list из >3 пунктов под одним вопросом
   - (d) есть ли причинно-следственные связки между предложениями ("потому что", "поэтому", "после того как", "в итоге", "дальше")
6. Skill возвращает output:
   - Если есть проблемы — два блока: "Переформулировано: <микроистория-версия>" + "Найдено проблем: <bullet-list конкретных проблем с цитатами из source>"
   - Если черновик OK — "Проблем не найдено" + краткий список пройденных критериев

## API

N/A — extension не предоставляет программный API (нет HTTP endpoints, нет TS/Node module exports, нет CLI subcommands). Skill consumes/produces только textual input/output через Claude Code agent interface — input = slash-команда `/answer-simple <text>`, output = markdown ответ в чате.

## Key Decisions

Hook `design-decision-guard` enforces format: each `### Decision:` block has Rationale, Trade-off, Alternatives considered with at least two bullets.

### Decision: Чисто декларативный extension без TypeScript tools

**Rationale:** Шаблон самопроверки и slash-команда — это guidance для агента, реализуемая полностью через rule body (markdown instructions) и skill SKILL.md (markdown workflow с примерами). TS-код не добавляет ценности — все checks выполняет агент в reasoning context, а не runtime скрипт. Аналог `extensions/auto-simplify/` который тоже rule-only.

**Trade-off:** Нет автоматизированной runtime validation того что агент реально применил шаблон (нет hook'а блокирующего ответ без микроистории). Полагается на agent compliance с rule instructions; невозможно forcibly enforce.

**Alternatives considered:**
- TypeScript tool в `extensions/answer-simple/tools/` с PreToolUse-hook'ом проверяющим финальный output — rejected, потому что Claude Code не имеет hook на финальный agent message (только на tool calls), и runtime checking текста на "соответствие микроистории" потребовал бы второй LLM-вызов с заметным latency.
- Cucumber/Reqnroll style validation framework — rejected как overkill для guidance rule.

### Decision: Мигрировать существующий rule в extension-specific path вместо дублирования

**Rationale:** Rule уже создан в этой сессии в root `.claude/rules/clear-questions-to-user.md`. Оставлять копию в обоих местах = двойной maintenance и риск drift. Перенос в `.claude/rules/answer-simple/` группирует rule под extension и оставляет единственный source-of-truth.

**Trade-off:** Atomic 3-step migration (file move + CLAUDE.md edit + memory edit) — если одно из 3 не сработает, integrity глоссария ломается. Промежуточное состояние запрещено, всё в одном commit.

**Alternatives considered:**
- Оставить rule в root + добавить копию в extension folder — rejected, дублирование и риск что одна копия отстанет от другой.
- Symlink — rejected, плохо работает на Windows (target platform пользователя), и git tracking symlinks через installer проблематичен.

### Decision: Никаких hook'ов в extension.json (только rule + skill)

**Rationale:** Always-apply rule загружается через CLAUDE.md context — стандартный механизм Claude Code. Slash-команда работает через skill discovery (имя skill = slash-команда). PostToolUse/Stop/UserPromptSubmit hook не нужны — нет event на который реагировать в текущей версии feature.

**Trade-off:** Если в будущем потребуется forced enforcement (например блокировать sendmessage без микроистории) — придётся добавить hook в новой версии extension. Но это вне scope v0.1.0 спеки.

**Alternatives considered:**
- PostToolUse hook на Bash tool — rejected, не tool output надо проверять а agent message.
- UserPromptSubmit hook — rejected, событие приходит ДО того как агент генерирует ответ; не подходит для post-check ответа.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE

Reasoning: FR-3 (installer creates files в target dir) и FR-5 (migration moves files в dev-pomogator repo) изменяют файловую систему — cleanup необходим. Для FR-1/FR-2/FR-4 (чистые guidance) — нет state changes, но тесты в одном файле, классификация по worst case.

**TEST_FORMAT:** BDD — соответствует convention dev-pomogator (`.feature` файл + vitest tests с CODE_NN tag mapping per `.claude/rules/extension-test-quality.md`).

**Framework:** vitest (TypeScript e2e tests). НЕ Cucumber.js или Reqnroll — dev-pomogator использует vitest как BDD-tag runner: `.feature` служит spec-документацией, а `tests/e2e/*.test.ts` имеют `describe('PLUGIN017_answer-simple', ...)` + `it('PLUGIN017_01: scenario name', ...)` 1:1 с feature scenarios.

**Install Command:** "already installed" — vitest 4.1.0 в devDependencies проекта (package.json:65).

**Evidence:** package.json:65 → `"vitest": "^4.1.0"`; tests/e2e/ содержит 50+ существующих vitest e2e tests (наблюдаемо через Glob `tests/e2e/*.test.ts`). Pattern documented в `.claude/rules/extension-test-quality.md`.

**Verdict:** Используется existing vitest e2e setup. Никаких новых hooks / fixtures на BDD framework level не требуется. Tests используют существующий helper `tests/e2e/helpers.ts` (`appPath()`, `runInstaller()`, `cleanupTestDir()`) для temp-проектов. Cleanup автоматический через vitest test isolation + helper pattern. FILE_CHANGES.md перечисляет только `tests/e2e/answer-simple.test.ts` — никаких новых helper-файлов.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts` | helper (не Before/After Scenario hook, vitest pattern) | shared | `appPath()` создаёт temp dir, `runInstaller()` запускает installer на temp, `cleanupTestDir()` после теста | Да — стандартный pattern всех existing e2e tests |

> Vitest не имеет BDD framework hooks типа Reqnroll BeforeScenario/AfterScenario — вместо этого используется `beforeAll/beforeEach/afterEach/afterAll` + shared helper functions. `tests/e2e/helpers.ts` — единственный shared setup.

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| N/A | — | — | Не требуются — existing `tests/e2e/helpers.ts` покрывает temp dir management для FR-3/FR-5 installer tests | — |

### Cleanup Strategy

Vitest test isolation + existing `cleanupTestDir()` в `tests/e2e/helpers.ts` — каждый тест выполняется в свежей temp директории, cleanup в `afterEach` или explicitly в test body. Для FR-3 (installer test): temp dir создаётся, installer запускается в temp, после теста — `cleanupTestDir(tempPath)`. Для FR-5 (migration test): используется in-memory copy / temp dir с скопированным `.claude/rules/clear-questions-to-user.md`, миграция тестируется на копии, после — cleanup. Никаких изменений в реальном dev-pomogator repo во время теста.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Temp test dir | runtime через `appPath()` helper | Изолированная workspace для installer/migration tests | per-test (afterEach cleanup) |
| Copy исходного rule | runtime через `fs.copyFile()` в test body | Тест миграции на копии, не на реальном файле | per-test |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tempPath` | string (file path) | `beforeEach` через `appPath()` | test body | Изолированный temp dir для теста |

> Pure local state в test scope. Никаких cross-test или global state.
