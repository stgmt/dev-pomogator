/**
 * Enforce Docker isolation for E2E tests.
 *
 * Tests destroy HOME-level directories (~/.claude/, ~/.dev-pomogator/) and
 * project files (.claude/settings.json) as part of setupCleanState().
 * Running on host kills the active Claude Code session (auth, hooks).
 *
 * Set DEV_POMOGATOR_TEST_IN_DOCKER=1 to bypass (set automatically in Docker).
 * For intentional host runs: npm run test:host (at your own risk).
 */

const inDocker = process.env.DEV_POMOGATOR_TEST_IN_DOCKER === '1';
const forceHost = process.env.DEVPOM_ALLOW_HOST_TESTS === '1';

if (!inDocker && !forceHost) {
  throw new Error(
    '\n\n' +
    '========================================\n' +
    '  E2E tests MUST run inside Docker.\n' +
    '  Tests delete ~/.claude/ and project hooks.\n' +
    '\n' +
    '  Use:  npm test          (Docker)\n' +
    '  Or:   npm run test:host (host, DANGEROUS)\n' +
    '========================================\n'
  );
}
