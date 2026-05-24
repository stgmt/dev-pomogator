# Fixtures

## Overview

Этой фиче нужен только один тип fixture — temporary test directories для integration tests FR-3 (installer creates files в target dir) и FR-5 (rule migration на копии исходного файла). Никаких static data fixtures, seed DB, или container fixtures не требуется — extension чисто declarative (markdown + JSON), нет runtime state.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | temp test project dir | factory | runtime через `appPath()` helper из `tests/e2e/helpers.ts` | per-scenario | `beforeEach` + `afterEach` в test body |
| F-2 | rule source copy | factory | runtime через `fs.copyFile()` из `.claude/rules/answer-simple/clear-questions-to-user.md` в temp dir | per-scenario | test body (FR-5 migration scenarios) |

## Fixture Details

### F-1: temp test project dir

- **Type:** factory (создаётся runtime через helper)
- **Format:** filesystem directory
- **Setup:** `tempPath = appPath()` создаёт OS temp dir с уникальным suffix; `runInstaller(tempPath, ['--claude', '--plugins=answer-simple'])` копирует extension артефакты в temp dir
- **Teardown:** `cleanupTestDir(tempPath)` рекурсивно удаляет temp dir после теста (или vitest test isolation если используется `tmp-promise` под капотом helper'а)
- **Dependencies:** none
- **Used by:** @feature3 scenarios — PLUGIN017_05 (installer creates correct structure)
- **Assumptions:** OS позволяет создавать temp dirs (любой POSIX/Windows); диск имеет свободное место для копии extension артефактов (~1 KB)

### F-2: rule source copy

- **Type:** factory (создаётся runtime через `fs.copyFile`)
- **Format:** markdown file
- **Setup:** `fs.copyFileSync(realRulePath, tempCopyPath)` копирует actual rule в temp dir для атомарного теста миграции на copy (не на реальном файле)
- **Teardown:** автоматически с F-1 cleanup (temp dir удаляется)
- **Dependencies:** F-1 (temp dir должен существовать первым)
- **Used by:** @feature3 scenarios — миграция верифицируется на copy чтобы не повредить реальный rule в repo
- **Assumptions:** `.claude/rules/answer-simple/clear-questions-to-user.md` существует в source repo на момент теста (после implementation Phase 3)

## Dependencies Graph

```
F-1 (temp dir) → F-2 (rule copy в temp dir)
```

F-2 строго зависит от F-1 (его создания первым). Cleanup F-1 каскадно очищает F-2.

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | PLUGIN017_01, PLUGIN017_02 (always-apply + incident trigger) | none (нет filesystem state) | none — scenarios verifyются через mock conversation context, не через filesystem |
| @feature2 | PLUGIN017_03, PLUGIN017_04 (slash-команда) | none (pure text I/O) | none — input/output текстовые, нет state |
| @feature3 | PLUGIN017_05 (installer + migration) | F-1, F-2 | none — обе fixtures покрывают installer и migration test cases |

## Notes

Cleanup order: F-2 cleanup automatic с F-1 (temp dir recursive delete). Никаких external dependencies (нет DB, нет network calls, нет shared state между тестами). Vitest test isolation гарантирует что параллельные тесты не вмешиваются друг в друга через одинаковые temp dirs (`appPath()` использует unique suffix). Известных проблем нет — это standard pattern существующих 50+ e2e tests в dev-pomogator.
