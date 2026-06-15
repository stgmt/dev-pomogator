/**
 * Stryker config — REAL-CODE mutation testing over the repo's own product modules.
 *
 * Complements stryker.config.mjs (which mutates a strong-tests skill helper via a
 * spawnSync integration test, forcing coverageAnalysis:off). This config targets the
 * pure, module-imported parser/aggregator logic — so `coverageAnalysis: perTest` works
 * and only the covering tests run per mutant (fast + meaningful kill-rate).
 *
 * Scope = the modules hardened with property-style invariant suites:
 *   - parsers/ndjson.ts  (scenario result = worst-of-steps; absolute-uri suffix fallback)
 *   - fr-census.ts       (completeness verdict = AND over all tasks, not OR)
 *   - scripts/add-task-ids.ts (idempotent, status-preserving id insertion)
 *
 * Run (Docker-only, never on host — see vitest.mutation.config.ts header):
 *   npm run mutation:real          # = bash scripts/docker-mutation.sh stryker.real.config.mjs
 * Reports: reports/mutation-real/mutation.html + mutation.json
 */
export default {
  packageManager: 'npm',
  reporters: ['html', 'json', 'progress', 'clear-text'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.mutation.config.ts',
  },
  coverageAnalysis: 'perTest',
  mutate: [
    'tools/spec-graph/parsers/ndjson.ts',
    'tools/spec-graph/fr-census.ts',
    'scripts/add-task-ids.ts',
  ],
  env: {
    SKIP_BUILD_CHECK: '1',
  },
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  jsonReporter: {
    fileName: 'reports/mutation-real/mutation.json',
  },
  htmlReporter: {
    fileName: 'reports/mutation-real/mutation.html',
  },
  timeoutMS: 30000,
  timeoutFactor: 2,
  concurrency: 4,
  ignorePatterns: [
    'dist/**',
    'node_modules/**',
    '.dev-pomogator/**',
    'extensions/**',
    'docker-test/**',
    'reports/**',
  ],
};
