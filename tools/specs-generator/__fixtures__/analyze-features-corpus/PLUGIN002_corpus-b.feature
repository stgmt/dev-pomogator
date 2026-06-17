Feature: PLUGIN002 Corpus B — analyze-features fixture

  Second PLUGIN-domain feature so domains.PLUGIN has a count of 2 and the
  -DomainCode PLUGIN filter returns more than one candidate deterministically.

  Background:
    Given the analyze-features corpus is loaded

  Scenario: PLUGIN002_01 beta computes a total
    Given a beta ledger with two entries
    When the agent computes the beta total
    Then the beta total equals the sum of the entries
