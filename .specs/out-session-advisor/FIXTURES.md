# Fixtures

## Overview

Для BDD-тестов out-session-advisor/parallel-safety нужны: реальные куски транскриптов Claude Code
(главный + субагентные, из сессии `6126f730...`), два транскрипта-сессии для «кто писал», и
git fixture-репо со staged-путями для git-гейта. Все фикстуры — копии в temp-workdir, никогда
не трогают реальные файлы.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | main-session.jsonl | snapshot | `tests/features/plugins/out-session-advisor/fixtures/main-session.jsonl` | per-scenario | out-session-advisor-hooks (BeforeScenario) |
| F-2 | subagents/agent-test.jsonl | snapshot | `.../fixtures/subagents/agent-test.jsonl` | per-scenario | out-session-advisor-hooks |
| F-3 | session-A.jsonl | snapshot | `.../fixtures/session-A.jsonl` | per-scenario | out-session-advisor-hooks |
| F-4 | session-B.jsonl | snapshot | `.../fixtures/session-B.jsonl` | per-scenario | out-session-advisor-hooks |
| F-5 | git-fixture/ | container | `.../fixtures/git-fixture/` | per-scenario | out-session-advisor-hooks |

## Fixture Details

### F-1: main-session.jsonl

- **Type:** snapshot
- **Format:** JSON (JSONL)
- **Setup:** скопирован из реального транскрипта (`6126f730.../6126f730....jsonl`), срез user/assistant/tool_use/step-finish
- **Teardown:** temp-workdir удаляется AfterScenario
- **Dependencies:** none
- **Used by:** @feature1, @feature3
- **Assumptions:** структура строк JSONL соответствует контракту SCHEMA.md (type + message.content[])

### F-2: subagents/agent-test.jsonl

- **Type:** snapshot
- **Format:** JSON (JSONL)
- **Setup:** срез реального `subagents/agent-*.jsonl` (незакрытый поток — читается до последней строки)
- **Teardown:** temp-workdir удаляется AfterScenario
- **Dependencies:** none
- **Used by:** @feature1
- **Assumptions:** файл может быть незакрыт при чтении (нет EOF-блокировки)

### F-3 / F-4: session-A.jsonl / session-B.jsonl

- **Type:** snapshot
- **Format:** JSON (JSONL)
- **Setup:** два независимых транскрипта; A правит `src/foo.py`, B — `src/bar.py`
- **Teardown:** temp-workdir удаляется AfterScenario
- **Dependencies:** none
- **Used by:** @feature9
- **Assumptions:** Edit/Write-события распознаются парсером «кто писал»

### F-5: git-fixture/

- **Type:** container
- **Format:** git repository
- **Setup:** `git init` в temp + staged-пут, включающий `src/foo.py`
- **Teardown:** temp-workdir удаляется AfterScenario
- **Dependencies:** none
- **Used by:** @feature6
- **Assumptions:** не пересекается с реальным рабочим деревом

## Dependencies Graph

```
F-1, F-2 → (tail/verify scenario)
F-3, F-4 → (кто писал scenario)
F-5      → (git-guard scenario)
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | OUTSESS001_01/_02 | F-1, F-2 | none |
| @feature3 | OUTSESS001_03/04/05 | F-1 | none |
| @feature2 | OUTSESS001_06 | none (ConPTY smoke — live-инструмент, не файл) | none |
| @feature6 | OUTSESS001_09/10 | F-5 | none |
| @feature7 | OUTSESS001_11/12 | temp locks dir | none |
| @feature8 | OUTSESS001_13 | F-3, F-4 (процессы mocked) | none |
| @feature9 | OUTSESS001_14 | F-3, F-4 | none |
| @feature10 | OUTSESS001_15/16 | F-3, F-4 | none |

## Notes

- Cleanup: AfterScenario удаляет temp-workdir (копии фикстур + git fixture).
- Реальные файлы `6126f730...` не трогаются — только чтение/копирование.
- ConPTY-сценарий (OUTSESS001_06) — live-инструмент без файловой фикстуры; покрывается smoke-test'ом.