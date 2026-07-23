import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST, PORT, VERSION, runtimeIdentity, stateDir, stateFile, tokenFile } from './server.mjs';
import { fingerprint, provisionCredential } from './credential.mjs';

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
  for (let i = 0; i < 20 && ownProcess(pid); i += 1) await new Promise(resolveWait => setTimeout(resolveWait, 50));
};

export async function ensureUp(pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  const expected = await runtimeIdentity(pluginRoot);
  await mkdir(stateDir(), { recursive: true, mode: 0o700 });
  const { token } = await provisionCredential(tokenFile());
  if ((await probeHealth(token, expected)).current) return { ready: true, token, port: PORT, restarted: false };
  const lockPath = `${stateFile()}.lock`;
  let lock;
  for (let i = 0; i < 20; i += 1) {
    try {
      lock = await open(lockPath, 'wx', 0o600);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await new Promise(resolveWait => setTimeout(resolveWait, 50));
      if ((await probeHealth(token, expected)).current) return { ready: true, token, port: PORT, restarted: false };
    }
  }
  if (!lock) return { ready: false, reason: 'service startup lock timed out', port: PORT };
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
    for (let i = 0; i < 20; i += 1) {
      await new Promise(resolveWait => setTimeout(resolveWait, 50));
      if ((await probeHealth(token, expected)).current) return { ready: true, token, port: PORT, restarted };
    }
    return { ready: false, reason: 'service failed to become healthy', port: PORT };
  } finally {
    await lock.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await ensureUp())}\n`);
}
