# Fixtures

## Overview

3 static fixtures для integration-тестов axis-detector и cli. Greenfield/brownfield PRD проверяют detection vs hard-OUT; expected-axes.json — golden output для сравнения. Temp output (md/html/QUEUE) создаётся тестами в os.tmpdir() и удаляется per-test cleanup hook.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | greenfield-prd | static file | `tests/fixtures/architecture-decision/greenfield-prd.md` | global | T0-02 |
| F-2 | brownfield-prd | static file | `tests/fixtures/architecture-decision/brownfield-prd.md` | global | T0-03 |
| F-3 | expected-axes | static file | `tests/fixtures/architecture-decision/expected-axes.json` | global | T0-04 |

## Fixture Details

### F-1: greenfield-prd

- **Type:** static file
- **Format:** Markdown
- **Setup:** копируется в репо как fixture (~80 строк, описание fictional проекта без упоминаний стека/build-manifest)
- **Teardown:** none (read-only fixture)
- **Dependencies:** none
- **Used by:** @feature1 (ARCH001_01 detect axes)
- **Assumptions:** нет build-manifest рядом; содержит trigger-релевантный домен-текст для axis detection

### F-2: brownfield-prd

- **Type:** static file
- **Format:** Markdown
- **Setup:** копируется как fixture; явно упоминает существующий Django+Postgres стек
- **Teardown:** none (read-only fixture)
- **Dependencies:** none
- **Used by:** @feature1 (ARCH001_01 brownfield skip)
- **Assumptions:** detection должен вернуть axes_detected=0 (hard-OUT по build-manifest/stack mention)

### F-3: expected-axes

- **Type:** static file
- **Format:** JSON
- **Setup:** golden output AxisCandidate[] для greenfield-prd
- **Teardown:** none
- **Dependencies:** F-1 (соответствует greenfield-prd содержимому)
- **Used by:** @feature1 (ARCH001_01 assertion на detected axes)
- **Assumptions:** обновляется если axis-detector seed taxonomy меняется

## Dependencies Graph

```
F-1 (greenfield-prd) → F-3 (expected-axes — golden output для F-1)
F-2 (brownfield-prd) — независим (hard-OUT тест)
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | ARCH001 detect/skip | F-1, F-2, F-3 | none |
| @feature2 | ARCH002 artefact gen | temp output (per-test) | none — генерится из F-1 axis |
| @feature3 | ARCH004 browser | temp html | none — mocked child_process |
| @feature5 | ARCH003 index | temp AXIS files | none — генерится в тесте |
| @feature4,6,7,9 | ARCH005 cli e2e | F-1 + temp | none |

## Notes

Temp output dir (`os.tmpdir()/arch-test-*`) удаляется per-test afterEach. Live-fetch мокается (нет реальных сетевых вызовов). Cascading-тест использует фиктивный axis-catalog inline. F-3 golden output требует обновления при изменении seed taxonomy в axis-detector.
