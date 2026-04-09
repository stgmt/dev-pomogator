# Research

## Контекст

Plan-pomogator hook `plan-gate.ts` при Phase 2 deny выводит секцию «Последние сообщения пользователя» — список последних промптов из кэша `~/.dev-pomogator/.plan-prompts-{session_id}.json`. Цель — дать AI-агенту контекст реального запроса при доработке плана. На скриншоте от 2026-04-09 видно: deny-сообщение содержит `«да отчет»` и XML-блоки `<task-notification>` от background-задач (`b993dg7si`, `bq0h0cqkz`, `be39wt8g7`) которые относятся к задачам Hyper-V VM/EFI install — совсем другим задачам, не текущей. Это вводит агента в заблуждение и провоцирует написание плана на основе неверного контекста.

## Источники

- Скриншоты пользователя от 2026-04-09 показывающие deny-сообщение с чужими промптами (Phase 2 ошибка `Отсутствует подсекция ### Extracted Requirements`)
- Файл `~/.dev-pomogator/.plan-prompts-default.json` с накопленным мусором (10 entries из разных задач, mtime обновляется при каждом write)
- Исходный код `extensions/plan-pomogator/tools/plan-pomogator/prompt-capture.ts` (UserPromptSubmit hook, writer)
- Исходный код `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts` (PreToolUse hook, reader)
- Исходный код `extensions/plan-pomogator/tools/plan-pomogator/prompt-store.ts` (shared module)
- Документация Claude Code hooks: UserPromptSubmit hook input format содержит `session_id` (snake_case), не `conversation_id`

## Технические находки

### Bug 1 (фатальный): field name mismatch — `conversation_id` vs `session_id`

`prompt-capture.ts:31` декларирует `interface HookInput { conversation_id?: string; ... }`. `prompt-capture.ts:88` использует `const sessionId = input.conversation_id || 'default';`. Однако Claude Code в UserPromptSubmit hook input передаёт поле `session_id` (snake_case). Это подтверждается тем что `plan-gate.ts:30` корректно использует `session_id?: string` в `interface PreToolUseInput`. Из-за рассинхрона `input.conversation_id` ВСЕГДА `undefined`, fallback `|| 'default'` загоняет ВСЕ сессии (всех проектов на машине) в общий файл `~/.dev-pomogator/.plan-prompts-default.json`.

### Bug 2: отсутствие фильтра task-notification псевдо-промптов

`prompt-capture.ts:85-86` проверяет только `if (!prompt) return;` после trim. Никакой фильтрации по содержимому. Claude Code инжектит `<task-notification>...</task-notification>` сообщения от background-задач как user message в conversation, и они попадают в hook input как `prompt`. Эти псевдо-промпты сохраняются в кэш как реальные user-промпты и потом отображаются в deny-сообщении plan-gate.

### Bug 3: GC mtime never expires shared file

`prompt-capture.ts:54` (внутри `gcOldFiles()`) удаляет файлы старше `GC_MAX_AGE_MS` (2 hours) по сравнению `now - stat.mtimeMs > GC_MAX_AGE_MS`. Поскольку из-за Bug 1 ВСЕ сессии пишут в общий `default.json`, его `mtime` обновляется при каждом промпте. Двухчасовой таймаут никогда не срабатывает, файл копит мусор бесконечно.

### Bug 4: most-recent fallback в plan-gate нарушает cwd-scoping

`plan-gate.ts:74-97` функция `loadUserPrompts()` при отсутствии session-specific файла делает fallback: `fs.readdirSync(getPromptsDir())`, итерирует все `.plan-prompts-*.json` файлы, выбирает по `mtime` самый свежий. Это нарушает правило `.claude/rules/gotchas/hook-global-state-cwd-scoping.md` (глобальная директория без cwd-привязки) и берёт чужой файл из общей home-папки. В сочетании с Bug 1 это означает что даже если Bug 1 был бы исправлен, fallback всё равно мог бы подхватить файл другой сессии.

### Каскад

UserPromptSubmit для каждого сообщения → Bug 1 пишет в `default.json` → Bug 2 не фильтрует task-notifications → Bug 3 GC не срабатывает → ExitPlanMode → plan-gate Phase 2 fail → Bug 4 fallback на most-recent (= `default.json`) → deny показывает mix всех задач.

## Где лежит реализация

- Hook source (UserPromptSubmit writer): `extensions/plan-pomogator/tools/plan-pomogator/prompt-capture.ts:30-119`
- Hook source (PreToolUse reader): `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts:64-117`
- Shared store module: `extensions/plan-pomogator/tools/plan-pomogator/prompt-store.ts:1-55`
- Installed copies (реально вызываются hook-ом): `.dev-pomogator/tools/plan-pomogator/prompt-capture.ts`, `.dev-pomogator/tools/plan-pomogator/plan-gate.ts`
- Hook регистрация: `extensions/plan-pomogator/extension.json:35-48` (PreToolUse + UserPromptSubmit)
- Кэш runtime: `~/.dev-pomogator/.plan-prompts-{session_id}.json` (один файл на сессию должен быть)
- Существующие тесты: `tests/e2e/plan-validator.test.ts` (НЕТ покрытия prompt-capture, есть тесты для plan-gate validation)
- BDD feature: `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` (PLUGIN007_42 — последний)

## Выводы

1. Минимальный fix Bug 1 (rename `conversation_id` → `session_id`) уже устраняет основной симптом cross-session leak — каждая сессия будет писать в свой файл.
2. Bug 2 (filter task-notification) необходим как defense чтобы псевдо-промпты не попадали в кэш даже одной сессии — они НЕ являются реальным user input.
3. Bug 3 (GC) автоматически чинится после Bug 1 — каждый файл per-session получает stable lifecycle.
4. Bug 4 (fallback) необходим как defense-in-depth: убрать most-recent fallback чтобы plan-gate никогда не подхватывал чужой файл из общей директории.
5. Defense-in-depth read-side фильтр в `formatPromptsFromFile` нужен для legacy `default.json` файлов у пользователей которые получат update без cleanup.

## Open Questions

- [x] Какое поле использует Claude Code в UserPromptSubmit hook input — `conversation_id` или `session_id`? — **Resolved**: `session_id` (snake_case), подтверждено через `plan-gate.ts:30` где это поле уже корректно используется в `PreToolUseInput`.
- [x] Можно ли удалить fallback на most-recent файл без потери legitimate use cases? — **Resolved**: Да. Единственный legitimate case был «сессия не успела ничего записать», но fallback на чужой файл хуже чем пустая секция (агент видит мусор и пишет неправильный план). Лучше пустой output.
- [x] Нужна ли cwd-scoping для prompt cache (как для plan files)? — **Resolved**: Нет. Промпты не имеют естественной связи с `cwd`, primary key — `session_id`. Cwd-scoring неприменим.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| hook-global-state-cwd-scoping | `.claude/rules/gotchas/hook-global-state-cwd-scoping.md` | Hooks читающие глобальные директории ОБЯЗАНЫ привязываться к cwd | Глобальные пути в hook коде | FR-4 (убрать most-recent fallback из shared dir) |
| spec-test-sync | `.claude/rules/plan-pomogator/spec-test-sync.md` | Багфикс ОБЯЗАН иметь BDD `.feature` с регрессионным сценарием | File Changes Reason содержит fix/bug | FR-7 (BDD сценарии для регрессии) |
| extension-test-quality | `.claude/rules/extension-test-quality.md` | Тесты расширений 1:1 mapping test↔feature, без inline-копий | Создание тестов в `tests/e2e/*.test.ts` | FR-7 (PLUGIN007_43 numbering, real spawnSync calls) |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты ОБЯЗАНЫ быть интеграционными (spawnSync/runInstaller), unit как доп | FR покрытие тестами | FR-7 (spawnSync для prompt-capture, реальные файлы) |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp file + atomic move | Сохранение JSON файлов кэша | NFR-Reliability (writePromptFile уже использует temp+rename — соблюдено) |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker тесты не блокировать, run_in_background | Запуск /run-tests | Implementation Plan Phase 3 step 12 |
| post-edit-verification | `.claude/rules/pomogator/post-edit-verification.md` | После edit обязательно скопировать в installed location | Edit `extensions/*/tools/` | Implementation Plan Phase 3 step 11 |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | Манифест single source of truth для апдейтера | Изменения в extensions/ | NFR (extension.json toolFiles уже включает prompt-capture.ts и plan-gate.ts — соблюдено) |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| prompt-store module | `extensions/plan-pomogator/tools/plan-pomogator/prompt-store.ts` | sanitizeSessionId, getPromptFilePath, readPromptFile, writePromptFile (atomic temp+rename) | Reuse полностью, не изменять — стабильный contract |
| plan-gate test pattern | `tests/e2e/plan-validator.test.ts:670-700` (PLUGIN007_27) | tmpDir + spawnSync паттерн для интеграционных тестов validate-plan | Reuse как образец для PLUGIN007_43 regression tests |
| BDD background pattern | `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature:6-8` | `Given dev-pomogator is installed / And plan-pomogator extension is enabled` | Reuse Background для PLUGIN007_43..47 сценариев |
| Hook test (similar) | `tests/e2e/auto-capture.test.ts` | Существующие тесты auto-capture UserPromptSubmit hook | Reference для setup HOME env var в spawnSync (для изоляции теста от user home) |

### Architectural Constraints Summary

- **`hook-global-state-cwd-scoping.md`** напрямую запрещает most-recent fallback из `loadUserPrompts` (FR-4): глобальные директории требуют cwd-привязки, а для промптов primary key — `session_id`, поэтому fallback должен быть удалён, не добавлен cwd-scoring.
- **`spec-test-sync.md`** требует `.feature` BDD сценарий для багфикса (FR-7) — не unit-only тесты.
- **`integration-tests-first.md`** требует чтобы регрессионные тесты PLUGIN007_43_NN были интеграционными через `spawnSync('npx', ['tsx', captureScript])` с временным `HOME` env var, а не через прямой импорт mocked функции (unit допустим как дополнение, но не замена).
- **`extension-test-quality.md`** требует 1:1 mapping между `it()` блоками и `Scenario:` блоками с одинаковыми CODE_NN номерами — поэтому 5 тестов в plan-validator.test.ts должны иметь 5 парных сценариев в PLUGIN007_plan-pomogator.feature.
- **`prompt-store.ts` contract**: оставить стабильным — менять только prompt-capture.ts main() и plan-gate.ts loadUserPrompts/formatPromptsFromFile.
