import { logger, formatErrorChain, getErrorMessage } from '../utils/logger.js';
import { loadConfig, saveConfig } from '../config/index.js';
import type { InstalledExtension, ManagedFiles, ManagedFileEntry, ManagedFileItem } from '../config/schema.js';
import { getManagedPaths, getManagedHash } from '../config/schema.js';
import { shouldCheckUpdate } from './cooldown.js';
import { fetchExtensionManifest, downloadExtensionFile } from './github.js';
import { acquireLock, releaseLock } from './lock.js';
import { runPostUpdateHook, PostUpdateHookError } from '../installer/extensions.js';
import { computeHash, isModifiedByUser, getFileHash } from './content-hash.js';
import { backupUserFile, writeUpdateReport } from './backup.js';
import type { ModifiedFile } from './backup.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import semver from 'semver';
import { RULES_SUBFOLDER, TOOLS_DIR, SKILLS_DIR } from '../constants.js';
import { resolveHookToolPaths, replaceNpxTsxWithPortable, ensureExecutableShellScripts } from '../installer/shared.js';
import { detectMangledArtifacts } from '../utils/msys.js';
import { writeJsonAtomic, readJsonSafe } from '../utils/atomic-json.js';
import { writeGlobalStatusLine, isManagedStatusLineCommand } from '../utils/statusline.js';
import { resolveWithinProject, normalizeRelativePath } from '../utils/path-safety.js';
import { updateSharedFiles, hasMissingSharedDir } from './shared-sync.js';
import { writePluginJson } from '../installer/plugin-json.js';

interface UpdateOptions {
  force?: boolean;
  platform?: 'claude';  // Filter updates by platform
}

interface UpdateResult {
  written: ManagedFileEntry[];
  hadFailures: boolean;
  backedUp: ModifiedFile[];
}

// `resolveWithinProject` and `normalizeRelativePath` extracted to
// `src/utils/path-safety.ts` so the same security primitive is shared with
// `src/installer/uninstall-project.ts` (per .claude/rules/no-unvalidated-manifest-paths.md).

function ensureManagedEntry(
  installed: InstalledExtension,
  projectPath: string
): ManagedFiles {
  if (!installed.managed) {
    installed.managed = {};
  }
  if (!installed.managed[projectPath]) {
    installed.managed[projectPath] = {};
  }
  return installed.managed[projectPath];
}

/**
 * Determine whether a managed file should be backed up before overwriting.
 *
 * Handles the migration case: when storedHash is empty (old config format),
 * we compare the current file against the NEW upstream content. If they match,
 * the user hasn't modified the file — no backup needed.
 */
async function shouldBackupFile(
  destFile: string,
  storedHash: string | undefined,
  upstreamContent: string
): Promise<boolean> {
  if (!await isModifiedByUser(destFile, storedHash)) {
    return false;
  }
  // Migration case: storedHash is '' (normalized from old string format).
  // Compare current file with upstream to avoid false-positive backups.
  if (!storedHash) {
    const currentHash = await getFileHash(destFile);
    if (currentHash === null) return false;
    return currentHash !== computeHash(upstreamContent);
  }
  return true;
}

/**
 * Remove empty directories left behind after stale-file removal.
 *
 * Walks parents of removed files bottom-up, deleting any that are now empty.
 * Stops at `{projectPath}/.dev-pomogator/tools/` boundary so the tools root
 * itself is never deleted. Quietly skips dirs that no longer exist or are
 * non-empty (other extensions still using them).
 *
 * Implements FR-13.
 */
async function pruneEmptyDirs(
  projectPath: string,
  removedRelativePaths: string[]
): Promise<void> {
  const toolsRoot = path.resolve(projectPath, '.dev-pomogator', 'tools');
  const dirsToCheck = new Set<string>();

  for (const rel of removedRelativePaths) {
    const abs = resolveWithinProject(projectPath, rel);
    if (!abs) continue;
    let dir = path.dirname(abs);
    // Walk up until we hit toolsRoot or filesystem root
    while (dir !== toolsRoot && dir !== path.parse(dir).root && dir.startsWith(toolsRoot)) {
      dirsToCheck.add(dir);
      dir = path.dirname(dir);
    }
  }

  // Sort descending by length so we prune leaves before parents
  const sortedDirs = [...dirsToCheck].sort((a, b) => b.length - a.length);
  for (const dir of sortedDirs) {
    try {
      const entries = await fs.readdir(dir);
      if (entries.length === 0) {
        await fs.rmdir(dir);
        console.log(`  - Pruned empty dir: ${path.relative(projectPath, dir)}`);
      }
    } catch {
      // Dir gone or non-empty — skip silently
    }
  }
}

async function removeStaleFiles(
  projectPath: string,
  previousItems: ManagedFileItem[] = [],
  next: string[] = [],
  extensionName?: string
): Promise<ModifiedFile[]> {
  const previousSet = new Set(getManagedPaths(previousItems).map(normalizeRelativePath));
  const nextSet = new Set(next.map(normalizeRelativePath));
  const backedUp: ModifiedFile[] = [];

  for (const relativePath of previousSet) {
    if (nextSet.has(relativePath)) {
      continue;
    }
    const destFile = resolveWithinProject(projectPath, relativePath);
    if (!destFile) {
      console.log(`  ⚠ Skipping stale path outside project: ${relativePath}`);
      continue;
    }
    if (await fs.pathExists(destFile)) {
      const storedHash = getManagedHash(previousItems, relativePath);
      const shouldBackupStaleFile = storedHash
        ? await isModifiedByUser(destFile, storedHash)
        : true;

      if (shouldBackupStaleFile && extensionName) {
        const backupPath = await backupUserFile(projectPath, relativePath);
        if (backupPath) {
          console.log(`  📋 Backed up stale user-modified file: ${relativePath}`);
          backedUp.push({ relativePath, backupPath, extensionName });
        }
      }

      await fs.remove(destFile);
      console.log(`  - Removed stale file: ${relativePath}`);
    }
  }

  return backedUp;
}

async function updateCommandFiles(
  extensionName: string,
  platform: 'claude',
  files: string[],
  projectPath: string,
  previousItems?: ManagedFiles['commands']
): Promise<UpdateResult> {
  if (files.length === 0) return { written: [], hadFailures: false, backedUp: [] };

  const platformDir = '.claude';
  const destDir = path.join(projectPath, platformDir, 'commands');
  await fs.ensureDir(destDir);

  const written: ManagedFileEntry[] = [];
  const backedUp: ModifiedFile[] = [];
  let hadFailures = false;
  for (const relativePath of files) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    const fileName = path.basename(relativePath);
    const destFile = path.join(destDir, fileName);
    const relativeDest = normalizeRelativePath(
      path.join(platformDir, 'commands', fileName)
    );
    if (!content) {
      console.log(`  ⚠ Failed to download command: ${relativePath}`);
      hadFailures = true;
      continue;
    }

    // Check for user modifications before overwriting
    const storedHash = getManagedHash(previousItems, relativeDest);
    if (await shouldBackupFile(destFile, storedHash, content)) {
      const backupPath = await backupUserFile(projectPath, relativeDest);
      if (backupPath) {
        console.log(`  📋 Backed up user-modified command: ${relativeDest}`);
        backedUp.push({ relativePath: relativeDest, backupPath, extensionName });
      }
    }

    await fs.writeFile(destFile, content, 'utf-8');
    written.push({ path: relativeDest, hash: computeHash(content) });
  }

  return { written, hadFailures, backedUp };
}

async function updateRuleFiles(
  extensionName: string,
  platform: 'claude',
  files: string[],
  projectPath: string,
  previousItems?: ManagedFiles['rules']
): Promise<UpdateResult> {
  if (files.length === 0) return { written: [], hadFailures: false, backedUp: [] };

  const written: ManagedFileEntry[] = [];
  const backedUp: ModifiedFile[] = [];
  let hadFailures = false;

  for (const relativePath of files) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    // ruleFiles paths are repo-root relative (e.g. .claude/rules/ext-name/rule.md)
    const relativeDest = normalizeRelativePath(relativePath);
    const destFile = path.join(projectPath, relativePath);
    await fs.ensureDir(path.dirname(destFile));

    if (!content) {
      console.log(`  ⚠ Failed to download rule: ${relativePath}`);
      hadFailures = true;
      continue;
    }

    // Check for user modifications before overwriting
    const storedHash = getManagedHash(previousItems, relativeDest);
    if (await shouldBackupFile(destFile, storedHash, content)) {
      const backupPath = await backupUserFile(projectPath, relativeDest);
      if (backupPath) {
        console.log(`  📋 Backed up user-modified rule: ${relativeDest}`);
        backedUp.push({ relativePath: relativeDest, backupPath, extensionName });
      }
    }

    await fs.writeFile(destFile, content, 'utf-8');
    written.push({ path: relativeDest, hash: computeHash(content) });
  }

  return { written, hadFailures, backedUp };
}

/**
 * Migrate rules from legacy .claude/rules/pomogator/ to .claude/rules/{ext-name}/
 * Idempotent: skips if source doesn't exist or dest already exists.
 */
/**
 * Migrate rules from legacy .claude/rules/pomogator/ to .claude/rules/{ext-name}/
 * for a specific extension. Idempotent: skips if source doesn't exist or dest already exists.
 */
async function migrateRulesNamespace(
  installed: InstalledExtension,
  projectPath: string
): Promise<void> {
  if (!installed.managed) return;
  const managed = installed.managed[projectPath];
  if (!managed?.rules) return;

  let changed = false;
  for (let i = 0; i < managed.rules.length; i++) {
    const entry = managed.rules[i];
    const entryPath = typeof entry === 'string' ? entry : entry.path;
    const oldPrefix = `.claude/rules/${RULES_SUBFOLDER}/`;
    if (!entryPath.startsWith(oldPrefix)) continue;

    const fileName = path.basename(entryPath);
    const newPath = `.claude/rules/${installed.name}/${fileName}`;
    const oldFile = path.join(projectPath, entryPath);
    const newFile = path.join(projectPath, newPath);

    if (!await fs.pathExists(oldFile)) continue;
    if (await fs.pathExists(newFile)) continue;

    await fs.ensureDir(path.dirname(newFile));
    await fs.move(oldFile, newFile);
    if (typeof entry === 'string') {
      managed.rules[i] = newPath;
    } else {
      entry.path = newPath;
    }
    changed = true;
    console.log(`  📦 Migrated rule: ${oldPrefix}${fileName} → ${newPath}`);
  }

  if (changed) {
    const pomDir = path.join(projectPath, '.claude', 'rules', RULES_SUBFOLDER);
    try {
      const remaining = await fs.readdir(pomDir);
      if (remaining.length === 0) {
        await fs.remove(pomDir);
      }
    } catch { /* directory may not exist */ }
  }
}

async function updateToolFiles(
  extensionName: string,
  toolFiles: Record<string, string[]>,
  projectPath: string,
  previousItems?: ManagedFiles['tools']
): Promise<UpdateResult> {
  const allFiles = Object.values(toolFiles).flat();
  if (allFiles.length === 0) return { written: [], hadFailures: false, backedUp: [] };

  const written: ManagedFileEntry[] = [];
  const backedUp: ModifiedFile[] = [];
  let hadFailures = false;
  for (const relativePath of allFiles) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    const destFile = resolveWithinProject(projectPath, relativePath);
    if (!destFile) {
      console.log(`  ⚠ Skipping tool file outside project: ${relativePath}`);
      hadFailures = true;
      continue;
    }
    await fs.ensureDir(path.dirname(destFile));
    const normalizedPath = normalizeRelativePath(relativePath);
    if (!content) {
      console.log(`  ⚠ Failed to download tool file: ${relativePath}`);
      hadFailures = true;
      continue;
    }

    // Check for user modifications before overwriting
    const storedHash = getManagedHash(previousItems, normalizedPath);
    if (await shouldBackupFile(destFile, storedHash, content)) {
      const backupPath = await backupUserFile(projectPath, normalizedPath);
      if (backupPath) {
        console.log(`  📋 Backed up user-modified tool: ${normalizedPath}`);
        backedUp.push({ relativePath: normalizedPath, backupPath, extensionName });
      }
    }

    await fs.writeFile(destFile, content, 'utf-8');
    await ensureExecutableShellScripts(destFile);
    written.push({ path: normalizedPath, hash: computeHash(content) });
  }

  return { written, hadFailures, backedUp };
}

async function updateSkillFiles(
  extensionName: string,
  skillFiles: Record<string, string[]>,
  projectPath: string,
  previousItems?: ManagedFiles['skills']
): Promise<UpdateResult> {
  const allFiles = Object.values(skillFiles).flat();
  if (allFiles.length === 0) return { written: [], hadFailures: false, backedUp: [] };

  const written: ManagedFileEntry[] = [];
  const backedUp: ModifiedFile[] = [];
  let hadFailures = false;
  for (const relativePath of allFiles) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    const destFile = resolveWithinProject(projectPath, relativePath);
    if (!destFile) {
      console.log(`  ⚠ Skipping skill file outside project: ${relativePath}`);
      hadFailures = true;
      continue;
    }
    await fs.ensureDir(path.dirname(destFile));
    const normalizedPath = normalizeRelativePath(relativePath);
    if (!content) {
      console.log(`  ⚠ Failed to download skill file: ${relativePath}`);
      hadFailures = true;
      continue;
    }

    // Check for user modifications before overwriting
    const storedHash = getManagedHash(previousItems, normalizedPath);
    if (await shouldBackupFile(destFile, storedHash, content)) {
      const backupPath = await backupUserFile(projectPath, normalizedPath);
      if (backupPath) {
        console.log(`  📋 Backed up user-modified skill: ${normalizedPath}`);
        backedUp.push({ relativePath: normalizedPath, backupPath, extensionName });
      }
    }

    await fs.writeFile(destFile, content, 'utf-8');
    written.push({ path: normalizedPath, hash: computeHash(content) });
  }

  return { written, hadFailures, backedUp };
}

async function updateClaudeHooksForProject(
  repoRoot: string,
  hooks: Record<string, string | { matcher?: string; command: string; timeout?: number }>,
  previousManagedHooks: Record<string, string[]> = {}
): Promise<Record<string, string[]>> {
  const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
  const hasNewHooks = Object.keys(hooks).length > 0;

  if (!hasNewHooks && Object.keys(previousManagedHooks).length === 0) {
    return {};
  }

  const settings = await readJsonSafe<Record<string, unknown>>(settingsPath, {});

  if (!settings.hooks) {
    settings.hooks = {};
  }
  const existingHooks = settings.hooks as Record<string, unknown[]>;

  // Clean all managed hooks before re-adding to prevent path-format duplicates
  for (const hookName of Object.keys(existingHooks)) {
    const arr = existingHooks[hookName] as Array<{ hooks?: Array<{ command: string }> }>;
    existingHooks[hookName] = arr.filter(
      entry => !entry.hooks?.some(h => h.command.includes('.dev-pomogator/tools/'))
    );
  }

  const nextManagedHooks: Record<string, string[]> = {};

  for (const [hookName, rawHook] of Object.entries(hooks)) {
    const rawCommand = typeof rawHook === 'string' ? rawHook : rawHook.command;
    const matcher = typeof rawHook === 'string' ? '' : (rawHook.matcher ?? '');
    const timeout = typeof rawHook === 'string' ? 60 : (rawHook.timeout ?? 60);

    if (!nextManagedHooks[hookName]) {
      nextManagedHooks[hookName] = [];
    }
    nextManagedHooks[hookName].push(rawCommand);

    // Replace relative paths with absolute paths, then wrap npx tsx with resilient runner
    const command = replaceNpxTsxWithPortable(resolveHookToolPaths(rawCommand, repoRoot));

    if (!existingHooks[hookName]) {
      existingHooks[hookName] = [];
    }

    const hookArray = existingHooks[hookName] as Array<{
      matcher?: string;
      hooks?: Array<{ type: string; command: string; timeout?: number }>;
    }>;
    const commandExists = hookArray.some((h) =>
      h.hooks?.some((hook) => hook.command === command)
    );

    if (!commandExists) {
      hookArray.push({
        matcher,
        hooks: [{
          type: 'command',
          command,
          timeout,
        }],
      });
    }
  }

  for (const [hookName, commands] of Object.entries(previousManagedHooks)) {
    const hookArray = existingHooks[hookName] as Array<{
      matcher?: string;
      hooks?: Array<{ type: string; command: string; timeout?: number }>;
    }> | undefined;
    if (!hookArray) {
      continue;
    }
    const nextAbsolute = new Set(
      (nextManagedHooks[hookName] ?? []).map(cmd => resolveHookToolPaths(cmd, repoRoot))
    );
    const removeSet = new Set(
      commands
        .map(cmd => resolveHookToolPaths(cmd, repoRoot))
        .filter(cmd => !nextAbsolute.has(cmd))
    );
    if (removeSet.size === 0) {
      continue;
    }
    existingHooks[hookName] = hookArray.filter(
      (entry) => !entry.hooks?.some((hook) => removeSet.has(hook.command))
    );
  }

  await writeJsonAtomic(settingsPath, settings);

  return nextManagedHooks;
}

/**
 * Update statusLine config in global ~/.claude/settings.json
 * Delegates to shared writeGlobalStatusLine helper.
 */
async function updateClaudeStatusLineGlobal(
  statusLineConfig: { type: string; command: string }
): Promise<void> {
  await writeGlobalStatusLine(statusLineConfig);
}

/**
 * Remove managed statusLine from global ~/.claude/settings.json.
 * Only removes if the current statusLine is a dev-pomogator managed command.
 * Preserves user-defined statusLines.
 */
async function cleanupLegacyStatusLine(): Promise<void> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = await readJsonSafe<Record<string, unknown>>(settingsPath, {});
  const statusLine = settings.statusLine as { type?: string; command?: string } | undefined;
  if (!statusLine?.command) return;

  if (isManagedStatusLineCommand(statusLine.command)) {
    delete settings.statusLine;
    await writeJsonAtomic(settingsPath, settings);
    console.log('  ✓ Removed legacy statusLine from global settings');
  }
}

export async function checkUpdate(options: UpdateOptions = {}): Promise<boolean> {
  const { force = false, platform } = options;
  
  // 1. Попытка получить lock
  if (!await acquireLock()) {
    // Другой процесс уже проверяет
    return false;
  }
  
  try {
    const config = await loadConfig();
    
    if (!config) {
      return false;
    }
    
    if (!config.autoUpdate && !force) {
      return false;
    }

    // 1.5. Forced recovery probe — bypass cooldown if `_shared/` is missing for any
    // tracked project. Without this, legacy installs (pre-commit 6b475e4) hit the
    // 24h cooldown gate and never recover, causing MODULE_NOT_FOUND in hooks.
    // Cheap: only fs.existsSync per project, no network. Wrapped in try/catch so
    // a permission/symlink error degrades gracefully to normal cooldown logic.
    let effectiveForce = false;
    try {
      const trackedProjects = Object.keys(config.installedShared ?? {});
      for (const projectPath of trackedProjects) {
        const entries = config.installedShared?.[projectPath];
        if (!entries || entries.length === 0) continue;
        if (hasMissingSharedDir(projectPath)) {
          effectiveForce = true;
          console.log(`  ⚠ _shared/ missing for ${projectPath} — forcing recovery sync`);
          break;
        }
      }
    } catch (probeError) {
      console.log(`  ⚠ _shared/ probe failed: ${getErrorMessage(probeError)} — falling back to normal cooldown`);
    }

    // 2. Проверка cooldown
    if (!force && !effectiveForce && !shouldCheckUpdate(config)) {
      return false;
    }
    
    let updated = false;
    const allBackedUp: ModifiedFile[] = [];

    // 2.5. Sync _shared/ utilities for every unique project path (FR-12).
    // The installer copies extensions/_shared/ → .dev-pomogator/tools/_shared/
    // via fs.copy. Updater historically didn't, leaving these files stale and
    // causing MODULE_NOT_FOUND for hook scripts that import from them.
    // Done ONCE per project (not per extension) since _shared/ is shared.
    {
      const sharedProjectPaths = new Set<string>();
      for (const installed of config.installedExtensions) {
        if (platform && installed.platform !== platform) continue;
        for (const projectPath of installed.projectPaths) {
          sharedProjectPaths.add(projectPath);
        }
      }
      if (!config.installedShared) config.installedShared = {};
      for (const projectPath of sharedProjectPaths) {
        try {
          const previousShared = config.installedShared[projectPath] ?? [];
          const sharedResult = await updateSharedFiles(projectPath, previousShared);
          if (sharedResult.written.length > 0 || sharedResult.removed.length > 0) {
            config.installedShared[projectPath] = sharedResult.written;
            console.log(`  ✓ Synced _shared/ utilities for ${projectPath} (${sharedResult.written.length} files)`);
          }
        } catch (error) {
          console.log(`  ⚠ _shared sync failed for ${projectPath}: ${getErrorMessage(error)}`);
        }
      }
    }

    // 3. Для каждого установленного extension
    for (const installed of config.installedExtensions) {
      // Filter by platform if specified
      if (platform && installed.platform !== platform) {
        continue;
      }
      
      try {
        // Получить манифест из GitHub
        const remote = await fetchExtensionManifest(installed.name);
        
        if (!remote) {
          continue;
        }
        
        // 4. Сравнить версии
        if (!semver.gt(remote.version, installed.version)) {
          continue;
        }
        
        // 5. Скачать и обновить файлы во всех projectPaths
        const commandFiles = remote.commandFiles?.[installed.platform] ?? [];
        const ruleFiles = remote.ruleFiles?.[installed.platform] ?? [];
        const toolFiles = remote.toolFiles ?? {};
        const skillFiles = installed.platform === 'claude' ? (remote.skillFiles ?? {}) : {};
        const hooks = remote.hooks?.[installed.platform] ?? {};

        // Migrate legacy pomogator/ rules to per-extension namespace
        for (const projectPath of installed.projectPaths) {
          await migrateRulesNamespace(installed, projectPath);
        }

        for (const projectPath of installed.projectPaths) {
          try {
            const managedEntry = ensureManagedEntry(installed, projectPath);
            const commandResult = await updateCommandFiles(
              installed.name,
              installed.platform,
              commandFiles,
              projectPath,
              managedEntry.commands
            );
            const ruleResult = await updateRuleFiles(
              installed.name,
              installed.platform,
              ruleFiles,
              projectPath,
              managedEntry.rules
            );
            const toolResult = await updateToolFiles(
              installed.name,
              toolFiles,
              projectPath,
              managedEntry.tools
            );
            const skillResult = await updateSkillFiles(
              installed.name,
              skillFiles,
              projectPath,
              managedEntry.skills
            );

            // Collect backed-up files
            allBackedUp.push(
              ...commandResult.backedUp,
              ...ruleResult.backedUp,
              ...toolResult.backedUp,
              ...skillResult.backedUp
            );

            const writtenCommandPaths = commandResult.written.map((e) => e.path);
            const writtenRulePaths = ruleResult.written.map((e) => e.path);
            const writtenToolPaths = toolResult.written.map((e) => e.path);
            const writtenSkillPaths = skillResult.written.map((e) => e.path);

            // Always remove stale files — even if some downloads failed.
            // Stale = files in previous config that are NOT in current extension.json.
            // Download failures don't change which files are stale.
            allBackedUp.push(
              ...await removeStaleFiles(projectPath, managedEntry.commands, writtenCommandPaths, installed.name)
            );
            managedEntry.commands = commandResult.written;

            allBackedUp.push(
              ...await removeStaleFiles(projectPath, managedEntry.rules, writtenRulePaths, installed.name)
            );
            managedEntry.rules = ruleResult.written;

            // FR-13: capture previous tool paths BEFORE overwriting managedEntry.tools
            // so we can prune empty parent dirs after stale files are removed.
            const previousToolPaths = getManagedPaths(managedEntry.tools).map(normalizeRelativePath);
            const writtenToolSet = new Set(writtenToolPaths.map(normalizeRelativePath));
            const removedToolPaths = previousToolPaths.filter(p => !writtenToolSet.has(p));

            allBackedUp.push(
              ...await removeStaleFiles(projectPath, managedEntry.tools, writtenToolPaths, installed.name)
            );
            managedEntry.tools = toolResult.written;

            // FR-13: prune any empty parent dirs left over after tool removal
            if (removedToolPaths.length > 0) {
              await pruneEmptyDirs(projectPath, removedToolPaths);
            }

            allBackedUp.push(
              ...await removeStaleFiles(projectPath, managedEntry.skills, writtenSkillPaths, installed.name)
            );
            managedEntry.skills = skillResult.written;

            const previousHooks = managedEntry.hooks ?? {};
            const updatedHooks = await updateClaudeHooksForProject(projectPath, hooks, previousHooks);
            managedEntry.hooks = updatedHooks;

            // Migrate: remove project-level statusLine (now global)
            {
              const projectSettingsPath = path.join(projectPath, '.claude', 'settings.json');
              const projectSettings = await readJsonSafe<Record<string, unknown>>(projectSettingsPath, {});
              if (projectSettings.statusLine) {
                delete projectSettings.statusLine;
                await writeJsonAtomic(projectSettingsPath, projectSettings);
              }
            }

            if (remote.postUpdate) {
              await runPostUpdateHook(remote, projectPath, installed.platform, true);
            }
          } catch (error) {
            if (error instanceof PostUpdateHookError) {
              throw error;
            }
            console.log(`  ⚠ Update failed for project ${projectPath}: ${error instanceof Error ? error.message : error}`);
          }
        }

        // 7. Update global statusLine for Claude platform extensions (once per extension, not per-project)
        if (installed.platform === 'claude' && remote.statusLine?.claude) {
          await updateClaudeStatusLineGlobal(remote.statusLine.claude);
        } else if (installed.platform === 'claude' && !remote.statusLine?.claude) {
          // Extension no longer provides statusLine — clean up managed entry from global settings
          await cleanupLegacyStatusLine();
        }

        // 8. Обновить версию в config
        installed.version = remote.version;
        updated = true;
        
      } catch (error) {
        if (error instanceof PostUpdateHookError) {
          throw error;
        }
        console.log(`  ⚠ Update failed for ${installed.name}: ${getErrorMessage(error)}`);
        logger.error(`Extension ${installed.name} update failed: ${formatErrorChain(error)}`);
      }
    }

    // 8. Check for MSYS path mangling artifacts (deduplicated across extensions)
    const scannedPaths = new Set<string>();
    for (const installed of config.installedExtensions) {
      if (platform && installed.platform !== platform) continue;
      for (const projectPath of installed.projectPaths) {
        if (scannedPaths.has(projectPath)) continue;
        scannedPaths.add(projectPath);
        const mangledArtifacts = detectMangledArtifacts(projectPath);
        if (mangledArtifacts.length > 0) {
          console.log(`  ⚠ MSYS path mangling artifacts in ${projectPath}: ${mangledArtifacts.join(', ')}`);
          console.log(`    Fix: add MSYS_NO_PATHCONV=1 to your environment. These directories can be safely deleted.`);
        }
      }
    }

    // 8.5. FR-14: regenerate plugin.json for every project to reflect current installedExtensions.
    // This catches stale entries from previously-removed extensions and updates the version
    // string. Skills metadata is not propagated by the updater (would need manifest re-fetch);
    // installer continues to populate it on next install. Plugin discovery only needs name+version.
    {
      const pluginProjectPaths = new Set<string>();
      for (const installed of config.installedExtensions) {
        if (platform && installed.platform !== platform) continue;
        for (const projectPath of installed.projectPaths) {
          pluginProjectPaths.add(projectPath);
        }
      }
      // Read upstream package version (same as installer does)
      let packageVersion = '0.0.0';
      try {
        const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
        const pkg = await readJsonSafe<{ version?: string }>(pkgPath, {});
        packageVersion = pkg.version || '0.0.0';
      } catch {
        // ignore — fallback version
      }
      const extensionNames = config.installedExtensions
        .filter(e => !platform || e.platform === platform)
        .map(e => e.name);
      for (const projectPath of pluginProjectPaths) {
        try {
          await writePluginJson({
            repoRoot: projectPath,
            packageVersion,
            extensionNames,
          });
        } catch (error) {
          console.log(`  ⚠ plugin.json regen failed for ${projectPath}: ${getErrorMessage(error)}`);
        }
      }
    }

    // 9. Write update report if any files were backed up (across all extensions)
    if (allBackedUp.length > 0) {
      console.log(`  📋 ${allBackedUp.length} user-modified file(s) backed up to .dev-pomogator/.user-overrides/`);
      await writeUpdateReport(allBackedUp);
    }
    
    // 10. Сохранить config
    config.lastCheck = new Date().toISOString();
    await saveConfig(config);
    
    return updated;
    
  } finally {
    // Всегда освобождаем lock
    await releaseLock();
  }
}
