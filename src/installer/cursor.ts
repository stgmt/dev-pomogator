import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { listExtensions, getExtensionFiles, getExtensionRules, getExtensionTools, getExtensionHooks, runPostInstallHook, Extension } from './extensions.js';
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
  
  // Validate project directory
  if (!await fs.pathExists(repoRoot)) {
    throw new Error(`Project directory not found: ${repoRoot}`);
  }
  
  // Get extensions to install
  const allExtensions = await listExtensions();
  if (allExtensions.length === 0) {
    throw new Error('No extensions found. Check your dev-pomogator installation.');
  }
  
  const cursorExtensions = allExtensions.filter((ext) =>
    ext.platforms.includes('cursor')
  );
  
  if (cursorExtensions.length === 0) {
    throw new Error('No extensions support Cursor platform.');
  }
  
  const extensionsToInstall = options.extensions?.length
    ? cursorExtensions.filter((ext) => options.extensions!.includes(ext.name))
    : cursorExtensions;
  
  if (options.extensions?.length && extensionsToInstall.length === 0) {
    const available = cursorExtensions.map(e => e.name).join(', ');
    throw new Error(
      `None of the requested plugins found: ${options.extensions.join(', ')}. ` +
      `Available plugins: ${available}`
    );
  }
  
  // 1. Установить commands (НЕ rules!)
  const targetDir = path.join(repoRoot, '.cursor', 'commands');
  await fs.ensureDir(targetDir);
  
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
  
  // 4. Install extension hooks to ~/.cursor/hooks/hooks.json
  await installExtensionHooks(extensionsToInstall, repoRoot);
  
  // 5. Run post-install hooks for extensions that have them
  for (const extension of extensionsToInstall) {
    if (extension.postInstall) {
      await runPostInstallHook(extension, repoRoot, 'cursor');
    }
  }
  
  // 6. Setup auto-update if enabled
  // Note: claude-mem hooks are installed by memory.ts
  // Here we install extension hooks and track project paths
  if (options.autoUpdate) {
    await setupGlobalScripts();
    await addProjectPaths(repoRoot, extensionsToInstall);
  }
}

interface CursorHooksJson {
  version: number;
  hooks: {
    [eventName: string]: { command: string }[];
  };
}

/**
 * Install extension hooks to ~/.cursor/hooks/hooks.json
 * Merges hooks from extension.json with existing hooks
 */
async function installExtensionHooks(extensions: Extension[], repoRoot: string): Promise<void> {
  const homeDir = os.homedir();
  const hooksDir = path.join(homeDir, '.cursor', 'hooks');
  const hooksFile = path.join(hooksDir, 'hooks.json');
  
  // Collect all hooks from extensions
  const extensionHooks: { [eventName: string]: string[] } = {};
  
  for (const extension of extensions) {
    const hooks = getExtensionHooks(extension, 'cursor');
    for (const [eventName, command] of Object.entries(hooks)) {
      if (!extensionHooks[eventName]) {
        extensionHooks[eventName] = [];
      }
      // Replace relative paths with absolute paths
      const absoluteCommand = command.replace(
        /tools\//g,
        path.join(repoRoot, 'tools').replace(/\\/g, '/') + '/'
      );
      extensionHooks[eventName].push(absoluteCommand);
    }
  }
  
  // Skip if no hooks to install
  if (Object.keys(extensionHooks).length === 0) {
    return;
  }
  
  // Ensure hooks directory exists
  await fs.ensureDir(hooksDir);
  
  // Load existing hooks
  let existingHooks: CursorHooksJson = { version: 1, hooks: {} };
  if (await fs.pathExists(hooksFile)) {
    try {
      existingHooks = await fs.readJson(hooksFile);
    } catch {
      // Invalid JSON, start fresh
    }
  }
  
  // Merge extension hooks into existing hooks
  for (const [eventName, commands] of Object.entries(extensionHooks)) {
    if (!existingHooks.hooks[eventName]) {
      existingHooks.hooks[eventName] = [];
    }
    
    for (const command of commands) {
      // Escape backslashes for JSON on Windows
      const escapedCommand = command.replace(/\\/g, '\\\\');
      
      // Check if hook already exists (avoid duplicates)
      const exists = existingHooks.hooks[eventName].some(
        (h) => h.command === escapedCommand
      );
      
      if (!exists) {
        existingHooks.hooks[eventName].push({ command: escapedCommand });
        console.log(`  ✓ Installed hook: ${eventName} -> ${command.split(' ').slice(0, 2).join(' ')}...`);
      }
    }
  }
  
  // Write merged hooks
  await fs.writeJson(hooksFile, existingHooks, { spaces: 2 });
}

async function setupGlobalScripts(): Promise<void> {
  const homeDir = os.homedir();
  const scriptsDir = path.join(homeDir, '.dev-pomogator', 'scripts');
  await fs.ensureDir(scriptsDir);
  
  const scriptPath = path.join(scriptsDir, 'check-update.js');

  // Prefer bundled script from dist (matches runtime behavior)
  const distDir = path.resolve(__dirname, '..');
  const bundledScript = path.join(distDir, 'check-update.bundle.cjs');

  if (await fs.pathExists(bundledScript)) {
    await fs.copy(bundledScript, scriptPath, { overwrite: true });
    return;
  }

  // Fallback: use unbundled script from package root
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
