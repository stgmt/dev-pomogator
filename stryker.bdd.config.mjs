/**
 * Stryker config — mutation-test production code via cucumber BDD scenarios (W1/W2).
 *
 * Uses the OFFICIAL @stryker-mutator/cucumber-runner with coverageAnalysis:'perTest'
 * (per-mutant runs ONLY the scenarios that cover the mutant — and skips NoCoverage
 * mutants entirely) [src:https://stryker-mutator.io/docs/stryker-js/cucumber-runner/].
 * concurrency:'100%' parallelises across all CPU cores [src:https://stryker-mutator.io/docs/stryker-js/configuration/].
 * Together these replace the PoC command-runner (2.5h, serial) with a fast parallel run.
 *
 * Runs on HOST: cucumber works on host (no tests/setup/ensure-docker guard — that's vitest
 * only) and host has all cores (no Docker cpu limit), so '100%' uses them. Stryker sandboxes
 * the project copy, so real .specs is safe. testRunnerNodeArgs loads tsx so the cucumber
 * workers can import the TypeScript step-defs.
 *
 * The cucumber profile `stryker-bdd` (in cucumber.json) provides the scoped step-def import
 * (NOT the canonical default profile, which writes .last-test-run.ndjson). features+tags here
 * scope the run to the detect-invariant behavioural scenarios.
 */
export default {
  packageManager: 'npm',
  reporters: ['json', 'progress', 'clear-text'],
  testRunner: 'cucumber',
  testRunnerNodeArgs: ['--import', 'tsx'],
  cucumber: {
    profile: 'stryker-bdd',
    features: ['.specs/strong-tests/strong-tests.feature'],
    tags: ['@feature7'],
  },
  coverageAnalysis: 'perTest',
  concurrency: '100%',
  mutate: ['.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts'],
  thresholds: { high: 80, low: 60, break: 0 },
  jsonReporter: { fileName: 'reports/mutation-bdd/mutation.json' },
  timeoutMS: 60000,
  timeoutFactor: 2,
  ignorePatterns: ['dist/**', 'node_modules/**', '.dev-pomogator/**', 'extensions/**', 'docker-test/**', 'reports/**'],
};
