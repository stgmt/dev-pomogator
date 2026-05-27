# Functional Requirements (FR)

## FR-1: Validate stock for each adapter across all doctypes

System validates stock availability for each doctype during form submission. Pipeline reuses existing `validateStockForItems` for all variants. Per-variant call-site mapping must be enumerated explicitly чтобы для каждого provider не пропустить filter parameter mapping.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
