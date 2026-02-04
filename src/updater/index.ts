import { loadConfig, saveConfig } from '../config/index.js';
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

async function updateCommandFiles(
  extensionName: string,
  platform: 'cursor' | 'claude',
  files: string[],
  projectPath: string
): Promise<void> {
  if (files.length === 0) return;

  const platformDir = platform === 'claude' ? '.claude' : '.cursor';
  const destDir = path.join(projectPath, platformDir, 'commands');
  await fs.ensureDir(destDir);

  for (const relativePath of files) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    if (!content) continue;

    const fileName = path.basename(relativePath);
    const destFile = path.join(destDir, fileName);
    await fs.writeFile(destFile, content, 'utf-8');
  }
}

async function updateToolFiles(
  extensionName: string,
  toolFiles: Record<string, string[]>,
  projectPath: string
): Promise<void> {
  const allFiles = Object.values(toolFiles).flat();
  if (allFiles.length === 0) return;

  for (const relativePath of allFiles) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    if (!content) continue;

    const destFile = path.join(projectPath, relativePath);
    await fs.ensureDir(path.dirname(destFile));
    await fs.writeFile(destFile, content, 'utf-8');
  }
}

async function updateCursorHooksForProject(
  repoRoot: string,
  hooks: Record<string, string>
): Promise<void> {
  if (Object.keys(hooks).length === 0) return;

  const hooksDir = path.join(os.homedir(), '.cursor', 'hooks');
  const hooksFile = path.join(hooksDir, 'hooks.json');

  let existingHooks: CursorHooksJson = { version: 1, hooks: {} };
  if (await fs.pathExists(hooksFile)) {
    try {
      existingHooks = await fs.readJson(hooksFile);
    } catch {
      // Invalid JSON, start fresh
    }
  }

  const extensionHooks: { [eventName: string]: string[] } = {};
  for (const [eventName, command] of Object.entries(hooks)) {
    if (!extensionHooks[eventName]) {
      extensionHooks[eventName] = [];
    }
    const absoluteCommand = command.replace(
      /tools\//g,
      path.join(repoRoot, 'tools').replace(/\\/g, '/') + '/'
    );
    extensionHooks[eventName].push(absoluteCommand);
  }

  for (const [eventName, commands] of Object.entries(extensionHooks)) {
    if (!existingHooks.hooks[eventName]) {
      existingHooks.hooks[eventName] = [];
    }
    for (const command of commands) {
      const escapedCommand = command.replace(/\\/g, '\\\\');
      const exists = existingHooks.hooks[eventName].some(
        (h) => h.command === escapedCommand || h.command.includes(command.split(' ')[1] || command)
      );
      if (!exists) {
        existingHooks.hooks[eventName].push({ command: escapedCommand });
      }
    }
  }

  await fs.ensureDir(hooksDir);
  await fs.writeJson(hooksFile, existingHooks, { spaces: 2 });
}

async function updateClaudeHooksForProject(
  repoRoot: string,
  hooks: Record<string, string>
): Promise<void> {
  if (Object.keys(hooks).length === 0) return;

  const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
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

  for (const [hookName, command] of Object.entries(hooks)) {
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

  await fs.ensureDir(path.dirname(settingsPath));
  await fs.writeJson(settingsPath, settings, { spaces: 2 });
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
        const toolFiles = remote.toolFiles ?? {};
        const hooks = remote.hooks?.[installed.platform] ?? {};

        for (const projectPath of installed.projectPaths) {
          try {
            await updateCommandFiles(installed.name, installed.platform, commandFiles, projectPath);
            await updateToolFiles(installed.name, toolFiles, projectPath);

            if (installed.platform === 'cursor') {
              await updateCursorHooksForProject(projectPath, hooks);
            } else {
              await updateClaudeHooksForProject(projectPath, hooks);
            }

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
