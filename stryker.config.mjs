/**
 * Stryker config — the strong-tests skill SELF-TEST (secondary).
 * Target: .claude/skills/strong-tests/scripts/detect-invariant-candidates.ts
 * Test runner: vitest (already in devDeps).
 *
 * Run via: npm run mutation:skill. The PRIMARY mutation gate is the repo's real
 * product code — `npm run mutation` -> stryker.real.config.mjs (57% green, no
 * mutator exclusions). This file is intentionally NOT the headline gate.
 *
 * This target is a ~12-regex heuristic candidate-detector, so its mutation ceiling
 * is inherently capped: (1) the CLI main() is un-killable — Stryker cannot trace
 * mutations across the subprocess boundary (see the test file header); (2) a
 * regex-heuristic produces many char-class-shuffle mutants. Detection BEHAVIOUR is
 * pinned by 30+ scan() tests in tests/e2e/detect-invariant-candidates-unit.test.ts
 * (composition-chain across TS/C#/Python/Go + every return-type alternation). The
 * score here is an informational self-test signal, not a pass/fail gate.
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
    SKIP_BUILD_CHECK: '1',
  },
  env_comment: 'Stryker must run inside Docker via `npm run mutation` (= bash scripts/docker-mutation.sh) so vitest workers inherit DEV_POMOGATOR_TEST_IN_DOCKER=1 from the container env and pass tests/setup/ensure-docker.ts. Running `npx stryker run` directly on host will fail with the Docker-required error. The earlier DEVPOM_ALLOW_HOST_TESTS bypass was removed 2026-05-23 after a host-run suite destroyed real .specs/ via fs.remove (incident 2026-05-22).',
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
