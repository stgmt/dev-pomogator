import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_MEM_REPO = 'https://github.com/thedotmack/claude-mem.git';
// Always use marketplace directory - shared between Cursor and Claude Code
const CLAUDE_MEM_DIR = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', 'thedotmack');
const WORKER_PORT = 37777;

/**
 * Get the claude-mem directory (always marketplace location)
 */
function getClaudeMemDir(): string {
  return CLAUDE_MEM_DIR;
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Check if bun is installed
 */
async function checkBunInstalled(): Promise<boolean> {
  try {
    execSync('bun --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install bun (platform-specific)
 */
async function installBun(): Promise<void> {
  console.log(chalk.cyan('  Installing bun...'));
  
  const isWindows = process.platform === 'win32';
  
  try {
    if (isWindows) {
      execSync('powershell -c "irm bun.sh/install.ps1 | iex"', {
        stdio: 'inherit',
        timeout: 120000,
      });
    } else {
      execSync('curl -fsSL https://bun.sh/install | bash', {
        stdio: 'inherit',
        timeout: 120000,
        shell: '/bin/bash',
      });
    }
    console.log(chalk.green('  ✓ bun installed'));
  } catch (error) {
    throw new Error(`Failed to install bun: ${error}`);
  }
}

/**
 * Ensure bun is available
 */
async function ensureBun(): Promise<void> {
  const hasBun = await checkBunInstalled();
  if (!hasBun) {
    await installBun();
  }
}

/**
 * Check if worker is running on port 37777
 */
async function isWorkerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${WORKER_PORT}/api/readiness`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if claude-mem is installed (worker-service.cjs exists)
 */
async function isClaudeMemInstalled(): Promise<boolean> {
  const workerPath = path.join(CLAUDE_MEM_DIR, 'plugin', 'scripts', 'worker-service.cjs');
  return fs.pathExists(workerPath);
}

// ============================================================================
// Cursor Hooks JSON Generation
// ============================================================================

interface CursorHooksJson {
  version: number;
  hooks: {
    [eventName: string]: { command: string }[] | undefined;
  };
}

/**
 * Get the path to worker-service.cjs
 * Uses marketplace version if available, otherwise git clone
 */
function getWorkerServicePath(): string {
  return path.join(getClaudeMemDir(), 'plugin', 'scripts', 'worker-service.cjs');
}

/**
 * Get the path to dev-pomogator check-update.js script
 */
function getCheckUpdateScriptPath(): string {
  return path.join(os.homedir(), '.dev-pomogator', 'scripts', 'check-update.js');
}

/**
 * Get path to cursor-summarize wrapper script
 * This wrapper reads conversation from Cursor's SQLite and calls claude-mem API
 * Uses .ts extension since bun can execute TypeScript directly
 */
function getCursorSummarizeScriptPath(): string {
  return path.join(os.homedir(), '.dev-pomogator', 'scripts', 'cursor-summarize.ts');
}

/**
 * Generate Cursor hooks.json structure with node CLI commands
 * 
 * Includes:
 * - claude-mem hooks (session-init, context, observation, file-edit)
 * - cursor-summarize wrapper (reads SQLite + calls claude-mem API)
 * - dev-pomogator updater hook (check-update.js)
 */
function generateCursorHooksJson(): CursorHooksJson {
  const workerServicePath = getWorkerServicePath();
  const checkUpdatePath = getCheckUpdateScriptPath();
  const cursorSummarizePath = getCursorSummarizeScriptPath();
  
  const validateSpecsPath = getValidateSpecsScriptPath();
  
  // Escape backslashes for JSON on Windows
  const escapedWorkerPath = workerServicePath.replace(/\\/g, '\\\\');
  const escapedUpdatePath = checkUpdatePath.replace(/\\/g, '\\\\');
  const escapedSummarizePath = cursorSummarizePath.replace(/\\/g, '\\\\');
  const escapedValidateSpecsPath = validateSpecsPath.replace(/\\/g, '\\\\');
  
  // Helper to create claude-mem hook command (uses bun because worker-service.cjs requires bun:sqlite)
  const makeClaudeMemHook = (action: string): string => {
    return `bun "${escapedWorkerPath}" hook cursor ${action}`;
  };
  
  return {
    version: 1,
    hooks: {
      beforeSubmitPrompt: [
        { command: makeClaudeMemHook('session-init') },
        { command: makeClaudeMemHook('context') },
        { command: `npx tsx "${escapedValidateSpecsPath}"` },  // specs-workflow validator
      ],
      afterMCPExecution: [
        { command: makeClaudeMemHook('observation') },
      ],
      afterShellExecution: [
        { command: makeClaudeMemHook('observation') },
      ],
      afterFileEdit: [
        { command: makeClaudeMemHook('file-edit') },
      ],
      stop: [
        // Use our custom wrapper that reads Cursor's SQLite and calls claude-mem API
        // This fixes "Missing transcriptPath" error
        { command: `bun "${escapedSummarizePath}"` },
        { command: `npx tsx "${getValidateStepsScriptPath().replace(/\\/g, '\\\\')}"` },  // steps-validator
        { command: `node "${escapedUpdatePath}"` },  // dev-pomogator updater
      ],
    },
  };
}

// ============================================================================
// Cursor: claude-mem installation via git clone
// ============================================================================

/**
 * Clone and build claude-mem repository into marketplace directory
 * This makes it available for both Cursor and Claude Code
 */
async function cloneAndBuildRepo(): Promise<void> {
  console.log(chalk.cyan('  Cloning claude-mem repository...'));
  
  // Ensure bun is available
  await ensureBun();
  
  // Ensure parent directories exist
  await fs.ensureDir(path.dirname(CLAUDE_MEM_DIR));
  
  // Clone if not exists
  const packageJson = path.join(CLAUDE_MEM_DIR, 'package.json');
  if (!await fs.pathExists(packageJson)) {
    try {
      execSync(`git clone ${CLAUDE_MEM_REPO} "${CLAUDE_MEM_DIR}"`, {
        stdio: 'inherit',
        timeout: 300000, // 5 minutes for slow connections
      });
      console.log(chalk.green('  ✓ Repository cloned'));
    } catch (error) {
      throw new Error(`Failed to clone claude-mem: ${error}`);
    }
  } else {
    console.log(chalk.gray('  Repository already cloned, pulling latest...'));
    try {
      execSync('git pull', {
        cwd: CLAUDE_MEM_DIR,
        stdio: 'inherit',
        timeout: 60000,
      });
    } catch {
      console.log(chalk.yellow('  ⚠ Could not pull latest changes'));
    }
  }
  
  // Install dependencies
  console.log(chalk.cyan('  Installing dependencies...'));
  try {
    execSync('bun install', {
      cwd: CLAUDE_MEM_DIR,
      stdio: 'inherit',
      timeout: 180000, // 3 minutes
    });
    console.log(chalk.green('  ✓ Dependencies installed'));
  } catch (error) {
    throw new Error(`Failed to install dependencies: ${error}`);
  }
  
  // Build
  console.log(chalk.cyan('  Building claude-mem...'));
  try {
    execSync('bun run build', {
      cwd: CLAUDE_MEM_DIR,
      stdio: 'inherit',
      timeout: 180000, // 3 minutes
    });
    console.log(chalk.green('  ✓ Build complete'));
  } catch (error) {
    throw new Error(`Failed to build claude-mem: ${error}`);
  }
}

/**
 * Install Cursor hooks by directly generating hooks.json
 * 
 * Bypasses broken `bun run cursor:install` which looks for non-existent shell scripts.
 * Generates hooks.json with node CLI commands that call worker-service.cjs directly.
 */
export async function installCursorHooks(): Promise<void> {
  console.log(chalk.cyan('  Installing Cursor hooks...'));
  
  // Check if claude-mem is installed
  if (!await isClaudeMemInstalled()) {
    console.log(chalk.gray('    claude-mem not found, cloning repository...'));
    await cloneAndBuildRepo();
  } else {
    console.log(chalk.gray('    Using existing installation (shared with Claude Code)'));
  }
  
  // Verify worker-service.cjs exists
  const workerServicePath = getWorkerServicePath();
  if (!await fs.pathExists(workerServicePath)) {
    throw new Error(`worker-service.cjs not found at: ${workerServicePath}`);
  }
  
  // Generate hooks.json
  const hooksJson = generateCursorHooksJson();
  
  // Target directory: ~/.cursor/hooks/
  const cursorHooksDir = path.join(os.homedir(), '.cursor', 'hooks');
  const hooksFilePath = path.join(cursorHooksDir, 'hooks.json');
  
  // Create directory if not exists
  await fs.ensureDir(cursorHooksDir);
  
  // Merge with existing hooks if present
  let existingHooks: CursorHooksJson = { version: 1, hooks: {} };
  if (await fs.pathExists(hooksFilePath)) {
    try {
      existingHooks = await fs.readJson(hooksFilePath);
      console.log(chalk.gray('    Merging with existing hooks.json...'));
    } catch {
      console.log(chalk.yellow('    ⚠ Could not parse existing hooks.json, overwriting...'));
    }
  }
  
  // Merge hooks - combine arrays, don't overwrite
  const mergedHooks: CursorHooksJson = {
    version: 1,
    hooks: {},
  };
  
  // Get all unique event names from both sources
  const allEvents = new Set([
    ...Object.keys(existingHooks.hooks || {}),
    ...Object.keys(hooksJson.hooks || {}),
  ]);
  
  // Merge each event's hooks array
  for (const event of allEvents) {
    const existingArray = existingHooks.hooks[event] || [];
    const newArray = hooksJson.hooks[event as keyof typeof hooksJson.hooks] || [];
    
    // Combine arrays, avoiding duplicates by command
    const combined = [...existingArray];
    for (const hook of newArray) {
      const exists = combined.some((h) => h.command === hook.command);
      if (!exists) {
        combined.push(hook);
      }
    }
    
    mergedHooks.hooks[event] = combined;
  }
  
  // Write hooks.json
  await fs.writeJson(hooksFilePath, mergedHooks, { spaces: 2 });
  
  // Copy check-update.js script for dev-pomogator updater
  await copyCheckUpdateScript();
  
  // Copy cursor-summarize script (reads Cursor SQLite + calls claude-mem API)
  await copyCursorSummarizeScript();
  
  // Copy validate-specs script (specs-workflow validator)
  await copyValidateSpecsScript();
  
  // Copy validate-steps script (steps-validator for BDD)
  await copyValidateStepsScript();
  
  console.log(chalk.green('  ✓ Cursor hooks installed'));
  console.log(chalk.gray(`    Path: ${hooksFilePath}`));
}

/**
 * Copy bundled check-update script to ~/.dev-pomogator/scripts/
 * 
 * The bundle (check-update.bundle.js) is self-contained with all dependencies,
 * so no need to copy dist/updater or dist/config folders.
 * 
 * Structure after copy:
 * ~/.dev-pomogator/
 *   scripts/check-update.js  (copied from dist/check-update.bundle.cjs)
 *   logs/update.log          (created by the script when running)
 */
async function copyCheckUpdateScript(): Promise<void> {
  const devPomogatorDir = path.join(os.homedir(), '.dev-pomogator');
  const scriptsDir = path.join(devPomogatorDir, 'scripts');
  const destScript = path.join(scriptsDir, 'check-update.js');
  
  // Get source path: dist/check-update.bundle.cjs (relative to this file in dist/installer/)
  const distDir = path.resolve(__dirname, '..');  // This is /app/dist
  const bundledScript = path.join(distDir, 'check-update.bundle.cjs');
  
  await fs.ensureDir(scriptsDir);
  
  // Copy bundled script
  if (await fs.pathExists(bundledScript)) {
    await fs.copy(bundledScript, destScript, { overwrite: true });
    console.log(chalk.gray(`    Copied check-update.bundle.cjs to ${destScript}`));
  } else {
    console.log(chalk.yellow(`    ⚠ check-update.bundle.cjs not found. Run "npm run build" first.`));
  }
}

/**
 * Get path to validate-specs script
 * This script validates @featureN tags in .specs/ folders
 */
function getValidateSpecsScriptPath(): string {
  return path.join(os.homedir(), '.dev-pomogator', 'scripts', 'specs-validator', 'validate-specs.ts');
}

/**
 * Get path to validate-steps script
 * This script validates step definitions quality in BDD projects
 */
function getValidateStepsScriptPath(): string {
  return path.join(os.homedir(), '.dev-pomogator', 'scripts', 'steps-validator', 'validate-steps.ts');
}

/**
 * Copy validate-specs script to ~/.dev-pomogator/scripts/specs-validator/
 * 
 * This script validates @featureN tags in MD files against BDD scenarios.
 * It's executed with npx tsx (which supports TypeScript natively).
 * 
 * Note: Using separate subdirectory to avoid file conflicts with steps-validator.
 */
async function copyValidateSpecsScript(): Promise<void> {
  const devPomogatorDir = path.join(os.homedir(), '.dev-pomogator');
  const scriptsDir = path.join(devPomogatorDir, 'scripts');
  const destDir = path.join(scriptsDir, 'specs-validator');
  
  await fs.ensureDir(destDir);
  
  // Get source from installed extensions
  // First try: node_modules location (installed package)
  // Second try: development location (extensions folder)
  const extensionsDir = path.resolve(__dirname, '..', '..', 'extensions');
  const nodeModulesDir = path.resolve(__dirname, '..', '..', 'node_modules', 'dev-pomogator', 'extensions');
  
  const possibleSources = [
    path.join(extensionsDir, 'specs-workflow', 'tools', 'specs-validator'),
    path.join(nodeModulesDir, 'specs-workflow', 'tools', 'specs-validator'),
  ];
  
  for (const sourceDir of possibleSources) {
    const mainScript = path.join(sourceDir, 'validate-specs.ts');
    if (await fs.pathExists(mainScript)) {
      // Copy all validator files
      const filesToCopy = [
        'validate-specs.ts',
        'completeness.ts',
        'matcher.ts',
        'reporter.ts',
      ];
      
      for (const file of filesToCopy) {
        const src = path.join(sourceDir, file);
        const dest = path.join(destDir, file);
        if (await fs.pathExists(src)) {
          await fs.copy(src, dest, { overwrite: true });
        }
      }
      
      // Copy parsers subdirectory
      const parsersDir = path.join(sourceDir, 'parsers');
      const destParsersDir = path.join(destDir, 'parsers');
      if (await fs.pathExists(parsersDir)) {
        await fs.ensureDir(destParsersDir);
        await fs.copy(parsersDir, destParsersDir, { overwrite: true });
      }
      
      console.log(chalk.gray(`    Copied validate-specs to ${destDir}`));
      return;
    }
  }
  
  console.log(chalk.yellow(`    ⚠ validate-specs script not found`));
}

/**
 * Copy validate-steps (steps-validator) script to ~/.dev-pomogator/scripts/steps-validator/
 * 
 * This script validates step definitions quality in BDD projects.
 * It's executed with npx tsx (which supports TypeScript natively).
 * 
 * Note: Using separate subdirectory to avoid file conflicts with specs-validator.
 */
async function copyValidateStepsScript(): Promise<void> {
  const devPomogatorDir = path.join(os.homedir(), '.dev-pomogator');
  const scriptsDir = path.join(devPomogatorDir, 'scripts');
  const destDir = path.join(scriptsDir, 'steps-validator');
  
  await fs.ensureDir(destDir);
  
  // Get source from installed extensions
  const extensionsDir = path.resolve(__dirname, '..', '..', 'extensions');
  const nodeModulesDir = path.resolve(__dirname, '..', '..', 'node_modules', 'dev-pomogator', 'extensions');
  
  const possibleSources = [
    path.join(extensionsDir, 'specs-workflow', 'tools', 'steps-validator'),
    path.join(nodeModulesDir, 'specs-workflow', 'tools', 'steps-validator'),
  ];
  
  for (const sourceDir of possibleSources) {
    const mainScript = path.join(sourceDir, 'validate-steps.ts');
    if (await fs.pathExists(mainScript)) {
      // Copy all validator files
      const filesToCopy = [
        'validate-steps.ts',
        'types.ts',
        'config.ts',
        'detector.ts',
        'analyzer.ts',
        'reporter.ts',
        'logger.ts',
      ];
      
      for (const file of filesToCopy) {
        const src = path.join(sourceDir, file);
        const dest = path.join(destDir, file);
        if (await fs.pathExists(src)) {
          await fs.copy(src, dest, { overwrite: true });
        }
      }
      
      // Copy parsers subdirectory
      const parsersDir = path.join(sourceDir, 'parsers');
      const destParsersDir = path.join(destDir, 'parsers');
      if (await fs.pathExists(parsersDir)) {
        await fs.ensureDir(destParsersDir);
        await fs.copy(parsersDir, destParsersDir, { overwrite: true });
      }
      
      console.log(chalk.gray(`    Copied validate-steps to ${destDir}`));
      return;
    }
  }
  
  console.log(chalk.yellow(`    ⚠ validate-steps script not found`));
}

/**
 * Copy cursor-summarize script to ~/.dev-pomogator/scripts/
 * 
 * This script reads Cursor's SQLite database and calls claude-mem API.
 * It's executed with bun (which supports bun:sqlite and TypeScript natively).
 */
async function copyCursorSummarizeScript(): Promise<void> {
  const devPomogatorDir = path.join(os.homedir(), '.dev-pomogator');
  const scriptsDir = path.join(devPomogatorDir, 'scripts');
  const destScript = path.join(scriptsDir, 'cursor-summarize.ts');
  
  await fs.ensureDir(scriptsDir);
  
  // Copy TypeScript source directly (bun can execute .ts natively)
  // First try: adjacent to this compiled file (dev-pomogator/dist/hooks/cursor-summarize.ts)
  // Second try: source directory (dev-pomogator/src/hooks/cursor-summarize.ts)
  const distDir = path.resolve(__dirname, '..');
  const srcDir = path.resolve(__dirname, '..', '..', 'src');
  
  const possibleSources = [
    path.join(distDir, 'hooks', 'cursor-summarize.ts'),
    path.join(srcDir, 'hooks', 'cursor-summarize.ts'),
  ];
  
  for (const sourceScript of possibleSources) {
    if (await fs.pathExists(sourceScript)) {
      await fs.copy(sourceScript, destScript, { overwrite: true });
      console.log(chalk.gray(`    Copied cursor-summarize.ts to ${destScript}`));
      return;
    }
  }
  
  console.log(chalk.yellow(`    ⚠ cursor-summarize.ts script not found`));
}

/**
 * Start claude-mem worker using bun run worker:start
 */
export async function startClaudeMemWorker(): Promise<void> {
  console.log(chalk.cyan('  Starting claude-mem worker...'));
  
  // Check if worker is already running
  if (await isWorkerRunning()) {
    console.log(chalk.green('  ✓ claude-mem worker already running'));
    return;
  }
  
  // Ensure claude-mem is installed
  if (!await isClaudeMemInstalled()) {
    await cloneAndBuildRepo();
  }
  
  const claudeMemDir = getClaudeMemDir();
  
  // Start worker in background
  try {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Windows: use start /B to run in background
      spawn('cmd', ['/c', 'start', '/B', 'bun', 'run', 'worker:start'], {
        cwd: claudeMemDir,
        detached: true,
        stdio: 'ignore',
        shell: true,
      }).unref();
    } else {
      // Unix: use & to run in background
      spawn('bun', ['run', 'worker:start'], {
        cwd: claudeMemDir,
        detached: true,
        stdio: 'ignore',
        shell: true,
      }).unref();
    }
    
    // Wait for worker to start
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    // Verify worker started
    if (await isWorkerRunning()) {
      console.log(chalk.green('  ✓ claude-mem worker started'));
    } else {
      console.log(chalk.yellow('  ⚠ Worker may not have started. Check manually.'));
      console.log(chalk.gray(`  You can manually run: cd ${claudeMemDir} && bun run worker:start`));
    }
  } catch (error) {
    console.log(chalk.yellow(`  ⚠ Could not start worker: ${error}`));
  }
}

// ============================================================================
// Claude Code: claude-mem plugin installation
// ============================================================================

/**
 * Check if claude-mem plugin is installed in Claude Code
 */
export async function checkClaudeMemPluginInstalled(): Promise<boolean> {
  return isClaudeMemInstalled();
}

/**
 * Install claude-mem plugin for Claude Code (NO confirmation)
 */
export async function installClaudeMemPlugin(): Promise<void> {
  console.log(chalk.cyan('  Installing claude-mem plugin for Claude Code...'));
  
  try {
    // Add marketplace
    console.log(chalk.gray('    Adding marketplace...'));
    execSync('claude plugin marketplace add thedotmack/claude-mem', {
      stdio: 'inherit',
      timeout: 60000,
    });
    
    // Install plugin
    console.log(chalk.gray('    Installing plugin...'));
    execSync('claude plugin install claude-mem', {
      stdio: 'inherit',
      timeout: 60000,
    });
    
    console.log(chalk.green('  ✓ claude-mem plugin installed'));
  } catch (error) {
    throw new Error(`Failed to install claude-mem plugin: ${error}`);
  }
}

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Check if Cursor hooks are installed correctly with CURRENT paths
 * 
 * Validates:
 * 1. hooks.json exists
 * 2. Contains required hook actions (session-init, context, observation)
 * 3. Uses CURRENT worker-service.cjs path (will reinstall if path changed)
 * 4. No invalid old npm commands
 */
async function areCursorHooksInstalled(): Promise<boolean> {
  const hooksFile = path.join(os.homedir(), '.cursor', 'hooks', 'hooks.json');
  if (!await fs.pathExists(hooksFile)) {
    return false;
  }
  
  try {
    const hooks = await fs.readJson(hooksFile);
    const hooksStr = JSON.stringify(hooks);
    
    // Check for required hook actions
    const hasRequiredActions = 
      hooksStr.includes('hook cursor session-init') &&
      hooksStr.includes('hook cursor context') &&
      hooksStr.includes('hook cursor observation');
    
    if (!hasRequiredActions) {
      return false;
    }
    
    // Check that hooks use CURRENT worker-service.cjs path
    // This ensures hooks are updated if path changes
    // Note: JSON.stringify escapes backslashes, so we need to match the escaped version
    const expectedWorkerPath = getWorkerServicePath();
    // In JSON string, backslashes are double-escaped: \ -> \\ -> \\\\
    const escapedWorkerPath = expectedWorkerPath.replace(/\\/g, '\\\\\\\\');
    const hasCurrentWorkerPath = hooksStr.includes(escapedWorkerPath);
    
    if (!hasCurrentWorkerPath) {
      console.log(chalk.gray('  Hooks exist but claude-mem path outdated, will reinstall...'));
      return false;
    }
    
    // Check for dev-pomogator updater hook
    const expectedUpdatePath = getCheckUpdateScriptPath();
    const escapedUpdatePath = expectedUpdatePath.replace(/\\/g, '\\\\\\\\');
    const hasUpdaterHook = hooksStr.includes(escapedUpdatePath);
    
    if (!hasUpdaterHook) {
      console.log(chalk.gray('  Hooks exist but dev-pomogator updater missing, will reinstall...'));
      return false;
    }
    
    // Check for cursor-summarize wrapper (fixes "Missing transcriptPath" error)
    const expectedSummarizePath = getCursorSummarizeScriptPath();
    const escapedSummarizePath = expectedSummarizePath.replace(/\\/g, '\\\\\\\\');
    const hasSummarizeWrapper = hooksStr.includes(escapedSummarizePath);
    
    if (!hasSummarizeWrapper) {
      console.log(chalk.gray('  Hooks exist but cursor-summarize wrapper missing, will reinstall...'));
      return false;
    }
    
    // Check for validate-specs hook (specs-workflow validator)
    const expectedValidateSpecsPath = getValidateSpecsScriptPath();
    const escapedValidateSpecsPath = expectedValidateSpecsPath.replace(/\\/g, '\\\\\\\\');
    const hasValidateSpecsHook = hooksStr.includes(escapedValidateSpecsPath);
    
    if (!hasValidateSpecsHook) {
      console.log(chalk.gray('  Hooks exist but validate-specs hook missing, will reinstall...'));
      return false;
    }
    
    // Check for validate-steps hook (steps-validator for BDD)
    const expectedValidateStepsPath = getValidateStepsScriptPath();
    const escapedValidateStepsPath = expectedValidateStepsPath.replace(/\\/g, '\\\\\\\\');
    const hasValidateStepsHook = hooksStr.includes(escapedValidateStepsPath);
    
    if (!hasValidateStepsHook) {
      console.log(chalk.gray('  Hooks exist but validate-steps hook missing, will reinstall...'));
      return false;
    }
    
    // Check for INVALID hooks (old npm claude-mem commands that don't work)
    const hasInvalidHooks = hooksStr.includes('claude-mem cursor hook');
    
    return !hasInvalidHooks;
  } catch {
    return false;
  }
}

/**
 * Ensure claude-mem is installed and configured for the specified platform.
 * Runs AUTOMATICALLY without user confirmation.
 * 
 * For Cursor: Clones repo, builds, installs hooks, starts worker
 * For Claude Code: Installs plugin via marketplace
 */
export async function ensureClaudeMem(platform: 'cursor' | 'claude'): Promise<void> {
  console.log(chalk.cyan('\n🧠 Setting up persistent memory (claude-mem)...\n'));
  
  if (platform === 'cursor') {
    // Step 1: Check and install hooks (independent of worker)
    const hooksInstalled = await areCursorHooksInstalled();
    
    if (hooksInstalled) {
      console.log(chalk.green('  ✓ Cursor hooks already configured'));
      // Always update scripts (may have new versions)
      await copyCursorSummarizeScript();
      await copyValidateSpecsScript();
      await copyValidateStepsScript();
    } else {
      // installCursorHooks will check for marketplace first, clone only if needed
      await installCursorHooks();
    }
    
    // Step 2: Check and start worker (independent of hooks)
    const workerRunning = await isWorkerRunning();
    
    if (workerRunning) {
      console.log(chalk.green('  ✓ claude-mem worker already running'));
    } else {
      await startClaudeMemWorker();
    }
  }
  
  if (platform === 'claude') {
    // Check and install plugin
    const isInstalled = await checkClaudeMemPluginInstalled();
    
    if (!isInstalled) {
      await installClaudeMemPlugin();
    } else {
      console.log(chalk.green('  ✓ claude-mem plugin already installed'));
    }
  }
  
  console.log(chalk.green('\n✨ Persistent memory configured!\n'));
}
