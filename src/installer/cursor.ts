import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { listExtensions, getExtensionFiles, getExtensionRules, getExtensionTools, getExtensionHooks, runPostInstallHook, Extension } from './extensions.js';
import type { ManagedFileEntry, ManagedFiles } from '../config/schema.js';
import { findRepoRoot } from '../utils/repo.js';
import { RULES_SUBFOLDER, TOOLS_DIR } from '../constants.js';
import { getFileHash } from '../updater/content-hash.js';
import { collectFileHashes, addProjectPaths } from './shared.js';

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
  
  // Track managed files per extension for config
  const managedByExtension = new Map<string, ManagedFiles>();

  // 1. Установить commands (НЕ rules!)
  const targetDir = path.join(repoRoot, '.cursor', 'commands');
  await fs.ensureDir(targetDir);

  // Install each extension's cursor files
  for (const extension of extensionsToInstall) {
    const files = await getExtensionFiles(extension, 'cursor');
    const managedCommands: ManagedFileEntry[] = [];

    for (const srcFile of files) {
      if (srcFile.endsWith('.md')) {
        const fileName = path.basename(srcFile);
        const dest = path.join(targetDir, fileName);

        // Always overwrite to get latest version
        await fs.copy(srcFile, dest, { overwrite: true });

        const hash = await getFileHash(dest);
        if (hash) {
          managedCommands.push({ path: `.cursor/commands/${fileName}`, hash });
        }
      }
    }

    if (!managedByExtension.has(extension.name)) {
      managedByExtension.set(extension.name, {});
    }
    if (managedCommands.length > 0) {
      managedByExtension.get(extension.name)!.commands = managedCommands;
    }
  }

  // 2. Install rules to .cursor/rules/
  const rulesDir = path.join(repoRoot, '.cursor', 'rules', RULES_SUBFOLDER);
  await fs.ensureDir(rulesDir);

  for (const extension of extensionsToInstall) {
    const ruleFiles = await getExtensionRules(extension, 'cursor');
    const managedRules: ManagedFileEntry[] = [];

    for (const ruleFile of ruleFiles) {
      if (await fs.pathExists(ruleFile)) {
        const fileName = path.basename(ruleFile);
        const dest = path.join(rulesDir, fileName);
        await fs.copy(ruleFile, dest, { overwrite: true });
        console.log(`  ✓ Installed rule: ${fileName}`);

        const hash = await getFileHash(dest);
        if (hash) {
          managedRules.push({ path: `.cursor/rules/${RULES_SUBFOLDER}/${fileName}`, hash });
        }
      }
    }

    if (!managedByExtension.has(extension.name)) {
      managedByExtension.set(extension.name, {});
    }
    if (managedRules.length > 0) {
      managedByExtension.get(extension.name)!.rules = managedRules;
    }
  }

  // 3. Install tools to project/.dev-pomogator/tools/
  for (const extension of extensionsToInstall) {
    const tools = await getExtensionTools(extension);
    const managedTools: ManagedFileEntry[] = [];

    for (const [toolName, toolPath] of tools) {
      if (await fs.pathExists(toolPath)) {
        const dest = path.join(repoRoot, TOOLS_DIR, toolName);
        await fs.copy(toolPath, dest, { overwrite: true });
        console.log(`  ✓ Installed tool: ${toolName}/`);

        // Hash all files in the tool directory
        const toolFiles = await collectFileHashes(dest, path.join(TOOLS_DIR, toolName));
        managedTools.push(...toolFiles);
      }
    }

    if (!managedByExtension.has(extension.name)) {
      managedByExtension.set(extension.name, {});
    }
    if (managedTools.length > 0) {
      managedByExtension.get(extension.name)!.tools = managedTools;
    }
  }

  // 4. Install extension hooks to ~/.cursor/hooks/hooks.json
  const installedHooks = await installExtensionHooks(extensionsToInstall, repoRoot);

  // Store hook info in managed data
  for (const [extName, hookData] of Object.entries(installedHooks)) {
    if (!managedByExtension.has(extName)) {
      managedByExtension.set(extName, {});
    }
    managedByExtension.get(extName)!.hooks = hookData;
  }

  // 5. Run post-install hooks for extensions that have them
  for (const extension of extensionsToInstall) {
    if (extension.postInstall) {
      await runPostInstallHook(extension, repoRoot, 'cursor');
    }
  }

  // 6. Always persist managed data for tracking
  await addProjectPaths(repoRoot, extensionsToInstall, 'cursor', managedByExtension);

  // 7. Setup auto-update if enabled
  if (options.autoUpdate) {
    await setupGlobalScripts();
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
 * Returns map of extension name -> { eventName: commands[] } for managed tracking
 */
async function installExtensionHooks(extensions: Extension[], repoRoot: string): Promise<Record<string, Record<string, string[]>>> {
  const installedHooksByExtension: Record<string, Record<string, string[]>> = {};
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
        /\.dev-pomogator\/tools\//g,
        path.join(repoRoot, TOOLS_DIR).replace(/\\/g, '/') + '/'
      );
      extensionHooks[eventName].push(absoluteCommand);

      // Track per-extension hooks for managed data
      if (!installedHooksByExtension[extension.name]) {
        installedHooksByExtension[extension.name] = {};
      }
      if (!installedHooksByExtension[extension.name][eventName]) {
        installedHooksByExtension[extension.name][eventName] = [];
      }
      installedHooksByExtension[extension.name][eventName].push(absoluteCommand);
    }
  }

  // Skip if no hooks to install
  if (Object.keys(extensionHooks).length === 0) {
    return installedHooksByExtension;
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
  
  // Remove stale hooks that reference the same script but with different paths
  for (const [eventName, commands] of Object.entries(extensionHooks)) {
    const hooks = existingHooks.hooks[eventName];
    if (!hooks) continue;

    for (const newCommand of commands) {
      const escapedNew = newCommand.replace(/\\/g, '\\\\');
      // P1+P2 fix: extract script file via regex instead of path.basename()
      // This avoids false positives from substring matching and handles args correctly
      const scriptMatch = newCommand.match(/[\w.\-\\/]+\.(ts|js|py)/);
      const scriptName = scriptMatch ? path.basename(scriptMatch[0]) : '';

      if (!scriptName) continue;

      existingHooks.hooks[eventName] = existingHooks.hooks[eventName].filter(h => {
        if (h.command === escapedNew) return true; // keep the new one
        // Extract script basename from existing hook command for exact comparison
        const existingMatch = h.command.match(/[\w.\-\\/]+\.(ts|js|py)/);
        const existingScript = existingMatch ? path.basename(existingMatch[0]) : '';
        return existingScript !== scriptName;
      });
    }
  }

  // Write merged hooks
  await fs.writeJson(hooksFile, existingHooks, { spaces: 2 });

  return installedHooksByExtension;
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
  } else {
    console.log('  ⚠ check-update.bundle.cjs not found. Run "npm run build" first.');
  }
}

