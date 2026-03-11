import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const LOCK_FILE = path.join(os.homedir(), '.dev-pomogator', 'update.lock');
const LOCK_STALE = LOCK_FILE + '.stale';
const LOCK_TIMEOUT = 60 * 1000; // 60 seconds stale

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

/**
 * Check if a process with the given PID is alive.
 * Uses signal 0 which doesn't actually send a signal but checks if process exists.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the current lock is stale:
 * 1. Lock PID is dead → stale
 * 2. Lock older than LOCK_TIMEOUT → stale
 */
async function isLockStale(): Promise<boolean> {
  try {
    const [content, stat] = await Promise.all([
      fs.readFile(LOCK_FILE, 'utf-8'),
      fs.stat(LOCK_FILE),
    ]);

    // Check if lock holder is still alive
    const pid = parseInt(content.trim(), 10);
    if (!Number.isNaN(pid) && pid > 0) {
      if (!isProcessAlive(pid)) {
        return true; // Process dead → stale
      }
    }

    // Fallback: timeout-based staleness
    return Date.now() - stat.mtimeMs > LOCK_TIMEOUT;
  } catch {
    // Can't read lock — treat as stale
    return true;
  }
}

export async function acquireLock(): Promise<boolean> {
  try {
    if (await tryCreateLock()) {
      return true;
    }

    // Lock exists — check if stale
    if (await isLockStale()) {
      // Atomic rename-aside instead of remove to prevent TOCTOU race.
      // If another process also tries rename, one will get ENOENT — that's fine.
      try {
        await fs.rename(LOCK_FILE, LOCK_STALE);
      } catch {
        // Another process beat us — they have the lock now
        return false;
      }

      const acquired = await tryCreateLock();

      // Cleanup stale file (best-effort)
      fs.remove(LOCK_STALE).catch(() => {});

      return acquired;
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
