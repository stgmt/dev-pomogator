import { loadConfig, saveConfig } from '../config/index.js';
import type { InstalledExtension, ManagedFiles, ManagedFileEntry } from '../config/schema.js';
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
  previous: string[] = [],
  next: string[] = []
): Promise<void> {
  const previousSet = new Set(previous.map(normalizeRelativePath));
  const nextSet = new Set(next.map(normalizeRelativePath));

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
      await fs.remove(destFile);
      console.log(`  - Removed stale file: ${relativePath}`);
    }
  }
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
  const destDir = path.join(projectPath, platformDir, 'rules');
  await fs.ensureDir(destDir);

  const written: ManagedFileEntry[] = [];
  const backedUp: ModifiedFile[] = [];
  let hadFailures = false;
  for (const relativePath of files) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    const fileName = path.basename(relativePath);
    const destFile = path.join(destDir, fileName);
    const relativeDest = normalizeRelativePath(
      path.join(platformDir, 'rules', fileName)
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
    written.push({ path: normalizedPath, hash: computeHash(content) });
  }

  return { written, hadFailures, backedUp };
}

async function updateCursorHooksForProject(
  repoRoot: string,
  hooks: Record<string, string>,
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

  const nextManagedHooks: Record<string, string[]> = {};
  const nextAbsoluteByEvent: Record<string, string[]> = {};

  for (const [eventName, command] of Object.entries(hooks)) {
    if (!nextManagedHooks[eventName]) {
      nextManagedHooks[eventName] = [];
    }
    nextManagedHooks[eventName].push(command);

    const absoluteCommand = command.replace(
      /tools\//g,
      path.join(repoRoot, 'tools').replace(/\\/g, '/') + '/'
    );
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
    const previousAbsolute = commands.map((command) =>
      command.replace(
        /tools\//g,
        path.join(repoRoot, 'tools').replace(/\\/g, '/') + '/'
      ).replace(/\\/g, '\\\\')
    );
    const removeSet = new Set(previousAbsolute.filter((command) => !nextSet.has(command)));
    if (removeSet.size === 0) {
      continue;
    }
    existingHooks.hooks[eventName] = existing.filter((hook) => !removeSet.has(hook.command));
  }

  await fs.ensureDir(hooksDir);
  await fs.writeJson(hooksFile, existingHooks, { spaces: 2 });

  return nextManagedHooks;
}

async function updateClaudeHooksForProject(
  repoRoot: string,
  hooks: Record<string, string>,
  previousManagedHooks: Record<string, string[]> = {}
): Promise<Record<string, string[]>> {
  const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
  const hasNewHooks = Object.keys(hooks).length > 0;

  if (!hasNewHooks && Object.keys(previousManagedHooks).length === 0) {
    return {};
  }

  let settings: Record<string, unknown> = {};
  if (await fs.pathExists(settingsPath)) {
    try {
      settings = await fs.readJson(settingsPath);
    } catch {
      // Invalid JSON, start fresh
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }
  const existingHooks = settings.hooks as Record<string, unknown[]>;

  const nextManagedHooks: Record<string, string[]> = {};

  for (const [hookName, command] of Object.entries(hooks)) {
    if (!nextManagedHooks[hookName]) {
      nextManagedHooks[hookName] = [];
    }
    nextManagedHooks[hookName].push(command);

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
        matcher: '',
        hooks: [{
          type: 'command',
          command,
          timeout: 60,
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
    const nextSet = new Set(nextManagedHooks[hookName] ?? []);
    const removeSet = new Set(commands.filter((command) => !nextSet.has(command)));
    if (removeSet.size === 0) {
      continue;
    }
    existingHooks[hookName] = hookArray.filter(
      (entry) => !entry.hooks?.some((hook) => removeSet.has(hook.command))
    );
  }

  await fs.ensureDir(path.dirname(settingsPath));
  await fs.writeJson(settingsPath, settings, { spaces: 2 });

  return nextManagedHooks;
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
        const hooks = remote.hooks?.[installed.platform] ?? {};

        for (const projectPath of installed.projectPaths) {
          try {
            const managedEntry = ensureManagedEntry(installed, projectPath);
            const previousManagedPaths = {
              commands: getManagedPaths(managedEntry.commands),
              rules: getManagedPaths(managedEntry.rules),
              tools: getManagedPaths(managedEntry.tools),
            };

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

            // Collect backed-up files
            allBackedUp.push(
              ...commandResult.backedUp,
              ...ruleResult.backedUp,
              ...toolResult.backedUp
            );

            const writtenCommandPaths = commandResult.written.map((e) => e.path);
            const writtenRulePaths = ruleResult.written.map((e) => e.path);
            const writtenToolPaths = toolResult.written.map((e) => e.path);

            if (!commandResult.hadFailures) {
              await removeStaleFiles(projectPath, previousManagedPaths.commands, writtenCommandPaths);
              managedEntry.commands = commandResult.written;
            } else {
              console.log(`  ⚠ Skipping command cleanup for ${installed.name} in ${projectPath}`);
            }

            if (!ruleResult.hadFailures) {
              await removeStaleFiles(projectPath, previousManagedPaths.rules, writtenRulePaths);
              managedEntry.rules = ruleResult.written;
            } else {
              console.log(`  ⚠ Skipping rules cleanup for ${installed.name} in ${projectPath}`);
            }

            if (!toolResult.hadFailures) {
              await removeStaleFiles(projectPath, previousManagedPaths.tools, writtenToolPaths);
              managedEntry.tools = toolResult.written;
            } else {
              console.log(`  ⚠ Skipping tools cleanup for ${installed.name} in ${projectPath}`);
            }

            const previousHooks = managedEntry.hooks ?? {};
            const updatedHooks = installed.platform === 'cursor'
              ? await updateCursorHooksForProject(projectPath, hooks, previousHooks)
              : await updateClaudeHooksForProject(projectPath, hooks, previousHooks);
            managedEntry.hooks = updatedHooks;

            if (remote.postUpdate) {
              await runPostUpdateHook(remote, projectPath, installed.platform, true);
            }
          } catch (error) {
            if (error instanceof PostUpdateHookError) {
              throw error;
            }
            // Пропустить недоступные проекты
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

    // 8. Write update report if any files were backed up (across all extensions)
    if (allBackedUp.length > 0) {
      console.log(`  📋 ${allBackedUp.length} user-modified file(s) backed up to .user-overrides/`);
      await writeUpdateReport(allBackedUp);
    }
    
    // 9. Сохранить config
    config.lastCheck = new Date().toISOString();
    await saveConfig(config);
    
    return updated;
    
  } finally {
    // Всегда освобождаем lock
    await releaseLock();
  }
}
