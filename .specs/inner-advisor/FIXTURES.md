# Fixtures

## Overview

BDD-тесты `inner-advisor` опираются на: (1) реальный (обрезанный) транскрипт сессии — вход адвизора; (2) rolling summary, который либо уже лежит на диске, либо создаётся через `maybeUpdateSummary` с mock `callModel` (без сети); (3) конфиг активации.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Session transcript fixture | static | `tests/fixtures/inner-advisor/session-transcript.jsonl` | per-scenario | step `Given a session transcript path is resolvable` |
| F-2 | Rolling summary (created) | factory | `.dev-pomogator/advisor/summary/<sid>.md` (runtime) | per-scenario | step `Given a rolling session summary.md exists` (через `maybeUpdateSummary` + mock callModel) |
| F-3 | Empty summary (template) | static | `tools/advisor/session-summary.mjs` → `DEFAULT_TEMPLATE` | per-scenario | step Given initial template |

## Fixture Details

### F-1: Session transcript fixture

- **Type:** static file
- **Format:** JSONL (Claude Code transcript, усечённый до ~30-60 строк)
- **Setup:** копирование real transcript из `~/.claude/projects/E--repos-dev-pomogator/<sid>.jsonl` в `tests/fixtures/inner-advisor/`; обрезать до минимального валидного набора событий (user/assistant/tool_use/tool_result).
- **Teardown:** none (read-only fixture)
- **Dependencies:** none
- **Used by:** INNERADV01..08
- **Assumptions:** формат JSONL соответствует Claude Code (type/message.content blocks)

### F-2: Rolling summary (created)

- **Type:** factory
- **Format:** markdown (10 секций)
- **Setup:** вызов `maybeUpdateSummary` с `force=true` и mock `callModel`, возвращающим `DEFAULT_TEMPLATE` с заполненной «Current State»; идемпотентно
- **Teardown:** удаление `.dev-pomogator/advisor/summary/<sid>.md` + state (after scenario)
- **Dependencies:** F-1 (из транскрипта берётся дельта)
- **Used by:** INNERADV01, INNERADV03
- **Assumptions:** `verifyStructure` на mock-ответе проходит (mock сохраняет 10 заголовков)

### F-3: Empty summary template

- **Type:** static
- **Format:** markdown
- **Setup:** `DEFAULT_TEMPLATE` из `session-summary.mjs`
- **Teardown:** none
- **Used by:** INNERADV02 (гейт: форс создаёт из шаблона)
- **Assumptions:** none

## Dependencies Graph

```
F-1 → F-2 (delta берётся из транскрипта)
F-3 → F-2 (начальное состояние при первом создании)
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | INNERADV01_consult_uses_rolling_summary | F-1, F-2 | none |
| @feature2 | INNERADV02_gate_skips_short | F-1, F-3 (mock callModel, содержание сети не нужно) | новая фикстура F-3 появилась |
| @feature3 | INNERADV03_stop_hook_updates | F-1, F-2 | none |
| @feature4 | INNERADV04_mcp_available | F-1 | конфиг канонической регистрации (нет отдельного fixture, проверяется окружением) |
| @feature5 | INNERADV05_fail_open | F-1 | none (mock отсутствия токена) |
| @feature6 | INNERADV06_balanced_skeptic | F-1 (кабельный мок модели) | none |
| @feature7 | INNERADV07_no_coupling | grep репо | статическая проверка без fixture |
| @feature8 | INNERADV08_bench_compression | F-1 (реальный крупный транскрипт) | fixture большого размера (~1MB) — только для bench |

## Notes

- Сет-вызовы адвизора в BDD — только через mock `callModel`, чтобы тесты не зависели от sub2api и не тратили деньги.
- Cleanup фикстур summary — atomic (temp+rename) и `wx`-lock, чтобы параллельные прогоны не конфликтовали.
- Крупный транскрипт для INNERADV08 — отдельный `.fixture`-файл только для bench, не для обычного прогона.