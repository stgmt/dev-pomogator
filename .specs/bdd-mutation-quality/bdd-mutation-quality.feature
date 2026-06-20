# Каждый Scenario несёт @FR-N тег требования. Документационный .feature (не врезан в cucumber.json):
# описывает уже-проверенные поведения; реальная проверка — в коммитах + реальных тест-файлах ниже.
Feature: TESTMUT001_bdd-mutation-quality — Stryker mutation-tests BDD, fast, with quality control

  Background:
    Given the dev-pomogator repo with @stryker-mutator/cucumber-runner installed

  @FR-1
  Scenario: TESTMUT001_01 cucumber-runner mutation-tests via perTest
    Given the stryker-bdd cucumber profile and stryker.bdd.config.mjs
    When npm run mutation:bdd runs against detect-invariant-candidates.ts
    Then Stryker writes reports/mutation-bdd/mutation.json with a perTest score (commit 2d6879e)

  @FR-2
  Scenario: TESTMUT001_02 parallel mutation across all cores
    Given concurrency "100%" on a 24-core host
    When the mutation run starts
    Then Stryker spawns 24 runners and finishes 788 mutants in ~13 minutes, not ~2.5h (commit 2d6879e)

  @FR-3
  Scenario: TESTMUT001_03 mutation state is recorded atomically
    Given a completed mutation.json report
    When tools/stryker-mutation/state.ts records the run
    Then .dev-pomogator/.mutation-state.json holds the target score atomically (commit 156908b)

  @FR-4
  Scenario: TESTMUT001_04 coverage-breadth scenarios close NoCoverage
    Given the strong-tests §6.5 breadth guidance and 3 new branch scenarios
    When the BDD mutation is re-measured
    Then NoCoverage drops 139 to 91 and the score rises 79.25 to 80.87 (commits f06dcc6 / 68fbd65)

  @FR-5
  Scenario: TESTMUT001_05 the judge flags a weak BDD test
    Given a step-def whose only assertion is assert.ok(result)
    When the bdd-quality hook asks the Haiku judge against §6.5
    Then it emits an advisory naming the loose-assertion criterion (commit d57043a)

  @FR-6
  Scenario: TESTMUT001_06 path-limited commit ignores foreign staged files
    Given a sibling agent's file already staged in the shared tree
    When the agent commits its own paths via git commit -- explicit-paths
    Then the foreign file is NOT included in the commit (commit 0974678)
