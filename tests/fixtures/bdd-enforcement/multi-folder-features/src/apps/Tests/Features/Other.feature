# @feature-multifolder-2
Feature: CORE002_Other

  Scenario: another scenario for multi-folder scan test
    Given system under test
    When feature file is indexed
    Then analyze-features finds both feature files
