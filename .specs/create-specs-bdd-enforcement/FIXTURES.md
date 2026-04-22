# Fixtures

## Overview

Эта спека (МЕТА-spec про BDD enforcement в spec-generator) использует 7 mini-project fixture-проектов в `tests/fixtures/bdd-enforcement/` для integration-тестов SBDE001_01..06. Все fixtures static (read-only mini-project layouts), без runtime mutations — TEST_DATA=TEST_DATA_NONE.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | csharp-reqnroll-installed | static | `tests/fixtures/bdd-enforcement/csharp-reqnroll-installed/Project.csproj` | shared | tests/e2e/create-specs-bdd-enforcement.test.ts |
| F-2 | csharp-reqnroll-missing | static | `tests/fixtures/bdd-enforcement/csharp-reqnroll-missing/Project.csproj` | shared | tests/e2e/create-specs-bdd-enforcement.test.ts |
| F-3 | ts-cucumber-installed | static | `tests/fixtures/bdd-enforcement/ts-cucumber-installed/package.json` | shared | tests/e2e/create-specs-bdd-enforcement.test.ts |
| F-4 | ts-cucumber-missing | static | `tests/fixtures/bdd-enforcement/ts-cucumber-missing/package.json` | shared | tests/e2e/create-specs-bdd-enforcement.test.ts |
| F-5 | python-pytest-bdd-installed | static | `tests/fixtures/bdd-enforcement/python-pytest-bdd-installed/requirements.txt` | shared | tests/e2e/create-specs-bdd-enforcement.test.ts |
| F-6 | python-pytest-bdd-missing | static | `tests/fixtures/bdd-enforcement/python-pytest-bdd-missing/requirements.txt` | shared | tests/e2e/create-specs-bdd-enforcement.test.ts |
| F-7 | multi-folder-features | static | `tests/fixtures/bdd-enforcement/multi-folder-features/{Cloud,src}/.../Features/*.feature` | shared | SBDE001_03 (analyze-features multi-folder scan) |

## Lifecycle

- **Setup:** Все fixtures создаются один раз через `Write` tool при scaffolding. Read-only при выполнении тестов.
- **Teardown:** N/A — fixtures static, не модифицируются. Исключение: SBDE001_04 (escape hatch) создаёт временную spec в `.specs/_smoke-sbde004-{timestamp}/` через `try/finally` cleanup.
- **Dependencies:** Нет dependency graph — fixtures независимы.

## Gap Analysis

Покрытие 6 BDD scenarios:

| Scenario | Fixtures used | Notes |
|----------|---------------|-------|
| SBDE001_01 | F-1 | Positive detection Reqnroll |
| SBDE001_02 | (temp dir) | `os.tmpdir()` для blocker test, не нужен fixture |
| SBDE001_03 | F-7 | Multi-folder scan |
| SBDE001_04 | (real `.specs/_smoke-sbde004-{ts}/`) | Cleanup в `try/finally` |
| SBDE001_05 | F-2 | Reqnroll missing → bootstrap recipe |
| SBDE001_06 | F-6 | pytest-bdd missing → bootstrap recipe |

Не покрыто (intentional gap, реализация поверх существующих smoke tests): F-3 (TS Cucumber installed), F-4 (TS Cucumber missing), F-5 (Python pytest-bdd installed). Эти fixtures зарезервированы для будущих SBDE001_07/08/09 (опционально).
