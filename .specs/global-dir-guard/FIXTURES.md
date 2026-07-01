# Fixtures

## Overview

Тесты guard'а гоняют скрипт против изолированного mock-HOME, создавая/удаляя маркер деинсталляции и поддельную `~/.dev-pomogator/` структуру, чтобы ни один сценарий не трогал реальный HOME. Источник истины — таблица «Test Data & Fixtures» в [DESIGN.md](DESIGN.md#bdd-test-infrastructure).

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Uninstall marker file | factory | `<tempHome>/.dev-pomogator-uninstalled` | per-scenario | `beforeEach` (test создаёт по мере надобности) |
| F-2 | Fake scripts dir | factory | `<tempHome>/.dev-pomogator/scripts/` | per-scenario | `beforeEach` |
| F-3 | Fake project settings | factory | `<tempProject>/.claude/settings.json` | per-scenario | `beforeEach` |

## Fixture Details

### F-1: Uninstall marker file

- **Type:** factory
- **Format:** empty marker file
- **Setup:** created under the isolated `tempHome` when a scenario needs the "uninstalled" state.
- **Teardown:** `afterEach` removes `~/.dev-pomogator-uninstalled` if created.
- **Dependencies:** `tempHome` (isolated HOME)
- **Used by:** @feature1 global-dir-guard scenarios exercising the uninstall-marker branch
- **Assumptions:** the guard resolves HOME from the env override, never the real HOME.

### F-2: Fake scripts dir

- **Type:** factory
- **Format:** filesystem directory tree
- **Setup:** `beforeEach` builds a temp `~/.dev-pomogator/scripts/` structure inside `tempHome`.
- **Teardown:** `afterEach` deletes the temp dir; restores `~/.dev-pomogator/scripts/` if a test removed it.
- **Dependencies:** `tempHome`
- **Used by:** @feature1 scenarios checking guard behaviour against a present/absent scripts dir
- **Assumptions:** temp HOME is writable and isolated from the real one.

### F-3: Fake project settings

- **Type:** factory
- **Format:** JSON (`.claude/settings.json`)
- **Setup:** `beforeEach` writes a project `settings.json` carrying hooks into a temp project dir.
- **Teardown:** removed with the temp project dir in `afterEach`.
- **Dependencies:** none
- **Used by:** @feature1 scenarios that read project settings/hooks
- **Assumptions:** the guard reads settings from the project path under test, not the real project.

## Dependencies Graph

```
tempHome → F-1 (marker), F-2 (scripts dir)
tempProject → F-3 (settings.json)
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | guard acts on an isolated mock HOME state | F-1, F-2, F-3 | none |

## Notes

Все фикстуры per-scenario и живут в изолированном `tempHome`/`tempProject`; `afterEach` снимает маркер и восстанавливает `~/.dev-pomogator/scripts/`, если тест его удалил. Реальный HOME не трогается (env override).
