# Fixtures

## Overview

Spec-variant-matrix fixtures — 5 static .specs/-style directories под `tests/fixtures/specs-generator/variant-matrix/` для testing detection + audit + escape hatch flow без зависимости от живых .specs/. Каждая fixture покрывает конкретный test case (positive, negative, hard-OUT regression, RU detection, escape hatch edge case).

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | polymorphic-fr-complete | static | tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-complete/ | per-scenario | runShellScript audit-spec.ts |
| F-2 | polymorphic-fr-no-matrix | static | tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-no-matrix/ | per-scenario | runShellScript audit-spec.ts |
| F-3 | polymorphic-fr-hard-out | static | tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-hard-out/ | per-scenario | runShellScript audit-spec.ts |
| F-4 | polymorphic-fr-ru-mixed | static | tests/fixtures/specs-generator/variant-matrix/polymorphic-fr-ru-mixed/ | per-scenario | runShellScript audit-spec.ts |
| F-5 | escape-hatch-short-reason | static | tests/fixtures/specs-generator/variant-matrix/escape-hatch-short-reason/ | per-scenario | runShellScript audit-spec.ts |

## Fixture Details

### F-1: polymorphic-fr-complete

- **Type:** static directory (5 .md + 1 .feature)
- **Format:** markdown + Gherkin
- **Setup:** Static checked in to git; no setup required
- **Teardown:** rm AUDIT_REPORT.md если был создан тестом (test cleanup)
- **Dependencies:** none
- **Used by:** @feature5 (positive happy-path scenario)
- **Assumptions:** FR.md содержит "for each adapter" trigger; AC.md содержит valid Decision Table 5 rows; .feature содержит Scenario Outline + Examples 4 rows; TASKS.md содержит per-variant tasks

### F-2: polymorphic-fr-no-matrix

- **Type:** static directory (FR.md + AC.md)
- **Format:** markdown
- **Setup:** Static; no setup
- **Teardown:** rm AUDIT_REPORT.md
- **Dependencies:** none
- **Used by:** @feature2 (EN trigger detection), @feature5 (negative case — missing AC table)
- **Assumptions:** FR.md содержит polymorphic trigger; AC.md без Decision Table

### F-3: polymorphic-fr-hard-out

- **Type:** static directory (FR.md)
- **Format:** markdown
- **Setup:** Static; no setup
- **Teardown:** rm AUDIT_REPORT.md
- **Dependencies:** none
- **Used by:** @feature4 (H1 regression guard — hard-OUT skips detection)
- **Assumptions:** FR.md содержит "только для warehouse-transfer" near polymorphic phrase; CRITICAL что detection НЕ срабатывает (over-application prevention)

### F-4: polymorphic-fr-ru-mixed

- **Type:** static directory (FR.md)
- **Format:** markdown (mixed RU + EN)
- **Setup:** Static; no setup
- **Teardown:** rm AUDIT_REPORT.md
- **Dependencies:** none
- **Used by:** @feature3 (RU detection)
- **Assumptions:** FR.md содержит "переиспользуем для каждого доктайпа" + EN context terminology

### F-5: escape-hatch-short-reason

- **Type:** static directory (FR.md)
- **Format:** markdown
- **Setup:** Static; no setup
- **Teardown:** rm AUDIT_REPORT.md + clean .claude/logs/spec-variant-matrix-escapes.jsonl test-mode entries
- **Dependencies:** none
- **Used by:** @feature6 (FR-7 short reason WARNING_REASON_TOO_SHORT)
- **Assumptions:** FR.md содержит `[skip-variant-matrix: ok]` (3 chars — below threshold)

## Dependencies Graph

Все fixtures независимы — нет shared state между ними.

```
F-1 (independent)
F-2 (independent)
F-3 (independent)
F-4 (independent)
F-5 (independent)
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature2 | EN polymorphic detection | F-2 | none |
| @feature3 | RU polymorphic detection | F-4 | none |
| @feature4 | Hard-OUT regression | F-3 | none |
| @feature5 | Audit emit finding | F-2, F-1 | none |
| @feature6 | Short reason INFO | F-5 | none |
| @feature7 | Valid escape JSONL log | none — генерируется dynamically в test setup | covered by test code |

## Notes

- Все fixtures static — checked в git под `tests/fixtures/specs-generator/variant-matrix/`. Модификация требует git commit.
- F-7 (valid escape с long reason) не имеет dedicated fixture — генерируется dynamically в test code чтобы тестировать atomic O_APPEND поведение JSONL log.
- Cleanup strategy простая: тесты которые могут писать AUDIT_REPORT.md или JSONL log — должны use temp dirs или afterEach(() => rm artifacts).
- H1 regression fixture F-3 — CRITICAL guard. Если detection срабатывает на этой fixture — это immediate regression sign, тест MUST блокировать commit.
