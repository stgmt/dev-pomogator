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
import { resolveClaudeStatusLine } from '../utils/statusline.js';

interface UpdateOptions {
  force?: boolean;
  silent?: boolean;
  platform?: 'cursor' | 'claude';  // Filter updates by platform
}

interface CursorHooksJson {
  version: number;
  hooks: {
    [eventName: string]: { command: string }[];
  };
}

interface UpdateResult {
  written: ManagedFileEntry[];
  hadFailures: boolean;
  backedUp: ModifiedFile[];
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function resolveWithinProject(
  projectPath: string,
  relativePath: string
): string | null {
  const normalized = normalizeRelativePath(relativePath);
  if (path.isAbsolute(normalized)) {
    return null;
  }
  const base = path.resolve(projectPath);
  const resolved = path.resolve(base, normalized);
  const relative = path.relative(base, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

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
  platform: 'cursor' | 'claude',
  files: string[],
  projectPath: string,
  previousItems?: ManagedFiles['commands']
): Promise<UpdateResult> {
  if (files.length === 0) return { written: [], hadFailures: false, backedUp: [] };

  const platformDir = platform === 'claude' ? '.claude' : '.cursor';
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
  platform: 'cursor' | 'claude',
  files: string[],
  projectPath: string,
  previousItems?: ManagedFiles['rules']
): Promise<UpdateResult> {
  if (files.length === 0) return { written: [], hadFailures: false, backedUp: [] };

  const platformDir = platform === 'claude' ? '.claude' : '.cursor';
  const destDir = path.join(projectPath, platformDir, 'rules', RULES_SUBFOLDER);
  await fs.ensureDir(destDir);

  const written: ManagedFileEntry[] = [];
  const backedUp: ModifiedFile[] = [];
  let hadFailures = false;
  for (const relativePath of files) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    const fileName = path.basename(relativePath);
    const destFile = path.join(destDir, fileName);
    const relativeDest = normalizeRelativePath(
      path.join(platformDir, 'rules', RULES_SUBFOLDER, fileName)
    );

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

async function updateCursorHooksForProject(
  repoRoot: string,
  hooks: Record<string, string | { matcher?: string; command: string; timeout?: number }>,
  previousManagedHooks: Record<string, string[]> = {}
): Promise<Record<string, string[]>> {
  const hooksDir = path.join(os.homedir(), '.cursor', 'hooks');
  const hooksFile = path.join(hooksDir, 'hooks.json');

  const hasNewHooks = Object.keys(hooks).length > 0;
  if (!hasNewHooks && Object.keys(previousManagedHooks).length === 0) {
    return {};
  }

  let existingHooks: CursorHooksJson = { version: 1, hooks: {} };
  if (await fs.pathExists(hooksFile)) {
    try {
      existingHooks = await fs.readJson(hooksFile);
    } catch {
      // Invalid JSON, start fresh
    }
  }

  // Clean all managed hooks before re-adding to prevent path-format duplicates
  for (const eventName of Object.keys(existingHooks.hooks)) {
    existingHooks.hooks[eventName] = existingHooks.hooks[eventName].filter(
      h => !h.command.includes('.dev-pomogator/tools/')
        && !h.command.includes('.dev-pomogator\\\\tools\\\\')
        && !h.command.includes('.dev-pomogator\\tools\\')
    );
  }

  const nextManagedHooks: Record<string, string[]> = {};
  const nextAbsoluteByEvent: Record<string, string[]> = {};

  for (const [eventName, rawHook] of Object.entries(hooks)) {
    const command = typeof rawHook === 'string' ? rawHook : rawHook.command;
    if (!nextManagedHooks[eventName]) {
      nextManagedHooks[eventName] = [];
    }
    nextManagedHooks[eventName].push(command);

    const absoluteCommand = replaceNpxTsxWithPortable(resolveHookToolPaths(command, repoRoot));
    if (!nextAbsoluteByEvent[eventName]) {
      nextAbsoluteByEvent[eventName] = [];
    }
    nextAbsoluteByEvent[eventName].push(absoluteCommand.replace(/\\/g, '\\\\'));
  }

  for (const [eventName, commands] of Object.entries(nextAbsoluteByEvent)) {
    if (!existingHooks.hooks[eventName]) {
      existingHooks.hooks[eventName] = [];
    }
    for (const escapedCommand of commands) {
      const exists = existingHooks.hooks[eventName].some(
        (h) => h.command === escapedCommand
      );
      if (!exists) {
        existingHooks.hooks[eventName].push({ command: escapedCommand });
      }
    }
  }

  for (const [eventName, commands] of Object.entries(previousManagedHooks)) {
    const existing = existingHooks.hooks[eventName];
    if (!existing) {
      continue;
    }
    const nextSet = new Set(nextAbsoluteByEvent[eventName] ?? []);
    const previousAbsolute = commands.map((cmd) =>
      resolveHookToolPaths(cmd, repoRoot).replace(/\\/g, '\\\\')
    );
    const removeSet = new Set(previousAbsolute.filter((command) => !nextSet.has(command)));
    if (removeSet.size === 0) {
      continue;
    }
    existingHooks.hooks[eventName] = existing.filter((hook) => !removeSet.has(hook.command));
  }

  await fs.ensureDir(hooksDir);
  await writeJsonAtomic(hooksFile, existingHooks);

  return nextManagedHooks;
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
 * Update statusLine config in project .claude/settings.json
 * Managed statusLine is overwritten; user-defined is wrapped to coexist.
 */
async function updateClaudeStatusLineForProject(
  repoRoot: string,
  statusLineConfig: { type: string; command: string }
): Promise<void> {
  const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
  const settings = await readJsonSafe<Record<string, unknown>>(settingsPath, {});
  const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const globalSettings =
    settingsPath === globalSettingsPath
      ? settings
      : await fs.pathExists(globalSettingsPath)
        ? await readJsonSafe<Record<string, unknown>>(globalSettingsPath, {})
        : {};

  const resolved = resolveClaudeStatusLine({
    repoRoot,
    projectStatusLine: settings.statusLine as { type?: string; command?: string } | undefined,
    globalStatusLine: globalSettings.statusLine as { type?: string; command?: string } | undefined,
    statusLineConfig,
  });

  settings.statusLine = {
    type: resolved.type,
    command: resolved.command,
  };

  await writeJsonAtomic(settingsPath, settings);
}

export async function checkUpdate(options: UpdateOptions = {}): Promise<boolean> {
  const { force = false, silent = false, platform } = options;
  
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
    
    // 2. Проверка cooldown
    if (!force && !shouldCheckUpdate(config)) {
      return false;
    }
    
    let updated = false;
    const allBackedUp: ModifiedFile[] = [];
    
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
        const platformFiles = remote.files?.[installed.platform] ?? [];
        const commandFiles = platformFiles.length > 0
          ? platformFiles
          : [`${installed.platform}/commands/${installed.name}.md`];
        const ruleFiles = remote.rules?.[installed.platform] ?? [];
        const toolFiles = remote.toolFiles ?? {};
        const skillFiles = installed.platform === 'claude' ? (remote.skillFiles ?? {}) : {};
        const hooks = remote.hooks?.[installed.platform] ?? {};

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

            if (!commandResult.hadFailures) {
              allBackedUp.push(
                ...await removeStaleFiles(projectPath, managedEntry.commands, writtenCommandPaths, installed.name)
              );
              managedEntry.commands = commandResult.written;
            } else {
              console.log(`  ⚠ Skipping command cleanup for ${installed.name} in ${projectPath}`);
            }

            if (!ruleResult.hadFailures) {
              allBackedUp.push(
                ...await removeStaleFiles(projectPath, managedEntry.rules, writtenRulePaths, installed.name)
              );
              managedEntry.rules = ruleResult.written;
            } else {
              console.log(`  ⚠ Skipping rules cleanup for ${installed.name} in ${projectPath}`);
            }

            if (!toolResult.hadFailures) {
              allBackedUp.push(
                ...await removeStaleFiles(projectPath, managedEntry.tools, writtenToolPaths, installed.name)
              );
              managedEntry.tools = toolResult.written;
            } else {
              console.log(`  ⚠ Skipping tools cleanup for ${installed.name} in ${projectPath}`);
            }

            if (!skillResult.hadFailures) {
              allBackedUp.push(
                ...await removeStaleFiles(projectPath, managedEntry.skills, writtenSkillPaths, installed.name)
              );
              managedEntry.skills = skillResult.written;
            } else {
              console.log(`  ⚠ Skipping skills cleanup for ${installed.name} in ${projectPath}`);
            }

            const previousHooks = managedEntry.hooks ?? {};
            const updatedHooks = installed.platform === 'cursor'
              ? await updateCursorHooksForProject(projectPath, hooks, previousHooks)
              : await updateClaudeHooksForProject(projectPath, hooks, previousHooks);
            managedEntry.hooks = updatedHooks;

            // Update statusLine config for Claude platform extensions
            if (installed.platform === 'claude' && remote.statusLine?.claude) {
              await updateClaudeStatusLineForProject(projectPath, remote.statusLine.claude);
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

        // 7. Обновить версию в config
        installed.version = remote.version;
        updated = true;
        
      } catch (error) {
        if (error instanceof PostUpdateHookError) {
          throw error;
        }
        // Продолжить с другими extensions
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
