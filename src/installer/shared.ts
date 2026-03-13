import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { loadConfig, saveConfig } from '../config/index.js';
import type { InstalledExtension, ManagedFileEntry, ManagedFiles, Platform } from '../config/schema.js';
import type { Extension } from './extensions.js';
import { getFileHash } from '../updater/content-hash.js';
// TOOLS_DIR import removed — resolveHookToolPaths no longer bakes absolute paths

/**
 * Generate a cross-platform hook command that resolves ~/.dev-pomogator/scripts/<script>
 * at runtime using os.homedir(), so settings.json can sync across OS.
 */
export function makePortableScriptCommand(scriptName: string, args?: string): string {
  const cmd = `node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','${scriptName}'))"`;
  return args ? `${cmd} -- ${args}` : cmd;
}

/**
 * Generate a cross-platform hook command that runs a TypeScript file
 * via tsx-runner.js (which handles npx cache corruption with retry).
 *
 * Same portable pattern as makePortableScriptCommand — resolves
 * ~/.dev-pomogator/scripts/tsx-runner.js at runtime via os.homedir().
 */
export function makePortableTsxCommand(scriptPath: string, args?: string): string {
  const escaped = scriptPath.replace(/\\/g, '/');
  const runner = `node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','tsx-runner.js'))"`;
  return args ? `${runner} -- "${escaped}" ${args}` : `${runner} -- "${escaped}"`;
}

/**
 * Replace `npx tsx "SCRIPT"` or `npx tsx SCRIPT` in a hook command
 * with the portable tsx-runner command that handles cache corruption.
 */
export function replaceNpxTsxWithPortable(command: string): string {
  // Match: npx tsx "quoted/path" or npx tsx unquoted/path
  return command.replace(
    /\bnpx\s+tsx\s+"([^"]+)"/g,
    (_match, scriptPath) => makePortableTsxCommand(scriptPath)
  ).replace(
    /\bnpx\s+tsx\s+(\S+)/g,
    (_match, scriptPath) => makePortableTsxCommand(scriptPath)
  );
}

/**
 * Hook tool path resolver — currently a no-op.
 *
 * Previously converted relative `.dev-pomogator/tools/` paths to absolute.
 * Now tsx-runner.js handles path resolution at runtime via CWD-relative
 * lookup and git-root walk-up, making baked absolute paths unnecessary
 * and harmful for cross-platform use (Windows host + Linux devcontainer).
 */
export function resolveHookToolPaths(command: string, _repoRoot: string): string {
  return command;
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
 * Ensure every shell entrypoint under a copied tool directory is executable.
 * Accepts either a single file path or a directory path.
 */
export async function ensureExecutableShellScripts(targetPath: string): Promise<void> {
  if (!await fs.pathExists(targetPath)) {
    return;
  }

  const stat = await fs.stat(targetPath);

  if (stat.isDirectory()) {
    const items = await fs.readdir(targetPath, { withFileTypes: true });
    for (const item of items) {
      await ensureExecutableShellScripts(path.join(targetPath, item.name));
    }
    return;
  }

  if (!targetPath.endsWith('.sh')) {
    return;
  }

  await fs.chmod(targetPath, 0o755);
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

/**
 * Copy bundled scripts (check-update, tsx-runner) to ~/.dev-pomogator/scripts/
 * and ensure tsx is installed at ~/.dev-pomogator/node_modules/.bin/tsx.
 * @param distDir — path to the dist/ directory containing bundled scripts
 */
async function copyBundledScript(distDir: string, scriptsDir: string, srcName: string, destName?: string): Promise<void> {
  const src = path.join(distDir, srcName);
  const dest = path.join(scriptsDir, destName ?? srcName);
  if (await fs.pathExists(src)) {
    await fs.copy(src, dest, { overwrite: true });
  } else {
    console.log(`  ⚠ ${srcName} not found. Run "npm run build" first.`);
  }
}

export async function setupGlobalScripts(distDir: string): Promise<void> {
  const devPomogatorDir = path.join(os.homedir(), '.dev-pomogator');
  const scriptsDir = path.join(devPomogatorDir, 'scripts');
  await fs.ensureDir(scriptsDir);

  await copyBundledScript(distDir, scriptsDir, 'check-update.bundle.cjs', 'check-update.js');
  await copyBundledScript(distDir, scriptsDir, 'tsx-runner.js');
  await copyBundledScript(distDir, scriptsDir, 'statusline_render.cjs');
  await copyBundledScript(distDir, scriptsDir, 'statusline_wrapper.js');

  // Ensure tsx is available at ~/.dev-pomogator/node_modules/.bin/tsx (cross-platform)
  // This makes hooks work in ANY project, even those without local tsx or working npx
  await ensureHomeTsx(devPomogatorDir);
}

/**
 * Install tsx into ~/.dev-pomogator/ so tsx-runner.js can always find it.
 * Non-fatal: if npm install fails, tsx-runner still falls back to global/npx strategies.
 */
export async function ensureHomeTsx(devPomogatorDir: string): Promise<void> {
  const binName = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const tsxBin = path.join(devPomogatorDir, 'node_modules', '.bin', binName);

  // Skip if already installed
  if (await fs.pathExists(tsxBin)) return;

  const pkgJsonPath = path.join(devPomogatorDir, 'package.json');
  if (!await fs.pathExists(pkgJsonPath)) {
    await fs.writeJson(pkgJsonPath, {
      private: true,
      dependencies: { tsx: '^4.0.0' },
    }, { spaces: 2 });
  }

  try {
    execSync('npm install --no-audit --no-fund --ignore-scripts', {
      cwd: devPomogatorDir,
      stdio: 'pipe',
      timeout: 60000,
    });
  } catch {
    // Non-fatal — tsx-runner still has global/npx fallbacks
  }
}
