Feature: Deep multi-FR refs spec — dense BDD coverage

  Eight scenarios, each tagged with two @FR-N tags so the SpecGraph
  builder produces 8 Scenario nodes and at least 16 `tested-by` edges.
  Used by SHAPE005 to verify get_trace remains ≤200ms p95 on a dense graph.

  @FR-1 @FR-2
  Scenario: Submit order with valid inventory
    Given an authenticated customer
    When they submit a well-formed order
    Then the system accepts it with HTTP 201

  @FR-2 @FR-3
  Scenario: Reject order for out-of-stock item
    Given an item with zero stock
    When a customer submits an order containing it
    Then the system responds with HTTP 409

  @FR-3 @FR-4
  Scenario: Reserve stock then capture payment
    Given a valid order
    When the system reserves stock successfully
    Then it captures payment via the customer default method

  @FR-4 @FR-5
  Scenario: Generate invoice on successful capture
    Given payment captured
    When the capture webhook arrives
    Then the system generates and stores an invoice PDF

  @FR-5 @FR-6
  Scenario: Ship order after invoice persisted
    Given a persisted invoice
    When the order pipeline advances
    Then the system enqueues a shipment job

  @FR-6 @FR-7
  Scenario: Send confirmation email after shipment
    Given a shipment accepted by the provider
    When the shipping confirmation arrives
    Then the system emails the customer with a tracking link

  @FR-8 @FR-9
  Scenario: Refund request reverses payment
    Given an order eligible for refund
    When the customer submits a refund request
    Then the system reverses the original payment via the same gateway

  @FR-9 @FR-10
  Scenario: Refunded items return to inventory
    Given an approved refund
    When the refund settles
    Then the system increments stock for each refunded line item
