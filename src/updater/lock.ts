import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const LOCK_FILE = path.join(os.homedir(), '.dev-pomogator', 'update.lock');
const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 минут stale

async function tryCreateLock(): Promise<boolean> {
  try {
    await fs.ensureDir(path.dirname(LOCK_FILE));
    await fs.writeFile(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
      return false;
    }
    return false;
  }
}

export async function acquireLock(): Promise<boolean> {
  try {
    if (await tryCreateLock()) {
      return true;
    }

    if (await fs.pathExists(LOCK_FILE)) {
      const stat = await fs.stat(LOCK_FILE);
      if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT) {
        // Stale lock, удаляем
        await fs.remove(LOCK_FILE);
        return await tryCreateLock();
      }
    }

    return false;
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
