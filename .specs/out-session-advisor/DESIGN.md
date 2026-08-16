# Design

## Реализуемые требования

### Часть A — Адвизор

- [FR-1: Tail главного транскрипта + живых subagents](FR.md#fr-1-tail-главного-транскрипта-живых-subagents-снятие-слепоты)
- [FR-2: Управление воркером — stream-json (primary) + ConPTY fallback](FR.md#fr-2-управление-воркером-stream-json-primary-conpty-fallback)
- [FR-3: Факт-проверка отчётов воркера на «пиздёж» (verify_claims)](FR.md#fr-3-факт-проверка-отчётов-воркера-verifyclaims)
- [FR-4: Цикл мониторинга не «встаёт»](FR.md#fr-4-цикл-мониторинга-не-встаёт-живость-процесса-интервальные-снапшоты)
- [FR-5: Канонический SKILL.md + зеркало + доменные истины](FR.md#fr-5-канонический-skillmd-зеркало-доменные-истины)

### Часть B — Параллельная безопасность

- [FR-6: Git-гейт `add -A`/чужие staged](FR.md#fr-6-git-гейт-против-add-a-и-чужих-staged-runtime-слой-no-git-add-all-shared-tree)
- [FR-7: Атомарный лок-сервис](FR.md#fr-7-атомарный-лок-сервис-с-владельцем-и-stale-восстановлением)
- [FR-8: Инвентаризация сессий по репо](FR.md#fr-8-инвентаризация-сессий-по-нескольким-репо)
- [FR-9: «Кто писал <файл>»](FR.md#fr-9-диагностика-кто-писал-файл-single-writer-для-адвизора)
- [FR-10: Сводная диагностика](FR.md#fr-10-сводная-диагностика-параллельности-okdirtyconflict)

## Компоненты

### Часть A — Адвизор

- `tail_session.py` — аггрегатор транскрипта: главный `<sid>.jsonl` + живые `subagents/agent-*.jsonl`
  (включая вложенный `subagents/workflows/<runId>/`, depth≤8). Путь-логика по образцу
  `Guiziweb/claude-code-data.readSubagentTurns`. Читает незакрытые файлы по смещению, помечает
  закрытые, дедуплицирует строки. **`--event-log <path>`** объединяет живые события stream-json
  воркера (файловый транскрипт Claude Code пишет лениво) с маркером `[live]`.
- `strip_ansi.py` — очистка ANSI-последовательностей из снапшотов PTY (для ConPTY fallback).
- `worker_driver.py` — **PRIMARY драйвер воркера**: stream-json мост к `claude` CLI по образцу
  `claw-army/claude-node` (`--input-format stream-json --output-format stream-json`);
  `send`/`send_nowait`/`wait_for_result`/`wait_for_tool_use`/`get_messages`; launch с
  `--dangerously-skip-permissions`; вопросы воркера текст-в-`result` → ответ через `send`.
  **`--event-log <path>`** пишет нормализованные события JSONL сразу из stdout reader-потока
  (send/session_start/thinking_tokens/tool_use/tool_result/assistant_text/result);
  `--transcript <path>` дублирует raw stdout.
- `pty_daemon.py` — FALLBACK: долгоживущий ConPTY-процесс воркера; протокол `claude-ctl.json`/
  `claude-rsp.json`; принимает `cwd`, `--resume <sid>`, `--model <m>`,
  `--dangerously-skip-permissions` как аргументы. Нужен только для handoff в живой TUI.
- `verify_claims.ts` — CLI факт-проверки: `CONFIRMED`/`GAP` с evidence-путями; live-проверка
  цепочки `307→403→200` (финальный document) и `run_external_blockers` `source`; verify/repair
  транскрипта по образцу `@recensa/claude-session`.
- `consult.mjs` — **модель-консультация (модель-пара, опционально)**: на ключевых точках
  (done/recurring/plan) зовёт `ADVISOR_MODEL` (default `gpt-5.6-sol`) через
  `ANTHROPIC_BASE_URL/v1/messages` с пакетом транскрипта (главный+субагенты+event-log,
  переиспользует `tools/advisor/transcript-packet.mjs`); fail-open; совет не заменяет
  детерминированный `verify_claims`.

### Часть B — Параллельная безопасность

- `parallel-lock` (`lock.ts`) — атомарный лок `flag:'wx'` с полями `{owner_pid, owner_cmd, path, created}`;
  `acquire`/`release`/`status`/`recover_stale`.
- `parallel-git` (`git-guard.ts`) — PreCommit/PreTool hook: распознаёт `git add -A`/`.`, сверяет
  staged с чужими недавними правками из транскриптов.
- `parallel-session-inventory` (`inventory.ts`) — standalone CLI: живые процессы/сессии/ворктри →
  `{repo, pid, session, ts}`; без dashboard.
- `parallel-session-diag` (`diag.ts`) — сводка `ok/dirty/conflict` + «кто писал <файл>»
  (чтение транскриптов, bounded).

### Общее

- `out-session-advisor/SKILL.md` — канонический скил (принципы, доменные истины, протокол, воркфлоу,
  инструменты адвизора + параллельной безопасности).

## Где лежит реализация

- App-код: `tools/out-session-advisor/` (перенос и параметризация скриптов из `%TEMP%\opencode\`)
- Wiring: скил `out-session-advisor` в `.claude/skills/` + зеркало `.agents/skills/` (plugin skills field);
  hooks `git-guard` в `.claude-plugin/hooks.json` (canonical, существует) + dogfood `.claude/settings.json` (существует)

## Директории и файлы

- `tools/out-session-advisor/tail_session.py`, `strip_ansi.py`, `pty_daemon.py`
- `tools/out-session-advisor/verify_claims.ts`
- `tools/out-session-advisor/lock.ts`, `git-guard.ts`, `inventory.ts`, `diag.ts`
- `tools/out-session-advisor/README.md`
- `.claude/skills/out-session-advisor/SKILL.md`, `.agents/skills/out-session-advisor/SKILL.md`
- `tests/features/plugins/out-session-advisor/OUTSESS001_out-session-advisor.feature` (BDD)

## Алгоритм

1. Адвизор получает session-id и каталог `~/.claude/projects/<proj>/<sid>/`.
2. `tail_session.py` собирает хвост главного файла + живых `subagents/agent-*.jsonl` (в т.ч.
   `workflows/<runId>/`, depth≤8; путь-логика по образцу `claude-code-data.readSubagentTurns`)
   **+ `--event-log` живые события stream-json воркера** (файловый транскрипт пишется лениво);
   `strip_ansi.py` чистит снапшоты PTY (fallback-путь).
3. Перед правкой — `parallel-session-diag --who-wrote <path>` (FR-9): не порвать single-writer.
4. Диагноз: `verify_claims.ts` сверяет claims воркера с диском/БД/live-проверкой.
5. Промпт/стоп вору воркеру через **`worker_driver.py` (stream-json)**: `send_nowait()` + `wait_for_result()`;
   вопросы воркера из `result` → ответ тем же `send`. Fallback: `claude-ctl.json`/`claude-rsp.json` (ConPTY).
6. Интервальный мониторинг (SN+1 обязателен): новое `result`/снапшот и/или проверка живости процесса.
7. При коммите — `git-guard` (FR-6): не захватить чужое; локалы — `parallel-lock` (FR-7).
8. По завершении цикла — саммари владельцу с evidence-путями; CONTINUE до закрытия задачи.

## API

### tail_session.py (CLI)

- Usage: `python tail_session.py --session <sid> --project-dir <proj> [--tail-bytes 8388608]`
- Output: объединённый текст последних событий главного файла + живых subagents (nested до depth 8), с временнЫми штампы.

### worker_driver.py (PRIMARY, stream-json)

- Launch: `python worker_driver.py --cwd <dir> [--resume <sid>] [--model <m>] [--skip-permissions]`
- Методы: `send(text)`, `send_nowait(text)`, `wait_for_result(timeout)`, `wait_for_tool_use(name, timeout)`, `get_messages()`
- Синхронизация: ждать `type=result` перед следующим `send`; `system/init` даёт `session_id`.
- Вопросы воркера — текст в `result`; адвизор отвечает `send`.

### pty_daemon.py (FALLBACK протокол)

- Control: `claude-ctl.json` = `{"action":"send|read|exit","prompt":"<utf8>","wait":N}`
- Response: `claude-rsp.json` = `{"out":"<ansi snapshot>","pid":N,"sent":true}`
- Запуск: `python pty_daemon.py <ctl> <rsp> [--resume <sid>] [--model <m>] [--dangerously-skip-permissions] <cwd>`

### verify_claims.ts (CLI)

- Usage: `npx tsx tools/out-session-advisor/verify_claims.ts --claim <type> [--paths ...]`
- Вердикт: `{"status":"CONFIRMED|GAP","evidence":["..."],"reason":"..."}`

### parallel-lock (CLI)

- `acquire <path>` → `{ok, owner?}`; `release <path>`; `status <path>`; `recover-stale <path>`.
- Lock-файл: `.dev-pomogator/parallel-locks/<hash>.lock`

### git-guard (hook)

- На `PreToolUse Bash` с `git add -A`/`git add .` → `warn` (заблокировать требует `--override`).
- На коммите → сверка staged с транскриптами, вывод `conflict` списка.

### inventory / diag (CLI)

- `npx tsx tools/out-session-advisor/inventory.ts --repos <a,b>`
- `npx tsx tools/out-session-advisor/diag.ts`; `diag.ts --who-wrote <path>`

## Key Decisions

### Decision: Различать «промежуточный 403» и «финальный блокер» по document_response_chain

**Требование:** [FR-3](FR.md#fr-3-факт-проверка-отчётов-воркера-verifyclaims)

**Rationale:** В эксперименте ложный live-403 (шаг 307→403→200) блокировал запуск; единственный
честный критерий — финальный document ≥400 И `url === page.url()`. Это устраняет класс ложных блокеров.

**Trade-off:** Сложнее диагностика («почему 403» требует смотреть всю цепочку), но правда важнее скорости.

**Alternatives considered:**
- Резать по первому document-403 — rejected: даёт ложные блокеры (реальная ситуация g65/g69).
- Принимать любой 200 финального хопа без сверки url — rejected: маскирует редирект на другую страницу.

### Decision: stream-json мост — PRIMARY управление воркером; ConPTY — fallback

**Требование:** [FR-2](FR.md#fr-2-управление-воркером-stream-json-primary-conpty-fallback)

**Rationale:** live-тест (2026-08-15) показал: `claude --input-format stream-json
--output-format stream-json` даёт structured события, синхронизацию по `type=result`,
session_id и cost; `AskUserQuestion` отсутствует в tools (вопрос приходит текстом), а разрешительные
диалоги материализуются как `tool_result is_error` + `permission_denials` при
`--dangerously-skip-permissions` отсутствуют вовсе. Готовый Python-мост — `claw-army/claude-node`
(MIT). ConPTY не нужен для основного цикла.

**Trade-off:** stream-json не даёт живой TUI (handoff владельцу невозможен через него);
чужие потоки вывода MCP-тулов приходят как текст и могут быть большими.

**Alternatives considered:**
- `claude --remote-control` — rejected: доками отключён при не-`api.anthropic.com`.
- ConPTY (pywinpty) primary — rejected: хрупкий ANSI-парсинг; теперь fallback для handoff/живого TUI.
- tmux/WSL — rejected: Windows-native окружение, ConPTY уже локальный.

### Decision: вопросы воркера — текстом в `result`, не AskUserQuestion

**Требование:** [FR-2](FR.md#fr-2-управление-воркером-stream-json-primary-conpty-fallback)

**Rationale:** live-тест подтвердил: в stream-json `AskUserQuestion` не эмитится как пауза
(нет в tools списка), модель отвечает текстом; адвизору достаточно прочитать `result` и ответить
через `send` — без какого-либо перехвата диалогов.

**Trade-off:** воркер должен соблюдать правило «вопросы — текстом» (system-prompt дисциплина);
если воркер всё же откроет интерактивный диалог в чужом TUI — ConPTY fallback для перехвата.

**Alternatives considered:**
- HITL-мост (MCP tool «ask») — rejected: избыточно, если текст-в-`result` работает (проверено).
- Сырой PreToolUse перехват AskUserQuestion — rejected: в stream-json этого тула нет.

### Decision: allowed-tools скила — минимум на чтение + Bash + верификация

**Требование:** [FR-5](FR.md#fr-5-канонический-skillmd-зеркало-доменные-истины)

**Rationale:** адвизор читает транскрипты, шлёт промпты через файлы, работает с процессами;
запись — только файлов харнесса, которые воркер НЕ трогает. Правило `skill-allowed-tools-audit`.

**Trade-off:** без автономных прав на всё (редко нужны Write в чужой активный файл).

**Alternatives considered:**
- Дать Write на всё — rejected: ломает single-writer.
- Только чтение без Bash — rejected: нельзя проверить процессы и вести PTY.

### Decision: Skill НЕ владеет тем же файлом, что воркер (single-writer)

**Требование:** [FR-2](FR.md#fr-2-управление-воркером-stream-json-primary-conpty-fallback)

**Rationale:** второй писатель в активный JSONL = коррупция (правило no-unverified-blocker + память про один писатель).

**Trade-off:** медленнее, требует согласований, но надёжно.

**Alternatives considered:**
- Писать в JSONL воркера напрямую — rejected: коррупция транскрипта.
- `claude -p --resume` как второй писатель — rejected: конфликт двух процессов на одном id.

### Decision: runtime-слой поверх правил, а не новый репозиторий параллелизма

**Требование:** [FR-6](FR.md#fr-6-git-гейт-против-add-a-и-чужих-staged-runtime-слой-no-git-add-all-shared-tree)

**Rationale:** `no-git-add-all-shared-tree`/`atomic-update-lock` уже канон; инструмент реализует
их runtime-проверку, переиспользуя session-pilot discovery вместо нового движка.

**Trade-off:** зависит от формата транскриптов Claude Code (парсер).

**Alternatives considered:**
- Отдельный демон параллелизма — rejected: тяжелее, дублирует session-pilot.
- Только документация/дисциплина — rejected: инцидент `12220e5` доказал, что дисциплины мало.

### Decision: гейт и инвентаризация Fail-open в неизвестных деревьях

**Требование:** [FR-6](FR.md#fr-6-git-гейт-против-add-a-и-чужих-staged-runtime-слой-no-git-add-all-shared-tree)

**Rationale:** без транскриптов других сессий нельзя отделить «чужое» от «нашего»; жёсткий
блок в неизвестной среде = ложные конфликты и замедление работы.

**Trade-off:** реальный конфликт в неизвестном дереве может проскочить.

**Alternatives considered:**
- Fail-closed — rejected: блокирует продуктивную параллельность (NFR-US-2).
- Всегда только warn — rejected: не спасает от инцидента класса `12220e5`.

### Decision: локалы в `.dev-pomogator/parallel-locks/`, а не в `.git/`

**Требование:** [FR-7](FR.md#fr-7-атомарный-лок-сервис-с-владельцем-и-stale-восстановлением)

**Rationale:** `.git/` меняется git-внутренним, а наш каталог gitignored и очищаем; read-доступ
к списку локов для адвизора тривиален.

**Trade-off:** stale-локалы живут в репо-каталоге (мусор, если не чистить).

**Alternatives considered:**
- `.git/locks` — rejected: риск конфликта с внутренними git-примитивами.
- sys tmp (`%TEMP%`) — rejected: не виден между машинами/сессиями и не переживает очистку tmp.

### Decision: tail читает незакрытые субагентные файлы по offset (не ждёт EOF)

**Требование:** [FR-1](FR.md#fr-1-tail-главного-транскрипта-живых-subagents-снятие-слепоты)

**Rationale:** живые `subagents/agent-*.jsonl` растут без EOF; ожидание конца файла пропустит ход мысли
субагента. Чтение по offset даёт частичную строку/последние строки, где бы они ни были.

**Trade-off:** требует аккуратного хранения смещения на файл (state) и обработки частичных строк.

**Alternatives considered:**
- Ждать EOF — rejected: субагент пишет часами, ход мысли исчезает.
- Читать файл целиком каждый раз — rejected: дедупликация дорога и рискованна на больших файлах.

### Decision: живость процесса через Get-CimInstance по cmdline/session-id

**Требование:** [FR-4](FR.md#fr-4-цикл-мониторинга-не-встаёт-живость-процесса-интервальные-снапшоты)

**Rationale:** долгий xhigh-ход ≠ остановка; только проверка живого процесса отделяет «думает» от «умер».
Windows-native инструмент — Get-CimInstance (подтверждён в эксперименте).

**Trade-off:** на не-Windows нужен аналог (ps/pgrep), ветвление платформы.

**Alternatives considered:**
- Только mtime файла — rejected: compaction тоже держит mtime, но не = активность агента.
- JSONL-признаки «step-finish» — rejected: на долгом ходу нет записей и есть, что процесс жив.

### Decision: inventory standalone, без обязательного dashboard

**Требование:** [FR-8](FR.md#fr-8-инвентаризация-сессий-по-нескольким-репо)

**Rationale:** адвизор/владелец должны работать и без session-pilot сервера; periodic-скан транскриптов +
процессов достаточно.

**Trade-off:** может разойтись с dashboard при одновременной работе (два источника правды → merge по pid).

**Alternatives considered:**
- Только через dashboard API — rejected: зависимость от живого сервера при лишней связке.
- Только `~/.claude/projects` — rejected: не видно живых процессов/pid.

### Decision: «кто писал» — read-only анализ транскриптов, не мониторинг файлов

**Требование:** [FR-9](FR.md#fr-9-диагностика-кто-писал-файл-single-writer-для-адвизора)

**Rationale:** транскрипты уже содержат все Edit/Write с временем; анализ bounded-окна даёт ответ без
оверхеда на файл-системный watcher.

**Trade-off:** задержка до flush в JSONL (Claude Code пишет лениво).

**Alternatives considered:**
- fs.watch на файл — rejected: платформенные нюансы, лишний процесс, не нужен.
- mtime файла — rejected: не даёт «кто» (нужен парсер транскриптов).

### Decision: сводка diag — детерминированная, вердикты ok/dirty/conflict

**Требование:** [FR-10](FR.md#fr-10-сводная-диагностика-параллельности-okdirtyconflict)

**Rationale:** владелец/адвизор должен видеть причину одним взглядом; короткие вердикты с путем-причиной
быстрее, чем сырой список событий.

**Trade-off:** упрощение (агрегация) может скрыть нюанс редкого конфликта — доступен raw-список.

**Alternatives considered:**
- Только список процессов — rejected: не даёт вердикта про конфликт.
- Raw-дамп транскриптов — rejected: шум, противоречит NFR-US-2.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE — .feature задаёт файлы-фикстуры транскриптов (главный + subagents), git fixture-репо с staged-путями, локаль-файлы.
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js (уже установлен, см. `bdd-framework-detector`: `@cucumber/cucumber` в package.json:96)
**Install Command:** already installed
**Evidence:** docs — `@cucumber/cucumber` в `package.json` (проверено `bdd-framework-detector.ts` на `E:\repos\dev-pomogator`)
**Verdict:** hooks создают/удаляют фикстуры транскриптов и git fixture-репо в temp-workdir; реальные куски `6126f730.../subagents/agent-*.jsonl`.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/features/...` (см. GUARD002/CEGATE001) | Before/AfterScenario | @featureN | работают с fixture-файлами через Docker BDD | Да (по образу) |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/support/out-session-advisor-hooks.ts` | Before/AfterScenario | @SESSADV | копирует фикстуры транскриптов в temp-workdir; создать git fixture-репо; cleanup | существующие plugin hooks |

### Cleanup Strategy

- Фикстуры транскриптов копируются в temp-каталог на Each Scenario; AfterScenario удаляет temp-workdir.
- Реальные файлы `6126f730...` НЕ трогаются (копии, изоляция); git fixture-репо отдельно от реального дерева.
- Локалы в temp-catalog фикстуры (не `.dev-pomogator/`).

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| `main-session.jsonl` | `tests/features/plugins/out-session-advisor/fixtures/` | главный транскрипт с tool_use/user/assistant | per-scenario |
| `subagents/agent-test.jsonl` | там же | живой субагент (незакрытый) для FR-1 | per-scenario |
| `session-A.jsonl` / `session-B.jsonl` | там же | транскрипты двух сессий для FR-9 | per-scenario |
| `git-fixture/` | там же | git-репо с staged-путями для FR-6 | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `transcriptDir` | path | BeforeScenario hook | все steps | пути к temp транскриптам |
| `fixtureRepo` | path | BeforeScenario hook | git-guard steps | путь к git fixture |
| `locksDir` | path | BeforeScenario hook | lock steps | temp-каталог локалов |