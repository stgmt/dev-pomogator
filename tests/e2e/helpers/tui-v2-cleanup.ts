import fs from 'fs-extra';
import path from 'path';

/**
 * Cleanup temp files created by TUI v2 tests (AfterEach, per-scenario).
 *
 * Removes:
 * - .dev-pomogator/.test-status/status.*.yaml
 * - .dev-pomogator/.test-status/.tui-state.*.yaml
 * - logs/screenshots/tui-screenshot-*.svg
 * - .tui-test-runner.lock (PID lock file)
 */
export async function cleanupTuiV2(tempDir: string): Promise<void> {
  const cleanupPaths = [
    path.join(tempDir, '.dev-pomogator', '.test-status'),
    path.join(tempDir, 'logs', 'screenshots'),
  ];

  for (const dir of cleanupPaths) {
    if (await fs.pathExists(dir)) {
      await fs.remove(dir);
    }
  }

  // Remove lock file
  const lockFile = path.join(tempDir, '.tui-test-runner.lock');
  if (await fs.pathExists(lockFile)) {
    await fs.remove(lockFile);
  }

  // Remove user patterns override dir
  const userPatternsDir = path.join(tempDir, '.dev-pomogator', 'patterns.yaml');
  if (await fs.pathExists(userPatternsDir)) {
    await fs.remove(userPatternsDir);
  }
}
