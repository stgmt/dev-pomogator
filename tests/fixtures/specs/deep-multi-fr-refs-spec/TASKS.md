# Tasks — deep-multi-fr-refs-spec

Twelve tasks, each referencing one or two FRs. Once T-Trans.11
(`builder-implements-edges`) lands, the SpecGraph builder will emit a
Task node per row and a `tested-by`/`refs` edge into the FRs.

| ID | Description | Status | Refs | Est |
|----|-------------|--------|------|-----|
| T-1 | Build order submission endpoint | todo | FR-1 | 120m |
| T-2 | Inventory validation service | todo | FR-2, FR-3 | 90m |
| T-3 | Stock reservation primitive | todo | FR-3 | 60m |
| T-4 | Payment gateway integration | todo | FR-4 | 180m |
| T-5 | Invoice PDF generator | todo | FR-5 | 90m |
| T-6 | Shipment job + retry logic | todo | FR-6 | 120m |
| T-7 | Confirmation email template | todo | FR-7 | 45m |
| T-8 | Refund request endpoint | todo | FR-8 | 90m |
| T-9 | Payment reversal flow | todo | FR-4, FR-9 | 120m |
| T-10 | Restock-on-refund handler | todo | FR-3, FR-10 | 60m |
| T-11 | Refund window guard | todo | FR-8 | 30m |
| T-12 | Idempotency layer for refunds | todo | FR-8, FR-9 | 90m |
