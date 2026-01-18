import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Cursor: claude-mem installation
// ============================================================================

/**
 * Check if claude-mem is installed globally
 */
export async function checkClaudeMemInstalled(): Promise<boolean> {
  try {
    execSync('claude-mem --version', { stdio: 'ignore' });
    return true;
  } catch {
    // Try npm list
    try {
      execSync('npm list -g claude-mem', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Install claude-mem globally via npm (NO confirmation)
 */
export async function installClaudeMemNpm(): Promise<void> {
  console.log(chalk.cyan('  Installing claude-mem globally...'));
  
  try {
    execSync('npm install -g claude-mem', { 
      stdio: 'inherit',
      timeout: 120000 // 2 minutes timeout
    });
    console.log(chalk.green('  ✓ claude-mem installed'));
  } catch (error) {
    throw new Error(`Failed to install claude-mem: ${error}`);
  }
}

/**
 * Install Cursor hooks using claude-mem CLI (always global ~/.cursor/hooks/)
 * Uses `claude-mem cursor install user` which handles everything automatically
 */
export async function installCursorHooks(): Promise<void> {
  console.log(chalk.cyan('  Installing Cursor hooks...'));
  
  try {
    // claude-mem cursor install handles:
    // - Creating ~/.cursor/hooks/ directory
    // - Copying hook scripts
    // - Creating/merging hooks.json
    execSync('claude-mem cursor install user', {
      stdio: 'inherit',
      timeout: 60000,
    });
    
    console.log(chalk.green('  ✓ Cursor hooks installed'));
  } catch (error) {
    // If claude-mem cursor install fails, try alternative approach
    console.log(chalk.yellow('  ⚠ claude-mem cursor install failed, trying manual setup...'));
    await manualHooksSetup();
  }
}

/**
 * Manual hooks setup as fallback
 */
async function manualHooksSetup(): Promise<void> {
  const homeDir = os.homedir();
  const hooksDir = path.join(homeDir, '.cursor', 'hooks');
  const hooksFile = path.join(hooksDir, 'hooks.json');
  
  await fs.ensureDir(hooksDir);
  
  // Create minimal hooks.json that uses claude-mem CLI
  const hooksConfig = {
    version: 1,
    hooks: {
      beforeSubmitPrompt: [
        { command: 'claude-mem cursor hook beforeSubmitPrompt' }
      ],
      afterMCPExecution: [
        { command: 'claude-mem cursor hook afterMCPExecution' }
      ],
      afterShellExecution: [
        { command: 'claude-mem cursor hook afterShellExecution' }
      ],
      afterFileEdit: [
        { command: 'claude-mem cursor hook afterFileEdit' }
      ],
      stop: [
        { command: 'claude-mem cursor hook stop' }
      ]
    }
  };
  
  // Load existing hooks if present and merge
  if (await fs.pathExists(hooksFile)) {
    try {
      const existing = await fs.readJson(hooksFile);
      
      // Merge: add claude-mem hooks to existing ones
      for (const [event, hooks] of Object.entries(hooksConfig.hooks)) {
        if (!existing.hooks[event]) {
          existing.hooks[event] = [];
        }
        
        // Check if claude-mem hook already exists
        const hasClaudeMemHook = existing.hooks[event].some(
          (h: { command: string }) => h.command.includes('claude-mem')
        );
        
        if (!hasClaudeMemHook) {
          existing.hooks[event].push(...(hooks as unknown[]));
        }
      }
      
      await fs.writeJson(hooksFile, existing, { spaces: 2 });
    } catch {
      // If parsing fails, write new config
      await fs.writeJson(hooksFile, hooksConfig, { spaces: 2 });
    }
  } else {
    await fs.writeJson(hooksFile, hooksConfig, { spaces: 2 });
  }
  
  console.log(chalk.green('  ✓ Cursor hooks configured (manual setup)'));
}

/**
 * Start claude-mem worker in background
 */
export async function startClaudeMemWorker(): Promise<void> {
  console.log(chalk.cyan('  Starting claude-mem worker...'));
  
  try {
    // Check if worker is already running
    try {
      const response = await fetch('http://127.0.0.1:37777/api/readiness');
      if (response.ok) {
        console.log(chalk.green('  ✓ claude-mem worker already running'));
        return;
      }
    } catch {
      // Worker not running, start it
    }
    
    // Start worker in background
    const child = spawn('claude-mem', ['start'], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
    
    child.unref();
    
    // Wait a bit for worker to start
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    console.log(chalk.green('  ✓ claude-mem worker started'));
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
  const homeDir = os.homedir();
  const pluginDir = path.join(homeDir, '.claude', 'plugins', 'marketplaces', 'thedotmack');
  
  return fs.pathExists(pluginDir);
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
 * Ensure claude-mem is installed and configured for the specified platform.
 * Runs AUTOMATICALLY without user confirmation.
 */
export async function ensureClaudeMem(platform: 'cursor' | 'claude'): Promise<void> {
  console.log(chalk.cyan('\n🧠 Setting up persistent memory (claude-mem)...\n'));
  
  if (platform === 'cursor') {
    // Check and install claude-mem
    const isInstalled = await checkClaudeMemInstalled();
    
    if (!isInstalled) {
      await installClaudeMemNpm();
    } else {
      console.log(chalk.green('  ✓ claude-mem already installed'));
    }
    
    // Install hooks (handles hooks.json internally)
    await installCursorHooks();
    
    // Start worker
    await startClaudeMemWorker();
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
