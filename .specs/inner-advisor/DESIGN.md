# Design

## Реализуемые требования

- [FR-1: Rolling session summary](FR.md#fr-1-rolling-session-summary-10-секций-на-диске)
- [FR-2: Гейт обновления summary](FR.md#fr-2-гейт-обновления-summary-cost-gate)
- [FR-3: Stop-hook автообновления](FR.md#fr-3-stop-hook-автообновления-summary-в-реальных-сессиях)
- [FR-4: MCP-тул advisor в каноне](FR.md#fr-4-mcp-тул-advisor-self-invocation-в-каноне)
- [FR-5: Fail-open и bounded-input](FR.md#fr-5-fail-open-и-bounded-input-по-всей-цепочке)
- [FR-6: Evidence-based консультация](FR.md#fr-6-evidence-based-консультация-two-pass-skeptic-balanced)
- [FR-7: Изоляция от out-session-advisor](FR.md#fr-7-изоляция-от-out-session-advisor)
- [FR-8: Измеримость + async](FR.md#fr-8-измеримость-bench-и-асинхронность-внутри-синхронного-тула)
- [FR-9: READ-ONLY inner advisor](FR.md#fr-9-read-only-inner-advisor-строго-по-факту-инструментов)

## Компоненты

- `tools/advisor/mcp-server.mjs` — MCP-сервер, тул `mcp__dev-pomogator-advisor__advisor` (без параметров), выбор режима, трейс.
- `tools/advisor/session-summary.mjs` — Rolling summary: шаблон 10 секций, гейт (5K/5K+3tools), дельта ≤40, атомарная запись, `wx`-lock, `verifyStructure`, `maybeUpdateSummary`.
- `tools/advisor/session-digest.mjs` — контекст-движок: слои (план/цели/дрейф, активность asymmetric, repo-rules, self-check), `renderDigestPrioritized` (бюджет/приоритет), two-pass, `buildSummaryPacket` (summary+delta if exists else digest fallback), `callModel` (cacheControl/usage).
- `tools/advisor/fast-evidence.mjs` — паттерн-выборка ошибок/файлов/команд/промптов (параллельные чанки).
- `tools/advisor/transcript-packet.mjs` — locate транскрипта по session-id, full-пакет, модель-вызов.
- `tools/advisor/advisor_stop.ts` — Stop-hook: ключевые точки (done/recurring/plan) + гейт-обновление summary; fail-open. **Единственный писатель `summary.md`/state.**
- `tools/advisor/bench/*` — real-sessions (сжатие/q), skeptic-ab (A/B), bench (детектор).

## READ-ONLY граница (FR-9, принцип)

Адвизор — только чтение: у MCP-тула нет Write/Edit/state-changing-Bash, только read-тулы и return. Писать `summary.md`/`session-state.json` может ТОЛЬКО Stop-hook (`session-summary.mjs`), адвизор их читает. Выявленную проблему адвизор «возвращает на доработку» (re-delegate), не исправляет сам. Это защищает от fable-lead gotcha «prompt constraint ≠ permission boundary» и сохраняет single-writer инвариант для состояний сессии.

## Поток данных

```
[Stop-hook] transcript → parse → gate(5K/5K+3tools) → нет: skip
          → да: delta последних ≤40 → luna → атомарный summary.md (wx-lock, verifyStructure)

[MCP advisor] transcript locate → buildSummaryPacket
          → summary существует? да: summary + delta-хвост + errors/files/repo-rules
          → нет: full digest (renderDigestPrioritized)
          → pass1 luna (situation report) → pass2 sol (guidance balanced)
          → tool_result агент применяет
```

## Активация в реальных сессиях (как плагин)

Решения: (1) активация через файл конфига `.dev-pomogator/advisor/config.json` + env override (`ADVISOR_SESSION_SUMMARY`), fail-open; (2) дефолт только по само-вызову адвизора (никакой авто-консультации на done); (3) канонический плагин распределения (resolve от `CLAUDE_PLUGIN_ROOT`), а не ручной `--settings` overlay.

Регистрация:
- Stop-hook: в `hooks.json` (`.claude-plugin/`) матчер Stop → `node ${CLAUDE_PLUGIN_ROOT}/tools/advisor/advisor_stop.ts`, `async: true`, timeout → работает во всех сессиях установивших плагин.
- MCP: в `.mcp.json` (dogfood) + в plugin manifest — `mcpServers.dev-pomogator-advisor`, command node, args провиод через `CLAUDE_PLUGIN_ROOT` (sample как dev-pomogator-specs: резолвят через require + spawn).
- Fallback-активация конфигом: `{ enabled:true, mode:'digest', skeptic:'balanced', sessionSummary:true }`.

Главный вызов канонической регистрации: **не класть абсолютные пути `E:/repos/...` в shipped конфиг** — всё через `${CLAUDE_PLUGIN_ROOT}`/node-launcher (требование FR-4/AC-4).

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE

### Cleanup Strategy

- F-1 (transcript fixture): не чистится (read-only статик в `tests/fixtures/`).
- F-2 (rolling summary): удаляется after-scenario `.dev-pomogator/advisor/summary/<sid>.md` + `state/<sid>.json` (atomic, под `wx`-lock, параллельные прогоны безопасны).
- F-3 (template): константа `DEFAULT_TEMPLATE`, очистка не требуется.
- Бэкап/роллбэк: записи атомарные (temp+rename); при сбое стейт не портится (consecutive_failures отслеживается). — фиче нужны фикстуры (transcript fixture + создаваемый rolling summary), см. FIXTURES.md.

**Framework:** cucumber-js (не «framework missing» — подтверждено в репо: `cucumber.json` в корне, `tests/step_definitions/` существует, `scripts/docker-bdd.sh` для прогона).

Test Data & Fixtures:

| Фикстура | Тип | Lifecycle | Кто создаёт | JSON/YAML/SQL/Docker/TS/Py | Как создаётся/чистится | Зависит от | Сценарии |
|---|---|---|---|---|---|---|---|
| rolling summary `/.dev-pomogator/advisor/summary/<sid>.md` | dynamic | per-scenario | step `Given a rolling session summary.md exists` | markdown | создание: `maybeUpdateSummary` при форсе/гейте; cleanup: удаление `.dev-pomogator/advisor/<sid>` | mock callModel (тест без сети) | INNERADV01 |
| session transcript fixture `.jsonl` | static | per-scenario | `Given a session transcript path is resolvable` | TypeScript/JSONL | фиксированный `.jsonl` из `tests/fixtures/` (реальный обрезанный транскрипт); cleanup: none (read-only) | repo-структура | INNERADV01..08 |

Прогон: `bash scripts/docker-bdd.sh --name "INNERADV01"` (или range). Хостовый прогон запрещён — только Docker (правило no-host-bdd-runs).