/**
 * Bundled auto-update script for dev-pomogator.
 * Called by Cursor/Claude Code stop hook from ~/.dev-pomogator/scripts/check-update.js
 * This file is bundled with esbuild to include all dependencies.
 * 
 * Usage:
 *   node check-update.js          # Default (Cursor)
 *   node check-update.js --claude # Called from Claude Code
 * 
 * Note: Shebang is added by esbuild via banner option.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { checkUpdate } from './index.js';
import { logger } from '../utils/logger.js';

const CONFIG_DIR = path.join(os.homedir(), '.dev-pomogator');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Parse command line arguments
const args = process.argv.slice(2);
const isClaudeCode = args.includes('--claude');
const platform = isClaudeCode ? 'claude' : 'cursor';

interface Config {
  autoUpdate?: boolean;
  lastCheck?: string;
  cooldownHours?: number;
  installedExtensions?: unknown[];
}

function loadConfig(): Config | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {
    logger.error('Failed to load config');
  }
  return null;
}

function shouldUpdate(config: Config | null): boolean {
  if (!config || !config.autoUpdate) return false;
  if (!config.lastCheck) return true;
  
  const lastCheck = new Date(config.lastCheck);
  const now = new Date();
  const hours = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);
  const cooldown = config.cooldownHours || 24;
  
  return hours >= cooldown;
}

async function main(): Promise<void> {
  logger.info(`=== Update check started (${platform}) ===`);
  
  const config = loadConfig();
  
  if (!shouldUpdate(config)) {
    logger.info('Skipped: cooldown not expired or autoUpdate disabled');
    return;
  }
  
  logger.info('Cooldown expired, checking for updates...');
  
  try {
    const updated = await checkUpdate({ silent: true, platform });
    if (updated) {
      logger.info(`Extensions updated successfully (${platform})`);
    } else {
      logger.info('No updates available');
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Update failed: ${message}`);
  }
}

main()
  .catch((e) => {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Fatal: ${message}`);
  })
  .finally(() => {
    logger.info('Update check completed');
    // Signal Cursor to continue
    process.stdout.write(JSON.stringify({ continue: true }));
  });
