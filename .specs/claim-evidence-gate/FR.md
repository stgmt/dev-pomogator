# Claim-Evidence Gate — Functional Requirements

## Контекст

Stop-хук, который ловит инцидент-первопричину этой фичи: агент презентует РЕЗУЛЬТАТ (таблицу вердиктов fact-check, «работает», «не существует», `[VERIFIED via X]`), которого в этом ходе не производил — вообразил вывод инструмента вместо запуска. Существующие сторожа (pinator) ловят формулировку по словам-триггерам, а не наличие улики; tester/researcher вообще без хука. Этот гейт — объединение: один сторож на класс «заявил результат без улики».

Реализация: `tools/claim-evidence-gate/` (`turn_window.ts`, `claim_classifier.ts`, `claim_evidence_gate_stop.ts`). Зарегистрирован в `.claude-plugin/hooks.json` (canonical) + `.claude/settings.json` (dogfood).

## FR (Functional Requirements)

- **FR-1**: Хук SHALL извлекать turn-window — всё после последнего реального user-сообщения (не tool_result): последний assistant-текст (claim) + все `tool_use {name,input}` главной цепочки, ИСКЛЮЧАЯ sidechain-линии.
- **FR-2**: Классификатор SHALL распознавать 4 класса заявлений на `stripCode(text)`: `analysis-verdict` (≥2 строки вердикт-токенов PASS/FAIL/✅/❌), `works-done` («работает/починено/фикс деплоен/тесты зелёные», standalone, не negated, не explainer), `not-found-impossible` («не нашёл/не существует/архитектурно невозможно»), `verified-marker` (`[VERIFIED via X]` на raw-тексте).
- **FR-3**: Гейт SHALL блокировать первый класс, чья улика отсутствует: analysis-verdict/works-done → ≥1 исполнитель (Bash/PowerShell/Task/Agent/mcp__*); not-found → ≥`CLAIM_GATE_MIN_SEARCH` (default 2) поисковых вызовов (Grep/Glob/WebSearch/WebFetch/octocode/Task); verified-marker → tool_use, чьё имя/вход содержит токен из X.
- **FR-4**: `CLAIM_GATE_ENABLED` SHALL принимать `true` (enforce, **дефолт**), `shadow` (только лог, никогда не блок), `false` (выкл).
- **FR-5**: Каждое срабатывание SHALL дописываться в `.dev-pomogator/.claim-evidence-gate-fires.jsonl` (ts, class, need, tool_uses, claim_snippet, mode, session_id, cwd) — даже в shadow.
- **FR-6**: Гейт SHALL иметь anti-loop (одинаковый claim-hash → approve; > `CLAIM_GATE_MAX_RETRIES` за cooldown → approve), self-marker short-circuit, honor `stop_hook_active`, и fail-open на любой ошибке (вернуть `{}`).
- **FR-7**: Гейт НЕ ДОЛЖЕН блокировать репорт результата, полученного ПОСЛЕ реального запуска в том же user-ходе (улика в окне) — окно ограничено сообщениями юзера, не ходами ассистента.

## NFR (Non-Functional Requirements)

- **Performance**: синхронно, без сети/subprocess; пропуск линий >1MB; укладывается в Stop-таймаут (<5s).
- **Security**: snippet усечён до 200 символов; per-repo marker/fires scoping через cwd.
- **Reliability**: fail-open везде; atomic marker write; corrupt JSONL-линии пропускаются.
- **Usability**: причина блока простым языком с указанием что прогнать + подсказкой `[UNVERIFIED]`; env kill-switch (`false`).

## Out of Scope

- Улика в ПРЕДЫДУЩЕМ user-ходе (репорт без нового вызова после нового запроса юзера) — known limitation; при необходимости расширить окно по данным fire-лога.
- Семантическая (LLM/embedding) проверка соответствия claim↔tool — гейт чисто лексический/структурный для скорости.
