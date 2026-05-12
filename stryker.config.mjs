/**
 * Stryker config — formal mutation testing for strong-tests skill scripts.
 * Target: .claude/skills/strong-tests/scripts/detect-invariant-candidates.ts
 * Test runner: vitest (already in devDeps).
 *
 * Run via: npx stryker run
 * Reports: reports/mutation/mutation.html + mutation.json
 */
export default {
  packageManager: 'npm',
  reporters: ['html', 'json', 'progress', 'clear-text'],
  testRunner: 'vitest',
  testRunner_comment: 'vitest is the project test runner (see vitest.config.ts)',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  vitest_comment: 'After Import Guard refactor — detect-invariant-candidates.ts экспортирует API; новый detect-invariant-candidates-unit.test.ts импортирует напрямую. Vitest --related теперь находит chain.',
  coverageAnalysis: 'off',
  coverageAnalysis_comment: 'detect-invariant-candidates.ts is invoked via spawnSync subprocess, not module import. Per-test analysis impossible — fall back to off (run all tests per mutant).',
  mutate: [
    '.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts',
  ],
  testRunnerNodeArgs: [],
  env: {
    DEVPOM_ALLOW_HOST_TESTS: '1',
    SKIP_BUILD_CHECK: '1',
  },
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  jsonReporter: {
    fileName: 'reports/mutation/mutation.json',
  },
  htmlReporter: {
    fileName: 'reports/mutation/mutation.html',
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
