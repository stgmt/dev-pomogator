/**
 * Updater sync for `extensions/_shared/` cross-extension utility files.
 *
 * **Why this exists**: the installer copies `extensions/_shared/` → target
 * `.dev-pomogator/tools/_shared/` via `fs.copy` (recursive directory copy).
 * The updater historically only synced files declared in extension manifests'
 * `toolFiles[]`, leaving `_shared/` STALE on every auto-update. Hook scripts
 * that import from `../_shared/hook-utils.js` then fail with `MODULE_NOT_FOUND`.
 *
 * Incident: dkidyaev on `c:\msmaster` hit 5 hooks failing because his
 * `.dev-pomogator/tools/_shared/` was stale relative to upstream.
 *
 * **Strategy**: read static manifest `extensions/_shared/.manifest.json`
 * (committed alongside `_shared/` source), download each listed file via
 * the existing `downloadExtensionFile` helper, write atomically to target,
 * compute SHA-256 hashes, return ManagedFileEntry list. Removes files that
 * were previously synced but are no longer in the upstream manifest.
 *
 * See `.specs/personal-pomogator/` FR-12, AC-12.
 */

import fs from 'fs-extra';
import path from 'path';
import { downloadExtensionFile } from './github.js';
import { computeHash } from './content-hash.js';
import { resolveWithinProject } from '../utils/path-safety.js';
import type { ManagedFileEntry } from '../config/schema.js';

const SHARED_TARGET_PREFIX = '.dev-pomogator/tools/_shared/';

interface SharedManifest {
  files: string[];
}

export interface SharedSyncResult {
  written: ManagedFileEntry[];
  removed: string[];
  hadFailures: boolean;
}

/**
 * Sync upstream `extensions/_shared/` files to a target project's
 * `.dev-pomogator/tools/_shared/` directory.
 *
 * @param projectPath Target project root (absolute)
 * @param previousShared Previously synced files with hashes (from config.installedShared[projectPath])
 */
export async function updateSharedFiles(
  projectPath: string,
  previousShared: ManagedFileEntry[] = []
): Promise<SharedSyncResult> {
  const result: SharedSyncResult = {
    written: [],
    removed: [],
    hadFailures: false,
  };

  // 1. Fetch upstream manifest (.manifest.json sits at extensions/_shared/.manifest.json)
  // downloadExtensionFile('_shared', '.manifest.json') resolves to that path.
  const manifestContent = await downloadExtensionFile('_shared', '.manifest.json');
  if (!manifestContent) {
    // No manifest → can't sync. Don't fail update — just log.
    console.log('  ⚠ _shared/.manifest.json not available — skipping shared utilities sync');
    result.hadFailures = true;
    return result;
  }

  let manifest: SharedManifest;
  try {
    manifest = JSON.parse(manifestContent) as SharedManifest;
  } catch (e) {
    console.log(`  ⚠ Invalid _shared/.manifest.json: ${e instanceof Error ? e.message : e}`);
    result.hadFailures = true;
    return result;
  }

  if (!Array.isArray(manifest.files)) {
    console.log('  ⚠ _shared/.manifest.json missing "files" array — skipping');
    result.hadFailures = true;
    return result;
  }

  // 2. Build set of expected destination paths for stale-file detection
  const expectedTargetPaths = new Set<string>(
    manifest.files.map((f) => SHARED_TARGET_PREFIX + f)
  );

  // 3. Download and write each file
  for (const fileName of manifest.files) {
    const content = await downloadExtensionFile('_shared', fileName);
    if (content === null) {
      console.log(`  ⚠ Failed to download _shared/${fileName}`);
      result.hadFailures = true;
      continue;
    }

    const targetRelative = SHARED_TARGET_PREFIX + fileName;
    const destFile = resolveWithinProject(projectPath, targetRelative);
    if (!destFile) {
      console.log(`  ⚠ Skipping _shared file outside project: ${targetRelative}`);
      result.hadFailures = true;
      continue;
    }

    await fs.ensureDir(path.dirname(destFile));
    await fs.writeFile(destFile, content, 'utf-8');
    result.written.push({ path: targetRelative, hash: computeHash(content) });
  }

  // 4. Remove stale files (in previousShared but not in current manifest)
  for (const prev of previousShared) {
    if (expectedTargetPaths.has(prev.path)) continue;

    const stalePath = resolveWithinProject(projectPath, prev.path);
    if (!stalePath) continue;
    if (!(await fs.pathExists(stalePath))) continue;

    await fs.remove(stalePath);
    result.removed.push(prev.path);
    console.log(`  - Removed stale _shared file: ${prev.path}`);
  }

  return result;
}

/**
 * Cheap synchronous probe: does `<projectPath>/.dev-pomogator/tools/_shared/` exist?
 *
 * Used by `checkUpdate` to detect legacy installs (pre-commit 6b475e4) where the
 * directory was never copied at all, OR projects where it was deleted manually.
 * In both cases the standard 24h cooldown gate would skip recovery — this probe
 * lets the updater bypass cooldown for the missing-directory case only.
 *
 * Incident reference: dkidyaev (`c:\msmaster`), see comment at top of this file.
 *
 * Returns true if the directory is MISSING (recovery needed).
 */
export function hasMissingSharedDir(projectPath: string): boolean {
  return !fs.existsSync(path.join(projectPath, '.dev-pomogator/tools/_shared'));
}
