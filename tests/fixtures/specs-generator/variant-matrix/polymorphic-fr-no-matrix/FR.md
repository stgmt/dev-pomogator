# Functional Requirements (FR)

## FR-1: Validate stock for each adapter across all doctypes

System validates stock for each adapter и для всех doctype variants через shared pipeline. Pipeline reuses existing `validateStockForItems` для всех types. Каждый provider должен иметь call-site mapping enumerated в матрице вариантов.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
