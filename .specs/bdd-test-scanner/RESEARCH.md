# Research

## Контекст

Репо мигрирует на BDD-only (цель — ноль `*.test.ts`). Уже есть PreToolUse-страж, который ЗАПРЕЩАЕТ создание НОВЫХ не-BDD тестов, и агент `bdd-migrator`, мигрирующий существующие. Чего нет: ничто не ПОКАЗЫВАЕТ уже лежащие на диске не-BDD тесты — долг миграции невидим, пока кто-то не грепнет вручную. Эта фича добавляет неблокирующий SessionStart-сканер, который считает существующие не-BDD тесты и указывает на мигратора либо на заведение GitHub-issue. Должна ставиться всем юзерам плагина и проверяться доктором.

## Источники

- `tools/bdd-only-test-guard/guard.ts` — существующий детектор не-BDD тестов
- `.claude-plugin/hooks.json` + `.claude/settings.json` — регистрация хуков (canonical + dogfood)
- `.claude/skills/pomogator-doctor/scripts/doctor-hook.ts` + `engine/` — паттерн SessionStart + doctor-чек
- `tools/specs-validator/conformance-summary.ts` + `ack-summary.ts` — модель «тихо после подтверждения»
- `gh` CLI 2.95.0 — `gh issue create` (проверено `gh issue create --help`)

## Технические находки

### Детектор не-BDD тестов переиспользуем (но это per-write, не сканер)

`tools/bdd-only-test-guard/guard.ts` экспортирует `bddOnlyDecision(toolName, filePath, exists)` (строки 54-77). Паттерны не-BDD (строки 33-39): `*.test/spec.[cm]?[jt]sx?`, `test_*.py`, `*_test.py`, `*_test.go`, `*Tests.cs`/`*Test.cs` (кроме `*Steps.cs`). Allow-листы (строки 43-49): `*.feature`, `tests/step_definitions/`, `tests/hooks/`, `tests/fixtures/`, `__fixtures__/`. Чистая функция, builtins-only (node:fs/node:path), fail-open, posix-нормализация путей. ОГРАНИЧЕНИЕ: это решение для одной ЗАПИСИ, не обход каталога. → выделить общий `isNonBddTest(path)` / `detectNonBddTests(root)`, чтобы guard и сканер делили один источник истины (без дрейфа паттернов).

### Контракт SessionStart-хука

`doctor-hook.ts` (строки 20-24, 48-82): вывод `{continue:true, suppressOutput?, additionalContext?}`; вычитывает stdin; lazy-load движка; race с timeout; fail-soft (ошибка → лог + тихое продолжение). `additionalContext` — поверхность для предупреждения.

### Путь «завести GitHub-issue» (заменяет слабый локальный «видел»)

Заведение долга в трекер вместо молчаливого локального флага. Команда: `gh issue create` (проверено: gh 2.95.0; флаги `-t/--title`, `-b/--body`, `-F/--body-file`, `-l/--label`). ВАЖНО: хук НЕ зовёт `gh` сам (нужны сеть + авторизация, это не builtins и не fail-open-дружелюбно) — хук ПРЕДЛАГАЕТ команду; агент/юзер её выполняет. Локальный маркер записывает номер issue + покрытый набор тестов, чтобы уведомление замолкало, пока не появятся новые тесты сверх покрытых.

### Политика зависимостей (директива владельца)

Зависимости должны ЛИБО ставиться юзерам, ЛИБО при отсутствии кидать варнинг, и доктор обязан чинить — НЕ молчаливый пропуск. Применение здесь: ядро сканера сторонних зависимостей не требует (builtins-only — идеал «работает у всех без установки»); единственный внешний инструмент — `gh` (для пути issue) — подчиняется политике: doctor проверяет наличие и авторизацию `gh`, при отсутствии варнинг + предложение починки.

### Модель «тихо после того, как долг зафиксирован»

`tools/specs-validator/conformance-summary.ts` + `ack-summary.ts`: предупреждать, пока unresolved > 0; подтверждение пишет маркер атомарно; молчит, пока не появятся новые. Зеркалю: «подтверждение» = заведённый GitHub-issue (маркер хранит номер + покрытый набор); повторно срабатывать только при новых не-BDD тестах сверх покрытых.

### Структура doctor-чека

`engine/types.ts` `CheckDefinition` (строки 119-128) + `CheckResult` (11-26); образец `checks/git.ts`; регистрация в `engine/checks/index.ts` (phase2Checks). Следующий id ~C25. severity ok/warning/critical + reinstallHint/fix hint. Чек проверяет ДВА: (1) хук зарегистрирован и запускается; (2) зависимости на месте (Node-рантайм; `gh` присутствует и авторизован для пути issue).

### Сканера ещё нет

Подтверждено разведкой: ни один хук не сканирует существующие не-BDD тесты; есть только write-time deny-страж. Фича новая и архитектурно безопасная.

## Где лежит реализация

- App-код: `tools/bdd-test-scanner/scanner-hook.ts` (новый entry) + `tools/bdd-test-scanner/engine/scan.ts` (новый) + общий детектор, вынесенный из `tools/bdd-only-test-guard/guard.ts`
- Конфигурация: `.claude-plugin/hooks.json` + `.claude/settings.json` (регистрация SessionStart); doctor-чек `.claude/skills/pomogator-doctor/scripts/engine/checks/bdd-test-scanner.ts` (проверяет хук + зависимость `gh`) + регистрация в `engine/checks/index.ts`

## Выводы

Фича реализуема композицией проверенных паттернов: переиспользовать детектор стража (вынести в общий модуль), контракт SessionStart doctor-хука, модель «тихо после фиксации» (conformance ack), путь заведения GitHub-issue через `gh`. Ядро — builtins-only/fail-open (работает у всех); зависимость `gh` подчиняется политике install-or-warn + doctor-fix.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| bdd-only-tests | `.claude/rules/bdd-only/bdd-only-tests.md` | Цель zero *.test.ts; deny новых не-BDD | запись тест-файла | FR-1/FR-2 |
| dead-integration-guard | `.claude/rules/testing/dead-integration-guard.md` | Plugin-distributed код builtins-only/fail-open | новый хук/импорт пакета | NFR-Reliability |
| finish-the-deploy | `.claude/rules/pomogator/finish-the-deploy-dont-hand-off.md` | Доводи до живого: регистрация + ребилд сам | новый хук | NFR-Operability |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| deny-guard | `tools/bdd-only-test-guard/guard.ts` | паттерны детектора не-BDD | переиспользовать для сканера |
| doctor-hook | `.claude/skills/pomogator-doctor/scripts/doctor-hook.ts` | контракт SessionStart | образец хука-сканера |
| conformance ack | `tools/specs-validator/conformance-summary.ts` | «тихо после фиксации» | зеркало для гашения уведомления |
| gh CLI | `gh issue create` (2.95.0) | заведение issue в трекер | путь «отложить» = GitHub-issue |

### Architectural Constraints Summary

Ядро сканера обязано быть builtins-only + fail-open (dead-integration-guard) — ставится юзерам без node_modules и не имеет права ронять сессию. Зависимость `gh` (путь issue) — не молчаливый пропуск, а install-or-warn + doctor-fix (директива владельца). Детектор переиспользуется единым модулем, чтобы паттерны не разъезжались. Уведомление неблокирующее (SessionStart additionalContext, никогда deny); шум ограничен наличием GitHub-issue.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Уведомление долбит каждую сессию в репо с большим хвостом (~120 файлов) | High | Medium | Гаснет, когда долг зафиксирован GitHub-issue; повтор только при новых тестах сверх покрытых |
| Дрейф паттернов, если сканер копирует регэкспы стража | Medium | High | Вынести единый общий `isNonBddTest()`/`detectNonBddTests()`; и guard, и сканер импортируют его |
| Ядро хука роняет сессию у юзеров плагина (нет node_modules) | Medium | High | builtins-only + fail-open + race с timeout; прогон deps-absent до «готово» |
| `gh` отсутствует/не авторизован → путь issue не работает | Medium | Medium | Не молчать: doctor проверяет `gh`, варнинг + предложение установки/авторизации; уведомление деградирует до «мигрируй / поставь gh для issue» |
| Сканер медленно обходит большие репо на старте сессии | Medium | Medium | Ограничить обход (skip node_modules/.git/dist), кап на число файлов, race с timeout как doctor-hook |
