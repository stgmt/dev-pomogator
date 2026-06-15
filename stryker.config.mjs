/**
 * Stryker config — the strong-tests skill SELF-TEST (secondary).
 * Target: .claude/skills/strong-tests/scripts/detect-invariant-candidates.ts
 * Test runner: vitest (already in devDeps).
 *
 * Run via: npm run mutation:skill   (the PRIMARY `npm run mutation` targets the
 * repo's real product code — see stryker.real.config.mjs).
 * Reports: reports/mutation/mutation.html + mutation.json
 *
 * Why excludedMutations:['Regex'] here (and NOT in stryker.real.config.mjs):
 * this file is a ~12-regex HEURISTIC candidate-detector. Stryker's Regex mutator
 * dominates with equivalent char-class shuffles — verified on the 2026-06-15 run:
 * survivors are `^\s*`→`\s*` (anchor drop), `\s+`→`\s`, `\s*`→`\S*`, optional-group
 * removal — none of which change detection on valid source. The DETECTION BEHAVIOR
 * (does scan() classify a function as collection-returning / nxm-overlap /
 * composition-chain, per stack) is pinned by 30+ behavioural tests in
 * tests/e2e/detect-invariant-candidates-unit.test.ts. We therefore gate on the
 * LOGIC mutants (conditionals/blocks/strings), not regex char-shuffle noise. This
 * is the strong-tests skill's own documented procedure (references/
 * stryker.config.template.mjs §"Regex-equivalent survivors"). The CLI main() is
 * additionally un-killable here — Stryker cannot trace mutations across the
 * subprocess boundary (see the test file header). This is NOT a threshold drop;
 * thresholds are unchanged.
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
  // Gate on logic mutants, not equivalent regex char-shuffles (see header rationale).
  mutator: {
    excludedMutations: ['Regex'],
  },
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
