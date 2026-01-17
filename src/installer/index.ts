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
      const extNames = existingConfig.installedExtensions?.map(e => e.name) || [];
      await install(existingConfig.platforms, existingConfig.autoUpdate, extNames);
      return;
    }
  }
  
  // 1. Platform selection
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
  
  // 2. Extension selection
  const allExtensions = await listExtensions();
  const availableExtensions = allExtensions.filter(ext =>
    ext.platforms.some(p => platforms.includes(p as Platform))
  );
  
  let selectedExtensions: string[] = [];
  
  if (availableExtensions.length > 0) {
    selectedExtensions = await checkbox({
      message: 'Select extensions to install:',
      choices: availableExtensions.map(ext => ({
        name: `${ext.name} — ${ext.description}`,
        value: ext.name,
        checked: true,
      })),
    });
    
    if (selectedExtensions.length === 0) {
      console.log(chalk.yellow('No extensions selected. Exiting.'));
      process.exit(0);
    }
  }
  
  // 3. Auto-update option (only for Cursor)
  let autoUpdate = false;
  if (platforms.includes('cursor')) {
    autoUpdate = await confirm({
      message: 'Enable auto-updates for Cursor? (checks every 24 hours)',
      default: true,
    });
  }
  
  // 4. Remember choice
  const rememberChoice = await confirm({
    message: 'Remember these choices for next time?',
    default: true,
  });
  
  // 5. Save config
  const config: Config = {
    platforms,
    autoUpdate,
    lastCheck: new Date().toISOString(),
    cooldownHours: 24,
    rememberChoice,
    installedExtensions: [],
  };
  
  await saveConfig(config);
  
  // 6. Install
  await install(platforms, autoUpdate, selectedExtensions);
}

async function install(
  platforms: Platform[],
  autoUpdate: boolean,
  extensions: string[]
): Promise<void> {
  console.log(chalk.cyan('\nInstalling...\n'));
  
  for (const platform of platforms) {
    if (platform === 'cursor') {
      await installCursor({ autoUpdate, extensions });
      console.log(chalk.green('✓ Cursor commands installed'));
    }
    
    if (platform === 'claude') {
      await installClaude({ extensions });
      console.log(chalk.green('✓ Claude Code plugin installed'));
    }
  }
  
  console.log(chalk.bold.green('\n✨ Installation complete!\n'));
  
  if (platforms.includes('cursor')) {
    console.log(chalk.cyan('Cursor: Type /suggest-rules in chat to generate project rules'));
    if (autoUpdate) {
      console.log(chalk.gray('         Auto-update enabled (checks every 24 hours)'));
    }
  }
  
  if (platforms.includes('claude')) {
    console.log(chalk.cyan('Claude Code: Use /suggest-rules command to generate project rules'));
  }
}
