Feature: AUTH001_User_Authentication

  Background:
    Given the system is running
    And the database is empty

  # @feature1
  Scenario: Login with valid credentials
    Given a user account exists
    When user provides valid credentials
    Then system should return JWT token

  # @feature2
  Scenario: Register new user
    Given no account with email exists
    When user submits registration form
    Then new account should be created
