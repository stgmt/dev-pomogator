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

interface ClaudeOptions {
  extensions?: string[]; // List of extension names to install, empty = all
  autoUpdate?: boolean;  // Enable auto-update via hooks
}

export async function installClaude(options: ClaudeOptions = {}): Promise<void> {
  const repoRoot = findRepoRoot();
  
  // Validate project directory
  if (!await fs.pathExists(repoRoot)) {
    throw new Error(`Project directory not found: ${repoRoot}`);
  }
  
  // Get all extensions that support claude
  const allExtensions = await listExtensions();
  if (allExtensions.length === 0) {
    throw new Error('No extensions found. Check your dev-pomogator installation.');
  }
  
  const claudeExtensions = allExtensions.filter((ext) =>
    ext.platforms.includes('claude')
  );
  
  if (claudeExtensions.length === 0) {
    throw new Error('No extensions support Claude Code platform.');
  }
  
  // Filter by requested extensions if specified
  const extensionsToInstall = options.extensions?.length
    ? claudeExtensions.filter((ext) => options.extensions!.includes(ext.name))
    : claudeExtensions;
  
  if (options.extensions?.length && extensionsToInstall.length === 0) {
    const available = claudeExtensions.map(e => e.name).join(', ');
    throw new Error(
      `None of the requested plugins found: ${options.extensions.join(', ')}. ` +
      `Available plugins: ${available}`
    );
  }
  
  // Track managed files per extension for config
  const managedByExtension = new Map<string, ManagedFiles>();

  // 1. Install commands to .claude/commands/ (in project directory)
  const commandsDir = path.join(repoRoot, '.claude', 'commands');
  await fs.ensureDir(commandsDir);

  for (const extension of extensionsToInstall) {
    const files = await getExtensionFiles(extension, 'claude');
    const managedCommands: ManagedFileEntry[] = [];

    for (const srcFile of files) {
      if (srcFile.endsWith('.md')) {
        const fileName = path.basename(srcFile);
        const dest = path.join(commandsDir, fileName);
        await fs.copy(srcFile, dest, { overwrite: true });
        console.log(`  ✓ Installed command: ${fileName}`);

        const hash = await getFileHash(dest);
        if (hash) {
          managedCommands.push({ path: `.claude/commands/${fileName}`, hash });
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

  // 2. Install rules to .claude/rules/ (in project directory)
  const rulesDir = path.join(repoRoot, '.claude', 'rules', RULES_SUBFOLDER);
  await fs.ensureDir(rulesDir);

  for (const extension of extensionsToInstall) {
    const ruleFiles = await getExtensionRules(extension, 'claude');
    const managedRules: ManagedFileEntry[] = [];

    for (const ruleFile of ruleFiles) {
      if (await fs.pathExists(ruleFile)) {
        const fileName = path.basename(ruleFile);
        const dest = path.join(rulesDir, fileName);
        await fs.copy(ruleFile, dest, { overwrite: true });
        console.log(`  ✓ Installed rule: ${fileName}`);

        const hash = await getFileHash(dest);
        if (hash) {
          managedRules.push({ path: `.claude/rules/${RULES_SUBFOLDER}/${fileName}`, hash });
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

  // 4. Install extension hooks to project .claude/settings.json
  const installedHooks = await installExtensionHooks(repoRoot, extensionsToInstall);

  // Store hook info in managed data
  for (const [extName, hookData] of Object.entries(installedHooks)) {
    if (!managedByExtension.has(extName)) {
      managedByExtension.set(extName, {});
    }
    managedByExtension.get(extName)!.hooks = hookData;
  }

  // 5. Generate .dev-pomogator/.claude-plugin/plugin.json (Claude Code plugin metadata)
  const pluginDir = path.join(repoRoot, '.dev-pomogator', '.claude-plugin');
  await fs.ensureDir(pluginDir);

  const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
  let packageVersion = '0.0.0';
  try {
    const pkg = await fs.readJson(packageJsonPath);
    packageVersion = pkg.version || '0.0.0';
  } catch {
    // fallback version if package.json not found
  }

  const pluginJsonContent = {
    name: 'dev-pomogator',
    version: packageVersion,
    description: `Installed extensions: ${extensionsToInstall.map(e => e.name).join(', ')}`,
  };

  const pluginJsonPath = path.join(pluginDir, 'plugin.json');
  await fs.writeJson(pluginJsonPath, pluginJsonContent, { spaces: 2 });
  console.log('  ✓ Generated .dev-pomogator/.claude-plugin/plugin.json');

  // Track plugin.json in managed files (first extension's tools)
  const pluginJsonHash = await getFileHash(pluginJsonPath);
  if (pluginJsonHash && extensionsToInstall.length > 0) {
    const firstExtName = extensionsToInstall[0].name;
    if (!managedByExtension.has(firstExtName)) {
      managedByExtension.set(firstExtName, {});
    }
    const firstExtManaged = managedByExtension.get(firstExtName)!;
    if (!firstExtManaged.tools) firstExtManaged.tools = [];
    firstExtManaged.tools.push({ path: '.dev-pomogator/.claude-plugin/plugin.json', hash: pluginJsonHash });
  }

  // 6. Run post-install hooks for extensions that have them
  for (const extension of extensionsToInstall) {
    if (extension.postInstall) {
      await runPostInstallHook(extension, repoRoot, 'claude');
    }
  }

  // 7. Always persist managed data for tracking
  await addProjectPaths(repoRoot, extensionsToInstall, 'claude', managedByExtension);

  // 8. Setup auto-update hooks if enabled
  if (options.autoUpdate !== false) {
    await setupClaudeHooks();
    await setupGlobalScripts();
  }
}

/**
 * Get the path to dev-pomogator check-update.js script
 */
function getCheckUpdateScriptPath(): string {
  return path.join(os.homedir(), '.dev-pomogator', 'scripts', 'check-update.js');
}

/**
 * Setup Claude Code hooks for auto-update
 * Hooks are stored in ~/.claude/settings.json
 */
async function setupClaudeHooks(): Promise<void> {
  const homeDir = os.homedir();
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');
  const checkUpdatePath = getCheckUpdateScriptPath();
  
  // Escape backslashes for JSON on Windows
  const escapedUpdatePath = checkUpdatePath.replace(/\\/g, '\\\\');
  
  // Load existing settings or create new
  let settings: Record<string, unknown> = {};
  if (await fs.pathExists(settingsPath)) {
    try {
      settings = await fs.readJson(settingsPath);
    } catch {
      console.log('  ⚠ Could not parse existing settings.json, creating new...');
    }
  }
  
  // Ensure hooks structure exists
  if (!settings.hooks) {
    settings.hooks = {};
  }
  
  const hooks = settings.hooks as Record<string, unknown[]>;
  
  // Add Stop hook for auto-update
  const updateHookCommand = `node "${escapedUpdatePath}" --claude`;
  
  // Check if Stop hooks exist
  if (!hooks.Stop) {
    hooks.Stop = [];
  }
  
  // Check if our hook already exists
  const stopHooks = hooks.Stop as Array<{ hooks?: Array<{ type: string; command: string }> }>;
  const hasUpdateHook = stopHooks.some((h) => 
    h.hooks?.some((hook) => hook.command?.includes('check-update.js'))
  );
  
  if (!hasUpdateHook) {
    stopHooks.push({
      hooks: [{
        type: 'command',
        command: updateHookCommand,
      }],
    });
  }
  
  // Ensure directory exists
  await fs.ensureDir(path.dirname(settingsPath));
  
  // Write settings
  await fs.writeJson(settingsPath, settings, { spaces: 2 });
  console.log('  ✓ Installed Claude Code hooks for auto-update');
}

/**
 * Copy bundled check-update script to ~/.dev-pomogator/scripts/
 */
async function setupGlobalScripts(): Promise<void> {
  const devPomogatorDir = path.join(os.homedir(), '.dev-pomogator');
  const scriptsDir = path.join(devPomogatorDir, 'scripts');
  const destScript = path.join(scriptsDir, 'check-update.js');
  
  // Get source path: dist/check-update.bundle.cjs (relative to this file in dist/installer/)
  const distDir = path.resolve(__dirname, '..');
  const bundledScript = path.join(distDir, 'check-update.bundle.cjs');
  
  await fs.ensureDir(scriptsDir);
  
  // Copy bundled script
  if (await fs.pathExists(bundledScript)) {
    await fs.copy(bundledScript, destScript, { overwrite: true });
  } else {
    console.log('  ⚠ check-update.bundle.cjs not found. Run "npm run build" first.');
  }
}


/**
 * Install extension hooks to project .claude/settings.json
 * Returns map of extension name -> { hookName: commands[] } for managed tracking
 */
async function installExtensionHooks(repoRoot: string, extensions: Extension[]): Promise<Record<string, Record<string, string[]>>> {
  const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
  const installedHooksByExtension: Record<string, Record<string, string[]>> = {};

  // Collect all hooks from extensions
  const allHooks: Record<string, Array<{ type: string; command: string; timeout?: number }>> = {};

  for (const ext of extensions) {
    const hooks = getExtensionHooks(ext, 'claude');

    for (const [hookName, command] of Object.entries(hooks)) {
      if (!allHooks[hookName]) {
        allHooks[hookName] = [];
      }

      // Check if this hook command already exists
      const exists = allHooks[hookName].some(h => h.command === command);
      if (!exists) {
        allHooks[hookName].push({
          type: 'command',
          command,
          timeout: 60,
        });
      }

      // Track per-extension hooks for managed data
      if (!installedHooksByExtension[ext.name]) {
        installedHooksByExtension[ext.name] = {};
      }
      if (!installedHooksByExtension[ext.name][hookName]) {
        installedHooksByExtension[ext.name][hookName] = [];
      }
      installedHooksByExtension[ext.name][hookName].push(command);
    }
  }
  
  // No hooks to install
  if (Object.keys(allHooks).length === 0) {
    return installedHooksByExtension;
  }
  
  // Load existing project settings or create new
  let settings: Record<string, unknown> = {};
  if (await fs.pathExists(settingsPath)) {
    try {
      settings = await fs.readJson(settingsPath);
    } catch {
      // Invalid JSON, start fresh
    }
  }
  
  // Ensure hooks structure exists
  if (!settings.hooks) {
    settings.hooks = {};
  }
  
  const existingHooks = settings.hooks as Record<string, unknown[]>;
  
  // Merge new hooks
  for (const [hookName, hookEntries] of Object.entries(allHooks)) {
    if (!existingHooks[hookName]) {
      existingHooks[hookName] = [];
    }
    
    const hookArray = existingHooks[hookName] as Array<{ matcher?: string; hooks?: Array<{ type: string; command: string }> }>;
    
    for (const hookEntry of hookEntries) {
      // Check if hook command already exists
      const commandExists = hookArray.some(h => 
        h.hooks?.some(hook => hook.command === hookEntry.command)
      );
      
      if (!commandExists) {
        hookArray.push({
          matcher: '',
          hooks: [hookEntry],
        });
      }
    }
  }
  
  // Ensure directory exists
  await fs.ensureDir(path.dirname(settingsPath));
  
  // Write settings
  await fs.writeJson(settingsPath, settings, { spaces: 2 });
  
  const hookCount = Object.values(allHooks).flat().length;
  if (hookCount > 0) {
    console.log(`  ✓ Installed ${hookCount} extension hook(s)`);
  }

  return installedHooksByExtension;
}
