import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { listExtensions, getExtensionFiles } from './extensions.js';

interface ClaudeOptions {
  extensions?: string[]; // List of extension names to install, empty = all
}

export async function installClaude(options: ClaudeOptions = {}): Promise<void> {
  const homeDir = os.homedir();
  const targetDir = path.join(homeDir, '.claude', 'plugins', 'dev-pomogator');
  const commandsDir = path.join(targetDir, 'commands');
  
  // Ensure target directories exist
  await fs.ensureDir(targetDir);
  await fs.ensureDir(commandsDir);
  
  // Get all extensions that support claude
  const allExtensions = await listExtensions();
  const claudeExtensions = allExtensions.filter((ext) =>
    ext.platforms.includes('claude')
  );
  
  // Filter by requested extensions if specified
  const extensionsToInstall = options.extensions?.length
    ? claudeExtensions.filter((ext) => options.extensions!.includes(ext.name))
    : claudeExtensions;
  
  // Install each extension's claude files
  for (const extension of extensionsToInstall) {
    const files = await getExtensionFiles(extension, 'claude');
    
    for (const srcFile of files) {
      if (srcFile.endsWith('.md')) {
        const fileName = path.basename(srcFile);
        const dest = path.join(commandsDir, fileName);
        
        // Don't overwrite existing commands
        if (!(await fs.pathExists(dest))) {
          await fs.copy(srcFile, dest);
        }
      }
    }
  }
  
  // Create plugin.json if not exists
  const pluginJsonPath = path.join(targetDir, 'plugin.json');
  if (!(await fs.pathExists(pluginJsonPath))) {
    const pluginJson = {
      name: 'dev-pomogator',
      version: '1.0.0',
      description: 'Developer productivity extensions for Claude Code',
      commands: extensionsToInstall.map((ext) => `commands/${ext.name}.md`),
    };
    await fs.writeJson(pluginJsonPath, pluginJson, { spaces: 2 });
  }
}
