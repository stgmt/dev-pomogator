/**
 * Stryker config — spec-generator-v4 WHOLE-SUBSYSTEM mutation sweep.
 *
 * `mutate` = the 42 v4 source files that a unit (__tests__) test actually imports
 * (the "covered set" from .dev-pomogator/.tmp/v4-coverage-partition.mjs). The other
 * ~78 v4 files have NO module-import test — running Stryker on them would only emit
 * NoCoverage mutants (a coverage fact already known from the grep), so they are
 * deliberately out of scope here and reported as the "zero unit-test coverage" list.
 *
 * Run the whole sweep:   npm run mutation:specgen
 * Calibrate one dir: pass a Stryker --mutate glob CLI override (docker-mutation.sh
 * forwards "$@" to `npx stryker run`), scoping the sweep to one directory.
 * Reports: reports/mutation-specgen/mutation.html + .json
 */
export default {
  packageManager: 'npm',
  reporters: ['html', 'json', 'progress', 'clear-text'],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.specgen.config.ts' },
  coverageAnalysis: 'perTest',
  // Skip static mutants (top-level const/regex): they force a full re-run each and
  // dominate wall-clock on this heavily-const subsystem (~1h20m → minutes). The score
  // then reflects in-FUNCTION logic mutants — the more meaningful signal for a sweep.
  ignoreStatic: true,
  mutate: [
    'tools/spec-graph/wikilinks.ts',
    'tools/spec-graph/test_quality_gate_stop.ts',
    'tools/spec-graph/task-lifecycle.ts',
    'tools/spec-graph/task-census.ts',
    'tools/spec-graph/stale-marker-scan.ts',
    'tools/spec-graph/incremental.ts',
    'tools/spec-graph/fr-census.ts',
    'tools/spec-graph/coverage.ts',
    'tools/spec-graph/corpus-health.ts',
    'tools/spec-graph/conformance.ts',
    'tools/spec-graph/builder.ts',
    'tools/spec-graph/parsers/tasks.ts',
    'tools/spec-graph/parsers/ndjson.ts',
    'tools/spec-graph/parsers/multilang.ts',
    'tools/spec-graph/parsers/md.ts',
    'tools/spec-graph/parsers/gherkin.ts',
    'tools/spec-mcp-server/tools.ts',
    'tools/spec-mcp-server/server.ts',
    'tools/spec-mcp-server/mutations.ts',
    'tools/spec-mcp-server/lock-manager.ts',
    'tools/spec-mcp-server/lifecycle.ts',
    'tools/spec-mcp-server/codespaces-autostart.ts',
    'tools/spec-mcp-server/sqlite/wrapper.ts',
    'tools/specs-validator/conformance-summary.ts',
    'tools/specs-generator/spec-archive.ts',
    'tools/specs-generator/legacy-triage.ts',
    'tools/specs-generator/legacy-judge.ts',
    'tools/spec-conformance-guard/spec-conformance-guard.ts',
    'tools/spec-conformance-push/spec-conformance-push.ts',
    'tools/spec-check-log/writer.ts',
    'tools/spec-check-log/cli.ts',
    'tools/spec-backlog/writer.ts',
    'tools/spec-backlog/classifier.ts',
    'tools/spec-backlog/resolvers/wrap-deprecated-ref.ts',
    'tools/spec-backlog/resolvers/scenario-writer.ts',
    'tools/spec-backlog/resolvers/registry.ts',
    'tools/spec-backlog/resolvers/owner-picker.ts',
    'tools/spec-backlog/resolvers/link-fixer.ts',
    'tools/spec-backlog/resolvers/fr-author.ts',
    'tools/spec-backlog/resolvers/decision-arbiter.ts',
    'tools/spec-backlog/resolvers/cross-ref-linker.ts',
    'tools/spec-backlog/resolvers/ac-author.ts',
  ],
  env: { SKIP_BUILD_CHECK: '1' },
  thresholds: { high: 80, low: 60, break: 50 },
  jsonReporter: { fileName: 'reports/mutation-specgen/mutation.json' },
  htmlReporter: { fileName: 'reports/mutation-specgen/mutation.html' },
  timeoutMS: 30000,
  timeoutFactor: 2,
  concurrency: 4,
  ignorePatterns: ['dist/**', 'node_modules/**', '.dev-pomogator/**', 'extensions/**', 'docker-test/**', 'reports/**'],
};
