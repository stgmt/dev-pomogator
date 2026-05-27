# AC-3 (FR-3): Validate stock for each adapter across all doctypes

System SHALL validate stock availability per doctype через shared pipeline (`validateStockForItems(warehouseIdField)`). Each doctype variant SHALL map to the correct warehouse-id field on its `formData` shape.

**Variant Axis:** doctype
**Shared codepath:** `validateStockForItems(formData.warehouseId)` (call-site `services/stock-validation/validateStockForItems.ts`)

| # | Variant | Trigger condition | Expected param | Test ref (@featureN) | Coverage |
|---|----------------------|---------------------------------------------------------------|-------------------------------------------------|--------------------------------|----------|
| 1 | inbound              | doctype === 'inbound' AND formData.warehouseId set            | `validateStockForItems(formData.warehouseId)`   | @feature3-inbound              | pending  |
| 2 | outbound             | doctype === 'outbound' AND formData.warehouseId set           | `validateStockForItems(formData.warehouseId)`   | @feature3-outbound             | pending  |
| 3 | warehouse-transfer   | doctype === 'warehouse-transfer' AND formData.sourceWarehouseId set | `validateStockForItems(formData.sourceWarehouseId)` (NOT warehouseId — different field on WarehouseTransfer doctype, per QA переписка 2026-04) | @feature3-warehouse-transfer   | pending  |
| 4 | revaluation          | doctype === 'revaluation' AND formData.warehouseId set        | `validateStockForItems(formData.warehouseId)`   | @feature3-revaluation          | pending  |
| 5 | stocktaking          | doctype === 'stocktaking' (server-generated qty, no client-side gate) | n/a — `[OUT_OF_SCOPE: server generates qty per audited bin; client-side stock gate unreachable by design — see FR-3 last paragraph]` | —                              | excluded |

## Notes

- Row 3 (warehouse-transfer) — **specific to this incident**: WarehouseTransfer's form schema uses `sourceWarehouseId` (плюс отдельное `destinationWarehouseId`), not the generic `warehouseId`. Naive shared call-site `validateStockForItems(formData.warehouseId || undefined)` evaluates to `'' || undefined → undefined` for this doctype → filter dropped → bug ships. Per-variant mapping required.
- Row 5 (stocktaking) excluded with substantive reason ≥8 chars per Hard-OUT signals in SKILL.md §"Hard-OUT signals". Server-side `qty` generation means client never sends a quantity gateable against on-hand stock; the codepath is unreachable from this validation pipeline.
- Coverage progression: each `pending` row flips to `covered` when the corresponding `@feature3-{variant}` scenario is implemented and passing. Audit category VARIANT_COVERAGE blocks STOP #3 until all rows are `covered` or `excluded`.
