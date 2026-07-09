# Dead Integration Guard — installed ≠ integrated

Когда диф добавляет **установщик / скачиваемый бинарь / внешнюю зависимость**, проверь ДВА условия ПЕРЕД тем как назвать фичу готовой:

1. **Рантайм-потребитель существует** — продакшн-код реально вызывает зависимость в обычном потоке (не только флаг конфигурации и не только тест). «Скачали и положили на диск» — это не интеграция.
2. **Есть e2e против реального артефакта** — тест запускает настоящую зависимость (в Docker, где она гарантирована) и проверяет реальный ответ. Пропуск в Docker = провал, не «ок» (silent-skip = фейк-зелёное).

Если зависимость скачивается, но `grep` по продакшн-коду не находит вызывающего (кроме тестов/флагов) — это **dead integration**: корневой функционал, которого по факту нет. Поймать ДО мёржа.

## Инцидент (2026-06-04, FR-7 Marksman)

dev-pomogator месяцами **скачивал** Marksman LSP, верифицировал sha256, клал на диск — и **ни разу не запускал**. `resolveLspMode` имел ноль вызовов вне теста; `binary_path` нигде не читался. «Интеграция с Marksman» была пустышкой: установщик есть, потребителя нет. Вскрылось только потому, что BDD-шаг `_15` «бинарь отвечает на LSP initialize» нечем было закрыть честно. Первый фикс был кастомным мостом в MCP — но и он оказался не тем слоем. **Финальный фикс (2026-06-04):** Marksman зарегистрирован как **нативный Claude Code LSP-плагин** (`.lsp.json` → лаунчер `tools/marksman-installer/launch-marksman.cjs` → `marksman server`), рантайм-потребитель = встроенный `LSP`-тул Claude Code; доказано end-to-end реальной `claude -p` сессией (documentSymbol + `[[wiki-link]]` references против ground-truth). Кастомный мост/`md_references`/`skip-policy`/js-fallback **ретайрнуты**. Урок тот же: скачан ≠ интегрирован — нужен реальный рантайм-потребитель + e2e против живого артефакта.

## Под-класс: plugin-distributed код с `node_modules`-зависимостью (installed ≠ runnable)

Тот же «installed ≠ integrated», но механизм другой и злее, потому что dogfood его НЕ ловит: код, который **распространяется внутри плагина** (hook из `.claude-plugin/hooks.json`, MCP-сервер из `.mcp.json`, launcher из `.lsp.json`, любой `tools/**/*.ts`, запускаемый хуком), **импортит non-builtin пакет** (`@cucumber/gherkin`, `@modelcontextprotocol/sdk`, `zod`, `chokidar`, `fs-extra`, …). Но `node_modules` **gitignored**, а canonical-plugin install (`/plugin marketplace add`) **НЕ запускает `npm install`** — он копирует файлы. Значит у юзера плагина этого пакета **нет на диске** → код падает `ERR_MODULE_NOT_FOUND` при запуске. В dogfood-репо `node_modules` есть → всё «работает» → проёб проходит на ревью.

**Ключевая проверка (обязательна для plugin-distributed кода с импортом пакета):** спрячь `node_modules` (или только нужный `@scope`) и **реально запусти артефакт тем же способом, что harness** (hook через `bootstrap.cjs` лаунчер; MCP через его `.mcp.json` команду). Упало `ERR_MODULE_NOT_FOUND` → у юзеров оно **dead**. `grep` импортов недостаточно — **запусти deps-absent**.

```bash
# hook:  спрятать пакет → запустить через реальный лаунчер → ожидать НЕ-краш
mv node_modules/@cucumber node_modules/@cucumber.bak
echo '{}' | CLAUDE_PLUGIN_ROOT="$PWD" node -e "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT,'tools','_shared','bootstrap.cjs'))" -- "tools/<x>/<hook>.ts"
# exit 1 + 'Cannot find package' = DEAD для юзеров.   mv ...bak обратно.
```

**Три легитимных фикса (выбрать осознанно):**
1. **Bundle** (esbuild → self-contained `.mjs`/`.cjs`, зависимости inlined; запуск голым `node`, без tsx/node_modules) — как `tools/spec-mcp-server/server.bundle.mjs` (`npm run build:mcp`) + freshness-тест. Нужно когда фича ДОЛЖНА работать у юзера.
2. **Lazy-import + fail-open** — `await import('./heavy.ts')` внутри функции в try/catch; нет deps → деградировать (approve/skip + note), не крашиться. Годится когда non-enforcement у bare-юзера приемлемо (см. NFR fail-open).
3. **node-builtins-only** — переписать так, чтобы импортов из `node_modules` не было (как `anchor_gate_stop.ts` → только `check.mjs` на builtins).

## Инцидент №2 (эта сессия, 2026): MCP + test-quality hook

`spec-mcp-server` тянул `@modelcontextprotocol/sdk`+`zod`+`chokidar`; `.mcp.json` запускал `node --import tsx tools/.../server.ts` относительным путём. У юзера: нет tsx, нет sdk, неверный путь → MCP мёртв. Фикс — bundle (`server.bundle.mjs`) + dual-mode launcher через `${CLAUDE_PLUGIN_ROOT}`, доказано прогоном со спрятанным `node_modules`. Через пару коммитов **тот же проёб повторился**: новый Stop-hook `test_quality_gate_stop.ts` импортил `builder.ts` → `@cucumber/gherkin` на верхнем уровне → краш на КАЖДОМ Stop у юзеров. Поймано только когда юзер спросил «у других будет ставиться?». Фикс — lazy-import + fail-open. Урок: **каждый** plugin-distributed артефакт с импортом пакета гонять deps-absent ДО «готово», а не после вопроса юзера.

## Под-класс №2: hook/guard НЕ зарегистрирован живым (code+tests ≠ enforcement)

Хук может иметь код И тесты (прямой спавн) — и НИКОГДА не срабатывать:
регистрация отсутствует в живых манифестах. Инциденты 2026-06-07: meta-guard
жил только в `.bak`; ВСЕ ПЯТЬ v3 form-guards не были зарегистрированы нигде
(скиллы обещали «guard will deny» — ничего не fire-ило). **Для каждого
hook-артефакта:** grep имени в `.claude/settings.json` И
`.claude-plugin/hooks.json` (оба!), затем ЖИВОЙ прогон через реальный лаунчер
(echo payload | bootstrap → ожидаемый deny/allow). Зелёные тесты при прямом
спавне НЕ доказывают enforcement.

## Триггеры — когда проверять

- Диф добавляет загрузку бинаря (`curl`/`wget`/`download(...)`/release URL) или установщик.
- Диф добавляет рантайм-зависимость в `package.json` `dependencies` (не `devDependencies`).
- Диф добавляет `*-installer*`, `postinstall`, `verifyHash`, `install-log` без потребителя.
- Сборка скачивает что-то в Docker/CI слое, что код потом должен использовать.
- **Новый/изменённый plugin-distributed entry** (`hooks.json` command, `.mcp.json`, `.lsp.json`, `tools/**` запускаемый хуком) **импортит non-`node:` non-relative пакет** → прогнать deps-absent.

## Что требовать

- [ ] `grep` по `tools/`/`src/`: есть НЕ-тестовый, НЕ-флаговый вызывающий скачанного артефакта в обычном потоке?
- [ ] Есть e2e, который спавнит/вызывает РЕАЛЬНЫЙ артефакт (не стаб/мок) и проверяет реальный ответ?
- [ ] e2e в Docker: отсутствие артефакта внутри Docker → тест **падает**, а не пропускается молча?
- [ ] Если потребителя пока нет — задача помечена явно (`installed, consumer pending`), а фича НЕ названа готовой.
- [ ] **(plugin-distributed код)** артефакт **запущен со спрятанным `node_modules`** (реальным лаунчером) и НЕ упал — либо bundled, либо lazy-import+fail-open, либо node-builtins-only. `grep` импортов ≠ доказательство.

## Hard-OUT (НЕ применять — иначе over-generalization, см. [[feedback_single-incident-rules-over-generalize]])

- `devDependencies` (линтеры, тест-раннеры, сборщики) — у них потребитель = сама сборка/тест, не рантайм.
- Type-only пакеты (`@types/*`).
- Удаление зависимости (removal, не addition).
- Version bump существующей уже-используемой зависимости.
- Чисто docs/markdown изменения.
- Зависимость с очевидным немедленным потребителем В ТОМ ЖЕ дифе (импорт + вызов рядом).

## Связанные правила

- [`verify-against-real-artifact`](verify-against-real-artifact.md) — фикстуры/прогон против реального вывода producer'а (этот guard — про наличие потребителя + real-e2e на уровне зависимости).
- [`integration-tests-first`](../integration-tests-first.md) — почему unit/флаг недостаточно как доказательство интеграции.

## История

Создано 2026-06-04 после FR-7 Marksman инцидента (скачан, но не использован). Юзер: «обнови правила так, чтобы такой пропуск корневого функционала больше не проходил незамеченным».
