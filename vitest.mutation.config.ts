import { defineConfig } from 'vitest/config';

/**
 * Scoped vitest config for REAL-CODE mutation testing (stryker.real.config.mjs).
 *
 * `include` is an EXPLICIT allow-list of pure, in-memory unit/property suites that
 * directly import the mutated modules. It deliberately EXCLUDES the destructive
 * Docker-only e2e suite (installer / setupCleanState / fs.remove(appPath)) so that
 * Stryker's `coverageAnalysis: perTest` dry-run — which executes the whole include
 * once to map test↔mutant coverage — never runs a destructive test.
 *
 * The `ensure-docker.ts` setup is KEPT: these suites are host-safe in isolation, but
 * the repo's hard discipline is Docker-only (a host bypass was removed after the
 * 2026-05-22 incident where a host-run suite destroyed real .specs/). So this config
 * still refuses to run outside the container — invoke via `npm run mutation:real`
 * (= scripts/docker-mutation.sh stryker.real.config.mjs).
 */
export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    include: [
      // ndjson parser (worst-of-steps merge, absolute-uri suffix fallback) — 3 suites
      'tools/spec-graph/__tests__/ndjson-ingester.test.ts',
      'tools/spec-graph/__tests__/ndjson-real-fixture.test.ts',
      'tools/spec-graph/__tests__/multilang.test.ts',
      // fr-census (AND-rollup completeness verdict, ready-status)
      'tools/spec-graph/__tests__/fr-census.test.ts',
      // add-task-ids rework helper (idempotence / id-uniqueness / status-preservation / child-safety)
      'tests/e2e/add-task-ids.test.ts',
    ],
    exclude: ['tests/fixtures/**'],
    setupFiles: ['tests/setup/ensure-docker.ts'],
    fileParallelism: false,
    reporters: ['dot'],
  },
});
