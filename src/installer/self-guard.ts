/**
 * Self-guard: detect "running in dev-pomogator source repository".
 *
 * When the installer runs against its own source repo (dogfooding), we MUST NOT
 * touch `.gitignore`, create `.claude/settings.local.json`, or migrate legacy
 * entries from `.claude/settings.json`. These files are managed by hand in
 * the dev-pomogator repo itself — modifying them would break our dev workflow.
 *
 * Detection uses three belt-and-suspenders checks:
 *   1. `package.json#name === "dev-pomogator"` at `repoRoot`
 *   2. `extensions/` directory exists at `repoRoot`
 *   3. `src/installer/` directory exists at `repoRoot`
 *
 * All three must be true. This prevents false positives from projects that
 * happen to have a file named `dev-pomogator` in package.json or similar dirs.
 */

import path from 'path';
import fs from 'fs-extra';
import { readJsonSafe } from '../utils/atomic-json.js';

/**
 * Check whether `repoRoot` is the dev-pomogator source repository.
 *
 * @param repoRoot Absolute path to repository root (from findRepoRoot())
 * @returns true if all three detection conditions pass
 */
export async function isDevPomogatorRepo(repoRoot: string): Promise<boolean> {
  // Test override: allow integration tests to force personal-mode ON
  // even when running from inside the dev-pomogator repo itself.
  // Never use this in production — it exists solely so that
  // `tests/e2e/personal-pomogator.test.ts` can exercise FR-1, FR-2, etc.
  if (process.env.DEV_POMOGATOR_SKIP_SELF_GUARD === '1') {
    return false;
  }

  // Condition 1: package.json#name === 'dev-pomogator'
  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = await readJsonSafe<{ name?: string }>(pkgPath, {});
  if (pkg?.name !== 'dev-pomogator') {
    return false;
  }

  // Condition 2: extensions/ directory exists
  const extensionsDir = path.join(repoRoot, 'extensions');
  if (!await fs.pathExists(extensionsDir)) {
    return false;
  }

  // Condition 3: src/installer/ directory exists
  const installerDir = path.join(repoRoot, 'src', 'installer');
  if (!await fs.pathExists(installerDir)) {
    return false;
  }

  return true;
}
