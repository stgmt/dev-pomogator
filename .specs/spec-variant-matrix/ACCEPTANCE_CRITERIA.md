# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-polymorphic-trigger-detection-через-mechanical-regex)

WHEN FR содержит >=2 polymorphic-trigger regex matches THEN detection module SHALL flag FR as polymorphic с returned object `{frId, lineNumber, triggers, axis, hardOut: false}`.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-hard-out-signals-anti-over-application)

WHEN FR содержит hard-OUT signal AND polymorphic-trigger AND текстовая близость <30 lines THEN detection SHALL NOT flag (return `{hardOut: true}`, hard-OUT priority over trigger count).

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-ac-decision-table-обязательна-per-polymorphic-fr), [FR-6](FR.md#fr-6-audit-category-variantcoverage-8-я-категория)

WHEN polymorphic FR lacks AC Decision Table (no markdown table с required 6 columns) THEN audit category VARIANT_COVERAGE SHALL emit finding с severity WARNING и `code: 'AC_DECISION_TABLE_MISSING'`.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-gherkin-scenario-outline-в-feature-11-с-ac), [FR-6](FR.md#fr-6-audit-category-variantcoverage-8-я-категория)

WHEN AC Decision Table covered-row count != Examples block row count для same FR (исключая OUT_OF_SCOPE rows) THEN audit SHALL emit finding `code: 'AC_EXAMPLES_ROW_MISMATCH'` с указанием expected/actual count.

## AC-5 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-escape-hatch-с-audit-log)

IF escape-hatch syntax `[skip-variant-matrix: <reason>]` present AND reason length `<8 chars` THEN audit SHALL emit `WARNING_REASON_TOO_SHORT` (severity INFO, не блокирует STOP #3).

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-audit-category-variantcoverage-8-я-категория)

WHEN audit emits any VARIANT_COVERAGE finding с severity >= WARNING THEN spec-status.ts `-ConfirmStop Audit` SHALL refuse advancement до резолюции finding.

## AC-7 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-hard-out-signals-anti-over-application)

WHEN spec contains zero polymorphic FRs (все FRs либо single-variant либо без trigger phrases) THEN audit category VARIANT_COVERAGE SHALL emit zero findings (no over-application — H1 mitigation).

## Out of Scope: FR-9 deferred to v0.2.0

**Требование:** [FR-9](FR.md#fr-9-pretooluse-form-guard-на-writeedit-frmd-out-of-scope)

> OUT OF SCOPE — см. FR-9. Form-guard variant-matrix-guard.ts откладывается до v0.2.0; в v0.1.0 audit-only catch достаточен.
