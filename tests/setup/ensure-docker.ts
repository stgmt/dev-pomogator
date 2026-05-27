/**
 * Enforce Docker isolation for E2E tests.
 *
 * Tests destroy HOME-level directories (~/.claude/, ~/.dev-pomogator/) and
 * project files (.specs/, .claude/settings.json) as part of setupCleanState().
 * Running on host wipes real project data — incident 2026-05-22 cost a week of
 * untracked spec work via fs.remove('.specs/') in specs-validator.test.ts.
 *
 * `DEV_POMOGATOR_TEST_IN_DOCKER=1` is set automatically by the Docker entrypoint.
 * No bypass env var exists by design — if you need to run a test on host, copy
 * it to a tmpdir-only variant (see tests/e2e/mcp-config.test.ts for a safe
 * pattern that uses os.tmpdir() instead of appPath()).
 */

const inDocker = process.env.DEV_POMOGATOR_TEST_IN_DOCKER === '1';

if (!inDocker) {
  throw new Error(
    '\n\n' +
    '========================================\n' +
    '  E2E tests MUST run inside Docker.\n' +
    '  Tests delete ~/.claude/, ~/.dev-pomogator/, .specs/, and project hooks.\n' +
    '\n' +
    '  Run via:  npm test     (docker-test.sh)\n' +
    '========================================\n'
  );
}
