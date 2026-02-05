import { loadConfig, saveConfig } from '../config/index.js';
import type { InstalledExtension, ManagedFiles } from '../config/schema.js';
import { shouldCheckUpdate } from './cooldown.js';
import { fetchExtensionManifest, downloadExtensionFile } from './github.js';
import { acquireLock, releaseLock } from './lock.js';
import { runPostUpdateHook, PostUpdateHookError } from '../installer/extensions.js';
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
  written: string[];
  hadFailures: boolean;
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map(normalizeRelativePath)));
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
  projectPath: string
): Promise<UpdateResult> {
  if (files.length === 0) return { written: [], hadFailures: false };

  const platformDir = platform === 'claude' ? '.claude' : '.cursor';
  const destDir = path.join(projectPath, platformDir, 'commands');
  await fs.ensureDir(destDir);

  const written: string[] = [];
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
    await fs.writeFile(destFile, content, 'utf-8');
    written.push(relativeDest);
  }

  return { written: uniquePaths(written), hadFailures };
}

async function updateRuleFiles(
  extensionName: string,
  platform: 'cursor' | 'claude',
  files: string[],
  projectPath: string
): Promise<UpdateResult> {
  if (files.length === 0) return { written: [], hadFailures: false };

  const platformDir = platform === 'claude' ? '.claude' : '.cursor';
  const destDir = path.join(projectPath, platformDir, 'rules');
  await fs.ensureDir(destDir);

  const written: string[] = [];
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
    await fs.writeFile(destFile, content, 'utf-8');
    written.push(relativeDest);
  }

  return { written: uniquePaths(written), hadFailures };
}

async function updateToolFiles(
  extensionName: string,
  toolFiles: Record<string, string[]>,
  projectPath: string
): Promise<UpdateResult> {
  const allFiles = Object.values(toolFiles).flat();
  if (allFiles.length === 0) return { written: [], hadFailures: false };

  const written: string[] = [];
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
    await fs.writeFile(destFile, content, 'utf-8');
    written.push(normalizedPath);
  }

  return { written: uniquePaths(written), hadFailures };
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
            const previousManaged = {
              commands: managedEntry.commands ?? [],
              rules: managedEntry.rules ?? [],
              tools: managedEntry.tools ?? [],
            };

            const commandResult = await updateCommandFiles(
              installed.name,
              installed.platform,
              commandFiles,
              projectPath
            );
            const ruleResult = await updateRuleFiles(
              installed.name,
              installed.platform,
              ruleFiles,
              projectPath
            );
            const toolResult = await updateToolFiles(
              installed.name,
              toolFiles,
              projectPath
            );

            if (!commandResult.hadFailures) {
              await removeStaleFiles(projectPath, previousManaged.commands, commandResult.written);
              managedEntry.commands = commandResult.written;
            } else {
              console.log(`  ⚠ Skipping command cleanup for ${installed.name} in ${projectPath}`);
            }

            if (!ruleResult.hadFailures) {
              await removeStaleFiles(projectPath, previousManaged.rules, ruleResult.written);
              managedEntry.rules = ruleResult.written;
            } else {
              console.log(`  ⚠ Skipping rules cleanup for ${installed.name} in ${projectPath}`);
            }

            if (!toolResult.hadFailures) {
              await removeStaleFiles(projectPath, previousManaged.tools, toolResult.written);
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
    
    // 8. Сохранить config
    config.lastCheck = new Date().toISOString();
    await saveConfig(config);
    
    return updated;
    
  } finally {
    // Всегда освобождаем lock
    await releaseLock();
  }
}
