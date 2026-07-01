# Functional Requirements (FR)

## FR-1: BDD mutation via the official cucumber-runner

The system SHALL mutation-test production code through its BDD `@featureN` scenarios using
`@stryker-mutator/cucumber-runner` with `coverageAnalysis: perTest`, via a dedicated `stryker-bdd`
cucumber profile (throwaway format, never the canonical ndjson). DONE — commit `2d6879e`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)

## FR-2: Parallel mutation across all CPU cores

The mutation run SHALL parallelise across all cores (`concurrency: "100%"`) on the host — turning
~2.5h serial into ~13 min (24 runners). DONE — `2d6879e`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)

## FR-3: stryker-mutation skill and state

A `stryker-mutation` skill SHALL document the run/interpret recipe, and a state helper SHALL persist
the last score per target atomically in `.dev-pomogator/.mutation-state.json`. DONE — `156908b`.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)

## FR-4: strong-tests mutation-resistant BDD authoring

The strong-tests §6.5 SHALL require both tight assertions (depth) AND a scenario per code branch
(breadth) — proven by closing detect-invariant NoCoverage 139 to 91, score 79.25 to 80.87. DONE —
`cb188e9` / `f06dcc6` / `68fbd65`.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)

## FR-5: BDD-quality judge hook

A PostToolUse hook SHALL, on Edit/Write of a `.feature`/step-def, ask a one-shot Haiku to score it
against the §6.5 rubric WITH context (edit + step-def + code-under-test) and emit an advisory; never
blocks; fail-open. DONE — `d57043a`.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)

## FR-6: path-limited agent commit discipline

The bdd-migrator agent/skill SHALL commit ONLY its own files via `git commit -m msg -- explicit
paths` (clean root first; never bare `git commit` / `git add -A`) — closing the 8ab1d22
foreign-capture incident. DONE — `0974678`.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
