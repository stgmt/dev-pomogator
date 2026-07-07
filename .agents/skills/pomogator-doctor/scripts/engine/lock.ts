import fs from 'node:fs';
import path from 'node:path';

export interface LockHandle {
  path: string;
  pid: number;
  release(): void;
}

export class LockHeldError extends Error {
  constructor(
    public readonly lockPath: string,
    public readonly holderPid: number,
  ) {
    super(`Another doctor run in progress (PID=${holderPid})`);
    this.name = 'LockHeldError';
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    return false;
  }
}

export function acquireLock(lockPath: string): LockHandle {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  const pid = process.pid;

  try {
    fs.writeFileSync(lockPath, String(pid), { flag: 'wx' });
    return makeHandle(lockPath, pid);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }

  let holderPid = Number.NaN;
  try {
    holderPid = Number.parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10);
  } catch {
    holderPid = Number.NaN;
  }

  if (Number.isFinite(holderPid) && isPidAlive(holderPid)) {
    throw new LockHeldError(lockPath, holderPid);
  }

  fs.rmSync(lockPath, { force: true });
  fs.writeFileSync(lockPath, String(pid), { flag: 'wx' });
  return makeHandle(lockPath, pid);
}

function makeHandle(lockPath: string, pid: number): LockHandle {
  let released = false;
  return {
    path: lockPath,
    pid,
    release() {
      if (released) return;
      released = true;
      try {
        const written = fs.readFileSync(lockPath, 'utf-8').trim();
        if (written === String(pid)) fs.rmSync(lockPath, { force: true });
      } catch {
        // ignore — lock already gone
      }
    },
  };
}
