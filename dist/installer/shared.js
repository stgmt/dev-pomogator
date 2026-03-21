import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { loadConfig, saveConfig } from '../config/index.js';
import { getFileHash } from '../updater/content-hash.js';
// TOOLS_DIR import removed — resolveHookToolPaths no longer bakes absolute paths
/**
 * Generate a cross-platform hook command that resolves ~/.dev-pomogator/scripts/<script>
 * at runtime using os.homedir(), so settings.json can sync across OS.
 */
export function makePortableScriptCommand(scriptName, args) {
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
export function makePortableTsxCommand(scriptPath, args) {
    const escaped = scriptPath.replace(/\\/g, '/');
    const runner = `node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','tsx-runner.js'))"`;
    return args ? `${runner} -- "${escaped}" ${args}` : `${runner} -- "${escaped}"`;
}
/**
 * Replace `npx tsx "SCRIPT"` or `npx tsx SCRIPT` in a hook command
 * with the portable tsx-runner command that handles cache corruption.
 */
export function replaceNpxTsxWithPortable(command) {
    // Match: npx tsx "quoted/path" or npx tsx unquoted/path
    return command.replace(/\bnpx\s+tsx\s+"([^"]+)"/g, (_match, scriptPath) => makePortableTsxCommand(scriptPath)).replace(/\bnpx\s+tsx\s+(\S+)/g, (_match, scriptPath) => makePortableTsxCommand(scriptPath));
}
/**
 * Hook tool path resolver — currently a no-op.
 *
 * Previously converted relative `.dev-pomogator/tools/` paths to absolute.
 * Now tsx-runner.js handles path resolution at runtime via CWD-relative
 * lookup and git-root walk-up, making baked absolute paths unnecessary
 * and harmful for cross-platform use (Windows host + Linux devcontainer).
 */
export function resolveHookToolPaths(command, _repoRoot) {
    return command;
}
/**
 * Recursively collect file hashes from a directory.
 * Returns ManagedFileEntry[] with relative paths prefixed by basePath.
 * basePath is normalized to forward slashes to avoid mixed separators on Windows.
 */
export async function collectFileHashes(dirPath, basePath) {
    // P3 fix: normalize basePath to forward slashes once
    const normalizedBase = basePath.replace(/\\/g, '/');
    const entries = [];
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        const relativePath = `${normalizedBase}/${item.name}`;
        if (item.isDirectory()) {
            // Skip runtime directories
            if (item.name === '__pycache__' || item.name === 'node_modules' || item.name === 'logs')
                continue;
            const subEntries = await collectFileHashes(fullPath, relativePath);
            entries.push(...subEntries);
        }
        else {
            const hash = await getFileHash(fullPath);
            if (hash) {
                entries.push({ path: relativePath, hash });
            }
        }
    }
    return entries;
}
/**
 * Remove files in dest that don't exist in source (stale/legacy cleanup).
 * Compares recursively — if a file exists in dest but not in source, it's deleted.
 * Skips runtime dirs (__pycache__, node_modules, logs).
 */
export async function removeOrphanedFiles(sourceDir, destDir) {
    if (!await fs.pathExists(destDir))
        return;
    const items = await fs.readdir(destDir, { withFileTypes: true });
    for (const item of items) {
        if (item.name === '__pycache__' || item.name === 'node_modules' || item.name === 'logs')
            continue;
        const destPath = path.join(destDir, item.name);
        const sourcePath = path.join(sourceDir, item.name);
        if (item.isDirectory()) {
            if (!await fs.pathExists(sourcePath)) {
                await fs.remove(destPath);
                console.log(`  - Removed orphaned dir: ${item.name}/`);
            }
            else {
                await removeOrphanedFiles(sourcePath, destPath);
            }
        }
        else {
            if (!await fs.pathExists(sourcePath)) {
                await fs.remove(destPath);
                console.log(`  - Removed orphaned file: ${item.name}`);
            }
        }
    }
}
/**
 * Ensure every shell entrypoint under a copied tool directory is executable.
 * Accepts either a single file path or a directory path.
 */
export async function ensureExecutableShellScripts(targetPath) {
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
export async function addProjectPaths(projectPath, extensions, platform, managedByExtension) {
    let config = await loadConfig();
    if (!config) {
        const { DEFAULT_CONFIG } = await import('../config/schema.js');
        config = { ...DEFAULT_CONFIG };
    }
    if (!config.installedExtensions) {
        config.installedExtensions = [];
    }
    for (const ext of extensions) {
        const existing = config.installedExtensions.find((e) => e.name === ext.name && e.platform === platform);
        if (existing) {
            if (!existing.projectPaths.includes(projectPath)) {
                existing.projectPaths.push(projectPath);
            }
            existing.version = ext.version;
            // P5 fix: merge managed data instead of overwriting
            const managedData = managedByExtension?.get(ext.name);
            if (managedData) {
                if (!existing.managed)
                    existing.managed = {};
                existing.managed[projectPath] = { ...existing.managed[projectPath], ...managedData };
            }
        }
        else {
            const entry = {
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
async function copyBundledScript(distDir, scriptsDir, srcName, destName, fallbackPaths) {
    const dest = path.join(scriptsDir, destName ?? srcName);
    // Primary location: dist/<srcName>
    const primary = path.join(distDir, srcName);
    if (await fs.pathExists(primary)) {
        await fs.copy(primary, dest, { overwrite: true });
        return;
    }
    // Try fallback paths (e.g., src/scripts/ for plain JS files)
    if (fallbackPaths) {
        for (const fallback of fallbackPaths) {
            if (await fs.pathExists(fallback)) {
                await fs.copy(fallback, dest, { overwrite: true });
                return;
            }
        }
    }
    console.log(`  ⚠ ${srcName} not found. Run "npm run build" first.`);
}
export async function setupGlobalScripts(distDir) {
    const devPomogatorDir = path.join(os.homedir(), '.dev-pomogator');
    const scriptsDir = path.join(devPomogatorDir, 'scripts');
    await fs.ensureDir(scriptsDir);
    // check-update.bundle.cjs has no source fallback (requires esbuild bundling)
    await copyBundledScript(distDir, scriptsDir, 'check-update.bundle.cjs', 'check-update.js');
    // tsx-runner.js is plain JS — fall back to src/scripts/ if dist/ copy missing
    const packageRoot = path.resolve(distDir, '..');
    await copyBundledScript(distDir, scriptsDir, 'tsx-runner.js', undefined, [
        path.join(packageRoot, 'src', 'scripts', 'tsx-runner.js'),
    ]);
    // launch-claude-tui.ps1 — PowerShell launcher for context-menu, no bundling needed
    await copyBundledScript(distDir, scriptsDir, 'launch-claude-tui.ps1', undefined, [
        path.join(packageRoot, 'scripts', 'launch-claude-tui.ps1'),
    ]);
    // statusline_render.cjs and statusline_wrapper.js removed — test progress shown in TUI, not Claude Code statusline
    // Ensure tsx is available at ~/.dev-pomogator/node_modules/.bin/tsx (cross-platform)
    // This makes hooks work in ANY project, even those without local tsx or working npx
    await ensureHomeTsx(devPomogatorDir);
    // Ensure Bun is available for claude-mem plugin hooks (prevents cold-start failures)
    await ensureHomeBun();
}
/**
 * Ensure Bun runtime is installed for claude-mem plugin hooks.
 * On cold start (devcontainer restart), claude-mem's SessionStart hooks
 * fail if Bun is not available. Non-fatal: skips silently on failure.
 */
export async function ensureHomeBun() {
    // Check common Bun locations
    const homeDir = os.homedir();
    const bunPaths = [
        path.join(homeDir, '.bun', 'bin', process.platform === 'win32' ? 'bun.exe' : 'bun'),
    ];
    // Also check PATH
    try {
        execSync(process.platform === 'win32' ? 'where bun' : 'which bun', {
            stdio: 'pipe',
            timeout: 5000,
        });
        return; // Bun found on PATH
    }
    catch {
        // Not on PATH — check known locations
    }
    for (const bunPath of bunPaths) {
        if (await fs.pathExists(bunPath))
            return; // Already installed
    }
    // Install Bun
    try {
        if (process.platform === 'win32') {
            execSync('powershell -Command "irm bun.sh/install.ps1 | iex"', {
                stdio: 'pipe',
                timeout: 60000,
            });
        }
        else {
            execSync('curl -fsSL https://bun.sh/install | bash', {
                stdio: 'pipe',
                timeout: 60000,
                shell: '/bin/bash',
            });
        }
    }
    catch {
        // Non-fatal — claude-mem's smart-install.js will handle it
    }
}
/**
 * Install tsx into ~/.dev-pomogator/ so tsx-runner.js can always find it.
 * Non-fatal: if npm install fails, tsx-runner still falls back to global/npx strategies.
 */
export async function ensureHomeTsx(devPomogatorDir) {
    const binName = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
    const tsxBin = path.join(devPomogatorDir, 'node_modules', '.bin', binName);
    // Skip if already installed
    if (await fs.pathExists(tsxBin))
        return;
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
    }
    catch {
        // Non-fatal — tsx-runner still has global/npx fallbacks
    }
}
//# sourceMappingURL=shared.js.map