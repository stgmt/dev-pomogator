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
