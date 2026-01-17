import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { listExtensions, getExtensionFiles, Extension } from './extensions.js';
import { loadConfig, saveConfig } from '../config/index.js';
import type { InstalledExtension } from '../config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CursorOptions {
  autoUpdate: boolean;
  extensions?: string[];
}

export async function installCursor(options: CursorOptions): Promise<void> {
  const cwd = process.cwd();
  
  // 1. Установить commands (НЕ rules!)
  const targetDir = path.join(cwd, '.cursor', 'commands');
  await fs.ensureDir(targetDir);
  
  // Get extensions to install
  const allExtensions = await listExtensions();
  const cursorExtensions = allExtensions.filter((ext) =>
    ext.platforms.includes('cursor')
  );
  
  const extensionsToInstall = options.extensions?.length
    ? cursorExtensions.filter((ext) => options.extensions!.includes(ext.name))
    : cursorExtensions;
  
  // Install each extension's cursor files
  for (const extension of extensionsToInstall) {
    const files = await getExtensionFiles(extension, 'cursor');
    
    for (const srcFile of files) {
      if (srcFile.endsWith('.md')) {
        const fileName = path.basename(srcFile);
        const dest = path.join(targetDir, fileName);
        
        // Don't overwrite existing commands
        if (!(await fs.pathExists(dest))) {
          await fs.copy(srcFile, dest);
        }
      }
    }
  }
  
  // 2. Setup auto-update if enabled
  if (options.autoUpdate) {
    await setupGlobalScripts();
    await setupAutoUpdateHook(cwd);
    await addProjectPaths(cwd, extensionsToInstall);
  }
}

async function setupGlobalScripts(): Promise<void> {
  const homeDir = os.homedir();
  const scriptsDir = path.join(homeDir, '.dev-pomogator', 'scripts');
  await fs.ensureDir(scriptsDir);
  
  const scriptPath = path.join(scriptsDir, 'check-update.js');
  
  // Копировать скрипт из пакета
  const packageRoot = path.resolve(__dirname, '..', '..');
  const packageScript = path.join(packageRoot, 'scripts', 'check-update.js');
  
  if (await fs.pathExists(packageScript)) {
    await fs.copy(packageScript, scriptPath, { overwrite: true });
  }
}

async function setupAutoUpdateHook(cwd: string): Promise<void> {
  const hooksDir = path.join(cwd, '.cursor', 'hooks');
  const hooksFile = path.join(hooksDir, 'hooks.json');
  
  await fs.ensureDir(hooksDir);
  
  let hooks: { version: number; hooks: { stop?: Array<{ command: string }> } } = {
    version: 1,
    hooks: {},
  };
  
  // Load existing hooks if present
  if (await fs.pathExists(hooksFile)) {
    try {
      hooks = await fs.readJson(hooksFile);
    } catch {
      // Use default if parsing fails
    }
  }
  
  // Add update hook if not present
  const homeDir = os.homedir();
  const updateCommand = `node ${path.join(homeDir, '.dev-pomogator', 'scripts', 'check-update.js')}`;
  
  if (!hooks.hooks.stop) {
    hooks.hooks.stop = [];
  }
  
  const hasUpdateHook = hooks.hooks.stop.some(
    (hook) => hook.command.includes('dev-pomogator')
  );
  
  if (!hasUpdateHook) {
    hooks.hooks.stop.push({ command: updateCommand });
    await fs.writeJson(hooksFile, hooks, { spaces: 2 });
  }
}

async function addProjectPaths(projectPath: string, extensions: Extension[]): Promise<void> {
  let config = await loadConfig();
  
  if (!config) {
    // Создать новый config если не существует
    const { DEFAULT_CONFIG } = await import('../config/schema.js');
    config = { ...DEFAULT_CONFIG };
  }
  
  if (!config.installedExtensions) {
    config.installedExtensions = [];
  }
  
  for (const ext of extensions) {
    const existing = config.installedExtensions.find(
      (e: InstalledExtension) => e.name === ext.name && e.platform === 'cursor'
    );
    
    if (existing) {
      if (!existing.projectPaths.includes(projectPath)) {
        existing.projectPaths.push(projectPath);
      }
      existing.version = ext.version;
    } else {
      config.installedExtensions.push({
        name: ext.name,
        version: ext.version,
        platform: 'cursor',
        projectPaths: [projectPath],
      });
    }
  }
  
  await saveConfig(config);
}
