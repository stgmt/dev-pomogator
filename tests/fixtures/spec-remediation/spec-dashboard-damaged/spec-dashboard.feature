Feature: Spec dashboard

  @feature1
  Scenario: DASHDOG001_01 card API returns data
    When the client requests the card route
    Then the HTTP response is successful

  @feature2
  Scenario: DASHDOG001_02 detail API returns data
    When the client requests the detail route
    Then the HTTP response is successful
