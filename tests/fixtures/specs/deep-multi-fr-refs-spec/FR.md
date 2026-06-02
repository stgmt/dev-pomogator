# Functional Requirements — deep-multi-fr-refs-spec

Dense cross-reference fixture: 10 FRs, each cited from multiple ACs,
scenarios, tasks, and FILE_CHANGES paths. Used by SHAPE005 to verify
`get_trace` performance (≤200ms p95) on a non-trivial graph density.

### FR-1: Submit order

The system SHALL accept a new order from an authenticated user.

### FR-2: Validate inventory

The system SHALL refuse orders for out-of-stock items.

### FR-3: Reserve stock

The system SHALL reserve stock for accepted orders.

### FR-4: Capture payment

The system SHALL capture payment against the customer's selected method.

### FR-5: Issue invoice

The system SHALL issue an invoice PDF on successful payment.

### FR-6: Ship order

The system SHALL hand off the order to the shipping provider.

### FR-7: Send confirmation email

The system SHALL email a confirmation with order details and tracking link.

### FR-8: Handle refund request

The system SHALL accept a refund request within the configured window.

### FR-9: Reverse payment

The system SHALL reverse the original payment on approved refunds.

### FR-10: Restock inventory

The system SHALL return refunded items to inventory.
