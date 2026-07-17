import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const fingerprint = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);

async function atomicWrite(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(temporary, value, { mode: 0o600 });
  await rename(temporary, path);
}

export async function provisionCredential(path) {
  const existing = (await readFile(path, 'utf8').catch(() => '')).trim();
  if (existing) return { token: existing, created: false };

  const lockPath = `${path}.lock`;
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
      const winner = (await readFile(path, 'utf8').catch(() => '')).trim();
      if (winner) return { token: winner, created: false };
    }
    throw new Error('credential provisioning lock timed out');
  }

  try {
    const winner = (await readFile(path, 'utf8').catch(() => '')).trim();
    if (winner) return { token: winner, created: false };
    const token = randomBytes(32).toString('base64url');
    await atomicWrite(path, token);
    return { token, created: true };
  } finally {
    await lock.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}

export async function persistCredentialForNextProcess(token, platform = process.platform) {
  if (platform !== 'win32') return { persisted: false, reason: 'installer environment provisioning required' };
  await execFileAsync('setx.exe', ['DEV_POMOGATOR_HOOK_TOKEN', token], { windowsHide: true });
  return { persisted: true };
}
