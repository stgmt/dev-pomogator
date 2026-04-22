# @feature-multifolder-1
Feature: CORE001_Sample

  Scenario: sample scenario for multi-folder scan test
    Given system under test
    When feature file is indexed
    Then analyze-features finds it recursively
