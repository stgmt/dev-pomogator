# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-rolling-session-summary-10-секций-на-диске)

WHEN существует rolling summary для сессии AND вызывается MCP-консультация `advisor` THEN консультация SHALL строиться из summary + delta-хвоста (`mode='summary'`), А НЕ пересобирать полный транскрипт.

## AC-1b (FR-1)

**Требование:** [FR-1](FR.md#fr-1-rolling-session-summary-10-секций-на-диске)

WHEN адвизор создаёт/обновляет `summary.md` THEN файл SHALL содержать все 10 секций с целыми `#`-заголовками (проверка `verifyStructure`), запись SHALL быть атомарной (temp+rename), и путь SHALL быть `.dev-pomogator/advisor/summary/<session-id>.md` (gitignored).

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-гейт-обновления-summary-cost-gate)

IF контент-токенов < 5K THEN обновление summary SHALL НЕ выполняться (гейт init); IF рост < 5K OR (tool calls с прошлого раза < 3 AND последний ход содержит tool calls) THEN обновление SHALL НЕ выполняться; IF `ADVISOR_SUMMARY_FORCE=1` THEN гейт SHALL быть пропущен.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-stop-hook-автообновления-summary-в-реальных-сессиях)

WHEN Stop-hook видит прохождение гейта THEN он SHALL обновить summary дельтой последних ≤40 событий через дешёвую модель, атомарно, под `wx`-lock; WHEN ошибка/таймаут/нет модели THEN он SHALL пропустить обновление и НЕ блокировать Stop.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-mcp-тул-advisor-self-invocation-в-каноне)

WHEN плагин установлен канонически AND агент вызывает `mcp__dev-pomogator-advisor__advisor` (без параметров) THEN тул SHALL быть доступен во всех сессиях WITHOUT ручных машинных путей (resolve от `CLAUDE_PLUGIN_ROOT`).

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-fail-open-и-bounded-input-по-всей-цепочке)

WHEN нет модели/таймаут/битый транскрипт/потеря структуры summary THEN адвизор SHALL вернуть fail-open ответ (короткая ошибка или `{}`), Stop SHALL не блокироваться, визes НЕ бесконечность; входы модели SHALL быть bounded (`ADVISOR_DIGEST_MAX_TOKENS`, delta ≤40).

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-evidence-based-консультация-two-pass-skeptic-balanced)

WHEN адвизор консультирует в режиме `balanced` AND в digest/report нет реальной причины для блокировки THEN совет SHALL содержать формулировку «выглядит sound/complete» + одну проверку, а НЕ шаблонное «don't declare done»; WHEN есть причина (нет улики/drift/нарушение правила/ошибки) THEN «не done» SHALL появляться и быть обоснован именем файла/правила/ошибки.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-изоляция-от-out-session-advisor)

WHEN проверяется изоляция THEN `tools/advisor/*` SHALL не импортировать из out-session-advisor, имена спеки разные (`inner-advisor` vs `out-session-advisor`), пути данных (`summary/<sid>.md`) и хуки (Stop/MCP vs внешние подпроцессы) SHALL не пересекаться.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-измеримость-bench-и-асинхронность-внутри-синхронного-тула)

WHEN прогоняется `bench/real-sessions.mjs` THEN для крупных сессий (10-16MB) сжатие SHALL быть ≤0.3% raw, q-слой ≥2, итог-запись содержит kept/compact/omitted; WHEN запущен `bench/skeptic-ab.mjs` THEN оба режима дают осмысленный совет и сравнение показывает сжатие `balanced` ≤ `strict`.

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-read-only-inner-advisor-строго-по-факту-инструментов)

WHEN адвизор вызывается THEN его доступ SHALL быть строго read-only ПО ФАКТУ ИНСТРУМЕНТОВ: у тула MCP нет Write/Edit/state-changing-Bash, только чтение транскрипта, summary, git-status/diff и репо-файлов; в tool_result возвращается совет, а не изменения.

## AC-9b (FR-9)

**Требование:** [FR-9](FR.md#fr-9-read-only-inner-advisor-строго-по-факту-инструментов)

WHEN адвизор выявляет проблему (дрейф, недоказанное done, нарушение правила) THEN он SHALL «вернуть на доработку» в совете (re-delegate), а НЕ исправлять файлы/коммиты самостоятельно; WHÉ ROLL запись в summary.md SHALL выполняться только Stop-hook'ом (`session-summary.mjs`), МCP-адвизор её только читает.

## AC-10 (FR-10)

**Требование:** [FR-10](FR.md#fr-10-интеграция-mindlas-metrics-в-консультацию)

WHEN `mindlas scorecard --json` доступен (или demo-фикстура в тесте) AND `ADVISOR_MINDLAS=1` THEN консультация SHALL включать секцию `## MINDLAS METRICS` с context_rot/verification_debt/change_blast_radius/tool_failure_loop; WHEN mindlas недоступен (не на PATH/таймаут/без JSON) THEN секция SHALL пропускаться и консультация SHALL работать без неё (fail-open).