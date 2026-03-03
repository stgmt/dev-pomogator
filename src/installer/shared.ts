import fs from 'fs-extra';
import path from 'path';
import { loadConfig, saveConfig } from '../config/index.js';
import type { InstalledExtension, ManagedFileEntry, ManagedFiles, Platform } from '../config/schema.js';
import type { Extension } from './extensions.js';
import { getFileHash } from '../updater/content-hash.js';

/**
 * Generate a cross-platform hook command that resolves ~/.dev-pomogator/scripts/<script>
 * at runtime using os.homedir(), so settings.json can sync across OS.
 */
export function makePortableScriptCommand(scriptName: string, args?: string): string {
  const cmd = `node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','${scriptName}'))"`;
  return args ? `${cmd} ${args}` : cmd;
}

/**
 * Recursively collect file hashes from a directory.
 * Returns ManagedFileEntry[] with relative paths prefixed by basePath.
 * basePath is normalized to forward slashes to avoid mixed separators on Windows.
 */
export async function collectFileHashes(dirPath: string, basePath: string): Promise<ManagedFileEntry[]> {
  // P3 fix: normalize basePath to forward slashes once
  const normalizedBase = basePath.replace(/\\/g, '/');
  const entries: ManagedFileEntry[] = [];
  const items = await fs.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    const relativePath = `${normalizedBase}/${item.name}`;

    if (item.isDirectory()) {
      // Skip runtime directories
      if (item.name === '__pycache__' || item.name === 'node_modules' || item.name === 'logs') continue;
      const subEntries = await collectFileHashes(fullPath, relativePath);
      entries.push(...subEntries);
    } else {
      const hash = await getFileHash(fullPath);
      if (hash) {
        entries.push({ path: relativePath, hash });
      }
    }
  }

  return entries;
}

/**
 * Add project path to config for tracking installed extensions.
 * Always called regardless of autoUpdate setting to persist managed data.
 */
export async function addProjectPaths(
  projectPath: string,
  extensions: Extension[],
  platform: Platform,
  managedByExtension?: Map<string, ManagedFiles>
): Promise<void> {
  let config = await loadConfig();

  if (!config) {
    const { DEFAULT_CONFIG } = await import('../config/schema.js');
    config = { ...DEFAULT_CONFIG };
  }

  if (!config.installedExtensions) {
    config.installedExtensions = [];
  }

  for (const ext of extensions) {
    const existing = config.installedExtensions.find(
      (e: InstalledExtension) => e.name === ext.name && e.platform === platform
    );

    if (existing) {
      if (!existing.projectPaths.includes(projectPath)) {
        existing.projectPaths.push(projectPath);
      }
      existing.version = ext.version;

      // P5 fix: merge managed data instead of overwriting
      const managedData = managedByExtension?.get(ext.name);
      if (managedData) {
        if (!existing.managed) existing.managed = {};
        existing.managed[projectPath] = { ...existing.managed[projectPath], ...managedData };
      }
    } else {
      const entry: InstalledExtension = {
        name: ext.name,
        version: ext.version,
        platform,
        projectPaths: [projectPath],
      };

      // Add managed files
      const managedData = managedByExtension?.get(ext.name);
      if (managedData) {
        entry.managed = { [projectPath]: managedData };
      }

      config.installedExtensions.push(entry);
    }
  }

  await saveConfig(config);
}
