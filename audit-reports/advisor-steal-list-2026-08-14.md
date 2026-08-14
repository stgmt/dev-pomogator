# Ресёрч: что спиздить в адвизора из GitHub (session-aware advisor)

**Дата:** 2026-08-14 · **Метод:** GitHub поиск по «claude code session context summary», «session
summarizer agent transcript» + чтение найденных репо и нативного бинаря Claude Code.

## Главное открытие

**У самого Anthropic есть встроенная Session Memory экстракция** (внутренний
`src/services/SessionMemory/sessionMemory.ts` + `prompts.ts`), и она **перепорт** на публичных
хуках репо **`AUI-AI-squad/ccjr-state-manager`** («прямой порт нативной session-memory extraction…
тот же темplейт, gate-пороги, промпт»). Это готовый «оригинал», а не самоделка — самое ценное для
порта.

## Найденные репо

| Репо | Звёзды | Что делает | Ценность для нас |
|---|---|---|---|
| **ccjr-state-manager** | 0 (но 20 коммитов, 150 тестов) | Stop-hook: держит 10-секционный `summary.md`, гейт-пороги, Mode A/B, file_edit | ** высокая** — нативный формат/пороги/промпты |
| memctx | 26 | Авто-память сессий в SQLite+даемон, граф, dashboard, handoff-рубрики | средняя — идеи «START HERE / tech debt / drift» |
| claude-session-handoff | 2 | 7-секционный чат-саммари для передач между агентами | низкая — похоже на наш digest |
| ccm (rexzhen) | 2 | session management, авто-сейв, загрузка саммари на старте | низкая |
| session-bandit (janole) | 0 | CLI поиск/сводки по транскриптам Claude/Codex | низкая — общая идея выжимок |
| claude-conversation-logger | 1 | hook-захват + саммари сессий | низкая |
| context-restore | 0 | восстановление контекста после /compact из транскрипта | средняя — близко к нашему digest-from-transcript |

## Что именно переносим (по приоритету)

### 1. Rolling `summary.md` — 10-секционный шаблон (Нативный prompts.ts)
Формат (буквально из оригинала):
```
# Session Title            # Current State          # Task specification
# Files and Functions      # Workflow               # Errors & Corrections
# Codebase and System Docs # Learnings              # Key results
# Worklog
```
Модель-адвизор **ведёт этот файл** (мы его пишем/читаем на диске), а не собирает digest заново из
транскрипта каждый раз. Переживает `/compact` и `--resume`. Секционные лимиты: ≤2K ток/секция,
≤12K всего; при переполнении — конденсировать, сохраняя «Current State» и «Errors» приоритетно.

### 2. Gate-пороги + cost-gate (Нативная sessionMemoryUtils)
- инициализация: экстракт после **5K контент-токенов**;
- обновление: при **≥5K нового контента** И (**≥3 tool calls** с прошлой экстракции ИЛИ последний
  ход без tool calls — «конверсационный escape hatch»);
- механические условия исключают «позвать на каждый done» — это наш главный больной вопрос.

### 3. Mode A/B + truncate-to-fit
- **Mode A** (<149K api-tokens): вся беседа;
- **Mode B** (≥149K): **delta-only** — только новые записи с прошлой экстракции (экономия на больших
  сессиях);
- `truncate_messages_to_fit`: с хвоста в бюджет, маркер «[earlier conversation truncated]».
У нас есть токен-бюджет/приоритет, но **нет delta** — каждый вызов перечитывает весь транскрипт.

### 4. file_edit tool + cache_control
- апдейт секций через `file_edit` (old_string→new_string), проблемы «old_string not found»
  восстанавливаются повторными вызовами до MAX_TURNS=10;
- cache_control breakpoint на последнем сообщении → повторные экстракции ~в 10 раз дешевле;
- PoC стоимость через Haiku ~$0.05–0.30/сессия.

### 5. Handoff-рубрики (из memctx, для формата совета адвизора)
`START HERE` / **Open Rabbit Holes** / **Tech Debt** / **Architectural Drift** — готовые рубрики,
которые адвизор должен выдавать в конце совета («что дальше»).

## Что уже есть у нас (не дублировать)
- токен-бюджет/приоритет (`renderDigestPrioritized`);
- двухпроход summarizer→advisor (у них нет);
- repo-rules (AGENTS.md), self-check git/файлы;
- fail-open, self-reference filter, async-parallel digest (git через spawn+Promise.all, 10s→0.4s).

## План внедрения (предложение)
1. **Cost-gate** по порогам ccjr (5K init / 5K growth + 3 tool calls) — сразу закрывает «не звать
   адвизора на каждый done». Только чтение, без нового кода модели.
2. **Rolling summary.md** (10 секций) — адвизор пишет/читает; следующий вызов обновляет секции
   file_edit-подобно, а не пересобирает digest.
3. **Mode B (delta-only)** на больших сессиях — читать хвост транскрипта с прошлой экстракции.
4. **cache_control breakpoint** + handoff-рубрики в финале совета.

## Статус внедрения (2026-08-14, Фазы 1–2)

### Сделано (код + офлайн-проверка)
- **`session-summary.mjs`** (новый): 10-секционный шаблон из `prompts.ts`, гейт (5K init / 5K growth
  +3 tool calls | no-tool-last-turn), дельта (`sliceDelta`), атомарная запись (temp+rename), `wx`-lock
  по сессии, `verifyStructure` (заголовки + italic описания), таймаут-страховка (30s) для апдейта.
- **`advisor_stop.ts`**: по гейту авто-обновляет summary (env `ADVISOR_SESSION_SUMMARY=1`,
  `ADVISOR_SUMMARY_FORCE=1` для форса). Fail-open: ошибка → skip, stop не блокируется.
- **`session-digest.mjs`**: `buildSummaryPacket` — если summary есть → пакет = summary + delta-хвост
  (~12 событий) + repo-rules + ошибки; иначе фолбэк на полный digest. `callModel` получил
  параметры `cacheControl` (breakpoint) и возвращает `usage`.
- **`mcp-server.mjs`**: режим `digest` при `ADVISOR_SESSION_SUMMARY=1` идёт через `buildSummaryPacket`.

### Офлайн-доказательство
- parse реального транскрипта → гейт init честно не стреляет (361 < 5K) на маленькой сессии;
- форсированный апдейт создаёт `summary.md` (10 секций), state.extraction_count=1;
- **`buildSummaryPacket` видит summary → mode='summary', пакет 2.3K из 109K raw (~48× меньше**),
  т.е. консультация НЕ пересобирает транскрипт.

### Блок: live-прогон sub2api недоступен
В момент live-теста **sub2api (172.30.206.176:8787) перестал отвечать** (таймауты на gpt-5.6-luna и
sol, даже ping 8 токенов) — внешний сбой, не наша регрессия. Живой `claude -p` завис, summary не
создался при живом вызове модели. **Код валиден офлайн; живой прогон повторить как только sub2api
оживёт** (сценарий: задача → Stop-hook форс назвал summary → вторая консультация читает его).

## Источники
- https://github.com/AUI-AI-squad/ccjr-state-manager (+ сырой `session_memory_extractor.py` = порт
  `sessionMemory.ts`/`prompts.ts` Claude Code)
- https://github.com/bbhunterpk-ux/memctx
- Наш инфраструктура: `tools/advisor/*` (mcp-server.mjs, session-digest.mjs, fast-evidence.mjs).