Feature: outline-safe

  @feature1
  Scenario Outline: FR-1 charges <amount>
    Given a balance of <amount>
    When charged
    Then the balance is <result>

    Examples:
      | amount | result |
      | 10     | 0      |
