import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface EnvRequirement {
  name: string;        // e.g. AUTO_COMMIT_API_KEY
  required: boolean;   // true = feature won't work without it
  description: string; // human-readable description
  default?: string;    // default value (for optional vars)
  example?: string;    // example value for .env.example
}

export interface ExtensionHooks {
  claude?: {
    [hookName: string]: string; // e.g. "UserPromptSubmit": "python .dev-pomogator/tools/auto-commit/auto_commit.py"
  };
  cursor?: {
    [hookName: string]: string; // e.g. "beforeSubmitPrompt": "python .dev-pomogator/tools/auto-commit/auto_commit.py"
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
 * Get hooks defined in extension for a specific platform
 */
export function getExtensionHooks(
  extension: Extension,
  platform: 'cursor' | 'claude'
): Record<string, string> {
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
 * Run post-install hook for an extension
 */
export async function runPostInstallHook(
  extension: Extension,
  repoRoot: string,
  platform?: 'cursor' | 'claude'
): Promise<void> {
  const hook = getPostInstallHook(extension, platform);
  if (!hook) return;

  const { command, interactive = true, skipInCI = true } = hook;

  // Skip in CI if configured
  if (skipInCI && isCI()) {
    console.log(`  ⏭ Skipping post-install hook for ${extension.name} (CI detected)`);
    return;
  }

  console.log(`  ▶ Running post-install hook for ${extension.name}...`);

  try {
    const { execa } = await import('execa');
    await execa(command, {
      cwd: repoRoot,
      stdio: interactive ? 'inherit' : 'pipe',
      shell: true,
    });
    console.log(`  ✓ Post-install hook completed for ${extension.name}`);
  } catch (error) {
    // Don't fail installation if post-install hook fails
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

  const { command, interactive = true, skipInCI = true } = hook;

  if (skipInCI && isCI()) {
    console.log(`  ⏭ Skipping post-update hook for ${extension.name} (CI detected)`);
    return;
  }

  console.log(`  ▶ Running post-update hook for ${extension.name}...`);

  try {
    const { execa } = await import('execa');
    await execa(command, {
      cwd: repoRoot,
      stdio: interactive ? 'inherit' : 'pipe',
      shell: true,
    });
    console.log(`  ✓ Post-update hook completed for ${extension.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ⚠ Post-update hook failed for ${extension.name}: ${message}`);
    if (failFast) {
      throw new PostUpdateHookError(extension.name, message);
    }
  }
}
