import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import crossSpawn from 'cross-spawn';
import chalk from 'chalk';
import { writeJsonAtomic } from '../utils/atomic-json.js';
import { getErrorMessage } from '../utils/logger.js';
// ============================================================================
// Constants
// ============================================================================
const CLAUDE_MEM_REPO = 'https://github.com/thedotmack/claude-mem.git';
// Module-level logger set by ensureClaudeMem, used by inner functions
let _installLogger;
// Always use marketplace directory for Claude Code
const CLAUDE_MEM_DIR = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', 'thedotmack');
const WORKER_PORT = 37777;
const CHROMA_PORT = 8000;
/**
 * Get the claude-mem directory (always marketplace location)
 */
function getClaudeMemDir() {
    return CLAUDE_MEM_DIR;
}
// ============================================================================
// Utility functions
// ============================================================================
/**
 * Check if bun is installed
 */
async function checkBunInstalled() {
    try {
        execSync('bun --version', { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Install bun (platform-specific)
 */
async function installBun() {
    console.log(chalk.cyan('  Installing bun...'));
    const isWindows = process.platform === 'win32';
    try {
        if (isWindows) {
            execSync('powershell -c "irm bun.sh/install.ps1 | iex"', {
                stdio: 'inherit',
                timeout: 120000,
            });
        }
        else {
            execSync('curl -fsSL https://bun.sh/install | bash', {
                stdio: 'inherit',
                timeout: 120000,
                shell: '/bin/bash',
            });
        }
        // Add bun to PATH for current process (installer updated ~/.bashrc
        // but current Node.js process doesn't see it until shell restart)
        const bunBinDir = path.join(os.homedir(), '.bun', 'bin');
        if (!process.env.PATH?.includes(bunBinDir)) {
            process.env.PATH = `${bunBinDir}${path.delimiter}${process.env.PATH}`;
        }
        console.log(chalk.green('  ✓ bun installed'));
    }
    catch (error) {
        throw new Error(`Failed to install bun: ${error}`);
    }
}
/**
 * Ensure bun is available
 */
async function ensureBun() {
    const hasBun = await checkBunInstalled();
    if (!hasBun) {
        await installBun();
    }
}
/**
 * Check if worker is running on port 37777
 */
async function isWorkerRunning() {
    try {
        const response = await fetch(`http://127.0.0.1:${WORKER_PORT}/api/health`);
        return response.ok;
    }
    catch {
        return false;
    }
}
/**
 * Check if claude-mem repo is cloned and built (worker-service.cjs exists).
 * Checks file presence for plugin availability.
 */
async function isClaudeMemRepoCloned() {
    const workerPath = path.join(CLAUDE_MEM_DIR, 'plugin', 'scripts', 'worker-service.cjs');
    return fs.pathExists(workerPath);
}
// ============================================================================
// Chroma vector DB dependency management
// ============================================================================
/**
 * Check if Chroma server is running on port 8000
 */
async function isChromaRunning() {
    try {
        const response = await fetch(`http://127.0.0.1:${CHROMA_PORT}/api/v2/heartbeat`, {
            signal: AbortSignal.timeout(3000),
        });
        return response.ok;
    }
    catch {
        return false;
    }
}
/**
 * Install a Python package with PEP 668 compatibility.
 * Cascade: pip3 --user → venv fallback → throw
 */
function pipInstall(pkg) {
    const isWindows = process.platform === 'win32';
    // Strategy 1: pip3 install --user (works on PEP 668 systems)
    try {
        const pip = isWindows ? 'pip' : 'pip3';
        execSync(`${pip} install --user ${pkg}`, {
            stdio: 'inherit',
            timeout: 180000,
        });
        // Ensure ~/.local/bin is in PATH for current process (pip --user installs there on Linux)
        if (!isWindows) {
            const localBin = path.join(os.homedir(), '.local', 'bin');
            if (!process.env.PATH?.includes(localBin)) {
                process.env.PATH = `${localBin}${path.delimiter}${process.env.PATH}`;
            }
        }
        return;
    }
    catch { /* --user failed, try venv */ }
    // Strategy 2: venv fallback
    const venvDir = path.join(os.homedir(), '.dev-pomogator', '.venv');
    const venvPip = isWindows
        ? path.join(venvDir, 'Scripts', 'pip.exe')
        : path.join(venvDir, 'bin', 'pip');
    const python = isWindows ? 'python' : 'python3';
    try {
        if (!fs.existsSync(venvPip)) {
            execSync(`${python} -m venv "${venvDir}"`, { stdio: 'inherit', timeout: 60000 });
        }
        execSync(`"${venvPip}" install ${pkg}`, { stdio: 'inherit', timeout: 180000 });
        return;
    }
    catch { /* venv also failed */ }
    throw new Error(`Could not install ${pkg} (tried --user and venv)`);
}
/**
 * Find Python chromadb's chroma executable path.
 * Searches pip user install, venv, Scripts dirs, and PATH.
 * Returns the path to chroma.exe (Windows) or chroma (Unix), or null if not found.
 */
function findPythonChroma() {
    const isWindows = process.platform === 'win32';
    const chromaBin = isWindows ? 'chroma.exe' : 'chroma';
    // Strategy 1: pip show chromadb → derive Scripts path
    for (const pip of isWindows ? ['pip'] : ['pip3', 'pip']) {
        try {
            const location = execSync(`${pip} show chromadb`, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 10000,
            });
            const locationMatch = location.match(/Location:\s*(.+)/);
            if (locationMatch) {
                const scriptsDir = path.join(path.dirname(locationMatch[1].trim()), 'Scripts');
                const chromaPath = path.join(scriptsDir, chromaBin);
                if (fs.existsSync(chromaPath))
                    return chromaPath;
            }
        }
        catch { /* pip not available or chromadb not installed */ }
    }
    // Strategy 2: check well-known locations
    const knownPaths = [
        // pip --user install on Linux
        path.join(os.homedir(), '.local', 'bin', chromaBin),
        // venv fallback
        path.join(os.homedir(), '.dev-pomogator', '.venv', 'bin', chromaBin),
        path.join(os.homedir(), '.dev-pomogator', '.venv', 'Scripts', chromaBin),
    ];
    for (const p of knownPaths) {
        if (fs.existsSync(p))
            return p;
    }
    // Strategy 3: which/where
    try {
        const chromaPath = execSync(isWindows ? `where ${chromaBin}` : `which ${chromaBin}`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000,
        }).trim().split('\n')[0].trim();
        if (chromaPath && fs.existsSync(chromaPath))
            return chromaPath;
    }
    catch { /* not in PATH */ }
    return null;
}
/**
 * Ensure Chroma server can start by fixing the chroma binary resolution.
 *
 * Problem chain (Windows x64):
 * 1. bun install creates node_modules with chromadb, but npm .cmd shims are missing
 * 2. npm chromadb@3.3.x CLI doesn't support Windows x64 (only ARM64 has binaries)
 * 3. ChromaServerManager looks for chroma.cmd in node_modules/.bin/
 *
 * Fix: Install Python chromadb (which works on all platforms) and create a
 * chroma.cmd shim in node_modules/.bin/ that delegates to Python's chroma.exe.
 */
async function ensureChromaDeps() {
    const claudeMemDir = getClaudeMemDir();
    const isWindows = process.platform === 'win32';
    const binDir = path.join(claudeMemDir, 'node_modules', '.bin');
    const chromaShim = path.join(binDir, isWindows ? 'chroma.cmd' : 'chroma');
    // Quick check: does the existing chroma binary actually work?
    if (fs.existsSync(chromaShim)) {
        try {
            execSync(`"${chromaShim}" --version`, {
                cwd: claudeMemDir,
                stdio: 'ignore',
                timeout: 15000,
            });
            return; // Chroma binary works, nothing to fix
        }
        catch {
            // Chroma binary broken (Windows x64 or missing semver) — fix it
        }
    }
    console.log(chalk.cyan('  Fixing Chroma server binary...'));
    // Step 1: Ensure Python chromadb is installed
    let pythonChromaPath = findPythonChroma();
    if (!pythonChromaPath) {
        console.log(chalk.cyan('  Installing Python chromadb...'));
        try {
            pipInstall('chromadb');
            pythonChromaPath = findPythonChroma();
        }
        catch (error) {
            _installLogger?.warn(`pip-install-chromadb: ${getErrorMessage(error)}`);
            console.log(chalk.yellow(`  ⚠ Could not install Python chromadb: ${error}`));
        }
    }
    if (!pythonChromaPath) {
        _installLogger?.warn('find-chroma-binary: Python chromadb not found after all strategies');
        console.log(chalk.yellow('  ⚠ Python chromadb not found. Chroma vector search may not work.'));
        return;
    }
    console.log(chalk.gray(`  Found Python chroma at: ${pythonChromaPath}`));
    // Step 2: Create chroma.cmd shim that delegates to Python chroma
    await fs.ensureDir(binDir);
    if (isWindows) {
        // Windows: create .cmd shim pointing to Python chroma.exe
        const shimContent = `@ECHO off\r\n"${pythonChromaPath}" %*\r\n`;
        await fs.writeFile(chromaShim, shimContent, 'utf-8');
    }
    else {
        // Unix: create shell shim
        const shimContent = `#!/bin/sh\nexec "${pythonChromaPath}" "$@"\n`;
        await fs.writeFile(chromaShim, shimContent, { mode: 0o755 });
    }
    console.log(chalk.green('  ✓ Chroma binary shim created (Python backend)'));
}
/**
 * Start Chroma server directly using Python's chroma binary.
 *
 * The claude-mem worker (from plugin cache) cannot find the chroma binary
 * because the plugin cache has no node_modules/. The npm chromadb CLI is
 * broken on Windows x64 (missing 'semver' transitive dependency).
 *
 * Fix: Start Chroma externally BEFORE the worker. The worker detects a
 * running Chroma via heartbeat and reuses it instead of trying to start one.
 */
export async function startChromaServer() {
    // Already running? Nothing to do.
    if (await isChromaRunning()) {
        console.log(chalk.green('  ✓ Chroma vector database already running'));
        return;
    }
    console.log(chalk.cyan('  Starting Chroma vector database...'));
    // Find Python chroma binary
    let chromaBin = findPythonChroma();
    if (!chromaBin) {
        // Attempt to install Python chromadb
        console.log(chalk.cyan('  Installing Python chromadb...'));
        try {
            pipInstall('chromadb');
            chromaBin = findPythonChroma();
        }
        catch (error) {
            _installLogger?.warn(`startChroma-pip-install: ${getErrorMessage(error)}`);
            console.log(chalk.yellow(`  ⚠ Could not install Python chromadb: ${error}`));
        }
    }
    if (!chromaBin) {
        _installLogger?.warn('startChroma-find-binary: chroma not found, vector search disabled');
        console.log(chalk.yellow('  ⚠ Python chroma not found. Vector search will be disabled.'));
        console.log(chalk.gray('    Basic memory features (observations, context) still work.'));
        return;
    }
    // Ensure data directory exists
    const dataDir = path.join(os.homedir(), '.claude-mem', 'vector-db');
    await fs.ensureDir(dataDir);
    // Start Chroma as detached background process
    const isWindows = process.platform === 'win32';
    const args = ['run', '--path', dataDir, '--host', '127.0.0.1', '--port', String(CHROMA_PORT)];
    console.log(chalk.gray(`  Using: ${chromaBin}`));
    const chromaProcess = spawn(chromaBin, args, {
        stdio: 'ignore',
        detached: !isWindows,
        windowsHide: true,
    });
    chromaProcess.unref();
    chromaProcess.on('error', (err) => {
        _installLogger?.warn(`startChroma-spawn: ${err.message}`);
        console.log(chalk.yellow(`  ⚠ Chroma process error: ${err.message}`));
    });
    // Wait for heartbeat (up to 30 seconds)
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (await isChromaRunning()) {
            console.log(chalk.green('  ✓ Chroma vector database started'));
            return;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    _installLogger?.warn('startChroma-heartbeat: Chroma did not respond within 30s');
    console.log(chalk.yellow('  ⚠ Chroma did not respond within 30s. Vector search may be disabled.'));
    console.log(chalk.gray('    Basic memory features (observations, context) still work.'));
}
// ============================================================================
// claude-mem installation via git clone
// ============================================================================
/**
 * Clone and build claude-mem repository into marketplace directory
 * Clone and build claude-mem repository into marketplace directory
 */
async function cloneAndBuildRepo() {
    console.log(chalk.cyan('  Cloning claude-mem repository...'));
    // Ensure bun is available
    await ensureBun();
    // Ensure parent directories exist
    await fs.ensureDir(path.dirname(CLAUDE_MEM_DIR));
    // Clone if not exists (with retry for transient network failures)
    const packageJson = path.join(CLAUDE_MEM_DIR, 'package.json');
    if (!await fs.pathExists(packageJson)) {
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                execSync(`git clone ${CLAUDE_MEM_REPO} "${CLAUDE_MEM_DIR}"`, {
                    stdio: 'inherit',
                    timeout: 300000, // 5 minutes for slow connections
                });
                console.log(chalk.green('  ✓ Repository cloned'));
                break;
            }
            catch (error) {
                if (attempt < maxRetries) {
                    _installLogger?.warn(`cloneRepo-attempt${attempt}: ${getErrorMessage(error)}`);
                    console.log(chalk.yellow(`  ⚠ Clone attempt ${attempt} failed, retrying in ${attempt * 5}s...`));
                    await fs.remove(CLAUDE_MEM_DIR).catch(() => { });
                    await fs.ensureDir(path.dirname(CLAUDE_MEM_DIR));
                    await new Promise(r => setTimeout(r, attempt * 5000));
                }
                else {
                    throw new Error(`Failed to clone claude-mem after ${maxRetries} attempts: ${error}`);
                }
            }
        }
    }
    else {
        console.log(chalk.gray('  Repository already cloned, pulling latest...'));
        try {
            execSync('git pull', {
                cwd: CLAUDE_MEM_DIR,
                stdio: 'inherit',
                timeout: 60000,
            });
        }
        catch {
            _installLogger?.warn('cloneRepo-pull: Could not pull latest changes');
            console.log(chalk.yellow('  ⚠ Could not pull latest changes'));
        }
    }
    // Install dependencies
    console.log(chalk.cyan('  Installing dependencies...'));
    try {
        execSync('bun install', {
            cwd: CLAUDE_MEM_DIR,
            stdio: 'inherit',
            timeout: 180000, // 3 minutes
        });
        console.log(chalk.green('  ✓ Dependencies installed'));
    }
    catch (error) {
        throw new Error(`Failed to install dependencies: ${error}`);
    }
    // Build
    console.log(chalk.cyan('  Building claude-mem...'));
    try {
        execSync('bun run build', {
            cwd: CLAUDE_MEM_DIR,
            stdio: 'inherit',
            timeout: 180000, // 3 minutes
        });
        console.log(chalk.green('  ✓ Build complete'));
    }
    catch (error) {
        throw new Error(`Failed to build claude-mem: ${error}`);
    }
    // Fix chromadb transitive deps for Node.js (bun doesn't resolve them for npx)
    await ensureChromaDeps();
}
/**
 * Start claude-mem worker using bun run worker:start
 */
export async function startClaudeMemWorker() {
    console.log(chalk.cyan('  Starting claude-mem worker...'));
    // Check if worker is already running
    if (await isWorkerRunning()) {
        console.log(chalk.green('  ✓ claude-mem worker already running'));
        return;
    }
    // Ensure claude-mem repo is cloned and built
    if (!await isClaudeMemRepoCloned()) {
        await cloneAndBuildRepo();
    }
    const claudeMemDir = getClaudeMemDir();
    // Start worker in background
    try {
        crossSpawn('bun', ['run', 'worker:start'], {
            cwd: claudeMemDir,
            detached: true,
            stdio: 'ignore',
        }).unref();
        // Wait for worker to start
        await new Promise((resolve) => setTimeout(resolve, 3000));
        // Verify worker started
        if (await isWorkerRunning()) {
            console.log(chalk.green('  ✓ claude-mem worker started'));
        }
        else {
            _installLogger?.warn('startWorker-health: worker not responding after 3s');
            console.log(chalk.yellow('  ⚠ Worker may not have started. Check manually.'));
            console.log(chalk.gray(`  You can manually run: cd ${claudeMemDir} && bun run worker:start`));
        }
    }
    catch (error) {
        _installLogger?.error(`startWorker-spawn: ${getErrorMessage(error)}`);
        console.log(chalk.yellow(`  ⚠ Could not start worker: ${error}`));
    }
}
// ============================================================================
// Claude Code: claude-mem plugin installation
// ============================================================================
/**
 * Check if claude-mem plugin is registered in Claude Code.
 * Checks installed_plugins.json first (fast, works in Docker),
 * falls back to `claude plugin list` CLI.
 */
export async function checkClaudeMemPluginInstalled() {
    // Strategy 1: Check installed_plugins.json for claude-mem registration
    const installedPluginsPath = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
    try {
        if (await fs.pathExists(installedPluginsPath)) {
            const data = await fs.readJson(installedPluginsPath);
            const plugins = data?.plugins || {};
            const isRegistered = Object.keys(plugins).some(key => key.includes('claude-mem') || key.includes('thedotmack'));
            if (isRegistered)
                return true;
        }
    }
    catch {
        // Fall through to CLI check
    }
    // Strategy 2: Try `claude plugin list` CLI as fallback
    try {
        const output = execSync('claude plugin list', {
            encoding: 'utf-8',
            timeout: 15000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return output.includes('claude-mem');
    }
    catch {
        // CLI not available (Docker headless, etc.)
        return false;
    }
}
/**
 * Install claude-mem plugin for Claude Code (NO confirmation)
 */
export async function installClaudeMemPlugin() {
    console.log(chalk.cyan('  Installing claude-mem plugin for Claude Code...'));
    try {
        // Add marketplace
        console.log(chalk.gray('    Adding marketplace...'));
        execSync('claude plugin marketplace add thedotmack/claude-mem', {
            stdio: 'inherit',
            timeout: 60000,
        });
        // Install plugin
        console.log(chalk.gray('    Installing plugin...'));
        execSync('claude plugin install claude-mem', {
            stdio: 'inherit',
            timeout: 60000,
        });
        console.log(chalk.green('  ✓ claude-mem plugin installed via CLI'));
    }
    catch {
        // claude CLI not available or plugin commands failed — fallback to git clone + build
        _installLogger?.warn('installPlugin-cli: claude CLI not available, falling back to git clone');
        console.log(chalk.yellow('  ⚠ claude CLI not available, falling back to git clone...'));
        if (!await isClaudeMemRepoCloned()) {
            await cloneAndBuildRepo();
        }
    }
}
// ============================================================================
// Main entry point
// ============================================================================
/**
 * Check if claude-mem marketplace plugin is enabled in ~/.claude/settings.json.
 * When enabled, Claude Code auto-discovers MCP servers from the plugin's .mcp.json,
 * so manual registration in ~/.claude.json is unnecessary and causes duplication.
 */
async function isClaudeMemPluginEnabled() {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    try {
        if (await fs.pathExists(settingsPath)) {
            const settings = await fs.readJson(settingsPath);
            return settings?.enabledPlugins?.['claude-mem@thedotmack'] === true;
        }
    }
    catch {
        // Corrupted settings — assume not enabled
    }
    return false;
}
/**
 * Register claude-mem MCP server in ~/.claude.json.
 *
 * Skips manual registration when the marketplace plugin
 * is enabled (enabledPlugins), and cleans up legacy manual entries to
 * prevent duplicate MCP servers.
 *
 * Uses atomic config save (temp + move) per project rules.
 * Paths use forward slashes in JSON for cross-platform compatibility.
 */
async function registerClaudeMemMcp(platform) {
    const configPath = path.join(os.homedir(), '.claude.json');
    // If marketplace plugin is enabled, it already provides MCP.
    // Clean up any legacy manual entry to prevent duplicate servers.
    if (await isClaudeMemPluginEnabled()) {
        let config = {};
        try {
            if (await fs.pathExists(configPath)) {
                config = await fs.readJson(configPath);
            }
        }
        catch {
            // Can't read config — nothing to clean up
        }
        if (config.mcpServers?.['claude-mem']) {
            delete config.mcpServers['claude-mem'];
            await writeJsonAtomic(configPath, config);
            console.log(chalk.green('  ✓ cleaned up legacy claude-mem MCP entry (plugin provides it)'));
        }
        else {
            console.log(chalk.green('  ✓ claude-mem MCP provided by marketplace plugin'));
        }
        return;
    }
    // Load existing config
    let config = {};
    if (await fs.pathExists(configPath)) {
        try {
            config = await fs.readJson(configPath);
        }
        catch {
            // Corrupted config — start fresh
        }
    }
    if (!config.mcpServers)
        config.mcpServers = {};
    // Path to mcp-server.cjs (forward slashes for JSON cross-platform compat)
    const mcpServerPath = path.join(CLAUDE_MEM_DIR, 'plugin', 'scripts', 'mcp-server.cjs')
        .replace(/\\/g, '/');
    // Verify binary exists before registering
    if (!(await fs.pathExists(path.join(CLAUDE_MEM_DIR, 'plugin', 'scripts', 'mcp-server.cjs')))) {
        _installLogger?.warn('registerMcp: mcp-server.cjs not found, skipping MCP registration');
        console.log(chalk.yellow('  ⚠ mcp-server.cjs not found, skipping MCP registration'));
        return;
    }
    // Check if already registered with same config
    const existing = config.mcpServers['claude-mem'];
    const expectedArgs = [mcpServerPath];
    if (existing?.command === 'node' && JSON.stringify(existing.args) === JSON.stringify(expectedArgs)) {
        console.log(chalk.green('  ✓ claude-mem MCP server already registered'));
        return;
    }
    // Register MCP server (fallback when plugin not available)
    config.mcpServers['claude-mem'] = {
        command: 'node',
        args: expectedArgs,
    };
    // Atomic config save
    await writeJsonAtomic(configPath, config);
    console.log(chalk.green(`  ✓ claude-mem MCP server registered in ${path.basename(configPath)}`));
}
/**
 * Set CLAUDE_MEM_CHROMA_MODE=external in ~/.claude-mem/settings.json.
 * This prevents the claude-mem worker from trying to start Chroma via
 * `npx chromadb` (broken on Windows — missing 'semver' dep in bun cache).
 * Instead, our health-check hook starts Chroma via Python chroma binary.
 */
async function ensureChromaExternalMode() {
    const settingsPath = path.join(os.homedir(), '.claude-mem', 'settings.json');
    await fs.ensureDir(path.dirname(settingsPath));
    let settings = {};
    if (await fs.pathExists(settingsPath)) {
        try {
            settings = await fs.readJson(settingsPath);
        }
        catch {
            // Corrupted settings — start fresh
        }
    }
    if (settings.CLAUDE_MEM_CHROMA_MODE === 'external')
        return;
    settings.CLAUDE_MEM_CHROMA_MODE = 'external';
    await writeJsonAtomic(settingsPath, settings);
    console.log(chalk.green('  ✓ Chroma mode set to external (managed by health-check hook)'));
}
/**
 * Ensure claude-mem is installed and configured for the specified platform.
 * Runs AUTOMATICALLY without user confirmation.
 *
 * Installs claude-mem plugin via marketplace for Claude Code.
 */
export async function ensureClaudeMem(platform, logger) {
    _installLogger = logger;
    console.log(chalk.cyan('\n🧠 Setting up persistent memory (claude-mem)...\n'));
    // Ensure bun is available before any hooks run (they depend on bun)
    await ensureBun();
    // Step 1: Install plugin (CLI or git clone fallback)
    const isInstalled = await checkClaudeMemPluginInstalled();
    if (!isInstalled) {
        await installClaudeMemPlugin();
    }
    else {
        console.log(chalk.green('  ✓ claude-mem plugin already installed'));
    }
    // Step 2: Ensure repo is cloned and built (installClaudeMemPlugin may have used fallback)
    if (!await isClaudeMemRepoCloned()) {
        await cloneAndBuildRepo();
    }
    // Step 3: Set CHROMA_MODE=external so worker doesn't try broken npx chromadb
    await ensureChromaExternalMode();
    // Step 4: Start Chroma BEFORE worker (worker detects running Chroma via heartbeat)
    try {
        await startChromaServer();
    }
    catch (err) {
        const msg = getErrorMessage(err);
        logger?.warn(`chroma-start: ${msg}`);
        console.log(chalk.yellow('  ⚠ Could not start Chroma (non-blocking)'));
    }
    // Step 5: Start worker if not running
    const workerRunning = await isWorkerRunning();
    if (workerRunning) {
        console.log(chalk.green('  ✓ claude-mem worker already running'));
    }
    else {
        await startClaudeMemWorker();
    }
    // Step 6: Post-install validation — check services alive
    const validation = {
        worker: await isWorkerRunning(),
        chroma: await isChromaRunning(),
        mcpBinary: false,
    };
    // Step 7: Register MCP only if worker is alive (no point pointing to dead service)
    const mcpPath = path.join(CLAUDE_MEM_DIR, 'plugin', 'scripts', 'mcp-server.cjs');
    if (validation.worker) {
        await registerClaudeMemMcp(platform);
        validation.mcpBinary = await fs.pathExists(mcpPath);
    }
    else {
        logger?.error('post-install: worker not running, skipping MCP registration');
        console.log(chalk.red('  ✗ Worker not running — MCP registration skipped'));
    }
    // Log validation results
    logger?.info(`post-install validation: worker=${validation.worker}, chroma=${validation.chroma}, mcp=${validation.mcpBinary}`);
    if (!validation.chroma) {
        console.log(chalk.gray('  ℹ Chroma not running — basic memory works, semantic search unavailable'));
    }
    console.log(chalk.green('\n✨ Persistent memory configured!\n'));
    return validation;
}
//# sourceMappingURL=memory.js.map