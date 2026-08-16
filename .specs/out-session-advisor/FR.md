# Functional Requirements (FR)

# Часть A — Адвизор (клиентский аналог Anthropic Advisor: наблюдает, проверяет, управляет воркером)

## FR-1: Tail главного транскрипта + живых subagents (снятие слепоты)

Хвостит не только `~/.claude/projects/<proj>/<sid>.jsonl`, но и все открытые/живые
`subagents/agent-*.jsonl` того же каталога, **включая вложенный layout
`subagents/workflows/<runId>/agent-<id>.jsonl`** (standard CC ≥2.1.2, рекурсивный обход с
лимитом глубины ≤8). Читает незакрытые файлы до последней строки (не ждёт EOF), помечает
закрытые, дедуплицирует уже показанные строки.
**Stream-json воркеры (FR-2):** файловый транскрипт Claude Code пишет лениво, поэтому tail
также читает **событийный лог** `worker_driver --event-log` (`session_start/send/thinking_tokens/
tool_use/tool_result/assistant_text/result`) и объединяет с файлом (маркер `[live]`, dedup).
[VERIFIED: `6126f730.../subagents/agent-*.jsonl` существуют в каталоге сессии.]
[VERIFIED: формат вложенных субагентов подтверждён сторонним парсером
`Guiziweb/claude-code-data` `src/data/parser/session.ts` `readSubagentTurns`.]
[VERIFIED: live-прогон 2026-08-16 — event-log поймал `send→session_start→thinking_tokens→
assistant_text→result`, файл в это время не рос.]

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-адвизор-берёт-управление-живой-воркер-сессией-feature2-feature3), [UC-2](USE_CASES.md#uc-2-адвизор-видит-субагентов-воркера-feature1-feature3)

## FR-2: Управление воркером — stream-json (primary) + ConPTY fallback

Первичный драйвер воркера — **stream-json мост** (паттерн `claw-army/claude-node`,
`[VERIFIED: github.com/claw-army/claude-node docs/04-protocol.md]`):
`claude --input-format stream-json --output-format stream-json [--resume <sid> --model <m>]`,
синхронизация по `type=result`, structured события (`system/init` с session_id, `assistant`,
`user/tool_result`, `result`). Управление через единый Python-контроллер (send/send_nowait/
wait_for_result/wait_for_tool_use/get_messages). Запуск воркера с `--dangerously-skip-permissions`.
**Событийный лог:** `worker_driver --event-log <path>` пишет нормализованные события
(`session_start/send/thinking_tokens/tool_use/tool_result/assistant_text/result`, формат в стиле
`csd` events.ts) в JSONL сразу при получении из stdout — потому что файловый транскрипт
Claude Code в stream-json режиме пишется лениво; `--transcript <path>` дублирует raw stdout.

ConPTY (`pty_daemon.py`, ctl/rsp-файлы) остаётся **fallback** для случая, когда нужен живой
TUI (handoff) или stream-json-флаг недоступен: `PtyProcess.spawn([claude, --resume <sid>, ...])`,
протокол `claude-ctl.json` → `claude-rsp.json`, многострочный UTF-8 промпт через ctl-файл.

**AskUserQuestion / интерактивные вопросы** — вариант A: воркеру в system-prompt предписывается
писать вопросы владельцу обычным текстом (не `AskUserQuestion`); адвизор видит такой вопрос в
`result` и отвечает `send`. Проверено live: в stream-json `AskUserQuestion` не эмитится как
пауза (нет в `system/init` tools), разрешительные диалоги превращаются в `tool_result
is_error + permission_denials`, модель возвращает вопрос текстом. Permission-диалоги гасятся
`--dangerously-skip-permissions`; если нужен перехват живого TUI-диалога — ConPTY fallback (вариант B).

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-адвизор-берёт-управление-живой-воркер-сессией-feature2-feature3)

## FR-3: Факт-проверка отчётов воркера (verify_claims)

`verify_claims.ts` принимает пути/path-claims из отчёта воркера и выдаёт `CONFIRMED`/`GAP`
по real-фактам (файл существует?, hash/размер совпал?, live-проверка той же карточки,
БД `run_external_blockers` `source=live|archived`). Вердикт содержит evidence-пути и причину.
Доменные истины оценки «403»: промежуточный 403 в цепочке `307→403→200` ≠ блокер; блокер —
только финальный document ≥400 И `url === page.url()`.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-адвизор-ловит-ложный-отчёт-воркера-на-пиздёж-feature3)

## FR-4: Цикл мониторинга не «встаёт» — живость процесса + интервальные снапшоты

После каждого шага адвизора следует следующий ход: интервальный снапшот транскрипта
и/или проверка живости воркера (Get-CimInstance по cmdline/session-id). Долгие думающие
ходы (нет записей ≥N мин, но процесс жив) помечаются «думает», а не «повис»; при смерти
процесса — адвизор явно сообщает и предлагает перезапуск.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-5](USE_CASES.md#uc-5-адвизор-отдаёт-саммари-и-продолжает-мониторинг-feature4)

## FR-5: Канонический SKILL.md + зеркало + доменные истины

Skill `out-session-advisor` создаётся в `.claude/skills/out-session-advisor/SKILL.md` (канон, уезжает
с плагином) и зеркале `.agents/skills/out-session-advisor/`; фиксирует принципы («не вставать»,
«один писатель», «факты на диске»), доменные истины (промежуточный 403 ≠ блокер; бренд/артикул
со страницы после открытия, не из slug; live vs archived; техсбой ≠ 403), протокол ctl/rsp.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-4](USE_CASES.md#uc-4-адвизор-стопает-и-перезапускает-воркер-при-техне403-инциденте-feature2-feature3)

# Часть B — Параллельная безопасность (неконфликтность множественных сессий в одном/нескольких репо)

## FR-6: Git-гейт против add -A и чужих staged (runtime-слой no-git-add-all-shared-tree)

Проверяет staged-пути перед коммитом: если команда содержит `git add -A`/`git add .` в общем
дереве — предупреждает/блокирует (require override). Если в staged есть файлы, которые недавно
правлены другой сессией (по транскриптам) — гейт помечает пересечение и требует подтверждения
владельца. Ground-truth «мои файлы» — File Changes / явный список сессии.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-6](USE_CASES.md#uc-6-две-сессии-в-одном-репо-коммит-без-захвата-чужого-feature6)

## FR-7: Атомарный лок-сервис с владельцем и stale-восстановлением

`parallel-lock` следует `atomic-update-lock` (`flag:'wx'`/O_EXCL): создание лока атомарно,
второй процесс получает EEXIST без порчи; stale-лок удаляется и пересоздаётся атомарно с
аудитом; каждый лок хранит `{owner: pid+cmdline, path, created}` для диагностики «кто держит».

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-7](USE_CASES.md#uc-7-два-процесса-борются-за-лок-атомарность-спасает-feature7)

## FR-8: Инвентаризация сессий по нескольким репо

`parallel-session-inventory` сканирует живые процессы/сессии/ворктри и относит каждый к репо
(по пути/session-id) или `unknown`; результат — детерминированный список `{repo, pid, session, ts}`.
Работает и без активного dashboard-сервера (standalone). Использует session-pilot discovery +
`process-tree.ts`.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-8](USE_CASES.md#uc-8-инвентаризация-по-нескольким-репо-feature8)

## FR-9: Диагностика «кто писал <файл>» (single-writer для адвизора)

По пути файла возвращает сессии, чьи недавние Edit/Write (по транскриптам) затрагивают файл,
с временем последней записи и последним писателем; если живой воркер сейчас пишет — помечает
конфликт single-writer (read-only для адвизора, никогда не перезапишет).

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-9](USE_CASES.md#uc-9-адвизор-определяет-кто-пишет-файл-feature9)

## FR-10: Сводная диагностика параллельности ok/dirty/conflict

`parallel-session-diag` выводит активные сессии (repo/sid/pid), локалы с владельцем, писателей
спорных файлов и вердикт по каждому элементу: `ok` / `dirty` / `conflict` + причина. При отсутствии
активных чужих сессий — короткая сводка `0 active, 0 locks, 0 conflicts`.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-10](USE_CASES.md#uc-10-диагностика-параллельности-feature10)

# Вне объёма

## FR-11: Стойкий запуск на pywinpty + fallback без PTY — OUT OF SCOPE

> OUT OF SCOPE — pywinpty под Python 3.14 на Windows ставится больно (user-site/ENABLE_USER_SITE);
> надёжная схема установки и fallback без PTY (чтение транскрипта) — отдельный харденинг.
>
> Связанные AC: [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-out-of-scope) · UC: UC-1

## FR-12: Множественные воркеры параллельно в одном адвизоре — OUT OF SCOPE

> OUT OF SCOPE — v1 адвизор управляет ОДНИМ воркером; параллельный роевой адвизор нескольких
> воркеров — будущая эволюция на базе FR-8/FR-9.
>
> Связанные AC: [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-out-of-scope) · UC: UC-5