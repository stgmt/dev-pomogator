import fs from 'fs-extra';
import path from 'path';
import { getConfigDir } from '../config/index.js';
import { USER_OVERRIDES_DIR } from '../constants.js';

export interface ModifiedFile {
  /** Relative path inside the project (e.g. ".cursor/rules/specs-management.mdc") */
  relativePath: string;
  /** Absolute path to the backup copy */
  backupPath: string;
  /** Extension name that triggered the overwrite */
  extensionName: string;
}

/**
 * Validate that a resolved path stays within the base directory.
 * Returns the resolved path if safe, or null if path traversal is detected.
 */
function resolveWithinDir(base: string, relativePath: string): string | null {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(resolvedBase, relativePath);
  const rel = path.relative(resolvedBase, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

/**
 * Copy a user-modified file into `{projectPath}/.dev-pomogator/.user-overrides/{relativePath}`
 * before it gets overwritten by an upstream update.
 *
 * Returns the absolute backup path on success, or null on failure.
 */
export async function backupUserFile(
  projectPath: string,
  relativePath: string
): Promise<string | null> {
  try {
    const sourcePath = resolveWithinDir(projectPath, relativePath);
    if (!sourcePath) {
      console.log(`  ⚠ Skipping backup — path outside project: ${relativePath}`);
      return null;
    }
    if (!await fs.pathExists(sourcePath)) return null;

    const backupPath = resolveWithinDir(
      path.join(projectPath, USER_OVERRIDES_DIR),
      relativePath
    );
    if (!backupPath) {
      console.log(`  ⚠ Skipping backup — backup path outside project: ${relativePath}`);
      return null;
    }
    await fs.ensureDir(path.dirname(backupPath));
    await fs.copy(sourcePath, backupPath, { overwrite: true });
    return backupPath;
  } catch (error) {
    console.log(`  ⚠ Failed to backup ${relativePath}: ${error}`);
    return null;
  }
}

/**
 * Write (or overwrite) a Markdown summary report listing all files that were
 * backed up because they contained user modifications.
 *
 * Location: `~/.dev-pomogator/last-update-report.md`
 */
export async function writeUpdateReport(
  modifications: ModifiedFile[]
): Promise<void> {
  if (modifications.length === 0) return;

  const configDir = getConfigDir();
  const reportPath = path.join(configDir, 'last-update-report.md');

  const timestamp = new Date().toISOString();
  const lines: string[] = [
    '# Update Report',
    '',
    `Generated: ${timestamp}`,
    '',
    `${modifications.length} file(s) with user modifications were backed up before overwriting.`,
    '',
    '| File | Extension | Backup |',
    '|------|-----------|--------|',
  ];

  for (const mod of modifications) {
    lines.push(`| \`${mod.relativePath}\` | ${mod.extensionName} | \`${mod.backupPath}\` |`);
  }

  lines.push('');
  lines.push('> Merge your changes from `.dev-pomogator/.user-overrides/` back into the updated files if needed.');
  lines.push('');

  await fs.ensureDir(configDir);
  await fs.writeFile(reportPath, lines.join('\n'), 'utf-8');
}
