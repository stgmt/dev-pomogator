# AC-4 (FR-4): Process refund per payment method through shared pipeline

**Variant Axis:** payment-method
**Shared codepath:** `processRefund(transactionId, amount)` in `src/refund/pipeline.ts`
**Contract:** all variants return `{ success: boolean, refund_id: string, message: string }` regardless of sync/async/manual workflow.

## Decision Table

| # | Variant | Trigger condition | Expected param / behavior | Test ref (@featureN) | Coverage |
|---|---------|-------------------|---------------------------|----------------------|----------|
| 1 | credit-card | `payment.method === 'credit-card'` AND Stripe txn exists | Sync call to Stripe `refunds.create`; returns `{ refund_id: txn_id }` immediately (≤2s); no polling | @feature4-credit-card | pending |
| 2 | paypal | `payment.method === 'paypal'` AND capture_id present | Async PayPal `/v2/payments/captures/{id}/refund`; pipeline returns `{ refund_id: capture_id, status: 'pending' }`; webhook poller updates terminal state | @feature4-paypal | pending |
| 3 | crypto-btc | `payment.method === 'crypto-btc'` AND wallet has balance | Broadcast on-chain BTC tx; pipeline returns `{ refund_id: tx_hash, status: 'awaiting-confirmations' }`; confirmer waits for ≥3 confirmations (~30 min) before terminal `success: true` | @feature4-crypto-btc | pending |
| 4 | bank-transfer | `payment.method === 'bank-transfer'` (SEPA) | Enqueue manual approval task; pipeline returns `{ refund_id: sepa_ref, status: 'pending-approval' }`; SLA 3-5 business days; terminal state set by ops dashboard | @feature4-bank-transfer | pending |
| 5 | gift-card | `payment.method === 'gift-card'` AND card not expired | DB-only balance restore (no external API); sync; returns `{ refund_id: ledger_entry_id, status: 'success' }` immediately | @feature4-gift-card | pending |
| 6 | promo-credit | `payment.method === 'promo-credit'` | NOT REFUNDABLE per business rule; pipeline MUST throw `NonRefundableMethodError` BEFORE invoking dispatch; no ledger write | — | excluded `[OUT_OF_SCOPE: promo-credit non-refundable per finance policy CFO-2025-08; covered by guard test, not pipeline test]` |

## Coverage legend

- `pending` — AC row written, test scenario not yet implemented
- `covered` — Gherkin example exists AND integration test passes
- `excluded` — variant explicitly out of scope; reason ≥8 chars in `[OUT_OF_SCOPE: ...]`

## Cross-cutting acceptance (all covered variants)

- AC-4.a: Return shape `{ success, refund_id, message }` is invariant across all 5 covered variants.
- AC-4.b: Sync variants (credit-card, gift-card) MUST return terminal `success: true` within 2s; async variants (paypal, crypto-btc, bank-transfer) MUST return non-terminal `status` field within 2s and reach terminal state via separate finalizer.
- AC-4.c: `NonRefundableMethodError` is the ONLY allowed error path for promo-credit; pipeline must not attempt dispatch.
