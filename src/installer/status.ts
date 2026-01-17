import chalk from 'chalk';
import { loadConfig } from '../config/index.js';

export async function showStatus(): Promise<void> {
  const config = await loadConfig();
  
  if (!config) {
    console.log(chalk.yellow('No configuration found. Run `npx dev-pomogator` to install.'));
    return;
  }
  
  console.log(chalk.bold.cyan('\ndev-pomogator status\n'));
  
  console.log(`${chalk.bold('Version:')} ${config.installedVersion}`);
  console.log(`${chalk.bold('Platforms:')} ${config.platforms.join(', ')}`);
  console.log(`${chalk.bold('Auto-update:')} ${config.autoUpdate ? 'enabled' : 'disabled'}`);
  console.log(`${chalk.bold('Cooldown:')} ${config.cooldownHours} hours`);
  console.log(`${chalk.bold('Last check:')} ${config.lastCheck}`);
  console.log(`${chalk.bold('Remember choice:')} ${config.rememberChoice ? 'yes' : 'no'}`);
  
  console.log(chalk.bold('\nInstall paths:'));
  console.log(`  Cursor: ${config.installPath.cursor}`);
  console.log(`  Claude: ${config.installPath.claude}`);
  
  console.log('');
}
