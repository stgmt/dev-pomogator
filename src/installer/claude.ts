import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { listExtensions, getExtensionFiles, getExtensionRules, getExtensionTools } from './extensions.js';
import { findRepoRoot } from '../utils/repo.js';

interface ClaudeOptions {
  extensions?: string[]; // List of extension names to install, empty = all
}

export async function installClaude(options: ClaudeOptions = {}): Promise<void> {
  const homeDir = os.homedir();
  const repoRoot = findRepoRoot();
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
  
  // 1. Install each extension's claude command files
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
  
  // 2. Install rules to .claude/rules/ (in project directory)
  const rulesDir = path.join(repoRoot, '.claude', 'rules');
  await fs.ensureDir(rulesDir);
  
  for (const extension of extensionsToInstall) {
    const ruleFiles = await getExtensionRules(extension, 'claude');
    
    for (const ruleFile of ruleFiles) {
      if (await fs.pathExists(ruleFile)) {
        const fileName = path.basename(ruleFile);
        const dest = path.join(rulesDir, fileName);
        await fs.copy(ruleFile, dest, { overwrite: true });
        console.log(`  ✓ Installed rule: ${fileName}`);
      }
    }
  }
  
  // 3. Install tools to project/tools/
  for (const extension of extensionsToInstall) {
    const tools = await getExtensionTools(extension);
    
    for (const [toolName, toolPath] of tools) {
      if (await fs.pathExists(toolPath)) {
        const dest = path.join(repoRoot, 'tools', toolName);
        await fs.copy(toolPath, dest, { overwrite: true });
        console.log(`  ✓ Installed tool: ${toolName}/`);
      }
    }
  }
  
  // 4. Create plugin.json if not exists
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
