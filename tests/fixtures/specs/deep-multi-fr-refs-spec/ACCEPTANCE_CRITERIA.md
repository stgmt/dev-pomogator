# Acceptance Criteria — deep-multi-fr-refs-spec

Fifteen ACs, each citing 2-3 FRs by mentioning their canonical ids
in the EARS body. The parser emits one `covers` edge per
`### AC-N (FR-M)` heading; cross-FR mentions are captured by the
narrative body for backlink traversal.

### AC-1 (FR-1): Submission accepts well-formed order

WHEN a payload contains valid items list AND a known user THEN the system SHALL persist a new order. (refs FR-1, FR-2)

### AC-2 (FR-2): Out-of-stock items rejected

WHEN any line item has zero available stock THEN the system SHALL respond with 409 Conflict. (refs FR-2, FR-3)

### AC-3 (FR-3): Reservation atomic

WHEN inventory is reserved THEN the system SHALL atomically decrement the available count. (refs FR-2, FR-3)

### AC-4 (FR-4): Payment uses default method when unspecified

WHEN the request omits a payment method THEN the system SHALL fall back to the customer default. (refs FR-1, FR-4)

### AC-5 (FR-4): Declined payment surfaces gateway code

WHEN the payment gateway declines THEN the system SHALL include the gateway reason in the response. (refs FR-4)

### AC-6 (FR-5): Invoice PDF stored after capture

WHEN payment captures successfully THEN the system SHALL generate and persist an invoice PDF. (refs FR-4, FR-5)

### AC-7 (FR-6): Ship-out triggered after invoice

WHEN the invoice is persisted THEN the system SHALL enqueue the shipment job. (refs FR-5, FR-6)

### AC-8 (FR-6): Shipment retries on transient errors

WHEN the shipping provider returns 5xx THEN the system SHALL retry up to three times. (refs FR-6)

### AC-9 (FR-7): Email contains tracking link

WHEN the shipment is accepted by the provider THEN the system SHALL send an email with the tracking link. (refs FR-6, FR-7)

### AC-10 (FR-7): Confirmation includes order details

WHEN the order is shipped THEN the confirmation email SHALL include item names and quantities. (refs FR-1, FR-7)

### AC-11 (FR-8): Refund window enforced

WHEN a refund is requested past the window THEN the system SHALL reject with 410 Gone. (refs FR-8)

### AC-12 (FR-8): Refund request idempotent

WHEN the same refund is requested twice THEN the system SHALL process it only once. (refs FR-8, FR-9)

### AC-13 (FR-9): Payment reversed via original gateway

WHEN a refund is approved THEN the system SHALL reverse the payment via the same gateway. (refs FR-4, FR-9)

### AC-14 (FR-10): Refunded items return to stock

WHEN a refund completes THEN the system SHALL increment the available count for each item. (refs FR-3, FR-10)

### AC-15 (FR-10): Partial refunds restock proportionally

WHEN a partial refund is approved THEN the system SHALL restock only the refunded line items. (refs FR-8, FR-10)
