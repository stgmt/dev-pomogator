import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { Config } from './schema.js';

const CONFIG_DIR = path.join(os.homedir(), '.dev-pomogator');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function loadConfig(): Promise<Config | null> {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      return await fs.readJson(CONFIG_FILE);
    }
  } catch {
    // Return null if config doesn't exist or is invalid
  }
  return null;
}

export async function saveConfig(config: Config): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
  
  // Set restrictive permissions on Unix
  if (process.platform !== 'win32') {
    await fs.chmod(CONFIG_FILE, 0o600);
  }
}

export async function updateLastCheck(): Promise<void> {
  const config = await loadConfig();
  if (config) {
    config.lastCheck = new Date().toISOString();
    await saveConfig(config);
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}
