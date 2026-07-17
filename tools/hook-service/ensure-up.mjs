import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST, PORT, VERSION, stateDir, stateFile, tokenFile } from './server.mjs';
import { fingerprint, provisionCredential } from './credential.mjs';

const health = async token => { try { const response = await fetch(`http://${HOST}:${PORT}/health`, {headers:{'x-dev-pomogator-token':token}, signal:AbortSignal.timeout(500)}); const body = await response.json(); return response.status === 200 && body.service === 'dev-pomogator-hook-service' && body.version === VERSION && body.tokenFingerprint === fingerprint(token); } catch { return false; } };
const ownProcess = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

export async function ensureUp(pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  await mkdir(stateDir(), {recursive:true, mode:0o700});
  const startupLock = `${stateFile()}.lock`;
  let lock;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { lock = await open(startupLock, 'wx', 0o600); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; await new Promise(resolveWait => setTimeout(resolveWait, 50)); }
  }
  if (!lock) return {ready:false, reason:'service startup lock timed out', port:PORT};
  try {
    const { token } = await provisionCredential(tokenFile());
    if (await health(token)) return {ready:true, token, port:PORT};
    const prior = JSON.parse(await readFile(stateFile(), 'utf8').catch(() => '{}'));
    if (prior.pid && ownProcess(prior.pid)) {
      // A live process without this service's health identity is never killed.
      return {ready:false, reason:'owned process is unhealthy', token, port:PORT};
    }
    await unlink(stateFile()).catch(() => {});
    const entry = resolve(pluginRoot, 'tools', 'hook-service', 'server.mjs');
    spawn(process.execPath, [entry], {detached:true, stdio:'ignore', windowsHide:true, env:{...process.env, DEV_POMOGATOR_PLUGIN_ROOT:pluginRoot}}).unref();
    for (let attempt = 0; attempt < 20; attempt += 1) { await new Promise(r => setTimeout(r, 50)); if (await health(token)) return {ready:true, token, port:PORT}; }
    return {ready:false, reason:'service did not become healthy', token, port:PORT};
  } finally {
    await lock.close().catch(() => {});
    await unlink(startupLock).catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await ensureUp();
