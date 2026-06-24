/**
 * Enforce Docker isolation for the cucumber/BDD suite — the runtime analogue of
 * tests/setup/ensure-docker.ts (which guards ONLY the vitest suite).
 *
 * Cucumber loads this via cucumber.json `default.import` glob `tests/hooks/**\/*.ts` on EVERY
 * run, so it fires regardless of HOW cucumber was launched — `node scripts/run-bdd.mjs`, a raw
 * `node node_modules/@cucumber/cucumber/bin/cucumber.js`, `npm run test:bdd`, or an IDE. This is
 * the THIRD enforcement layer, closing the gap left by:
 *   1. the PreToolUse `test_guard` hook  — only catches Bash-TOOL invocations, and
 *   2. the `scripts/run-bdd.mjs` runtime guard — only catches the run-bdd entry.
 * A direct host cucumber run that bypasses both still aborts HERE.
 *
 * Why: a host run executes Linux/Docker-only scenarios in the wrong env (false reds) and
 * CLOBBERS the canonical `.dev-pomogator/.last-test-run.ndjson` with host-isolation artifacts
 * (incident 2026-06-24).
 *
 * `DEV_POMOGATOR_TEST_IN_DOCKER=1` is set by the Docker test image (Dockerfile.test +
 * Dockerfile.test.base ENV, and docker-compose.test.yml env), so this passes in Docker and
 * throws on the host. No bypass env var by design (mirrors ensure-docker.ts) — run the suite via
 * `bash scripts/docker-bdd.sh` (or `npm run test:bdd:docker`). Builtins-only (reads process.env),
 * so it is deps-absent-safe for plugin users.
 */
if (process.env.DEV_POMOGATOR_TEST_IN_DOCKER !== '1') {
  throw new Error(
    '\n\n' +
      '========================================\n' +
      '  The BDD/cucumber suite MUST run inside Docker, not on the host.\n' +
      '  A host run false-reds Linux/Docker-only scenarios and clobbers the\n' +
      '  canonical .dev-pomogator/.last-test-run.ndjson (incident 2026-06-24).\n' +
      '\n' +
      '  Run via:  bash scripts/docker-bdd.sh        (full suite)\n' +
      '            bash scripts/docker-bdd.sh --tags "@featureN"   (a batch)\n' +
      '            npm run test:bdd:docker  /  /run-tests --docker\n' +
      '========================================\n',
  );
}
