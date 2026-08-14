# Research

## Контекст

Паттерн «адвизор + воркер»: отдельная агентная сессия (адвизор) наблюдает, проверяет и
управляет другой живой Claude Code сессией (воркер), вмешиваясь как стоковый Anthropic
Advisor, но с упором на **внешнюю** проверку фактов («пиздёж»-детекция) и **интерактивное**
управление (ConPTY). Источник задачи — живой эксперимент `ses_00b9321adffezR4p0dDfROGH4H`
(opencode.db, проект `E:/repos/presentation-reels`), где адвизор управлял Claude Code
сессией `6126f730-d6c9-4eca-98ae-f858e110648f` (проект `E:\repos\sales`).

## Prior art (GitHub research, 2026-08-14)

Поиск по GitHub (API, не репо-звёзды — правило `research-by-code-signature-not-stars`)
показал: паттерн «внешний адвизор/контроллер другой Claude Code сессии» **уже решён**
несколькими проектами. Спека не пишет с нуля, а адаптирует зрелые механизмы.

### Таблица кандидатов «что спиздить»

| Репо | ★ | Язык | Лицензия | Что даёт | Как ложится на нашу спеку |
|------|---|------|----------|----------|---------------------------|
| **`obra/claude-session-driver`** (csd) | 105 | TS | MIT | Контроллер-воркер: `csd launch/send/converse/read-turn/read-events/status/stop/handoff`; JSONL event-stream Сеанс/промпт/tool-call/stop через **hooks** (не парсинг); гибридные харнессы Claude+Codex+Pi; плагин. | **Прямой референс FR-2/части B**: его **hooks-driven events** надёжнее нашего tail-парсинга транскрипта. Берём модель событий, НЕ tmux (у нас Windows+ConPTY). |
| **`claw-army/claude-node`** | ~ | Python | NOASSERTION | **Тонкий Python-мост к живому `claude` CLI через stream-json**: process-level контроль, session lifecycle, `converse`, supervisor-встраивание. | **Заменяет наш `pty_daemon.py`**: готовый Py-контроллер сессии вместо самописного ConPTY. Падеж: флаг `stream-json` вручную, наш ConPTY может быть надёжнее для TUI-диалогов. |
| **`S40911120/claude-session`** (@recensa) | — | JS | MIT | Node-библиотека JSONL: parse/**verify/repair**/fork/merge/redact; ловит дефекты, ломающие `--resume` (orphan tool_use и т.п.). | **Усиливает `verify_claims` (FR-3)**: готовый verify/repair транскрипта + temp+rename atomic-запись (наш atomic-config-save). |
| **`Guiziweb/claude-code-data`** | — | TS | MIT | `readSessionTurns` + **`readSubagentTurns`** — рекурсивный парсер `<sid>/subagents/agent-*.jsonl`, включая вложенный `workflows/<runId>/` (depth≤8). | **Прямое попадание под FR-1**: их парсер подтверждает наш корень (субагенты в `subagents/`) и даёт готовый tail-режим субагентов. |
| **`lout33/agentmux`** | 3 | Py | MIT | Контрольная плоскость: tmux+SQLite, manager+workers, live-дашборд, промпт-подача любому агенту. | **Часть B (параллельность)**: модель «одна durable-обложка агента + состояние в SQLite» — база для нашего `parallel-session-inventory`/diag. |
| **`michaeljabbour/amplifier`** | — | Py | MIT | Cross-harness PTY **daemon** (Claude/Codex/Gemini/OpenCode), artifact-gated relay controller. | **Альтернатива нашему ConPTY**: «forge PTY daemon» как готовый заменитель `pty_daemon.py`. |
| `Arylmera/Token-Dashboard`, `XJM-free/claude-agent-ledger`, `IvanBBaev/agenthropic` | 1-10 | Rust/… | MIT | Локальные дашборды: JSONL-транскрипты, per-subagent cost attribution, subagent DAG. | Отдельные потребители транскриптов; подтверждают формат, но не нужны нам напрямую. |
| `WillInvest/ClaudeX`, `dahlialabs/second-opinion`, `smart-byte/codex-plan-reviewer` | ~ | TS/Py | MIT | Second-opinion reviewer через MCP/внешний LLM; Opus-review планов. | Родственно FR-3 «проверка на пиздёж» — но наша verify сильнее (цепочка 403, БД, live). |

### Рекомендация (что реально брать)

1. **FR-2 (ConPTY/управление)** — судить `claw-army/claude-node` как заменитель pty-демона:
   протестировать его stream-json флаг против нашего ConPTY в live-прогоне воркера, выбрать
   по надёжности доставки промпта и перехвата TUI. Если stream-json не отдаёт полный TUI —
   остаёмся на ConPTY (уже работает, FR-2 в силе).
2. **FR-1 (tail субагентов)** — либо взять `claude-code-data` (`readSubagentTurns`) как
   **зависимость** в `verify_claims`, либо скопировать его рекурсивный scan (depth≤8,
   `workflows/<runId>/` — точь-в-точь наша находка). Скопировать путь-логику дешевле, чем тянуть npm.
3. **FR-3 (verify/repair транскрипта)** — взять у `@recensa/claude-session`: его
   `verify`/`repair` + temp+rename — готовая реализация нашего claim-гейта и atomic-записи.
   `[VERIFIED: github.com/S40911120/claude-session README "verify/repair/fork/merge/redact"]`
4. **Часть B (параллельность)** — у `csd`/`agentmux` взять **модель**: durable worker identity +
   JSONL event-stream + SQLite state; не копировать tmux (наш транспорт Windows-native).
5. **Не писать с нуля**: hooks-driven events (csd) принципиально надёжнее нашего
   tail-парсинга для наблюдения ДЕЙСТВИЙ воркера — рекомендую в Phase 1 спеки дорешать
   «hooks-опционал» наравне с tail (FR-1): если воркер наш (ставим plugin), hooks;
   если чужой (нет плагина) — tail-фоллбэк. Это закрывает и наш корень «не видит субагентов»:
   `claude-code-data.readSubagentTurns` доказывает, что субагентные JSONL — стандарт CC ≥2.1.2.

### Статус-маркеры prior art

- **Контроллер-воркер** `[VERIFIED: obra/claude-session-driver README + hooks/hooks.json + src/events.ts + src/core/transcript.ts]`
- **Python-мост** `[VERIFIED: claw-army/claude-node README + api tree (controller.py/router.py)]`
- **Субагент-парсер** `[VERIFIED: Guiziweb/claude-code-data src/data/parser/session.ts readSubagentTurns]`
- **Verify/repair JSONL** `[VERIFIED: S40911120/claude-session README + src parser]`
- **Контрольная плоскость** `[VERIFIED: lout33/agentmux README manager+workers]`
- **Важный вывод для спеки**: внешний адвизор по-настоящему ни у кого НЕ реализован как
  «проверка на пиздёж против БД/цепочки» — конкурентные проекты делают **наблюдение и
  delegation**, а не **верификацию claims**. Наша FR-3/FR-9 остаётся дифференциатором.

Порядок «спиздить» (план): выкатить csd локально → протестировать claude-node stream-json →
сравнить с ConPTY → решить FR-2; взять readSubagentTurns-логику в tail (FR-1); взять
verify/repair-паттерны в verify_claims (FR-3). Всё по лицензиям MIT/документируемо.

## Источники

- Живой эксперимент: `ses_00b9321adffezR4p0dDfROGH4H` → расшифровка `%TEMP%\opencode\adv_texts.txt`
  (извлечена из opencode.db: таблицы `session`, `message`, `part`).
- Скрипты эксперимента: `%TEMP%\opencode\pty_daemon.py`, `tail_session.py`, `strip_ansi.py`,
  `read_pty.py`; протокол `claude-ctl.json` / `claude-rsp.json`.
- Скил-прецедент в presentation-reels: `.claude/skills/out-session-advisor/SKILL.md`.
- Существующий PoC адвизора в dev-pomogator: `tools/advisor/` + отчёты
  `audit-reports/advisor-poc-2026-08-14.md`, `audit-reports/advisor-model-driven-2026-08-14.md`.

## Технические находки

### Слепота на субагентов (корень симптома «засыпает»)

Claude Code пишет транскрипт субагентов в отдельные файлы:
`~/.claude/projects/<proj>/<session>/subagents/agent-*.jsonl` — для `6126f730...` десятки
файлов, у каждого собственный поток `user/assistant/attachment`. Адvsор в эксперименте читал
только главный `<session>.jsonl`. Пока воркер гоняет субагента, его рассуждения уходят в
side-файл — адвизор не видит ход мысли. **Вывод:** tail обязан хвостить живые
`subagents/agent-*.jsonl` (незакрытые, до последней строки).

### ConPTY-управление (Windows)

`pty_daemon.py` — долгоживущий python-процесс: `PtyProcess.spawn([claude.exe, --resume <sid>,
--model <m>], cwd, dimensions, env)`; reader-thread копит вывод; протокол — два JSON-файла:
`claude-ctl.json` `{action: send|read|exit, prompt, wait}` → `claude-rsp.json`
`{out: <snapshot>, pid}`. Многострочный промпт в Claude Code попадает в редактор ввода —
нужен второй пустой `send` (Enter) для submit. Permission-диалог отвечается числом
(«1»=Yes, «2»=Yes+не спрашивать); надёжно — стартовать воркер сразу с
`--dangerously-skip-permissions`.

### Факт-проверка на «пиздёж»

В эксперименте адвизор дважды ловил ложь воркера:
1. «fresh live 403 на g65» — независимая live-проверка той же карточки (профиль/headless/флаги)
   дала HTTP 200; причина ложного 403 — детектор резал по промежуточному document-ответу цепочки.
2. «блокер навсегда» — `run_external_blockers` с `INSERT OR IGNORE` + PK `run_id` замораживал
   запуск архивным блокером; фикс — `source=live|archived` + live-only гейты + явный clear.

### Доменные истины (проверены live на Ozon-harness sales)

- Цепочка Ozon: `307 (?sh=…) → 403 (…&__rr=1) → 200 (…&__rr=1&abt_att=1)`. Промежуточный 403
  ≠ блокер; блокер = финальный document ≥400 И `url === page.url()`. `__rr=1` штатный.
- Бренд/артикул берётся со страницы ПОСЛЕ открытия (`h1`, характеристика «Бренд», «Артикул: N`,
  breadcrumb), НЕ из URL-slug (`/product/naushniki-smart...-<id>/` без бренда бывает).
- Техсбой запуска («Chrome launcher PID did not expose owned browser child», «Chrome profile
  'Default' is missing») ≠ 403 и ≠ результат Ozon.

## Где лежит реализация

- App-код (PoC): `tools/advisor/` (`advisor_stop.ts`, `transcript-packet.mjs`, `mcp-server.mjs`,
  `bench/bench.ts`).
- Скрипты эксперимента (внетепо!): `%TEMP%\opencode\` — параметризацией в `tools/out-session-advisor/`.
- Прецедент скила: `E:\repos\presentation-reels\.claude\skills\out-session-advisor\SKILL.md`.

## Выводы

Паттерн подтверждён живым прогоном: адвизор читает транскрипт, отделяет правду от «пиздёжа»
сверкой с диском/БД, управляет воркером через ConPTY, стопает/промптит. Чтобы стать «как
стоковый» и «по умолчанию» — нужны: (a) tail субагентов (снятие слепоты), (b) параметризованный
transfer скриптов в `tools/out-session-advisor/`, (c) канонический SKILL + зеркало + спека/BDD.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| no-unverified-blocker | `.claude/rules/no-unverified-blocker.md` | прежде чем «заблокировано/жду» — предъяви улику (ls/git diff) | любой «не могу трогать» | FR-2, FR-3 |
| no-git-add-all-shared-tree | `.claude/rules/gotchas/no-git-add-all-shared-tree.md` | параллельные сессии делят дерево; `git add -A` запрещён | коммиты | NFR (изоляция) |
| atomic-update-lock | `.claude/rules/atomic-update-lock.md` | lock через `flag:'wx'`, не exists+write | параллельные апдейты | FR-2 (verify) |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | конфиги через temp+move | запись конфигов | FR-2 |
| skill-allowed-tools-audit | `.claude/rules/checklists/skill-allowed-tools-audit.md` | allowed-tools покрывают ВСЕ инструменты workflow | создание/правка скила | FR-5 |
| bdd-only-tests | `.claude/rules/bdd-only/bdd-only-tests.md` | тесты — BDD `.feature`; новым `*.test.ts` forbidden | тесты | FR-1..5, BDD |
| verify-against-real-artifact | `.claude/rules/testing/verify-against-real-artifact.md` | фикстуры зеркалят РЕАЛЬНЫЙ вывод producer'а | фикстуры транскриптов | FR-1, FR-4 |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker тесты не блокировать; background | прогон | NFR |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| `tools/advisor/transcript-packet.mjs` | `E:\repos\dev-pomogator\tools\advisor\` | packeria транскрипта + вызов сильной модели через `/v1/messages` | переиспользуема для verify |
| `tools/advisor/advisor_stop.ts` | там же | детерминированный Stop-hook адвизора (done/recurring/plan) | модель-пара в одной сессии (не дубль) |
| `session-pilot/serves` | `.agents/skills/session-pilot/` + `tools/session-pilot/` | поднятие/resume Claude в worktree через dashboard | лаунчер воркера (режим B) |
| `out-session-advisor/SKILL.md` (presentation-reels) | `E:\repos\presentation-reels\.claude\skills\out-session-advisor\` | готовый скил-прецедент (110 строк) | база для канона |
| `tools/_shared/process-tree.ts` | `E:\repos\dev-pomogator\tools\_shared\` | поиск процессов по дереву (windows) | живость воркера |

### Architectural Constraints Summary

- Один писатель в один JSONL: адвизор никогда не пишет в транскрипт воркера; перед
  `claude --resume` — остановить предыдущий процесс того же session-id.
- Скрипты ConPTY/tail переносятся в плагин и параметризуются (сейчас захардкожены под
  `%TEMP%` и `cwd=E:/repos/sales`); pywinpty доступ не гарантирован → нужен fallback.
- allowed-tools скила охватывают: Read/Write/Edit (vue фейк-файлов теста), Bash (ConPTY,
  процессы), Glob/Grep (транскрипты), верификационные вызовы модели.
- BDD-тесты гоняются только в Docker (правило no-host-bdd-runs); фикстуры транскриптов —
  реальные куски из `6126f730.../subagents/agent-*.jsonl`.

## Proof of Concept

**PoC Required:** yes

**Провенанс:** живой прогон `ses_00b9321...` (opencode.db) — адвизор управлял воркером
`6126f730...` в `E:\repos\sales`, ловил ложные 403, правил харнесс, гнал g67-g69.

**Verdict:** WORKS — механики (tail транскрипта + strip_ansi + ConPTY ctl/rsp + verify against
БД/файлы) подтверждены рабочими файлами в `%TEMP%\opencode\` и логами.

## Cost Estimate

**Runtime/CI:** tail/verify — локальные файлы (миллисекунды); ConPTY — 1 python-процесс на
воркера; вызовы сильной модели — по необходимости (через локальный `/v1/messages`, см.
skill `meridian-model-call`).
**Maintenance:** параметризованные py-скрипты; pywinpty — внешняя зависимость (fallback:
спавн без PTY + чтение файла-транскрипта). Проверка плагинного распространения —
`dead-integration-guard` (deps-absent прогон).

## Risk Assessment

> Auto-populated by Skill `discovery-forms` during Phase 1. Hook `risk-assessment-guard` enforces:
> when `## Risk Assessment` heading is present, the table below must have ≥2 non-placeholder rows
> with Likelihood ∈ {Low, Medium, High}, Impact ∈ {Low, Medium, High}, and non-empty Mitigation.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Два процесса пишут в один JSONL воркера (конфликт писателей) при `claude --resume` | Medium | High | Проверка живых процессов по session-id перед заходом; стоп старого окна; скил-правило «один писатель» |
| Субагентные `agent-*.jsonl` не закрыты при чтении (tail ловит EOF) | Medium | Medium | Читать до последней строки по смещению, помечать закрытые; фикстура с незакрытым файлом |
| pywinpty не ставится/не импортируется (Python 3.14 user-site issue) | Medium | High | Надёжная схема пути + fallback без PTY (чтение файла транскрипта); проверка deps-absent |
| Адвизор сам «встаёт» на долгих думающих ходах (субagent не пишет минутами) | Medium | Medium | Проверка живости процесса + таймер интервала; BDD сценарий CONTINUE |
| Ложный 403-детектор (промежуточный vs финальный) возвращается и блокирует запуск | Medium | High | Доменные истины в SKILL; `verify_claims.ts` сверяет `document_response_chain` финальный document >=400 |