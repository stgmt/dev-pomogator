# Functional Requirements (FR)

## FR-1: Validate stock for each adapter across all doctypes [skip-variant-matrix: ok]

System validates stock for each adapter и для всех doctype variants через shared validation pipeline. Каждый provider call-site mapping должен быть covered.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)

(Note: escape hatch reason "ok" is 2 chars — below 8-char threshold. Audit MUST emit WARNING_REASON_TOO_SHORT finding с severity INFO.)
