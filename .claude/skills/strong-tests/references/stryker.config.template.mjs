/**
 * Stryker config TEMPLATE — copy to <project-root>/stryker.config.mjs and customize.
 *
 * Repo-agnostic baseline for `strong-tests` skill §3 Mutation tool integration.
 * Customize the {{TODO}} placeholders below for your project.
 *
 * Prerequisites (per SKILL.md §6.3 Prerequisite — Module-import layer):
 *   1. npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner
 *   2. Test files MUST import source modules directly (not only spawnSync/CLI invocation).
 *      Apply Import Guard pattern to CLI scripts: export functions + guard main() invocation.
 *   3. Repo-specific env vars (e.g., test infra bypass flags) — set in shell BEFORE
 *      `npx stryker run`, NOT in this config (Stryker `env:` field is unsupported).
 *
 * Run:
 *   npx stryker run
 *
 * Output:
 *   reports/mutation/mutation.html — clickable survivor report
 *   reports/mutation/mutation.json — machine-parseable for run-mutation.ts
 */

export default {
  packageManager: 'npm',
  reporters: ['html', 'json', 'progress', 'clear-text'],

  // ─── Test runner ─────────────────────────────────────────────
  // Options: 'vitest', 'jest', 'mocha', 'cucumber', 'karma'
  testRunner: 'vitest',
  vitest: {
    // {{TODO}} — path to your vitest config (relative to project root)
    configFile: 'vitest.config.ts',
  },

  // ─── Mutation scope ──────────────────────────────────────────
  // {{TODO}} — list source files to mutate. Use globs sparingly: fewer mutants = faster runs.
  // Start with ONE critical-path file, expand after baseline.
  mutate: [
    'src/path/to/your-critical-file.ts',
    // 'src/services/**/*.ts',
    // 'src/parsers/*.ts',
  ],

  // ─── Coverage analysis ───────────────────────────────────────
  // Options:
  //   'perTest' — fastest; requires test framework to expose per-test coverage hooks.
  //              Works with vitest + module-import tests (NOT with spawnSync-only).
  //   'all'     — slower; runs all tests per mutant. Safe fallback.
  //   'off'     — slowest; same as 'all' but skips coverage instrumentation entirely.
  //              Use when 'perTest'/'all' fail due to integration boundaries.
  coverageAnalysis: 'perTest',

  // ─── Thresholds ──────────────────────────────────────────────
  // Empirical defaults from OutSight AI case study (medium.com/@outsightai):
  //   high: 80% — production-ready, mutation-resistant
  //   low:  60% — acceptable for non-critical paths
  //   break: 50% — minimum gate; below this, CI/PR should fail
  // Per `strong-tests` skill recommendations:
  //   critical paths ≥70%, standard ≥50%, experimental ≥30%
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },

  // ─── Reports ─────────────────────────────────────────────────
  jsonReporter: {
    fileName: 'reports/mutation/mutation.json',
  },
  htmlReporter: {
    fileName: 'reports/mutation/mutation.html',
  },

  // ─── Timeouts ────────────────────────────────────────────────
  // timeoutMS — per-mutant test timeout (default 5000ms is often too short for I/O-heavy tests)
  // timeoutFactor — multiplier applied to detected average; lower = stricter timeout policy
  timeoutMS: 30000,
  timeoutFactor: 2,

  // ─── Concurrency ─────────────────────────────────────────────
  // {{TODO}} — tune based on CPU. 4 workers is safe baseline; bump to half your core count
  // (don't go full core count — host vitest workers + test process pool compete for CPU)
  concurrency: 4,

  // ─── Ignored paths ───────────────────────────────────────────
  // {{TODO}} — exclude generated/vendor code so Stryker doesn't mutate it
  ignorePatterns: [
    'dist/**',
    'build/**',
    'node_modules/**',
    'reports/**',
    'coverage/**',
    '.git/**',
    // Add project-specific generated directories:
    // 'generated/**',
    // 'protobuf-out/**',
  ],

  // ─── Excluded mutations (OPTIONAL — use only when justified) ─
  //
  // Per SKILL.md §3 "Regex-equivalent survivors" — `Regex` mutator produces
  // character-class shuffles that are functionally identical to original regex
  // (~72% survivor rate is normal for regex-heavy code).
  //
  // Uncomment ONLY when:
  //   1. Regex survivors >70% AND verified equivalent (not real gaps)
  //   2. Code is NOT regex-as-business-logic (e.g., security validation, parsing)
  //
  // mutator: {
  //   excludedMutations: ['Regex'],
  //   excludedMutations_comment: 'Justification: <link to ADR or commit explaining why>',
  // },

  // ─── Plugins (если custom test runner) ───────────────────────
  // plugins: ['@stryker-mutator/vitest-runner'],
};

/**
 * Repo-specific env vars examples (set in shell BEFORE `npx stryker run`):
 *
 *   # Generic — bypass test infra preconditions
 *   NODE_ENV=test npx stryker run
 *
 *   # dev-pomogator example
 *   DEVPOM_ALLOW_HOST_TESTS=1 SKIP_BUILD_CHECK=1 npx stryker run
 *
 *   # CI environment
 *   CI=true STRYKER_DASHBOARD_API_KEY=xxx npx stryker run
 *
 * Stryker passes process.env verbatim to spawned test workers — no special config needed.
 */
