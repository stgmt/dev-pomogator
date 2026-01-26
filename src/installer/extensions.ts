import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  // Tools to install to project/tools/
  tools?: {
    [toolName: string]: string; // name -> relative path in extension
  };
  // Post-install hook to run after extension is installed
  postInstall?: {
    command: string;       // Command to run (relative to repoRoot)
    interactive?: boolean; // Requires terminal input (default: true)
    skipInCI?: boolean;    // Skip in CI environment (default: true)
  };
  // Whether this extension requires claude-mem persistent memory
  requiresClaudeMem?: boolean;
  path: string;
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
 * Run post-install hook for an extension
 */
export async function runPostInstallHook(
  extension: Extension,
  repoRoot: string
): Promise<void> {
  if (!extension.postInstall) return;

  const { command, interactive = true, skipInCI = true } = extension.postInstall;

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
