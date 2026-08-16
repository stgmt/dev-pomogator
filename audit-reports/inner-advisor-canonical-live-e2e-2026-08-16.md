# Inner advisor: полный canonical live e2e (2026-08-16)

**Дата:** 2026-08-16 · **Окружение:** Docker (node:22-slim, Claude Code v2.1.233), транспорт sub2api
`http://172.30.206.176:8787` (gpt-5.6-sol = advisor, gpt-5.6-luna = summarizer).

## 1. Что проверено

Цель — закрыть задачу `inner-live` честно: каноническая установка плагина → интерактивная
сессия (НЕ `-p`) → агент сам вызывает адвизора → Stop-hook пишет rolling summary → консультация
идёт через summary+delta.

### 1.1 Каноническая установка (install flow)

В чистом контейнере (чистый `$HOME`, no plugin cache):

```
claude plugin marketplace add /plugin          -> OK
claude plugin install dev-pomogator@stgmt -s user -> OK (cache/stgmt/dev-pomogator/2.0.6)
claude plugin list --json                      -> enabled:true, MCP dev-pomogator-advisor зарегистрирован
```

Кэш плагина содержит всю advisor-цепочку: `.claude-plugin/hooks.json` → `client.mjs "Stop/13/0"`
→ `registry.json` → `tools/advisor/advisor_stop.bundle.mjs`; `.mcp.json` — `dev-pomogator-advisor`
через node-launcher, пути через `${CLAUDE_PLUGIN_ROOT}`, без абсолютных путей репо.

### 1.2 Интерактивная сессия (tmux, не `-p`)

Сессия `claude --dangerously-skip-permissions` в tmux-панели, `/tmp/ws` как workspace.
Промпт: создать fibonacci.py (числа до 100) + README.md + краткое резюме.

**Агент работал:** создал `fibonacci.py` и `README.md`, пытался запустить (python/python3
отсутствуют — честно сообщил об ограничении).

**Адвизор консультировал ДВАЖДЫ** через `mcp__dev-pomogator-advisor__advisor` (сам агент вызвал
тул — как задумано):
1. `04:57:24` — mode digest, указал: завершение преждевременно, нет evidence создания файлов;
2. `04:58:08` — подтвердил создание файлов, но отметил: runtime-проверка невозможна (exit 127),
   резюме не evidenced.

Оба ответа — реальный LLM (gpt-5.6-sol) через sub2api, trace в `/tmp/advisor-mcp-trace.log`.

### 1.3 Stop-hook → rolling summary

После `/exit` Stop-hook сработал:

```
/tmp/ws/.dev-pomogator/.advisor-fires.jsonl   — RECURRING_ERROR (2x exit 127) + guidance
/tmp/ws/.dev-pomogator/.advisor-marker.json   — cooldown marker
/tmp/ws/.dev-pomogator/advisor/summary/<sid>.md — создан
```

Суммаризатор (gpt-5.6-luna) заполнил все 10 секций реальным содержимым сессии
(2602 B): Session Title, Current State, Task specification, Files and Functions, Workflow,
Errors & Corrections (exit 127), Codebase, Learnings, Key results, Worklog.

### 1.4 Консультация через summary (режим summary)

После заполнения summary повторный вызов MCP-тула:

```
meta: { mode: "summary", summary: true, delta: 12, rawChars: 117564, packetChars: 4311 }
```

Т.е. консультация строится из summary + 12 последних событий, а не из полного транскрипта
(сжатие ~96%). Адвизор увидел state-файлы и дал более точный совет.

## 2. Найден и исправлен production-баг

**Симптом:** в Docker (Linux) `advisor_stop.bundle.mjs` при вызове как процесс молча возвращал
пустой stdout; fires-лог не писался — хотя в BDD-тестах (которые импортируют функции) всё было
зелёным.

**Причина** (`tools/advisor/advisor_stop.ts:361`):
```js
const thisUrl = import.meta.url.replace('file:///', '').replace(/\\/g, '/');
```
На Linux `import.meta.url` = `file:///home/...` → после replace получается `home/...` БЕЗ
ведущего `/`, а `path.resolve(argv[1])` = `/home/...` — `endsWith` → false → `isDirect` → false
→ `main()` НЕ запускался. На Windows совпадало (`file:///E:/...` → `E:/...`), поэтому локально
не воспроизводилось.

**Фикс:** `fileURLToPath(import.meta.url)` (платформенно-независимо). Bundle пересобран
(`npm run build:advisor`, 26.5kb).

**Регрессионный тест:** BDD-сценарий INNERADV11 «bundle entry executes as process on POSIX»
spawn'ит bundle как процесс с `{}` на stdin и проверяет approve-JSON + fires-лог.
`docker-bdd --name INNERADV`: 11 scenarios (11 passed), 67 steps (67 passed).

## 3. BDD-статус (после фикса)

- Filtered run `INNERADV*`: **11/11 passed, 67/67 steps** (последний прогон 2026-08-16).
- validate-spec: 0 errors / 0 warnings / 18/18 файлов; CHK 15/15 Verified; TASKS 12/12 done
  (включая `inner-live`).

## 4. Честные оговорки

- Полный канонический suite (все 50+ фич) НЕ проходит в этой среде: 3 полных прогона сегодня
  (06:36 / 08:07 / 09:15) — success=false (252 UNDEFINED/PENDING + 20 AMBIGUOUS, чужие фичи)
  или обрыв без testRunFinished (обрыв на spec-generator-v4.feature, 703 сценария — первая
  фича в cucumber.json). INNERADV-сценарии в полных прогонах не выполняются (cucumber падает/
  обрывается до них) — канон-кадастр для inner-advisor недостижим без починки чужих
  undefined-фич (вне скоупа этой фичи). Доказательство зелени INNERADV — filtered-прогон
  `docker-bdd.sh --name INNERADV`: 11/11 passed (67 steps), архивы в `.test-history/`.
- Интерактив — через tmux send-keys (эмуляция клавиатуры), а не человеческий ввод; сам факт
  работы агента, вызова MCP и хуков — реальный, без моков.
- Live-прогон был в Docker-песочнице (bypass permissions), транспорт — локальный sub2api,
  не прод-API.

## 5. Итог

| Проверка | Результат |
|---|---|
| Канон-install (marketplace → install → list) | ✅ |
| MCP-тул доступен агенту, консультирует | ✅ (2 вызова, реальный LLM) |
| Stop-hook пишет fires + marker | ✅ |
| Rolling summary создан с 10 секциями | ✅ (gpt-5.6-luna) |
| Консультация mode=summary + delta | ✅ (delta=12, сжатие 96%) |
| BDD регресс на entry-баг | ✅ INNERADV11 (11/11) |
