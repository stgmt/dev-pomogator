# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-bdd-mutation-via-the-official-cucumber-runner)

WHEN `npm run mutation:bdd` runs THEN the system SHALL mutation-test the target via the cucumber-runner with perTest coverage and produce `reports/mutation-bdd/mutation.json`.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-parallel-mutation-across-all-cpu-cores)

WHEN the BDD mutation run starts THEN Stryker SHALL create one test-runner process per available CPU core (`concurrency: "100%"`) and finish a 788-mutant file in minutes, not hours.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-stryker-mutation-skill-and-state)

WHEN a mutation run completes THEN the `stryker-mutation` state helper SHALL record the target's score atomically in `.dev-pomogator/.mutation-state.json`.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-strong-tests-mutation-resistant-bdd-authoring)

WHEN a BDD scenario set leaves a code branch uncovered THEN the strong-tests §6.5 guidance SHALL direct authoring a scenario per uncovered branch (breadth), AND the assertions SHALL be exact (depth).

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-bdd-quality-judge-hook)

WHEN a `.feature` or step-def is edited AND a token is configured THEN the PostToolUse hook SHALL emit an advisory naming the failing §6.5 criterion; IF no token / unreachable THEN it SHALL stay silent (fail-open).

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-path-limited-agent-commit-discipline)

IF a sibling agent's file is already staged THEN `git commit -- <my explicit paths>` SHALL NOT include it in the commit.
