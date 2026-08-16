# Spec Review: out-session-advisor

**Phase:**
Complete (реализация 2026-08-15, live-проверки)
**Generated:**
2026-08-14T10:10:00Z (обновлено 2026-08-15)
**Scope:**
1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 14, 15, 16

## Реализация + live-проверки (2026-08-15)

FR-1..10 доведены до рабочего кода в `tools/out-session-advisor/`, проверены против реальных
артефактов (детали — `RESEARCH.md «Реализация + live-проверки»`):
- FR-2 `worker_driver.py` — живой `converse` через stream-json: `OK-DRIVER`, session_id `7849dd84...`,
  cost `0.21$`; `AskUserQuestion` отсутствует в tools (вопрос текстом в result).
- FR-1 `tail_session.py` — продакшн-субагенты `agent-*.jsonl` читаются (`[subagent <id>]`, isSidechain).
- FR-3 `verify_claims.ts` — chain `307,403,200` → intermediate-403 (не блокер); sqlite live-blocker archived → no-live-blocker.
- FR-4 `monitor.py` — `dead` / `thinking-xhigh` различены.
- ФБ-5 SKILL + зеркало идентичны; skill-health 0 blocking.

## Live end-to-end цикл (2026-08-16) — стык tail↔stream-json закрыт

Сквозной прогон «адвизор управляет живым воркером» на реальной задаче (дрейф путей AGENTS.md):

1. `worker_driver.py --event-log` поднял реальный воркер (claude pid 50264, `gpt-5.6-luna`,
   sid `e98178b8`). **Event-log ловил живой поток**: `send → session_start → thinking_tokens(11,22,30)
   → tool_use Read → tool_result → tool_use Edit → tool_use Bash → assistant_text → result`.
   Ранее (без event-log) файл `~/.claude/projects` в stream-json режиме писался лениво —
   адвизор был слеп. Теперь `tail_session --event-log` показывает всё в реальном времени.
2. Воркер починил реальный дрейф: **56 путей `.Codex/rules/` → `.carl/rules/` в AGENTS.md**.
3. Адвизор-проверка на диске: `rg -c '\.Codex/rules' AGENTS.md` = **0**, `.carl/rules` = **56** —
   отчёт воркера правдив (совпадает с фактом, diff 56↔56 только пути).
4. `monitor.py` в процессе верно показал `thinking-xhigh` (жив, думает) — не dead.

**Вывод:** цикл «запуск → живое наблюдение (thinking/tool) → факт-проверка отчёта против диска»
работает end-to-end на реальной сессии. BDD: **18/18 scenarios, 119/119 steps** (добавлен
OUTSESS001_17 event-log).

**Полный канонический сьют (2026-08-16):** `docker-bdd.sh` (все 50 features) — OUTSESS001
**18/18 passed** в каноне `.dev-pomogator/.last-test-run.ndjson`; 3 failed + 14 undefined —
все в чужом `spec-generator-v4` (SPECGEN004_*), наших нет. Verdict: STRUCTURE/TRACEABILITY/
BDD_SYNC GREEN, 0 blocking; EXECUTION RED только за счёт OOS FR-11/12 (корректно never-run).

**OUTSESS001_18 (consult fail-open) — 19/19:** фильтрованный `docker-bdd --name OUTSESS001`
после добавления сценария — **19 scenarios (19 passed), 125 steps (125 passed)**. Полный
канонический прогон для 19 сценариев обрывался крашем WSL (`0x8007274c`) на длинном
сьюте + конкуренцией параллельных docker-прогонов соседней сессии (общий compose-проект
`devpom-bdd-<session>`: чужие `down --remove-orphans` сносили мои контейнеры; 6 попыток
2026-08-16). Канон остаётся без наших 19 сценариев — TASK_TRUTH/AC_SATISFACTION вердикта
честно RED до спокойного полного прогона.

## Task-status sync (2026-08-16) — дрейф TASKS.md закрыт

## Spec Review: post-implementation (2026-08-16)

**Phase:** Complete (post-impl review, категории 2/6/11/12/14/15/16)
**Verdict:** READY_WITH_WARNINGS — P0 устранён на месте, P1 задокументированы ниже.

| # | Category | Location | Issue | Sev |
|---|----------|----------|-------|-----|
| 1 | 11 spec↔code | TASKS T0-01 / FILE_CHANGES:26 | Чекбокс указывал `tests/features/.../OUTSESS001_*.feature` — файла нет; сценарии исполняются из `.specs/.../out-session-advisor.feature` (cucumber.json). **Исправлено в этой же сессии.** | P0→fixed |
| 2 | 11 spec↔code | TASKS T0-02 / FILE_CHANGES:28 | `tests/support/out-session-advisor-hooks.ts` не создан — фикстур-сетап inline в step-defs. **Исправлено в этой же сессии.** | P1→fixed |
| 3 | 11 spec↔code | FILE_CHANGES:9-21 | `monitor.py` (FR-4) реализован, но не числился в FILE_CHANGES. **Исправлено.** | P1→fixed |
| 4 | 11 spec↔code | FR.md:89 / hooks.json / settings.json | git-guard не зарегистрирован ни в одном hooks-реестре — FR-6 «runtime-слой» не заwire-чен; git-guard вызывается только вручную/из step-defs. Хуки-инфра — зона параллельной сессии; wire — отдельная задача. | P1 known |
| 5 | 11 spec↔code | diag.ts:58-71 vs FR.md:129-131 | FR-10 сводка: `locks: 0` захардкожен, вердикт `ok` не эмитится, нет repo/sid/pid; BDD-шаги OUTSESS001_15/16 почти ничего не проверяют. | P1 known |
| 6 | 11 spec↔code | git-guard.ts:21,90-96 / FR.md:91-94 | FR-6 «require override + audit» не реализованы (`warn`-ветка мёртвая, override-флага нет); Then-шаг про escape-audit — no-op. | P1 known |
| 7 | 11 spec↔code | step-defs :330,380,412,440 | 4 no-op Then-шага (`() => void 0`): escape-audit, lock-audit, single-writer, сводка-парс. Тест-качество: шаги не проверяют заявленное. | P1 known |
| 8 | 11 spec↔code | lock.ts:117-124 / FR.md:102-103 | recover-stale без аудита (FR-7 «с аудитом»). | P2 |
| 9 | 11 spec↔code | diag.ts:61-67 / FR.md:118-122 | single-writer — mtime<60s прокси, не live-проверка процесса. | P2 |
| 10 | 11 spec↔code | worker_driver.py:256 / FR.md:31 / SKILL.md | `get_messages` в спеке/скиле — в коде `snapshot()`; `converse` — CLI-флаг, не метод. | P2 |
| 11 | 11 spec↔code | worker_driver.py:329 / pty_daemon.py:55 | Флаг в коде `--no-skip-permissions` (skip по умолчанию), спека/скил пишут `--skip-permissions`. | P2 |
| 12 | 11 spec↔code | monitor.py:37-38 / FR.md:70 | FR-4 «Get-CimInstance» — код использует `Get-Process -Id`; докстринг monitor.py тоже врёт. | P2 |
| 13 | 11 spec↔code | inventory.ts:11-13 / FR.md:112-113 | FR-8 «session-pilot discovery + process-tree.ts» — inventory переизобрёл discovery inline; `tools/_shared/process-tree.ts` не используется. | P2 |
| 14 | 11 spec↔code | diag.ts:2-7 | Шапка-комментарий дважды перекодирована (mojibake). | P2 |

**Чистые категории:** 2 (нет реальных дублей; consult.mjs честно реюзает `tools/advisor/transcript-packet.mjs`), 12 (коллизий нет), 14 (memory feedback-файлов нет), 16 (acceptance-task-coverage: `ok, claims: []`), FR-1/3/5/7-ядро/8-CLI/9-who-wrote — без дрейфа; SKILL-зеркало идентично (fc.exe), allowed-tools покрывают workflow.

## Dogfood-анализ сессий (2026-08-16)

Сканирование `~/.claude/projects/E--repos-dev-pomogator/*.jsonl` (47 сессий) на реальные запуски инструментов:

1. **e98178b8 (06:08)** — воркер, которого адвизор вёл в live e2e (единственный полный цикл
   «запуск → наблюдение → факт-проверка»; задокументирован выше).
2. **b419882c (параллельная сессия)** — пассивный пользователь: 79 запусков git-guard hook
   (PreToolUse/7/0) с 10:20, все exit=0, 0 ложных блоков, 0 override-записей в escape-audit;
   чтение нашей спеки через MCP-дверь в 03:00 (их FR-7 изоляции). Инструменты адвизора
   (tail/worker_driver/consult) сама не запускала.
3. Остальные ~30 совпадений «inventory.ts»/«lock.ts» — другие одноимённые файлы
   (bdd-migrator/inventory.ts, doctor lock.ts), не наши.

Вывод: живых полных dogfood-циклов пока 1 (наш собственный); блок-путь git-guard ещё ни
разу не срабатывал на живом юзере (escape-audit пуст). Для честного UX-вывода нужен ещё
один заход на реальной чужой задаче.

## P1 known → closed (2026-08-16, «FR-6/7/10 честный довод»)


1. **git-guard заwire-чен**: `PreToolUse/7/0` (matcher Bash) в `.claude-plugin/hooks.legacy.json` → registry.json/hooks.json/.claude/settings.json перегенерированы; hook-режим `--hook` (stdin JSON): `git add -A`/`.` → block (exit 2 + stderr), override через `[skip-git-guard: <причина>]`/`GIT_GUARD_SKIP=1` → escape-audit `.dev-pomogator/git-guard-escapes.jsonl`, fail-open по умолчанию.
2. **lock.ts**: `recoverStale` пишет audit-строку в `<locksDir>/audit.jsonl` (old/new owner).
3. **diag.ts**: сводка по FR-10 — сессии (repo/sid/pid), локалы с владельцем (held/stale по живому pid), вердикты ok/dirty/conflict, single-writer conflict по живому процессу сессии (/proc + Get-CimInstance), пустая сводка «0 active, 0 locks, 0 conflicts» (`summary`-поле), `--locks-dir` CLI; mojibake-шапка исправлена.
4. **4 no-op Then-шага заменены реальными проверками** (escape-audit строка, lock-audit строка, single-writer conflict с живым pid, структура сводки). OUTSESS001_12 When теперь реально зовёт `recover-stale` (было `status`).
5. Фильтрованный BDD после довода: **19/19, 125/125 passed**.

1. Блоки задач не несли `id:` → граф/дверь не видели НИ одну задачу спеки (NODE_NOT_FOUND).
   Проставлены id по позиционной схеме генератора task-table (T0-01..T3-19).
2. 7 задач проведены через дверь `set_entity_status` по машине todo→ready→in-progress;
   DONE-гейт двери честно отказал: mapped-сценарии не канонически PASSED (см. выше).
   Задачи остаются IN_PROGRESS с **Комментарий:** (не fake-DONE, не блокер-отмазка).
3. Done When чекбоксы синхронизированы с фактом; 2 устаревшие формулировки переписаны
   («заглушки Pending»/«FAIL Red» → реальные step-defs / GREEN 19/19).
4. `_Requirements` refs добавлены в 6 задач без них (T0-02/03, T1-08, T2-17, T3-18, T3-19).
5. Ноги FR-11/FR-12 (OUT OF SCOPE) достроены: Decision ×2 (DESIGN.md), Story ×2
   (USER_STORIES.md) — FR_NO_DESIGN/FR_NO_STORY закрыты.
6. Summary Table перегенерирована `spec-status.ts -Format task-table`.

Вердикт после синка: STRUCTURE/TRACEABILITY/BDD_SYNC GREEN; conformance 0 error / 22 warning —
остаток (UNVERIFIED_FR:10, TASK_STATUS_UNVERIFIED:12) целиком производный от канона
(19 сценариев не в полном прогоне). Довести до полного GREEN = один спокойный полный
`docker-bdd.sh` (без параллельных прогонов соседа), затем через дверь закрыть 7 IN_PROGRESS.




После череды фиксов (см. ниже) целевой прогон `docker-bdd.sh --name OUTSESS001` дал:
**17 scenarios (17 passed), 112 steps (112 passed)** — все сценарии OUTSESS001_01..16(+06b) зелёные.

Фиксы по пути (реальные баги тест-кода, не имплементации):
1. `feature_inner_advisor.ts:208` (чужой step-def) — незаэскейпленный `/` ломал загрузку ВСЕХ step-defs
   (`CucumberExpressionError: Alternative may not be empty`); починен в working tree (параллельная сессия).
2. арность `{string}`-шагов: cucumber требует `fn.length == число параметров` — добавил `_`-параметры.
3. `verify_claims.ts`: `node:sqlite` top-level импорт валил file/chain-моды на контейнерном Node → ленивый импорт.
4. фикстурный layout приведён к каноничному `~/.claude/projects` (`E--main-session/`, `E--session-a/b/`).
5. `tail_session.py`: маркер `[closed]` на неизменном субагенте (был вычислен, но не выводился).
6. `git-guard.ts`: `--staged-files` + `--window-ms 0` — тест conflict без git (Docker-no-git).
7. lock-шаги: изоляция через `PARALLEL_LOCK_DIR` + правильное hash-имя лока.

**Статус BDD-gate: GREEN.** Docker-билд не виснет — просто медленный (большой контекст с /mnt/e + загрузка marksman);
нужно терпеливо ждать, не убивать преждевременно (см. `.carl/rules/pomogator/env-blocker-is-not-a-stop.md`).

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 (blockers) | 0 | ✅ clear |
| P1 (fix before stop) | 0 | ✅ clear |
| P2 (recommendations) | 3 | ℹ️ logged |
| P3 (informational) | 0 | ℹ️ logged |

**Overall verdict:** READY

## P0 Findings

Нет.

## P1 Findings

Нет.

## P2 / P3 Findings

| # | Category | Location | Note |
|---|----------|----------|------|
| 1 | 6 FEATURE_TAG | USE_CASES.md | UC-1..UC-5 (Часть A) не несут `@feature5` для FR-5 (скил); тег @feature5 есть в USER_STORIES/feature — цепочка не рвётся, но use-case для скила не помечен тегом. Рекомендация: добавить @feature5 в UC-5 или на будущее держать 1:1. |
| 2 | 15 REALITY_DRIFT | DESIGN.md narrative `out-session-advisor/SKILL.md` | Путь — планируемый (FILE_CHANGES create + TASKS T2-11); WARNING легитимен до реализации. |
| 3 | 15 REALITY_DRIFT | TASKS↔FILE_CHANGES (8×INFO) | README.md, `.claude-plugin/hooks.json`, `.claude/settings.json`, фикстуры не упомянуты отдельными задачами в TASKS; покрыты неявно (Phase 0 hook/fixture группы + T3-19). INFO, не блокирует. |

## Auto-fix patches

### Patch 1: hooks-пути в DESIGN.md narrative

**File:** `.specs/out-session-advisor/DESIGN.md`

**old_string:**
```
hooks `git-guard` в `.Codex-plugin/hooks.json` + dogfood `.Codex/settings.json`
```

**new_string:**
```
hooks `git-guard` в `.claude-plugin/hooks.json` (canonical, существует) + dogfood `.claude/settings.json` (существует)
```

> Применён. Оставшийся 1 WARNING (SKILL.md path) легитимен — файл создаётся при T2-11.

## Notes (категории с no-findings)

- C1 EXT_API: клаймы про Claude Code CLI (`--resume`, `--dangerously-skip-permissions`, `--model`) [VERIFIED] через `claude --help` в session; pywinpty — локальная зависимость, не external API.
- C2 EXISTING_ASSET: скрипты `%TEMP%\opencode\` переносятся в плагин — не дубль, а параметризация существующего работного артефакта; `tools/advisor/` PoC остаётся отдельной библиотекой (не пере-интегрируется).
- C5 OPEN_Q_STALE: Open Questions в RESEARCH нет — отсутствуют.
- C7 TOOLING: raw-тест-раннеры в TASKS не найдены; упоминания команд — Python/TS CLI-интерфейсы инструментов, не тест-раннеры.
- C10 FLUFF: только ложные hits в формулировках OOS; замеров «быстро/стабильно» без цифр нет (NFR-PERF задают числа).
- C14 MEMORY: запрещённых литералов (`stgmt/`, user-identifiers) в кодовых путях спеки нет; упоминания `6126f730...`, `E:\repos\sales`, `ses_00b9321...` — это evidence-примеры из live-эксперимента, помечены `[VERIFIED]`/сносками, не хардкод в коде.
- C16 ACCEPTANCE_DELIVERY: `acceptance-task-coverage` → `"ok": true, claims: []` — проход.