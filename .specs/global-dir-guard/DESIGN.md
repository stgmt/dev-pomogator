# Design

## Реализуемые требования

- [FR-1: Uninstall маркер](FR.md#fr-1-uninstall-маркер-feature2)
- [FR-2: Детекция аномального удаления](FR.md#fr-2-детекция-аномального-удаления-feature1)
- [FR-3: Auto-recovery global scripts](FR.md#fr-3-auto-recovery-global-scripts-feature1)
- [FR-4: Re-registration SessionStart hook](FR.md#fr-4-re-registration-sessionstart-hook-feature1)
- [FR-5: Диагностическое логирование](FR.md#fr-5-диагностическое-логирование-feature3)

## Компоненты

- `global-dir-guard.cjs` — standalone CJS скрипт, бандлится в dist/, вызывается из project hook. Детектит состояние, запускает recovery.
- `uninstall.ps1` (edit) — добавить запись маркера перед удалением
- `check-update.bundle.cjs` (edit) — вызвать guard перед основной логикой
- `src/installer/claude.ts` (edit) — бандлить guard в dist/ при build

## Где лежит реализация

- Guard скрипт: `src/guard/global-dir-guard.ts` (новый)
- Бандл: `dist/global-dir-guard.cjs` (собирается esbuild)
- Uninstall маркер: `uninstall.ps1` + `uninstall.sh`
- Hook wiring: `src/installer/claude.ts` → `setupClaudeHooks()`

## Алгоритм global-dir-guard

```
1. Проверить: существует ли ~/.dev-pomogator/scripts/tsx-runner.js?
   ├─ ДА → exit 0 (всё ок)
   └─ НЕТ → шаг 2

2. Проверить: существует ли ~/.dev-pomogator-uninstalled?
   ├─ ДА → log [SKIP_UNINSTALLED], exit 0
   └─ НЕТ → шаг 3

3. Проверить: project .claude/settings.json содержит pomogator hooks?
   ├─ НЕТ → log [SKIP_FIRST_INSTALL], exit 0 (нечего восстанавливать)
   └─ ДА → шаг 4 (аномальное удаление)

4. RECOVERY:
   a. ensureDir ~/.dev-pomogator/scripts/
   b. Копировать tsx-runner.js из __dirname (dist/)
   c. Копировать check-update.js из __dirname (dist/)
   d. Копировать launch-claude-tui.ps1 из __dirname (dist/) [Windows only]
   e. log [RECOVERY] ~/.dev-pomogator/ restored

5. Проверить: ~/.claude/settings.json содержит SessionStart hook?
   ├─ ДА → exit 0
   └─ НЕТ → добавить hook, log [HOOK_REREGISTERED]
```

## Точка входа

Guard вызывается из **project-level PreToolUse hook** (не SessionStart) — потому что SessionStart в global settings может быть сброшен. Project hooks выживают в `.claude/settings.json` проекта.

Hook command:
```
node "<dist>/global-dir-guard.cjs"
```

`<dist>` резолвится через `__dirname` бандла (рядом с `check-update.bundle.cjs`).

Альтернатива: встроить guard прямо в начало `check-update.bundle.cjs` — но это усложняет бандл. Отдельный файл проще.

## Маркер файл

Путь: `~/.dev-pomogator-uninstalled` (НЕ внутри `~/.dev-pomogator/`)

Формат:
```json
{"timestamp":"2026-03-25T20:00:00.000Z","source":"uninstall.ps1"}
```

Guard при детекции маркера удаляет его после отработки (чтобы последующий install не видел stale маркер).

## Reuse plan

| Что переиспользуем | Откуда | Как |
|---------------------|--------|-----|
| `setupGlobalScripts()` логика | `src/installer/shared.ts:235` | Упрощённая копия: только copy 3 файлов, без npm install |
| `setupClaudeHooks()` логика | `src/installer/claude.ts:277` | Упрощённая: только SessionStart hook, без cleanup |
| `writeJsonAtomic()` | `src/installer/claude.ts` | Переиспользовать для atomic settings write |
| `makePortableScriptCommand()` | `src/installer/shared.ts` | Для генерации hook command |

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE
**Evidence:** 1. Тесты создают/удаляют маркер-файл и `~/.dev-pomogator/` содержимое. 2. Нужен cleanup после каждого сценария. 3. Given-шаги создают тестовое состояние (маркер, директория). 4. Нет внешних сервисов.
**Verdict:** Нужны Before/After hooks для cleanup temp directories.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts` | Setup | Global | Shared test helpers, appPath(), homePath() | Да — использовать `homePath()` для маркер-файла |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/global-dir-guard.test.ts` beforeEach | BeforeEach | per-test | Создать temp `~/.dev-pomogator/` структуру | helpers.ts patterns |
| `tests/e2e/global-dir-guard.test.ts` afterEach | AfterEach | per-test | Удалить маркер и temp dirs | helpers.ts patterns |

### Cleanup Strategy

1. afterEach: удалить `~/.dev-pomogator-uninstalled` маркер если создан
2. afterEach: восстановить `~/.dev-pomogator/scripts/` если был удалён тестом
3. Тесты используют mock HOME через env var или temp dir — не трогают реальный HOME

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Маркер-файл | temp `~/.dev-pomogator-uninstalled` | Тестовый uninstall маркер | per-scenario |
| Fake scripts dir | temp `~/.dev-pomogator/scripts/` | Тестовая структура | per-scenario |
| Fake settings.json | temp `.claude/settings.json` | Project settings с hooks | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tempHome` | string | beforeEach | guard script | Isolated HOME для тестов |
