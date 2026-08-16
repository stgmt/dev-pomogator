# Functional Requirements (FR)

## FR-1: Rolling session summary (10 секций) на диске

Адвизор ведёт постоянный `summary.md` по СЕССИИ (не по репо-глобально): `.dev-pomogator/advisor/summary/<session-id>.md`. Включает 10 секций из нативного Anthropic Session Memory: Session Title / Current State / Task specification / Files and Functions / Workflow / Errors & Corrections / Codebase and System Docs / Learnings / Key results / Worklog. Секции имеют якоря `#`, содержимое обновляется моделью; структура заголовков сохраняется жёстко (`verifyStructure`). Файл переживает `/compact` и `--resume`. Путь — внутри проекта (gitignored), не лезет в глобальный `~/.claude`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), [AC-1b](ACCEPTANCE_CRITERIA.md#ac-1b-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-сессия-ведёт-rolling-summary-гейт-дельта)

## FR-2: Гейт обновления summary (cost-gate)

Обновление summary управляется гейтом (порт `sessionMemoryUtils`):
- инициализация: ≥5K контент-токенов (user+assistant текст/tool, без system overhead);
- обновление: ≥5K нового контента **И** (≥3 tool calls с прошлой экстракции ИЛИ последний ход без tool calls);
- `ADVISOR_SUMMARY_FORCE=1` — пропустить гейт (аналог `--force` ccjr, для демо/тестов).
Гейт не стреляет на коротких сессиях → нет расходов на пустую болтовню.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-сессия-ведёт-rolling-summary-гейт-дельта)

## FR-3: Stop-hook автообновления summary в реальных сессиях

В канонический плагин добавляется Stop-hook, который по гейту зовёт дешёвую модель (gpt-5.6-luna) с DELTA (последние ≤40 событий), обновляет summary атомарно (temp+rename) под `wx`-lock по сессии. Fail-open: ошибка/таймаут/нет ключа → skip, Stop НЕ блокируется. Гейтируется конфигом: активация по умолчанию (или файл `.dev-pomogator/advisor/config.json`, или env `ADVISOR_SESSION_SUMMARY=1`, fail-open). Регистрация в `hooks.json` с resolve от `CLAUDE_PLUGIN_ROOT` → работает во всех сессиях users.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-4](USE_CASES.md#uc-4-плагинная-регистрация-в-реальных-сессиях-канонический-установка)

## FR-4: MCP-тул `advisor` (self-invocation) в каноне

MCP-сервер `mcp-server.mjs` с тулом `mcp__dev-pomogator-advisor__advisor` (без параметров — как нативный sever-side tool). Агент вызывает его сам (модель решает, см. nudge). Регистрация в `.mcp.json` проекта и в plugin manifest c resolve путей от `CLAUDE_PLUGIN_ROOT` — доступно во всех сессиях установивших плагин. Консультация строится через `buildSummaryPacket`: если rolling summary есть → summary + delta-хвост; иначе полный digest (fallback для первой консультации).

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-2](USE_CASES.md#uc-2-агент-сам-консультируется-через-mcp-тул-self-invocation)

## FR-5: Fail-open и bounded-input по всей цепочке

Каждый компонент обязано fail-open: нет `ANTHROPIC_BASE_URL`/ключей, таймаут (30-45s), битый транскрипт, потеря структуры summary, lock недоступен — НЕ блокировать Stop и НЕ виснуть. Вход модели bounded: `ADVISOR_DIGEST_MAX_TOKENS` для digest; delta ≤40 событий для summary-апдейта; `truncate`-поведение как Mode B при больших сессиях. `callModel` поддерживает `cache_control` (breakpoint) и возвращает usage для измерения.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-3](USE_CASES.md#uc-3-fail-open-и-bounded-input-при-сбоях)

## FR-6: Evidence-based консультация (two-pass + skeptic balanced)

Консультация two-pass: pass1 дешёвая модель (luna) строит situation report; pass2 сильная (sol) даёт 3-6 bullets. Режим `balanced` (default): «не done» только при конкретной причине (нет улики / goal-drift / нарушение репо-правила / recurring-ошибки); иначе говорит «выглядит sound» + 1 проверка. Поддержка `strict` для совместимости с прошлым поведением. Совет ссылается на файлы/правила/ошибки из digest/repo-rules.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-2](USE_CASES.md#uc-2-агент-сам-консультируется-через-mcp-тул-self-invocation)

## FR-7: Изоляция от out-session-advisor

Реализация НЕ пересекается с существующей спекой `out-session-advisor` (внешний ноут над сторонними сессиями: ConPTY/stream-json, git add -A guard, parallel locks). Отличия: пути (`tools/advisor/` vs внешние), хуки (Stop/MCP vs подпроцессы внешнего запуска), данные (`summary/<sid>.md` vs. чужие транскрипты), конфиг. Два адвизора могут работать одновременно без конфликтов имён и файлов.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-5](USE_CASES.md#uc-5-сосуществование-с-out-session-advisor)

## FR-8: Измеримость (bench) и асинхронность внутри синхронного тула

Временные/токен метрики модельных вызовов возвращаются в usage; сборка digest async-параллельна (git self-check через spawn+Promise.all, читать транскрипт параллельно с repo-rules) — тул остаётся синхронным, но внутри независимое идёт параллельно. Bench: `bench/real-sessions.mjs` (сжатие/q-слой/kept-compact-omitted), `bench/skeptic-ab.mjs` (A/B), `bench/bench.ts` (детектор). Метрика: raw-вход vs пакет (ожидаем 0.1-0.3%, summary-режим до ~9K×).

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-3](USE_CASES.md#uc-3-fail-open-и-bounded-input-при-сбоях)

## FR-9: READ-ONLY inner advisor (строго, по факту инструментов)

Адвизор НЕ меняет ничего и НЕ исполняет state-changing команды: только читает (транскрипт, summary, git-status/diff, репо-файлы, repo-rules) и возвращает совет в tool_result. Read-only фиксируется **по факту инструментов** (у адвизора нет Write/Edit/state-changing-Bash-тулов), а не только «промпт-запретом» — заимствовано из fable-lead gotcha «prompt constraint ≠ permission boundary». `summary.md` и `session-state.json` пишет ТОЛЬКО Stop-hook (`session-summary.mjs`); МCP-адвизор их только читает. При выявлении проблемы адвизор «возвращает на доработку» (re-delegate), а не правит сам (приём fable-lead §5).

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9), [AC-9b](ACCEPTANCE_CRITERIA.md#ac-9b-fr-9)
**Use Case:** [UC-2](USE_CASES.md#uc-2-агент-сам-консультируется-через-mcp-тул-self-invocation), [UC-3](USE_CASES.md#uc-3-fail-open-и-bounded-input-при-сбоях)

## FR-10: Интеграция MINDLAS metrics в консультацию

Адвизор читает детерминированные метрики MINDLAS (Evolutionairy-AI/MINDLAS) и встраивает их в консультацию: секция `## MINDLAS METRICS` в пакете перед советом. Источник: `mindlas scorecard --json` (структур.): context_rot / verification_debt / change_blast_radius / tool_failure_loop + optional `status --plain` (однострочник). MINDLAS = безмодельная «термометрия» (ROT/VERIFY/BLAST/LOOP), наш sol-адвизор — смысловая интерпретация: если ROT высок — совет «сделай context repair»; VERIFY — «прогони verify gate»; BLAST — «разбей patch»; LOOP — «останови retry». Fail-open: нет `mindlas` на PATH / нет JSON / таймаут → секция пропускается, консультация не ломается. Гейт: `ADVISOR_MINDLAS` (default 1) + `MINDLAS_BIN` (path override для venv).

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-2](USE_CASES.md#uc-2-агент-сам-консультируется-через-mcp-тул-self-invocation)