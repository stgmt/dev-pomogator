/**
 * Per-project uninstall for dev-pomogator.
 *
 * Unlike the global `uninstall.ps1` which nukes `~/.dev-pomogator/` and
 * `~/.claude/`, this function cleans up a single target project:
 *
 *   1. Delete all managed files listed in `~/.config/dev-pomogator/config.json`
 *      under `installedExtensions[].managed[repoRoot]`
 *   2. Prune empty parent directories
 *   3. Remove `.gitignore` marker block
 *   4. Strip dev-pomogator hooks/env from `.claude/settings.local.json`
 *   5. Update config: remove repoRoot from projectPaths, delete managed[repoRoot]
 *
 * Refuses to run in dev-pomogator source repo (self-guard) — prevents accidental
 * dogfood deletion.
 *
 * See .specs/personal-pomogator/ FR-8.
 */

import path from 'path';
import fs from 'fs-extra';
import { loadConfig, saveConfig } from '../config/index.js';
import { getManagedPaths } from '../config/schema.js';
import { isDevPomogatorRepo } from './self-guard.js';
import { removeManagedGitignoreBlock } from './gitignore.js';
import { stripDevPomogatorFromSettingsLocal } from './settings-local.js';
import { resolveWithinProject } from '../utils/path-safety.js';

export interface UninstallReport {
  deletedFiles: string[];
  skippedFiles: string[];
  errors: string[];
  gitignoreBlockRemoved: boolean;
  settingsLocalCleaned: boolean;
  configUpdated: boolean;
}

export interface UninstallOptions {
  dryRun?: boolean;
}

// `resolveWithinProject` from `src/utils/path-safety.ts` (shared with updater/index.ts).
// `getManagedPaths` from `src/config/schema.ts` (canonical accessor for ManagedFileItem union).

/**
 * Per-project uninstall entry point.
 *
 * @param repoRoot Absolute path to target project root
 * @param options.dryRun If true, don't actually delete anything — just report
 */
export async function uninstallFromProject(
  repoRoot: string,
  options: UninstallOptions = {},
): Promise<UninstallReport> {
  const report: UninstallReport = {
    deletedFiles: [],
    skippedFiles: [],
    errors: [],
    gitignoreBlockRemoved: false,
    settingsLocalCleaned: false,
    configUpdated: false,
  };

  // Step 1: Self-guard refuse
  if (await isDevPomogatorRepo(repoRoot)) {
    throw new Error('Refusing to uninstall from dev-pomogator source repository');
  }

  // Step 2: Load config
  const config = await loadConfig();
  if (!config || !config.installedExtensions) {
    report.errors.push('No dev-pomogator config found — nothing to uninstall');
    return report;
  }

  // Step 3: Collect all managed files + hook commands + env keys for this repoRoot
  const managedFiles: string[] = [];
  const managedHookCommands = new Set<string>();
  const managedEnvKeys = new Set<string>();

  for (const ext of config.installedExtensions) {
    const projectManaged = ext.managed?.[repoRoot];
    if (!projectManaged) continue;

    managedFiles.push(...getManagedPaths(projectManaged.commands));
    managedFiles.push(...getManagedPaths(projectManaged.rules));
    managedFiles.push(...getManagedPaths(projectManaged.tools));
    managedFiles.push(...getManagedPaths(projectManaged.skills));

    if (projectManaged.hooks) {
      for (const commands of Object.values(projectManaged.hooks)) {
        if (Array.isArray(commands)) {
          for (const cmd of commands) managedHookCommands.add(cmd);
        }
      }
    }
  }

  if (managedFiles.length === 0 && managedHookCommands.size === 0) {
    report.errors.push(`No managed entries found for project ${repoRoot}`);
    return report;
  }

  // Step 4: Delete managed files in parallel with path traversal guard.
  // fs-extra's fs.remove is no-op on ENOENT, so no need to pre-check existence.
  const dirsToPrune = new Set<string>();
  await Promise.all(managedFiles.map(async (relPath) => {
    const absPath = resolveWithinProject(repoRoot, relPath);
    if (!absPath) {
      report.skippedFiles.push(relPath);
      report.errors.push(`Path traversal guard: ${relPath} escapes repoRoot — skipped`);
      return;
    }

    try {
      if (!options.dryRun) {
        await fs.remove(absPath);
      }
      report.deletedFiles.push(relPath);
      dirsToPrune.add(path.dirname(absPath));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`Failed to delete ${relPath}: ${msg}`);
    }
  }));

  // Step 5: Prune empty parent directories (walk up to repoRoot).
  // `visited` Set deduplicates ancestors so each directory is `readdir`'d at most
  // once even when many leaf paths share the same parent chain.
  if (!options.dryRun) {
    const repoRootAbs = path.resolve(repoRoot);
    const sortedDirs = Array.from(dirsToPrune).sort((a, b) => b.length - a.length); // deepest first
    const visited = new Set<string>();
    for (const dir of sortedDirs) {
      let current = dir;
      while (current !== repoRootAbs && current.startsWith(repoRootAbs)) {
        if (visited.has(current)) break;
        visited.add(current);
        try {
          const entries = await fs.readdir(current);
          if (entries.length === 0) {
            await fs.rmdir(current);
            current = path.dirname(current);
          } else {
            break;
          }
        } catch {
          break;
        }
      }
    }
  }

  // Step 6: Remove gitignore marker block
  if (!options.dryRun) {
    try {
      await removeManagedGitignoreBlock(repoRoot);
      report.gitignoreBlockRemoved = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`Failed to remove gitignore block: ${msg}`);
    }
  } else {
    report.gitignoreBlockRemoved = true;
  }

  // Step 7: Strip dev-pomogator entries from settings.local.json
  if (!options.dryRun) {
    try {
      await stripDevPomogatorFromSettingsLocal(repoRoot, managedHookCommands, managedEnvKeys);
      report.settingsLocalCleaned = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`Failed to strip settings.local.json: ${msg}`);
    }
  } else {
    report.settingsLocalCleaned = true;
  }

  // Step 8: Update config — remove repoRoot from projectPaths and managed[repoRoot]
  if (!options.dryRun) {
    try {
      for (const ext of config.installedExtensions) {
        ext.projectPaths = (ext.projectPaths ?? []).filter(p => p !== repoRoot);
        if (ext.managed) {
          delete ext.managed[repoRoot];
        }
      }
      await saveConfig(config);
      report.configUpdated = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`Failed to update config: ${msg}`);
    }
  } else {
    report.configUpdated = true;
  }

  return report;
}
