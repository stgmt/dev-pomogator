import { defineConfig } from 'vitest/config';

/**
 * Scoped vitest config for the spec-generator-v4 WHOLE-SUBSYSTEM mutation sweep
 * (stryker.specgen.config.mjs). `include` = every v4 unit suite (the module-import
 * `__tests__`), so a mutant in one dir killed by a test in another (e.g.
 * conformance.ts killed by a spec-conformance-push test) is NOT falsely reported as
 * survived. Excludes tests/e2e/* for SPEED (perTest only needs the fast,
 * module-importing unit tests; destructive e2e is contained by Docker anyway, just
 * slow). Docker-only via ensure-docker — invoke through scripts/docker-mutation.sh.
 */
export default defineConfig({
  test: {
    globals: true,
    testTimeout: 120000,
    hookTimeout: 120000,
    include: [
      'tools/spec-graph/**/__tests__/*.test.ts',
      'tools/spec-mcp-server/**/__tests__/*.test.ts',
      'tools/specs-validator/**/__tests__/*.test.ts',
      'tools/specs-generator/**/__tests__/*.test.ts',
      'tools/spec-conformance-guard/**/__tests__/*.test.ts',
      'tools/spec-conformance-push/**/__tests__/*.test.ts',
      'tools/spec-check-log/**/__tests__/*.test.ts',
      'tools/spec-backlog/**/__tests__/*.test.ts',
    ],
    exclude: ['tests/fixtures/**'],
    setupFiles: ['tests/setup/ensure-docker.ts'],
    fileParallelism: false,
    reporters: ['dot'],
  },
});
