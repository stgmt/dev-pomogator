import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST, PORT, VERSION, runtimeIdentity, stateDir, stateFile, tokenFile } from './server.mjs';
import { fingerprint, provisionCredential } from './credential.mjs';

const STARTUP_WAIT_MS = 5_000;
const LOCK_POLL_MS = 50;
const MALFORMED_LOCK_STALE_MS = 30_000;

const sleep = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));

const probeHealth = async (token, expected) => {
  try {
    const response = await fetch(`http://${HOST}:${PORT}/health`, {
      headers: { 'x-dev-pomogator-token': token },
      signal: AbortSignal.timeout(500),
    });
    const body = await response.json();
    const owned = response.status === 200
      && body.service === 'dev-pomogator-hook-service'
      && body.version === VERSION
      && body.tokenFingerprint === fingerprint(token);
    return {
      owned,
      current: owned
        && body.rootFingerprint === expected.rootFingerprint
        && body.registryDigest === expected.registryDigest
        && body.runtimeDigest === expected.runtimeDigest,
    };
  } catch {
    return { owned: false, current: false };
  }
};

const ownProcess = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const readLease = async lockPath => {
  try {
    return JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    return null;
  }
};

const reclaimDeadLease = async (lockPath, observed, staleAfterMs) => {
  if (observed?.ownerId && Number.isInteger(observed.pid)) {
    if (ownProcess(observed.pid)) return false;
    const current = await readLease(lockPath);
    if (current?.ownerId !== observed.ownerId || current.pid !== observed.pid) return false;
    await unlink(lockPath).catch(() => {});
    return true;
  }
  const ageMs = await stat(lockPath).then(value => Date.now() - value.mtimeMs).catch(() => 0);
  if (ageMs < staleAfterMs) return false;
  await unlink(lockPath).catch(() => {});
  return true;
};

export async function acquireStartupLease({
  lockPath,
  isReady,
  waitMs = STARTUP_WAIT_MS,
  pollMs = LOCK_POLL_MS,
  malformedStaleMs = MALFORMED_LOCK_STALE_MS,
} = {}) {
  const ownerId = randomUUID();
  const deadline = Date.now() + waitMs;
  let reclaimed = false;

  while (Date.now() <= deadline) {
    let handle;
    try {
      handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ schema: 1, ownerId, pid: process.pid, createdAt: new Date().toISOString() }));
      let released = false;
      return {
        acquired: true,
        ready: false,
        reclaimed,
        release: async () => {
          if (released) return;
          released = true;
          await handle.close().catch(() => {});
          const current = await readLease(lockPath);
          if (current?.ownerId === ownerId) await unlink(lockPath).catch(() => {});
        },
      };
    } catch (error) {
      await handle?.close().catch(() => {});
      if (error.code !== 'EEXIST') throw error;
    }

    if (await isReady()) return { acquired: false, ready: true, reclaimed };
    const observed = await readLease(lockPath);
    if (await reclaimDeadLease(lockPath, observed, malformedStaleMs)) {
      reclaimed = true;
      continue;
    }
    await sleep(pollMs);
  }

  if (await isReady()) return { acquired: false, ready: true, reclaimed };
  return { acquired: false, ready: false, reclaimed, reason: 'service startup lock timed out' };
}

export const ownedIdentity = (prior, expected) => prior
  && prior.version === VERSION
  && prior.rootFingerprint === expected.rootFingerprint
  && typeof prior.registryDigest === 'string'
  && typeof prior.runtimeDigest === 'string';

const stopOwned = async pid => {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  for (let i = 0; i < 100 && ownProcess(pid); i += 1) await sleep(LOCK_POLL_MS);
};

export async function ensureUp(pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  const expected = await runtimeIdentity(pluginRoot);
  await mkdir(stateDir(), { recursive: true, mode: 0o700 });
  const { token } = await provisionCredential(tokenFile());
  const ready = async () => (await probeHealth(token, expected)).current;
  if (await ready()) return { ready: true, token, port: PORT, restarted: false };

  const lease = await acquireStartupLease({ lockPath: `${stateFile()}.lock`, isReady: ready });
  if (!lease.acquired) {
    if (lease.ready) return { ready: true, token, port: PORT, restarted: false };
    return { ready: false, reason: lease.reason, port: PORT };
  }

  try {
    const observed = await probeHealth(token, expected);
    if (observed.current) return { ready: true, token, port: PORT, restarted: false };
    const prior = JSON.parse(await readFile(stateFile(), 'utf8').catch(() => '{}'));
    let restarted = false;
    if (prior.pid && ownProcess(prior.pid)) {
      if (!ownedIdentity(prior, expected)) {
        return { ready: false, reason: 'service process ownership is unverified; refusing to kill it', port: PORT };
      }
      await stopOwned(prior.pid);
      if (ownProcess(prior.pid)) return { ready: false, reason: 'stale hook service did not stop', port: PORT };
      restarted = true;
    }
    await unlink(stateFile()).catch(() => {});
    const entry = resolve(pluginRoot, 'tools', 'hook-service', 'server.mjs');
    spawn(process.execPath, [entry], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, DEV_POMOGATOR_PLUGIN_ROOT: pluginRoot },
    }).unref();
    for (let i = 0; i < 100; i += 1) {
      await sleep(LOCK_POLL_MS);
      if (await ready()) return { ready: true, token, port: PORT, restarted };
    }
    return { ready: false, reason: 'service failed to become healthy', port: PORT };
  } finally {
    await lease.release();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await ensureUp())}\n`);
}
