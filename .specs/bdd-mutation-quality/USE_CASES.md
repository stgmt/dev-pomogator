# Use Cases

## UC-1: Mutation-test a BDD-covered file

Measure how well BDD scenarios kill mutants in a file.

- Run `npm run mutation:bdd`
- cucumber-runner (perTest) runs only covering scenarios per mutant, parallel on all cores
- Result: `reports/mutation-bdd/mutation.json` + score recorded in state

## UC-2: Strengthen a weak BDD scenario set

Close the gaps a mutation run surfaces.

- Read the NoCoverage list from the report (skill `stryker-mutation`)
- Author a scenario per uncovered branch (§6.5 breadth) with exact assertions (depth)
- Re-measure: NoCoverage drops, score rises

## UC-3: Catch a weak BDD test at author-time

- Edit a `.feature` / step-def
- The PostToolUse hook asks the Haiku judge against §6.5 with context
- An advisory names the failing criterion (or stays silent if strong / no token)

## UC-4: Commit safely in a shared tree

- An agent finishes its work alongside a sibling agent
- It commits via `git commit -- <its explicit paths>`
- The sibling's staged files are not captured
