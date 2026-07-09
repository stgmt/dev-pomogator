Feature: LINTBOOT Lint self-bootstrap

  Dev-pomogator requires lint verification after code edits. The lint path must not fail
  because eslint is absent from a fresh checkout; it should either prepare the local
  dependency or report an actionable setup failure.

  @FR-1 @feature1
  Scenario: LINTBOOT001 fresh checkout prepares the local lint runner
    Given a lint fixture package without a local eslint executable
    When the lint self-bootstrap verification runs
    Then the local lint dependency is prepared before lint execution
    And the result is not a missing eslint command failure

  @FR-2 @feature2
  Scenario: LINTBOOT002 existing local eslint is reused
    Given a lint fixture package with an existing local eslint executable
    When the lint self-bootstrap verification runs
    Then dependency installation is not attempted
    And the existing local eslint executable is used

  @FR-3 @feature3
  Scenario: LINTBOOT003 dependency setup failure is actionable
    Given a lint fixture package where dependency installation fails
    When the lint self-bootstrap verification runs
    Then the result reports the failed install command and log location
    And lint execution is not attempted

  @FR-4 @feature4
  Scenario: LINTBOOT004 plugin and dogfood paths do not rely on global eslint
    Given the dev-pomogator lint verification configuration is available
    When the lint verification path is inspected
    Then it resolves eslint from project-local tooling
    And no always-on plugin hook imports eslint directly

  @FR-5 @feature5
  Scenario: LINTBOOT005 package metadata and lockfile declare eslint consistently
    Given the dev-pomogator package metadata and lockfile are available
    When lint dependency declarations are inspected
    Then eslint is declared in package metadata
    And eslint is present in the lockfile
