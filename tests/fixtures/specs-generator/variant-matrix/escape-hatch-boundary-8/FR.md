# Functional Requirements (FR)

## FR-1: Validate stock for each adapter across all doctypes [skip-variant-matrix: 12345678]

System validates stock for each adapter и для всех doctype variants через shared validation pipeline. Каждый provider call-site mapping должен быть covered.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)

(Note: escape hatch reason "12345678" is exactly 8 chars — boundary case. MUST pass as valid escape, NOT trigger WARNING_REASON_TOO_SHORT.)
