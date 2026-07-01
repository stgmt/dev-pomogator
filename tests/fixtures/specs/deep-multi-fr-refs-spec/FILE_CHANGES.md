# File Changes — deep-multi-fr-refs-spec

Five unique implementation paths. Once T-Trans.11
(`builder-implements-edges`) lands, the SpecGraph builder will emit a
`File` node per path and an `implements` edge from each FR referenced
in the Reason column to the File node.

| Path | Action | Reason |
|------|--------|--------|
| `src/orders/submit.ts` | create | Order submission endpoint (FR-1, FR-2). |
| `src/inventory/reserve.ts` | create | Atomic stock reservation (FR-3). |
| `src/payments/capture.ts` | create | Payment capture + reversal (FR-4, FR-9). |
| `src/shipping/dispatch.ts` | create | Shipment job + retry loop (FR-6, FR-7). |
| `src/refunds/handler.ts` | create | Refund window + restock (FR-8, FR-10). |
