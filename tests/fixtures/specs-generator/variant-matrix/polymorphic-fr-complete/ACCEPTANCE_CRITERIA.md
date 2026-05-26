# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-validate-stock-for-each-adapter-across-all-doctypes)

WHEN user submits form для any doctype THEN validateStockForItems SHALL receive correct warehouseId based on doctype source field mapping.

**Variant Axis:** doctype
**Shared codepath:** validateStockForItems(formData.warehouseId)

| # | Variant | Trigger condition | Expected param | Test ref (@featureN) | Coverage |
|---|---------|-------------------|----------------|----------------------|----------|
| 1 | inbound | doctype=='IN' | formData.warehouseId | @feature1-inbound | covered |
| 2 | outbound | doctype=='OUT' | formData.warehouseId | @feature1-outbound | covered |
| 3 | warehouse-transfer | doctype=='WH_TRANSFER' | formData.sourceWarehouseId | @feature1-wt | covered |
| 4 | revaluation | doctype=='REVAL' | formData.warehouseId | @feature1-reval | covered |
| 5 | stocktaking | doctype=='STOCKTAKING' | [OUT_OF_SCOPE: server-generated qty, gate unreachable for this variant] | — | excluded |

**Coverage summary:** 4/5 variants covered, 1 excluded с rationale ≥8 chars.
