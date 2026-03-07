import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getMsysSafeEnv } from '../utils/msys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface EnvRequirement {
  name: string;        // e.g. AUTO_COMMIT_API_KEY
  required: boolean;   // true = feature won't work without it
  description: string; // human-readable description
  default?: string;    // default value (for optional vars)
  example?: string;    // example value for .env.example
}

export type HookValue = string | { matcher?: string; command: string; timeout?: number };

export interface ExtensionHooks {
  claude?: {
    [hookName: string]: HookValue;
  };
  cursor?: {
    [hookName: string]: HookValue;
  };
}

export interface PostInstallHook {
  command: string;       // Command to run (relative to repoRoot)
  interactive?: boolean; // Requires terminal input (default: true)
  skipInCI?: boolean;    // Skip in CI environment (default: true)
}

export interface Extension {
  name: string;
  version: string;
  description: string;
  platforms: ('cursor' | 'claude')[];
  category: string;
  files: {
    cursor?: string[];
    claude?: string[];
  };
  // Rules to install to .cursor/rules/ or .claude/rules/
  rules?: {
    cursor?: string[];
    claude?: string[];
  };
  // Tools to install to project/.dev-pomogator/tools/
  tools?: {
    [toolName: string]: string; // name -> relative path in extension
  };
  // Skills to install to project/.claude/skills/ (Claude Code only)
  skills?: {
    [skillName: string]: string; // name -> relative path in extension
  };
  // IDE hooks to install
  hooks?: ExtensionHooks;
  // Post-install hook to run after extension is installed
  // Can be a single hook or platform-specific hooks
  postInstall?: PostInstallHook | {
    cursor?: PostInstallHook;
    claude?: PostInstallHook;
  };
  // Post-update hook to run after extension update
  // Can be a single hook or platform-specific hooks
  postUpdate?: PostInstallHook | {
    cursor?: PostInstallHook;
    claude?: PostInstallHook;
  };
  // Environment variables required by this extension
  envRequirements?: EnvRequirement[];
  // Whether this extension requires claude-mem persistent memory
  requiresClaudeMem?: boolean;
  path: string;
}

export interface PostHookOwner {
  name: string;
  postUpdate?: PostInstallHook | {
    cursor?: PostInstallHook;
    claude?: PostInstallHook;
  };
}

export class PostUpdateHookError extends Error {
  constructor(extensionName: string, message: string) {
    super(`Post-update hook failed for ${extensionName}: ${message}`);
    this.name = 'PostUpdateHookError';
  }
}

export async function getExtensionsDir(): Promise<string> {
  const packageRoot = path.resolve(__dirname, '..', '..');
  return path.join(packageRoot, 'extensions');
}

export async function listExtensions(): Promise<Extension[]> {
  const extensionsDir = await getExtensionsDir();
  const extensions: Extension[] = [];
  
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
      } catch {
        // Skip invalid extensions
      }
    }
  }
  
  return extensions;
}

export async function getExtension(name: string): Promise<Extension | null> {
  const extensions = await listExtensions();
  return extensions.find((ext) => ext.name === name) || null;
}

export async function getExtensionFiles(
  extension: Extension,
  platform: 'cursor' | 'claude'
): Promise<string[]> {
  // Новый путь: extensions/{name}/{platform}/commands/
  const commandsDir = path.join(extension.path, platform, 'commands');
  
  if (!(await fs.pathExists(commandsDir))) {
    return [];
  }
  
  const files = await fs.readdir(commandsDir);
  return files.map((f) => path.join(commandsDir, f));
}

/**
 * Get absolute paths to rule files for an extension
 */
export async function getExtensionRules(
  extension: Extension,
  platform: 'cursor' | 'claude'
): Promise<string[]> {
  const rules = extension.rules?.[platform] || [];
  return rules.map((r) => path.join(extension.path, r));
}

/**
 * Get map of tool_name -> absolute_path for extension tools
 */
export async function getExtensionTools(
  extension: Extension
): Promise<Map<string, string>> {
  const tools = new Map<string, string>();
  if (extension.tools) {
    for (const [name, relativePath] of Object.entries(extension.tools)) {
      tools.set(name, path.join(extension.path, relativePath));
    }
  }
  return tools;
}

/**
 * Get map of skill_name -> absolute_path for extension skills (Claude Code only)
 */
export async function getExtensionSkills(
  extension: Extension
): Promise<Map<string, string>> {
  const skills = new Map<string, string>();
  if (extension.skills) {
    for (const [name, relativePath] of Object.entries(extension.skills)) {
      skills.set(name, path.join(extension.path, relativePath));
    }
  }
  return skills;
}

/**
 * Get hooks defined in extension for a specific platform
 */
export function getExtensionHooks(
  extension: Extension,
  platform: 'cursor' | 'claude'
): Record<string, HookValue> {
  return extension.hooks?.[platform] || {};
}

/**
 * Check if running in CI environment
 */
function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.JENKINS_URL ||
    process.env.CIRCLECI ||
    process.env.TRAVIS
  );
}

/**
 * Check if running in non-interactive environment (no TTY, CI, Docker tests).
 * Unlike isCI() which skips hooks entirely, this allows hooks to run but without user prompts.
 */
function isNonInteractive(): boolean {
  return isCI() || !process.stdin.isTTY || !process.stdout.isTTY;
}

/**
 * For interactive hooks running in non-interactive environment,
 * append --non-interactive flag to known scripts that support it.
 */
function augmentCommandForNonInteractive(command: string): string {
  if (command.includes('configure.py') && !command.includes('--non-interactive')) {
    return command.replace('configure.py', 'configure.py --non-interactive');
  }
  return command;
}

/**
 * Get post-install hook for an extension and platform
 */
function getPostInstallHook(
  extension: Extension,
  platform?: 'cursor' | 'claude'
): PostInstallHook | undefined {
  if (!extension.postInstall) return undefined;

  // Check if it's platform-specific format
  const postInstall = extension.postInstall as PostInstallHook | {
    cursor?: PostInstallHook;
    claude?: PostInstallHook;
  };

  // If it has 'command' property, it's a simple PostInstallHook
  if ('command' in postInstall) {
    return postInstall as PostInstallHook;
  }

  // Otherwise it's platform-specific
  if (platform && (postInstall as any)[platform]) {
    return (postInstall as any)[platform] as PostInstallHook;
  }

  return undefined;
}

/**
 * Get post-update hook for an extension and platform
 */
function getPostUpdateHook(
  extension: PostHookOwner,
  platform?: 'cursor' | 'claude'
): PostInstallHook | undefined {
  if (!extension.postUpdate) return undefined;

  const postUpdate = extension.postUpdate as PostInstallHook | {
    cursor?: PostInstallHook;
    claude?: PostInstallHook;
  };

  if ('command' in postUpdate) {
    return postUpdate as PostInstallHook;
  }

  if (platform && (postUpdate as any)[platform]) {
    return (postUpdate as any)[platform] as PostInstallHook;
  }

  return undefined;
}

/**
 * Check if an extension has a shared (non-platform-specific) post-install hook
 */
export function isSharedPostInstallHook(extension: Extension): boolean {
  if (!extension.postInstall) return false;
  return 'command' in (extension.postInstall as any);
}

/**
 * Check if an error is a recoverable npm/node_modules error (ENOTEMPTY, MODULE_NOT_FOUND).
 * Covers both npx cache corruption and stale node_modules temp directories.
 */
function isRecoverableNpmError(error: unknown): boolean {
  const msg = String(error instanceof Error ? error.message : error);
  return (
    msg.includes('ENOTEMPTY') ||
    msg.includes('MODULE_NOT_FOUND') ||
    msg.includes('Cannot find module') ||
    msg.includes('ERR_MODULE_NOT_FOUND')
  );
}

/**
 * Clean the npx cache directory to recover from corruption.
 */
function cleanNpxCache(): void {
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
  } catch {
    // Can't clean — will still retry
  }
}

/**
 * Remove a directory, trying chmod and rename-aside as fallbacks.
 * On Linux/devcontainers, stale dirs may be owned by root so rmSync fails with EACCES.
 * rename() only needs write permission on the parent dir, not on contents.
 */
function forceRemoveDir(dirPath: string): void {
  // Attempt 1: direct rmSync
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return;
  } catch { /* fall through */ }

  // Attempt 2: fix permissions, then rmSync (handles read-only files)
  if (process.platform !== 'win32') {
    try {
      execSync(`chmod -R u+w "${dirPath}"`, { stdio: 'pipe', timeout: 5000 });
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch { /* fall through */ }
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
export function cleanStaleNodeModulesDirs(cwd: string): void {
  try {
    const nodeModulesDir = path.join(cwd, 'node_modules');
    const entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('.') && STALE_NPM_DIR_PATTERN.test(entry.name)) {
        try {
          forceRemoveDir(path.join(nodeModulesDir, entry.name));
          console.log(`  ↻ Cleaned stale temp dir: node_modules/${entry.name}`);
        } catch (e) {
          console.log(`  ⚠ Could not remove stale dir node_modules/${entry.name}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  } catch { /* skip — node_modules may not exist */ }
}

/**
 * Run post-install hook for an extension
 */
export async function runPostInstallHook(
  extension: Extension,
  repoRoot: string,
  platform?: 'cursor' | 'claude',
  executedSharedHooks?: Set<string>
): Promise<void> {
  const hook = getPostInstallHook(extension, platform);
  if (!hook) return;

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
    const { execa } = await import('execa');
    const execOpts = { cwd: repoRoot, stdio: (useInherit ? 'inherit' : 'pipe') as 'inherit' | 'pipe', shell: true, env };
    await execa(command, execOpts);
    console.log(`  ✓ Post-install hook completed for ${extension.name}`);
    if (executedSharedHooks && isSharedPostInstallHook(extension)) {
      executedSharedHooks.add(extension.name);
    }
  } catch (error) {
    // Retry once on ENOTEMPTY / MODULE_NOT_FOUND — clean both npx cache and stale node_modules dirs
    if (isRecoverableNpmError(error)) {
      cleanNpxCache();
      cleanStaleNodeModulesDirs(repoRoot);
      try {
        const { execa } = await import('execa');
        await execa(command, { cwd: repoRoot, stdio: useInherit ? 'inherit' : 'pipe', shell: true, env });
        console.log(`  ✓ Post-install hook completed for ${extension.name} (after cache cleanup)`);
        if (executedSharedHooks && isSharedPostInstallHook(extension)) {
          executedSharedHooks.add(extension.name);
        }
        return;
      } catch {
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
export async function runPostUpdateHook(
  extension: PostHookOwner,
  repoRoot: string,
  platform?: 'cursor' | 'claude',
  failFast: boolean = false
): Promise<void> {
  const hook = getPostUpdateHook(extension, platform);
  if (!hook) return;

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
    const { execa } = await import('execa');
    await execa(command, {
      cwd: repoRoot,
      stdio: useInherit ? 'inherit' : 'pipe',
      shell: true,
      env,
    });
    console.log(`  ✓ Post-update hook completed for ${extension.name}`);
  } catch (error) {
    // Retry once on ENOTEMPTY / MODULE_NOT_FOUND — clean both npx cache and stale node_modules dirs
    if (isRecoverableNpmError(error)) {
      cleanNpxCache();
      cleanStaleNodeModulesDirs(repoRoot);
      try {
        const { execa } = await import('execa');
        await execa(command, { cwd: repoRoot, stdio: useInherit ? 'inherit' : 'pipe', shell: true, env });
        console.log(`  ✓ Post-update hook completed for ${extension.name} (after cache cleanup)`);
        return;
      } catch {
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
