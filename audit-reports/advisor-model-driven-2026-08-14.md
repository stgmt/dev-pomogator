# Как сделать, чтобы агент САМ вызывал адвизора (model-driven)

**Дата:** 2026-08-14 · **Метод:** разбор исходника `claude.exe` 2.1.219 + живой прогон на нашем стеке
(sub2api → gpt-5.6-sol/luna).

## TL;DR

- **Нативный Claude Code** вызывает адвизора МОДЕЛЬЮ: адвизор — это **server-side tool**
  `{type:"advisor_20260301", name:"advisor", model:<X>}`, который Claude Code дописывает в каждое
  подмножество тулов, когда задан `advisorModel`. В системный промпт добавляется отдельный блок
  «# Advisor Tool», который **учит модель КОГДА звать**: до существенной работы, перед объявлением
  done, при застревании, при смене подхода. Модель сама решает вызвать `advisor()`, без параметров
  — сервер уводит весь диалог на более сильную модель и возвращает guidance.
- **Почему у нас это не заведётся напрямую:** sub2api-прокси форвардит tool-декларацию и умеет
  вернуть `tool_use advisor`, но **не исполняет серверный тул** — эмпирически агент зовёт
  `advisor()` и получает `No such tool available: advisor`.
- **Рабочий путь на нашем стеке (доказан):** выставить `advisor` как **MCP-тул**
  (`mcp__dev-pomogator-advisor__advisor`). Агент сам (модель решает) вызывает его и получает
  guidance. Это тот же model-driven паттерн, на клиентской стороне.

---

## 1. Что реально делает Claude Code (по исходнику бинаря)

Разобрал `C:\Users\stigm\.local\bin\claude.exe` (bun-compiled, 2.1.219) — миницифицированный JS
виден целиком. Ключевые строки:

```js
// 1) резолв адвизора из настроек:
function pEo(){ if(!H7()) return; return Dws(eo()) }              // H7 = advisor включён (конфиг/flag)
function Dws(e){ return typeof e.advisorModel==="string" ? e.advisorModel : void 0 }
// eo() = userSettings.advisorMode; советская запись `advisorModel`

// 2) афикс тула к КАЖДОМУ запросу модели:
let ne=[...i.extraToolSchemas??[]];
if(_) ne.push({type:"advisor_20260301", name:"advisor", model:_});   // _ = выбранная модель-адвизор
let ee=[...M,...ne];                                                  // ee = все тулы этого хода
```

То есть механизм ровно один: **добавить server-side тул в схему тулов на каждый ход** и
**добавить системный промпт-инструкцию**, и всё — модель сама решает вызвать `advisor()`.

### 1.1 Парные проверки (model catalog / ranks)

```js
const sxy=2; // минимальный advisor_rank для включения
function uEo(){ return process.env.CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL } // escape-hatch
function kws(e){ return catalog(e).advisor_rank }                 // ранг базовой модели
function Iws(e){ /* ранк кандидата-адвизора из каталога */ }
function gUe(e){ if(uEo()) return true; return kws(e) !== undefined }   // база поддерживает?
function E9e(e){ if(!uEo()) ...; if(!GQu() && CT()) return false; return qQu(e) } // адвизор валиден?
function Rdt(e,t){ if(uEo()) return true; const r=kws(e),n=Iws(t);
                  if(r===undefined||n===undefined) return true; return r<=n } // rank(main) <= rank(advisor)
```

Логи:
```
[AdvisorTool] Skipping advisor - base model 'gpt-5.6-sol' has no advisor rank in the model catalog.
  Switch to a public model alias (opus, sonnet, fable) or set CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL=1.
[AdvisorTool] Server-side tool enabled with <X> as the advisor model
```

Вывод по нашему окружению: `gpt-5.6-sol/luna` — это НЕ каталог Claude, у них нет `advisor_rank`,
поэтому без escape-hatch адвизор вообще скипывается. С `CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL=1`
обход включается, и тул реально дописывается.

### 1.2 Системный промпт «# Advisor Tool» (буквально из бинаря)

```
# Advisor Tool

You have access to an `advisor` tool backed by a stronger reviewer model. It takes NO parameters
-- when you call advisor(), your entire conversation history is automatically forwarded. They see
the task, every tool call you've made, every result you've seen.

Call advisor BEFORE substantive work -- before writing, before committing to an interpretation,
before building on an assumption. If the task requires orientation first (finding files, fetching
a source, seeing what's there), do that, then call advisor. Orientation is not substantive work.
Writing, editing, and declaring an answer are.

Also call advisor:
- When you believe the task is complete. BEFORE this call, make your deliverable durable...
- When stuck -- errors recurring, approach not converging, results that don't fit.
- When considering a change of approach.

On tasks longer than a few steps, call advisor at least once before committing to an approach and
once before declaring done. On short reactive tasks ... don't keep calling.

Give the advice serious weight. If you follow a step and it fails empirically, or you have
primary-source evidence that contradicts a specific claim ... adapt. A passing self-test is not
evidence the advice is wrong.

If you've already retrieved data pointing one way and the advisor points another: don't silently
switch. Surface the conflict in one more advisor call -- "I found X, you suggest Y, which
constraint breaks the tie?"
```

«Обвязок» вне этого минимума нет: декларация тула + промпт. Модель сама решает, когда звать.

### 1.3 Как включается

| Способ | Механика |
|---|---|
| `/advisor fable` | пикер/прямой CLI — пишет `advisorModel` в user settings |
| `advisorModel` в `settings.json` | персистентный дефолт |
| `--advisor <alias|fullID>` | на одну сессию (priority над settings) |
| `CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL=1` | escape-hatch: форсить тул даже без rank в каталоге |
| `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` | выключить вообще |

Допустимые пары: адвизор должен быть **не слабее** основной модели (`{{rnk(main)} <= rank(advisor)}`).
Fable-основная принимает только Fable. UI: строка `Advising … <model>`, после ответа
«Advisor has reviewed the conversation and will apply the feedback», Ctrl+O — развернуть guidance.

### 1.4 Как возвращается результат

Инфраструктура Anthropic исполняет тул и шлёт блоками:
`server_tool_use → content advisor_tool_result → (ошибка)` — строки в бинаре:
- `type:"advisor_tool_result"`, `type:"advisor_tool_result_error"`, `error_code`
- `Advisor tool result content could not be processed`, `found in advisor_tool_result blocks`
- `[AdvisorTool] Advisor tool called` / `result received` / `result error`

Это серверная часть — её у нас НЕТ (мы не Anthropic API, у нас прокси на gpt-5.6).

---

## 2. Эмпирика на нашем стеке (sub2api / gpt-5.6-sol)

### Прогон 1: `claude -p --advisor fable`
Агент ответил «ok», **никакого advisor-тула в транскрипте нет** — т.к. `gpt-5.6-sol` без rank в
каталоге → адвизор скипнут. Логически подтверждает раздел 1.1.

### Прогон 2: `--advisor fable` + `CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL=1`
Транскрипт `84bb76da-4cc5-47d6-aff0-7d6a4f521c04`:
```
12 assistant [tool_use:advisor] { "name":"advisor", "input":{} }
13 user        [tool_result] <tool_use_error>Error: No such tool available: advisor
```
→ **Модель сама вызвала `advisor()`** (значит декларация тула и промпт сработали!), но прокси
вернул «No such tool» — server-side исполнение отсутствует.

### Прогон 3: прямой запрос к прокси `/v1/messages` с `tools:[{type:"advisor_20260301",name:"advisor",model:...}]`
HTTP 200, ответ `stop_reason:"tool_use"` с `tool_use advisor input:{}` — прокси **пропускает**
декларацию тула, модель видит и зовёт его, но **не исполняет** (возвращает только намерение).

**Диагноз:** нам не хватает именно *исполнителя* серверного тула. Нативный путь требует
«честного» Anthropic-конца (где `advisor_tool_result` реально формируется сервером).

---

## 3. Рабочий путь на НАШЕМ стеке: адвизор как MCP-тул (модель решает сама, полный транскрипт)

MCP-тул выполняется клиентски (`claude` вызывает локальный stdio-сервер, прокси не участвует в
исполнении) → то, что невозможно на server-side, работает через клиент. Агент видит
`mcp__dev-pomogator-advisor__advisor` и сам вызывает его, когда считает нужным.

**Ключевая поправка к нативному контракту:** у нативного `advisor()` `input` всегда пуст —
«Nothing the executor puts in input reaches the advisor. The server constructs the advisor's view
from the full transcript automatically» (дока, `agents-and-tools/tool-use/advisor-tool`). Первая
итерация MCP-тула нарушала это (просила экзекутора писать `context` однострочником — давала
адвизору мусор). Исправлено: **тул не принимает параметров**, сервер сам восстанавливает полный
транскрипт.

### Что сделано (PoC, v2)

- `tools/advisor/transcript-packet.mjs` — чистые хелперы:
  - `resolveTranscriptPath()` — находит транскрипт текущей сессии через `CLAUDE_CODE_SESSION_ID`
    + `CLAUDE_PROJECT_DIR` (обе env передаются Claude Code в MCP stdio-процесс — проверено
    env-probe): `~/.claude/projects/<encoded-dir>/<session-id>.jsonl`;
  - `buildTranscriptPacket()` — из сырого `.jsonl` строит компактный пакет **полной истории**:
    user-сообщения, assistant-текст, каждый `tool_use` (имя + input), каждый `tool_result`
    (контент + флаг error), bounded последние ~60 блоков / 30k символов;
  - `consultAdvisorFromTranscript(packet)` — вызов `gpt-5.6-sol` через
    `ANTHROPIC_BASE_URL/v1/messages`, возвращает guidance (fail-open);
- `tools/advisor/mcp-server.mjs` — stdio MCP-сервер, тул `advisor` **без параметров**:
  `{}` input, вызывает три хелпера и возвращает guidance как tool_result;
- dep-safe: `@modelcontextprotocol/sdk` + `zod` (уже в package.json).

### Как включить

```jsonc
// .mcp.json (проект)
{
  "mcpServers": {
    "dev-pomogator-advisor": {
      "type": "stdio",
      "command": "node",
      "args": ["<repo>/tools/advisor/mcp-server.mjs"]
    }
  }
}
```

+ опционально системная инструкция (аналог нативного блока «# Advisor Tool»), например в
`CLAUDE.md`/skill-промпте: «Call `mcp__dev-pomogator-advisor__advisor` (no params — ваша вся
история автоматически передаётся адвизору) before substantive work, before declaring done, when
stuck, when changing approach.» Без неё тул доступен, но модель может не догадаться звать.

### Доказательство (живой прогон `claude -p` в dev-pomogator)

Запрос: «прочитай README, выполни git status, посмотри header transcript-packet.mjs; ЗАТЕМ
вызови `mcp__dev-pomogator-advisor__advisor` БЕЗ параметров; назови самый рискованный момент в
транскрипте.»

- Агент реально сделал чтения + git, потом сам вызвал `mcp__dev-pomogator-advisor__advisor` с
  **пустым input: {}**.
- MCP-сервер по env нашёл транскрипт текущей сессии, собрал пакет **26 блоков / 3 391 символ**
  (трейс `%TEMP%\advisor-mcp-trace.log`, `ADVISOR_TRACE=1`) и консультировал gpt-5.6-sol.
- Адвизор вернул **evidence-based** совет, ссылаясь на реальное содержимое транскрипта:
  - риск конфигурации `CLAIM_GATE_ENABLED=false + --permission-mode bypassPermissions`
    (заметил из транскрипта, где висела мусорная системная обвязка);
  - `git status` в транскрипте — только суммария, а не список изменений → проверить `git diff`;
  - лимиты пакета `MAX_TRANSCRIPT_BLOCKS`/`PER_BLOCK_CHARS`/`MAX_TOTAL_CHARS` и порядок
    truncation;
  - **нашёл расхождение таймаутов**: `advisor_stop.ts` 30000ms vs `transcript-packet.mjs`
    45000ms (реальная дыра в PoC — её потом поправили на 30000ms в обоих местах).
- Агент применил: в финале назвал риск, который увидел адвизор (а не сам).

Это поведение стокового адвизора: читает полную историю и ловит проблемы, которых сам
экзекутор в ответе не видит.

**Известное ограничение клона:** транскрипт читается с диска, а нативный адвизор видит
in-memory контекст. Claude Code может писать `.jsonl` лениво → в начале тура пакет может не
содержать самые свежие tool_result текущего хода. Это надо учитывать (сверять в реальном
клоне; вероятно нужен мини-ретрай / чтение после паузы), но базовый механизм рабочий.

---

## 4. Сравнение путей

| Аспект | Нативный server-side (Anthropic API) | Через MCP-тул (наш стек) |
|---|---|---|
| Кто решает звать | модель (промпт «# Advisor Tool») | модель (описание тула + опц. промпт) |
| Исполнение | сервер Anthropic | локальный stdio MCP → gpt-5.6-sol |
| Авто-проброс всего диалога | да (`advisor()` без параметров, input всегда `{}`) | да — тул без параметров, сервер сам читает транскрипт с диска (`resolveTranscriptPath` + `buildTranscriptPacket`) |
| Полнота контекста | живой in-memory контекст | транскрипт `.jsonl` с диска (может отставать от in-memory в начале хода); bounded последние ~60 блоков / 30k символов |
| Работает на sub2api | нет (нет server-side executor) | **да (доказано)** |
| Стоимость/латентность | серверные, вкл. в биллинг | ~1 вызов gpt-5.6-sol на консультацию (~5-6s), отдельные токены |
| Системная инструкция node | встроена в Claude Code | надо добавить самому (skill/CLAUDE.md) |

**Рекомендация:** для немедленного «агент сам зовёт адвизора на нашем стеке» — MCP-тул + короткая
системная инструкция (skill/CLAUDE.md). Если цель — честный server-side аналог (полный проброс
диалога, биллинг, `/advisor`-конфиг) — это вопрос к **lm-saas relay** (прокси должен исполнять
`advisor_20260301` и возвращать `advisor_tool_result`), там это ровно тот же класс работы, что в
`anthropic-api-expansion` совпадает с «Advisor tool — нет FR».

---

## 5. Артефакты

- `tools/advisor/transcript-packet.mjs` — хелперы: найти транскрипт по session-id, собрать полный пакет, вызвать модель.
- `tools/advisor/mcp-server.mjs` — MCP-сервер с тулом `advisor` (без параметров, полный транскрипт).
- `tools/advisor/advisor_stop.ts` + `bench/bench.ts` — Stop-hook-вариант (детерминированный) и бенч.
- `audit-reports/advisor-poc-2026-08-14.md` — первый отчёт (Stop-hook PoC).
- Доказательства: `84bb76da…` (server-side: No such tool available), `d95e63e6…` (первая,
  неправильная итерация MCP с ручным `context`), финальный прогон — `%TEMP%\advisor-mcp-trace.log`
  (26 блоков / 3 391 символов, полный транскрипт).
- `.mcp.json` восстановлен к исходному виду; включение MCP-сервера — 6 строк, см. раздел 3.