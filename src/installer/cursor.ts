import fs from 'fs-extra';
import path from 'path';
import { listExtensions, getExtensionFiles } from './extensions.js';

interface CursorOptions {
  autoUpdate: boolean;
  extensions?: string[]; // List of extension names to install, empty = all
}

export async function installCursor(options: CursorOptions): Promise<void> {
  const cwd = process.cwd();
  const targetDir = path.join(cwd, '.cursor', 'rules');
  
  // Ensure target directory exists
  await fs.ensureDir(targetDir);
  
  // Get all extensions that support cursor
  const allExtensions = await listExtensions();
  const cursorExtensions = allExtensions.filter((ext) =>
    ext.platforms.includes('cursor')
  );
  
  // Filter by requested extensions if specified
  const extensionsToInstall = options.extensions?.length
    ? cursorExtensions.filter((ext) => options.extensions!.includes(ext.name))
    : cursorExtensions;
  
  // Install each extension's cursor files
  for (const extension of extensionsToInstall) {
    const files = await getExtensionFiles(extension, 'cursor');
    
    for (const srcFile of files) {
      if (srcFile.endsWith('.mdc')) {
        const fileName = path.basename(srcFile);
        const dest = path.join(targetDir, fileName);
        
        // Don't overwrite existing rules
        if (!(await fs.pathExists(dest))) {
          await fs.copy(srcFile, dest);
        }
      }
    }
  }
  
  // Setup auto-update hook if enabled
  if (options.autoUpdate) {
    await setupAutoUpdateHook(cwd);
  }
}

async function setupAutoUpdateHook(cwd: string): Promise<void> {
  const hooksDir = path.join(cwd, '.cursor');
  const hooksFile = path.join(hooksDir, 'hooks.json');
  
  await fs.ensureDir(hooksDir);
  
  let hooks: { version: number; hooks: { stop?: Array<{ command: string }> } } = {
    version: 1,
    hooks: {},
  };
  
  // Load existing hooks if present
  if (await fs.pathExists(hooksFile)) {
    try {
      hooks = await fs.readJson(hooksFile);
    } catch {
      // Use default if parsing fails
    }
  }
  
  // Add update hook if not present
  const updateCommand = 'node ~/.dev-pomogator/scripts/check-update.js';
  
  if (!hooks.hooks.stop) {
    hooks.hooks.stop = [];
  }
  
  const hasUpdateHook = hooks.hooks.stop.some(
    (hook) => hook.command.includes('dev-pomogator')
  );
  
  if (!hasUpdateHook) {
    hooks.hooks.stop.push({ command: updateCommand });
    await fs.writeJson(hooksFile, hooks, { spaces: 2 });
  }
}
