import { loadConfig, saveConfig } from '../config/index.js';
import { shouldCheckUpdate } from './cooldown.js';
import { fetchExtensionManifest, downloadExtensionFile } from './github.js';
import { acquireLock, releaseLock } from './lock.js';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';

interface UpdateOptions {
  force?: boolean;
  silent?: boolean;
}

export async function checkUpdate(options: UpdateOptions = {}): Promise<boolean> {
  const { force = false, silent = false } = options;
  
  // 1. Попытка получить lock
  if (!await acquireLock()) {
    // Другой процесс уже проверяет
    return false;
  }
  
  try {
    const config = await loadConfig();
    
    if (!config) {
      return false;
    }
    
    if (!config.autoUpdate && !force) {
      return false;
    }
    
    // 2. Проверка cooldown
    if (!force && !shouldCheckUpdate(config)) {
      return false;
    }
    
    let updated = false;
    
    // 3. Для каждого установленного extension
    for (const installed of config.installedExtensions) {
      try {
        // Получить манифест из GitHub
        const remote = await fetchExtensionManifest(installed.name);
        
        if (!remote) {
          continue;
        }
        
        // 4. Сравнить версии
        if (!semver.gt(remote.version, installed.version)) {
          continue;
        }
        
        // 5. Скачать новые файлы
        const fileName = `${installed.name}.md`;
        const content = await downloadExtensionFile(
          installed.name,
          installed.platform,
          fileName
        );
        
        if (!content) {
          continue;
        }
        
        // 6. Обновить во всех projectPaths
        for (const projectPath of installed.projectPaths) {
          try {
            const destDir = path.join(projectPath, '.cursor', 'commands');
            const destFile = path.join(destDir, fileName);
            
            await fs.ensureDir(destDir);
            await fs.writeFile(destFile, content, 'utf-8');
          } catch {
            // Пропустить недоступные проекты
          }
        }
        
        // 7. Обновить версию в config
        installed.version = remote.version;
        updated = true;
        
      } catch {
        // Продолжить с другими extensions
      }
    }
    
    // 8. Сохранить config
    config.lastCheck = new Date().toISOString();
    await saveConfig(config);
    
    return updated;
    
  } finally {
    // Всегда освобождаем lock
    await releaseLock();
  }
}
