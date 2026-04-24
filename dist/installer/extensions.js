import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import crossSpawn from 'cross-spawn';
import { fileURLToPath } from 'url';
import { getMsysSafeEnv } from '../utils/msys.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Check if extension is marked as beta (undefined = stable) */
export function isBeta(ext) {
    return ext.stability === 'beta';
}
/**
 * Build choices array for the inquirer checkbox prompt.
 * Beta extensions get a "(BETA)" label in the name and are unchecked by default.
 * Single source of truth for FR-2 (label) and FR-3 (default) — both interactive
 * installer paths use this helper, so behavior can be verified by importing it.
 */
export function buildExtensionChoices(extensions) {
    return extensions.map(ext => ({
        name: `${ext.name}${isBeta(ext) ? ' (BETA)' : ''} — ${ext.description}`,
        value: ext.name,
        checked: !isBeta(ext),
    }));
}
export class PostUpdateHookError extends Error {
    constructor(extensionName, message) {
        super(`Post-update hook failed for ${extensionName}: ${message}`);
        this.name = 'PostUpdateHookError';
    }
}
/**
 * Execute a shell command via child_process.spawn, returning a Promise.
 * Replaces execa() — uses only Node.js built-ins (no external deps).
 * Captures stderr in pipe mode so isRecoverableNpmError() can inspect error.message.
 */
function execShellCommand(command, opts) {
    return new Promise((resolve, reject) => {
        const parts = command.split(/\s+/);
        const child = crossSpawn(parts[0], parts.slice(1), {
            cwd: opts.cwd,
            stdio: opts.stdio,
            env: opts.env,
        });
        let stderr = '';
        if (opts.stdio === 'pipe' && child.stderr) {
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });
        }
        child.on('error', (err) => {
            reject(new Error(`Command failed: ${command}\n${err.message}`));
        });
        child.on('close', (code) => {
            if (code !== 0) {
                const msg = stderr ? `\n${stderr.trim()}` : '';
                reject(new Error(`Command failed with exit code ${code}: ${command}${msg}`));
            }
            else {
                resolve();
            }
        });
    });
}
export async function getExtensionsDir() {
    const packageRoot = path.resolve(__dirname, '..', '..');
    return path.join(packageRoot, 'extensions');
}
export async function listExtensions() {
    const extensionsDir = await getExtensionsDir();
    const extensions = [];
    if (!(await fs.pathExists(extensionsDir))) {
        return extensions;
    }
    const dirs = await fs.readdir(extensionsDir);
    for (const dir of dirs) {
        const extPath = path.join(extensionsDir, dir);
        const manifestPath = path.join(extPath, 'extension.json');
        if (await fs.pathExists(manifestPath)) {
            try {
                const manifest = await fs.readJson(manifestPath);
                extensions.push({
                    ...manifest,
                    path: extPath,
                });
            }
            catch {
                // Skip invalid extensions
            }
        }
    }
    return extensions;
}
export async function getExtension(name) {
    const extensions = await listExtensions();
    return extensions.find((ext) => ext.name === name) || null;
}
export function getExtensionFiles(extension, platform, repoRoot) {
    const commandFiles = extension.commandFiles?.[platform] || [];
    return commandFiles.map((f) => path.join(repoRoot, f));
}
/**
 * Get absolute paths to rule SOURCE files for an extension.
 *
 * Rule paths in extension.json (e.g. ".claude/rules/scope-gate/rule.md") are
 * resolved against the dev-pomogator **package root** (source), not the target
 * project's repoRoot. The installer then copies them into the target project's
 * .claude/rules/{subfolder}/.
 *
 * Previous bug: `path.join(repoRoot, r)` resolved to `target/.claude/rules/...`
 * which doesn't exist when installing cross-repo → silent skip.
 *
 * @param _repoRoot ignored (retained for backward compatibility of signature)
 */
export function getExtensionRules(extension, platform, _repoRoot) {
    const ruleFiles = extension.ruleFiles?.[platform] || [];
    const packageRoot = path.resolve(__dirname, '..', '..');
    return ruleFiles.map((r) => path.join(packageRoot, r));
}
/**
 * Get map of tool_name -> absolute_path for extension tools
 */
export async function getExtensionTools(extension) {
    const tools = new Map();
    if (extension.tools) {
        for (const [name, relativePath] of Object.entries(extension.tools)) {
            tools.set(name, path.join(extension.path, relativePath));
        }
    }
    return tools;
}
/**
 * Get map of skill_name -> absolute SOURCE path for extension skills (Claude Code).
 *
 * Skill paths in extension.json (e.g. ".claude/skills/my-skill") are resolved
 * against the dev-pomogator **package root** (source), not the target project's
 * repoRoot. Installer copies them into target's .claude/skills/{name}/.
 *
 * Previous bug: `path.join(repoRoot, relativePath)` resolved to target path →
 * skill silently not copied during cross-repo install.
 *
 * @param _repoRoot ignored (retained for backward compatibility of signature)
 */
export function getExtensionSkills(extension, _repoRoot) {
    const skills = new Map();
    if (extension.skills) {
        const packageRoot = path.resolve(__dirname, '..', '..');
        for (const [name, relativePath] of Object.entries(extension.skills)) {
            skills.set(name, path.join(packageRoot, relativePath));
        }
    }
    return skills;
}
/**
 * Get hooks defined in extension for a specific platform
 */
export function getExtensionHooks(extension, platform) {
    return extension.hooks?.[platform] || {};
}
/**
 * Get statusLine config from extension for a specific platform
 */
export function getExtensionStatusLine(extension, platform) {
    if (platform !== 'claude')
        return null;
    return extension.statusLine?.claude ?? null;
}
/**
 * Check if running in CI environment
 */
function isCI() {
    return !!(process.env.CI ||
        process.env.GITHUB_ACTIONS ||
        process.env.GITLAB_CI ||
        process.env.JENKINS_URL ||
        process.env.CIRCLECI ||
        process.env.TRAVIS);
}
/**
 * Check if running in non-interactive environment (no TTY, CI, Docker tests).
 * Unlike isCI() which skips hooks entirely, this allows hooks to run but without user prompts.
 */
function isNonInteractive() {
    return isCI() || !process.stdin.isTTY || !process.stdout.isTTY;
}
/**
 * For interactive hooks running in non-interactive environment,
 * append --non-interactive flag to known scripts that support it.
 */
function augmentCommandForNonInteractive(command) {
    if (command.includes('configure.py') && !command.includes('--non-interactive')) {
        return command.replace('configure.py', 'configure.py --non-interactive');
    }
    return command;
}
/**
 * Get post-install hook for an extension and platform
 */
function getPostInstallHook(extension, platform) {
    if (!extension.postInstall)
        return undefined;
    // Check if it's platform-specific format
    const postInstall = extension.postInstall;
    // If it has 'command' property, it's a simple PostInstallHook
    if ('command' in postInstall) {
        return postInstall;
    }
    // Otherwise it's platform-specific
    if (platform && postInstall[platform]) {
        return postInstall[platform];
    }
    return undefined;
}
/**
 * Get post-update hook for an extension and platform
 */
function getPostUpdateHook(extension, platform) {
    if (!extension.postUpdate)
        return undefined;
    const postUpdate = extension.postUpdate;
    if ('command' in postUpdate) {
        return postUpdate;
    }
    if (platform && postUpdate[platform]) {
        return postUpdate[platform];
    }
    return undefined;
}
/**
 * Check if an extension has a shared (non-platform-specific) post-install hook
 */
export function isSharedPostInstallHook(extension) {
    if (!extension.postInstall)
        return false;
    return 'command' in extension.postInstall;
}
/**
 * Check if an error is a recoverable npm/node_modules error (ENOTEMPTY, MODULE_NOT_FOUND).
 * Covers both npx cache corruption and stale node_modules temp directories.
 */
function isRecoverableNpmError(error) {
    const msg = String(error instanceof Error ? error.message : error);
    return (msg.includes('ENOTEMPTY') ||
        msg.includes('MODULE_NOT_FOUND') ||
        msg.includes('Cannot find module') ||
        msg.includes('ERR_MODULE_NOT_FOUND'));
}
/**
 * Clean the npx cache directory to recover from corruption.
 */
function cleanNpxCache() {
    try {
        const cache = execSync('npm config get cache', {
            encoding: 'utf-8',
            timeout: 10000,
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        const npxDir = path.join(cache, '_npx');
        if (fs.existsSync(npxDir)) {
            fs.rmSync(npxDir, { recursive: true, force: true });
            console.log('  ↻ Cleaned corrupted npx cache, retrying...');
        }
    }
    catch {
        // Can't clean — will still retry
    }
}
/**
 * Remove a directory, trying chmod and rename-aside as fallbacks.
 * On Linux/devcontainers, stale dirs may be owned by root so rmSync fails with EACCES.
 * rename() only needs write permission on the parent dir, not on contents.
 */
function forceRemoveDir(dirPath) {
    // Attempt 1: direct rmSync
    try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        return;
    }
    catch { /* fall through */ }
    // Attempt 2: fix permissions, then rmSync (handles read-only files)
    if (process.platform !== 'win32') {
        try {
            execSync(`chmod -R u+w "${dirPath}"`, { stdio: 'pipe', timeout: 5000 });
            fs.rmSync(dirPath, { recursive: true, force: true });
            return;
        }
        catch { /* fall through */ }
    }
    // Attempt 3: rename aside so npm can reuse the original name
    // rename() on Linux only requires write on parent dir, not on contents
    const aside = `${dirPath}-purge-${Date.now()}`;
    fs.renameSync(dirPath, aside);
}
/**
 * Clean stale npm temp directories in node_modules/.
 * npm leaves behind .package-name-randomHash dirs on failed renames (ENOTEMPTY).
 * Duplicated in tsx-runner.js (standalone CJS bundle) — keep in sync.
 */
const STALE_NPM_DIR_PATTERN = /-.{8,}$/;
export function cleanStaleNodeModulesDirs(cwd) {
    try {
        const nodeModulesDir = path.join(cwd, 'node_modules');
        const entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.startsWith('.') && STALE_NPM_DIR_PATTERN.test(entry.name)) {
                try {
                    forceRemoveDir(path.join(nodeModulesDir, entry.name));
                    console.log(`  ↻ Cleaned stale temp dir: node_modules/${entry.name}`);
                }
                catch (e) {
                    console.log(`  ⚠ Could not remove stale dir node_modules/${entry.name}: ${e instanceof Error ? e.message : e}`);
                }
            }
        }
    }
    catch { /* skip — node_modules may not exist */ }
}
/**
 * Run post-install hook for an extension
 */
export async function runPostInstallHook(extension, repoRoot, platform, executedSharedHooks) {
    const hook = getPostInstallHook(extension, platform);
    if (!hook)
        return;
    // Skip shared hooks that were already executed for another platform
    if (executedSharedHooks && isSharedPostInstallHook(extension)) {
        if (executedSharedHooks.has(extension.name)) {
            return;
        }
    }
    const { command: rawCommand, interactive = true, skipInCI = true } = hook;
    // On Windows, python3 doesn't exist — normalize to python
    let command = process.platform === 'win32'
        ? rawCommand.replace(/\bpython3\b/g, 'python')
        : rawCommand;
    // Skip in CI if configured
    if (skipInCI && isCI()) {
        console.log(`  ⏭ Skipping post-install hook for ${extension.name} (CI detected)`);
        return;
    }
    // Auto-append --non-interactive for interactive hooks in headless environments
    const nonInteractive = isNonInteractive();
    if (interactive && nonInteractive) {
        command = augmentCommandForNonInteractive(command);
    }
    const useInherit = interactive && !nonInteractive;
    console.log(`  ▶ Running post-install hook for ${extension.name}...`);
    const env = getMsysSafeEnv();
    try {
        await execShellCommand(command, { cwd: repoRoot, stdio: useInherit ? 'inherit' : 'pipe', env });
        console.log(`  ✓ Post-install hook completed for ${extension.name}`);
        if (executedSharedHooks && isSharedPostInstallHook(extension)) {
            executedSharedHooks.add(extension.name);
        }
    }
    catch (error) {
        // Retry once on ENOTEMPTY / MODULE_NOT_FOUND — clean both npx cache and stale node_modules dirs
        if (isRecoverableNpmError(error)) {
            cleanNpxCache();
            cleanStaleNodeModulesDirs(repoRoot);
            try {
                await execShellCommand(command, { cwd: repoRoot, stdio: useInherit ? 'inherit' : 'pipe', env });
                console.log(`  ✓ Post-install hook completed for ${extension.name} (after cache cleanup)`);
                if (executedSharedHooks && isSharedPostInstallHook(extension)) {
                    executedSharedHooks.add(extension.name);
                }
                return;
            }
            catch {
                // Retry also failed — fall through to warning
            }
        }
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠ Post-install hook failed for ${extension.name}: ${message}`);
    }
}
/**
 * Run post-update hook for an extension
 */
export async function runPostUpdateHook(extension, repoRoot, platform, failFast = false) {
    const hook = getPostUpdateHook(extension, platform);
    if (!hook)
        return;
    const { command: rawCommand, interactive = true, skipInCI = true } = hook;
    // On Windows, python3 doesn't exist — normalize to python
    let command = process.platform === 'win32'
        ? rawCommand.replace(/\bpython3\b/g, 'python')
        : rawCommand;
    if (skipInCI && isCI()) {
        console.log(`  ⏭ Skipping post-update hook for ${extension.name} (CI detected)`);
        return;
    }
    // Auto-append --non-interactive for interactive hooks in headless environments
    const nonInteractive = isNonInteractive();
    if (interactive && nonInteractive) {
        command = augmentCommandForNonInteractive(command);
    }
    const useInherit = interactive && !nonInteractive;
    console.log(`  ▶ Running post-update hook for ${extension.name}...`);
    const env = getMsysSafeEnv();
    try {
        await execShellCommand(command, { cwd: repoRoot, stdio: useInherit ? 'inherit' : 'pipe', env });
        console.log(`  ✓ Post-update hook completed for ${extension.name}`);
    }
    catch (error) {
        // Retry once on ENOTEMPTY / MODULE_NOT_FOUND — clean both npx cache and stale node_modules dirs
        if (isRecoverableNpmError(error)) {
            cleanNpxCache();
            cleanStaleNodeModulesDirs(repoRoot);
            try {
                await execShellCommand(command, { cwd: repoRoot, stdio: useInherit ? 'inherit' : 'pipe', env });
                console.log(`  ✓ Post-update hook completed for ${extension.name} (after cache cleanup)`);
                return;
            }
            catch {
                // Retry also failed — fall through
            }
        }
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠ Post-update hook failed for ${extension.name}: ${message}`);
        if (failFast) {
            throw new PostUpdateHookError(extension.name, message);
        }
    }
}
//# sourceMappingURL=extensions.js.map