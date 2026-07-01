Feature: PLUGIN001 Corpus A — analyze-features fixture

  A committed, deterministic feature so the analyze-features tests count a KNOWN
  corpus (run with cwd = this dir) instead of walking the live, mutating repo root
  (which raced with parallel tests → exit 1) or the dockerignored .specs/.

  Background:
    Given the analyze-features corpus is loaded

  Scenario: PLUGIN001_01 alpha records a value
    Given a clean alpha store
    When the agent records an alpha value
    Then the alpha value is persisted

  Scenario: PLUGIN001_02 alpha rejects a duplicate
    Given an alpha store with one value
    When the agent records the same alpha value
    Then the duplicate is rejected
