import { confirm, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { installCursor } from './cursor.js';
import { installClaude } from './claude.js';
import { listExtensions } from './extensions.js';
import { saveConfig, loadConfig } from '../config/index.js';
import type { Config, Platform } from '../config/schema.js';

export { listExtensions } from './extensions.js';

export async function runInstaller(): Promise<void> {
  console.log(chalk.bold.cyan('\n🚀 dev-pomogator installer\n'));
  
  const existingConfig = await loadConfig();
  
  if (existingConfig?.rememberChoice) {
    console.log(chalk.yellow('Found existing configuration.'));
    const useExisting = await confirm({
      message: 'Use existing settings?',
      default: true,
    });
    
    if (useExisting) {
      await install(existingConfig.platforms, existingConfig.autoUpdate);
      return;
    }
  }
  
  // Platform selection
  const platforms = await checkbox<Platform>({
    message: 'Select platform(s) to install:',
    choices: [
      { name: 'Cursor', value: 'cursor' },
      { name: 'Claude Code', value: 'claude' },
    ],
    required: true,
  });
  
  if (platforms.length === 0) {
    console.log(chalk.yellow('No platforms selected. Exiting.'));
    process.exit(0);
  }
  
  // Auto-update option (only for Cursor)
  let autoUpdate = false;
  if (platforms.includes('cursor')) {
    autoUpdate = await confirm({
      message: 'Enable auto-updates for Cursor? (checks on stop hook, 6h cooldown)',
      default: true,
    });
  }
  
  // Remember choice
  const rememberChoice = await confirm({
    message: 'Remember these choices for next time?',
    default: true,
  });
  
  // Save config
  const config: Config = {
    platforms,
    autoUpdate,
    lastCheck: new Date().toISOString(),
    cooldownHours: 6,
    installedVersion: process.env.npm_package_version || '0.1.0',
    rememberChoice,
    installPath: {
      cursor: '.cursor/rules',
      claude: '~/.claude/plugins/dev-pomogator',
    },
  };
  
  await saveConfig(config);
  
  // Install
  await install(platforms, autoUpdate);
}

async function install(platforms: Platform[], autoUpdate: boolean): Promise<void> {
  console.log(chalk.cyan('\nInstalling...\n'));
  
  for (const platform of platforms) {
    if (platform === 'cursor') {
      await installCursor({ autoUpdate });
      console.log(chalk.green('✓ Cursor rules installed'));
    }
    
    if (platform === 'claude') {
      await installClaude();
      console.log(chalk.green('✓ Claude Code plugin installed'));
    }
  }
  
  console.log(chalk.bold.green('\n✨ Installation complete!\n'));
  
  if (platforms.includes('cursor')) {
    console.log(chalk.cyan('Cursor: Use suggest-rules command to generate project rules'));
  }
  
  if (platforms.includes('claude')) {
    console.log(chalk.cyan('Claude Code: Use /suggest-rules command to generate project rules'));
  }
}
