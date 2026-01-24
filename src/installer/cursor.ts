import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { listExtensions, getExtensionFiles, getExtensionRules, getExtensionTools, Extension } from './extensions.js';
import { loadConfig, saveConfig } from '../config/index.js';
import type { InstalledExtension } from '../config/schema.js';
import { findRepoRoot } from '../utils/repo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CursorOptions {
  autoUpdate: boolean;
  extensions?: string[];
}

export async function installCursor(options: CursorOptions): Promise<void> {
  // Find git repository root to install commands in the correct project directory
  const repoRoot = findRepoRoot();
  
  // 1. Установить commands (НЕ rules!)
  const targetDir = path.join(repoRoot, '.cursor', 'commands');
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
        
        // Always overwrite to get latest version
        await fs.copy(srcFile, dest, { overwrite: true });
      }
    }
  }
  
  // 2. Install rules to .cursor/rules/
  const rulesDir = path.join(repoRoot, '.cursor', 'rules');
  await fs.ensureDir(rulesDir);
  
  for (const extension of extensionsToInstall) {
    const ruleFiles = await getExtensionRules(extension, 'cursor');
    
    for (const ruleFile of ruleFiles) {
      if (await fs.pathExists(ruleFile)) {
        const fileName = path.basename(ruleFile);
        const dest = path.join(rulesDir, fileName);
        await fs.copy(ruleFile, dest, { overwrite: true });
        console.log(`  ✓ Installed rule: ${fileName}`);
      }
    }
  }
  
  // 3. Install tools to project/tools/
  for (const extension of extensionsToInstall) {
    const tools = await getExtensionTools(extension);
    
    for (const [toolName, toolPath] of tools) {
      if (await fs.pathExists(toolPath)) {
        const dest = path.join(repoRoot, 'tools', toolName);
        await fs.copy(toolPath, dest, { overwrite: true });
        console.log(`  ✓ Installed tool: ${toolName}/`);
      }
    }
  }
  
  // 4. Setup auto-update if enabled
  // Note: Hooks (claude-mem + updater) are installed globally by memory.ts
  // Here we only copy the check-update.js script and track project paths
  if (options.autoUpdate) {
    await setupGlobalScripts();
    await addProjectPaths(repoRoot, extensionsToInstall);
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
