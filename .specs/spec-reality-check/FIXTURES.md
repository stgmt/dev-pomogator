# Fixtures

## Overview

5 fixture spec directories покрывают по одному drift-классу каждая (stale-create / missing-edit / narrative-drift / code-drift / task-orphan). Каждая fixture — минимальная spec (FR.md + FILE_CHANGES.md + optionally TASKS.md) с одним известным drift'ом который verify.ts должен поймать. Tests копируют fixture в tmpdir, запускают verify.ts на копии, проверяют findings.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | stale-create | static | `tests/fixtures/spec-reality-check/stale-create/` | per-scenario | beforeEach в spec-reality-check.test.ts |
| F-2 | missing-edit | static | `tests/fixtures/spec-reality-check/missing-edit/` | per-scenario | beforeEach в spec-reality-check.test.ts |
| F-3 | narrative-drift | static | `tests/fixtures/spec-reality-check/narrative-drift/` | per-scenario | beforeEach в spec-reality-check.test.ts |
| F-4 | code-drift | static + factory | `tests/fixtures/spec-reality-check/code-drift/` | per-scenario | beforeEach + git init helper |
| F-5 | task-orphan | static | `tests/fixtures/spec-reality-check/task-orphan/` | per-scenario | beforeEach в spec-reality-check.test.ts |

## Fixture Details

### F-1: stale-create

- **Type:** static file
- **Format:** Markdown (FR.md + FILE_CHANGES.md)
- **Setup:** Копируется в tmpdir; FILE_CHANGES.md row `action=create` указывает на путь который существует в tmpdir (создаётся в beforeEach)
- **Teardown:** rmSync tmpdir в afterEach
- **Dependencies:** none
- **Used by:** SRC001_01
- **Assumptions:** tmpdir создан и содержит pre-existing файл по `action=create` пути

### F-2: missing-edit

- **Type:** static file
- **Format:** Markdown
- **Setup:** Копируется в tmpdir; FILE_CHANGES.md row `action=edit` указывает на путь которого нет
- **Teardown:** rmSync tmpdir
- **Dependencies:** none
- **Used by:** SRC001_02
- **Assumptions:** tmpdir созданный изолированно, путь из row не существует

### F-3: narrative-drift

- **Type:** static file
- **Format:** Markdown
- **Setup:** Копируется в tmpdir; FR.md содержит inline backtick path `src/foo/bar.ts` на missing file
- **Teardown:** rmSync tmpdir
- **Dependencies:** none
- **Used by:** SRC001_04
- **Assumptions:** регекс narrative path extraction срабатывает на `.ts` extension

### F-4: code-drift

- **Type:** static + factory
- **Format:** Markdown + git repo
- **Setup:** Копируется в tmpdir; beforeEach дополнительно делает `git init` + `git commit` с message содержащим `FR-1` и trivial file
- **Teardown:** rmSync tmpdir (включая .git)
- **Dependencies:** git binary on PATH
- **Used by:** SRC001_05, SRC001_05b
- **Assumptions:** git binary доступен для positive case; SRC001_05b skip .git creation для negative case

### F-5: task-orphan

- **Type:** static file
- **Format:** Markdown
- **Setup:** Копируется в tmpdir; TASKS.md содержит `**files:** \`src/extra.ts\`` где `src/extra.ts` не упоминается в FILE_CHANGES.md
- **Teardown:** rmSync tmpdir
- **Dependencies:** none
- **Used by:** SRC001_06
- **Assumptions:** TASKS parser распознаёт `**files:**` regex pattern

## Dependencies Graph

```
F-1 (stale-create)       — independent
F-2 (missing-edit)       — independent
F-3 (narrative-drift)    — independent
F-4 (code-drift)         — depends on git binary
F-5 (task-orphan)        — independent
```

Все 5 fixtures изолированы per-scenario через mkdtempSync + rmSync. Никакой cross-fixture state.

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature2 | SRC001_01 action=create existing | F-1 | none |
| @feature2 | SRC001_02 action=edit missing | F-2 | none |
| @feature2 | SRC001_03 action=delete missing | F-2 (reused с action=delete row) | none |
| @feature3 | SRC001_04 narrative drift | F-3 | none |
| @feature4 | SRC001_05 code-drift positive | F-4 | none |
| @feature4 | SRC001_05b code-drift skip on no-git | F-4 без git init | none |
| @feature5 | SRC001_06 task orphan | F-5 | none |
| @feature10 | SRC001_07 clean shipped negative | none (uses real `.specs/spec-workflow-md-validation`) | depends on existing repo spec |
| @feature6 | SRC001_08..10 output formats | F-1 reused (любая fixture с findings) | none |
| @feature7 | SRCHOOK001_01..03 hook scenarios | F-2 reused | none |

## Notes

- Cleanup order: rmSync recursive force handles nested .git directories на Windows. Если cleanup падает (file lock retry edge case) — afterEach использует try/catch, тест passes но warning в console.
- Windows-specific: создание fixture spec dirs через fs.cp() recursive — нужен Node 16.7+. Уже satisfied в этом repo (Node 22 LTS).
- Каскадные зависимости: F-4 требует git binary. Тест должен skip если git недоступен (CI environments without git).
