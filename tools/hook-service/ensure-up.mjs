import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST, PORT, VERSION, runtimeIdentity, stateDir, stateFile, tokenFile } from './server.mjs';
import { fingerprint, provisionCredential } from './credential.mjs';

const STARTUP_WAIT_MS = 5_000;
const LOCK_POLL_MS = 50;
const MALFORMED_LOCK_STALE_MS = 30_000;

const sleep = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));

const positivePid = value => Number.isInteger(value) && value > 0 ? value : null;
const validPort = value => Number.isInteger(value) && value > 0 && value <= 65_535 ? value : null;

export const listenerPidsFromNetstat = (output, host = HOST, port = PORT) => {
  const endpoint = `${host}:${port}`.toLowerCase();
  const pids = new Set();
  for (const line of String(output || '').split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 2 || fields[1].toLowerCase() !== endpoint) continue;
    const candidate = /^\d+$/.test(fields.at(-1) || '') ? Number(fields.at(-1)) : null;
    if (positivePid(candidate)) pids.add(candidate);
  }
  return [...pids].sort((left, right) => left - right);
};

const captureCommand = (file, args) => new Promise(resolveCapture => {
  execFile(file, args, { encoding: 'utf8', windowsHide: true, timeout: 2_000, maxBuffer: 1024 * 1024 }, (_error, stdout) => {
    resolveCapture(String(stdout || ''));
  });
});

const terminateWindowsTree = pid => new Promise(resolveTermination => {
  execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 2_000,
    maxBuffer: 1024 * 1024,
  }, error => resolveTermination(!error));
});

export async function resolveLoopbackListenerPid({
  host = HOST,
  port = PORT,
  platform = process.platform,
  run = captureCommand,
} = {}) {
  if (platform === 'win32') {
    const pids = listenerPidsFromNetstat(await run('netstat.exe', ['-ano', '-p', 'tcp']), host, port);
    return pids.length === 1 ? pids[0] : null;
  }

  const lsof = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  const lsofPids = [...new Set(String(lsof).split(/\s+/).filter(value => /^\d+$/.test(value)).map(Number).filter(positivePid))];
  if (lsofPids.length === 1) return lsofPids[0];
  if (lsofPids.length > 1) return null;

  const ss = await run('ss', ['-ltnp']);
  const endpoint = `${host}:${port}`;
  const ssPids = new Set();
  for (const line of String(ss).split(/\r?\n/)) {
    if (!line.split(/\s+/).includes(endpoint)) continue;
    for (const match of line.matchAll(/pid=(\d+)/g)) ssPids.add(Number(match[1]));
  }
  return ssPids.size === 1 ? [...ssPids][0] : null;
}

const probeHealth = async (token, expected, port = PORT) => {
  try {
    const response = await fetch(`http://${HOST}:${port}/health`, {
      headers: { 'x-dev-pomogator-token': token },
      signal: AbortSignal.timeout(500),
    });
    const body = await response.json();
    const owned = response.status === 200
      && body.service === 'dev-pomogator-hook-service'
      && body.tokenFingerprint === fingerprint(token);
    return {
      owned,
      current: owned
        && body.version === VERSION
        && body.rootFingerprint === expected.rootFingerprint
        && body.registryDigest === expected.registryDigest
        && body.runtimeDigest === expected.runtimeDigest,
      pid: positivePid(body.pid),
    };
  } catch {
    return { owned: false, current: false };
  }
};

export async function authenticatedListenerPid({ observed, probe, resolveListenerPid = resolveLoopbackListenerPid } = {}) {
  if (!observed?.owned || typeof probe !== 'function' || typeof resolveListenerPid !== 'function') return null;
  const first = positivePid(await resolveListenerPid());
  if (!first || (positivePid(observed.pid) && observed.pid !== first)) return null;
  const confirmed = await probe();
  if (!confirmed?.owned) return null;
  const second = positivePid(await resolveListenerPid());
  if (!second || first !== second || (positivePid(confirmed.pid) && confirmed.pid !== second)) return null;
  return first;
}

export const processExists = (pid, signal = process.kill) => {
  try {
    signal(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
};

const ownProcess = pid => processExists(pid);

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
    if (await isReady()) return { acquired: false, ready: true, reclaimed };
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
  if (!ownProcess(pid)) return true;
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (process.platform !== 'win32' || error?.code !== 'EPERM') return false;
    if (!await terminateWindowsTree(pid)) return false;
  }
  for (let i = 0; i < 100 && ownProcess(pid); i += 1) await sleep(LOCK_POLL_MS);
  return !ownProcess(pid);
};

const readServiceState = async () => {
  try {
    const parsed = JSON.parse(await readFile(stateFile(), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const currentService = async (token, expected) => {
  const state = await readServiceState();
  const port = validPort(state.port);
  if (!port) return null;
  const health = await probeHealth(token, expected, port);
  const statePid = positivePid(state.pid);
  return health.current && statePid && health.pid === statePid ? { ...health, port, state } : null;
};

export async function ensureUp(pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  const expected = await runtimeIdentity(pluginRoot);
  await mkdir(stateDir(), { recursive: true, mode: 0o700 });
  const { token } = await provisionCredential(tokenFile());
  const ready = async () => Boolean(await currentService(token, expected));
  const existing = await currentService(token, expected);
  if (existing) return { ready: true, token, port: existing.port, restarted: false };

  const lease = await acquireStartupLease({ lockPath: `${stateFile()}.lock`, isReady: ready });
  if (!lease.acquired) {
    if (lease.ready) {
      const current = await currentService(token, expected);
      if (current) return { ready: true, token, port: current.port, restarted: false };
    }
    return { ready: false, reason: lease.reason, port: PORT };
  }

  try {
    const current = await currentService(token, expected);
    if (current) return { ready: true, token, port: current.port, restarted: false };
    const prior = await readServiceState();
    const priorPort = validPort(prior.port);
    const observedPort = priorPort || PORT;
    const observed = await probeHealth(token, expected, observedPort);
    const restarted = Boolean(observed.owned || positivePid(prior.pid));
    if (observed.owned && prior.pid && ownProcess(prior.pid) && ownedIdentity(prior, expected)
      && (!positivePid(observed.pid) || observed.pid === prior.pid)) {
      await stopOwned(prior.pid);
    } else if (observed.owned) {
      const authenticatedPid = await authenticatedListenerPid({
        observed,
        probe: () => probeHealth(token, expected, observedPort),
        resolveListenerPid: () => resolveLoopbackListenerPid({ port: observedPort }),
      });
      if (authenticatedPid) await stopOwned(authenticatedPid);
    }
    await unlink(stateFile()).catch(() => {});
    const entry = resolve(pluginRoot, 'tools', 'hook-service', 'server.mjs');
    spawn(process.execPath, [entry], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, DEV_POMOGATOR_PLUGIN_ROOT: pluginRoot, DEV_POMOGATOR_HOOK_PORT: '0' },
    }).unref();
    for (let i = 0; i < 100; i += 1) {
      await sleep(LOCK_POLL_MS);
      const started = await currentService(token, expected);
      if (started) return { ready: true, token, port: started.port, restarted };
    }
    return { ready: false, reason: 'service failed to become healthy', port: PORT };
  } finally {
    await lease.release();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await ensureUp())}\n`);
}
