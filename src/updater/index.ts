import { loadConfig, saveConfig, updateLastCheck } from '../config/index.js';
import { shouldCheckUpdate } from './cooldown.js';
import { fetchLatestRelease, downloadRelease } from './github.js';
import { updateFiles } from './files.js';
import chalk from 'chalk';
import semver from 'semver';

interface UpdateOptions {
  force?: boolean;
  silent?: boolean;
}

export async function checkUpdate(options: UpdateOptions = {}): Promise<boolean> {
  const { force = false, silent = false } = options;
  
  const config = await loadConfig();
  
  if (!config) {
    if (!silent) {
      console.log(chalk.yellow('No configuration found. Run `npx dev-pomogator` first.'));
    }
    return false;
  }
  
  if (!config.autoUpdate && !force) {
    if (!silent) {
      console.log(chalk.yellow('Auto-update is disabled.'));
    }
    return false;
  }
  
  // Check cooldown (unless forced)
  if (!force && !shouldCheckUpdate(config)) {
    if (!silent) {
      console.log(chalk.gray('Skipping update check (cooldown active).'));
    }
    return false;
  }
  
  if (!silent) {
    console.log(chalk.cyan('Checking for updates...'));
  }
  
  try {
    const latestRelease = await fetchLatestRelease();
    
    if (!latestRelease) {
      await updateLastCheck();
      return false;
    }
    
    const latestVersion = latestRelease.tag_name.replace(/^v/, '');
    const currentVersion = config.installedVersion;
    
    if (semver.lte(latestVersion, currentVersion)) {
      if (!silent) {
        console.log(chalk.green(`Already up to date (v${currentVersion}).`));
      }
      await updateLastCheck();
      return false;
    }
    
    if (!silent) {
      console.log(chalk.cyan(`New version available: v${latestVersion} (current: v${currentVersion})`));
      console.log(chalk.cyan('Downloading update...'));
    }
    
    // Download and update
    const releaseData = await downloadRelease(latestRelease);
    await updateFiles(releaseData, config.platforms);
    
    // Update config
    config.installedVersion = latestVersion;
    config.lastCheck = new Date().toISOString();
    await saveConfig(config);
    
    if (!silent) {
      console.log(chalk.green(`✓ Updated to v${latestVersion}`));
    }
    
    return true;
  } catch (error) {
    if (!silent) {
      console.error(chalk.red('Update check failed:'), (error as Error).message);
    }
    return false;
  }
}
