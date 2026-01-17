import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const LOCK_FILE = path.join(os.homedir(), '.dev-pomogator', 'update.lock');
const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 минут stale

export async function acquireLock(): Promise<boolean> {
  try {
    if (await fs.pathExists(LOCK_FILE)) {
      const stat = await fs.stat(LOCK_FILE);
      if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT) {
        // Stale lock, удаляем
        await fs.remove(LOCK_FILE);
      } else {
        // Lock занят другим процессом
        return false;
      }
    }
    
    await fs.ensureDir(path.dirname(LOCK_FILE));
    await fs.writeFile(LOCK_FILE, process.pid.toString());
    return true;
  } catch {
    return false;
  }
}

export async function releaseLock(): Promise<void> {
  try {
    await fs.remove(LOCK_FILE);
  } catch {
    // Ignore errors on release
  }
}
