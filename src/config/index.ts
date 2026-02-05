import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { Config } from './schema.js';

const CONFIG_DIR = path.join(os.homedir(), '.dev-pomogator');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function loadConfig(): Promise<Config | null> {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      const config = await fs.readJson(CONFIG_FILE) as Config;
      return normalizeConfig(config);
    }
  } catch {
    // Return null if config doesn't exist or is invalid
  }
  return null;
}

function normalizeConfig(config: Config): Config {
  const normalized: Config = {
    ...config,
    installedExtensions: Array.isArray(config.installedExtensions)
      ? config.installedExtensions.map((ext) => ({
          ...ext,
          projectPaths: Array.isArray(ext.projectPaths) ? ext.projectPaths : [],
          managed: ext.managed ?? {},
        }))
      : [],
  };

  return normalized;
}

export async function saveConfig(config: Config): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
  const tempFile = path.join(CONFIG_DIR, 'config.json.tmp');
  await fs.writeJson(tempFile, config, { spaces: 2 });

  // Set restrictive permissions on Unix
  if (process.platform !== 'win32') {
    await fs.chmod(tempFile, 0o600);
  }

  await fs.move(tempFile, CONFIG_FILE, { overwrite: true });
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
