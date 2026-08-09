import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, stat, writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { join, resolve, relative, isAbsolute, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint } from './credential.mjs';
import { WorkerManager } from './worker-manager.mjs';

export const HOST = '127.0.0.1', PORT = 42619, VERSION = '1.0.0';
export const stateDir = () => process.env.DEV_POMOGATOR_STATE_DIR || join(process.env.LOCALAPPDATA || process.env.XDG_STATE_HOME || process.env.HOME || '.', 'dev-pomogator', 'hook-service');
export const stateFile = () => join(stateDir(), 'service.json');
export const tokenFile = () => join(stateDir(), 'token');
export const diagnosticsFile = (root = stateDir()) => join(root, 'failures.jsonl');
const MAX_BODY_BYTES = 2_000_000;
const MAX_OUTPUT_BYTES = 256_000;
const MAX_DIAGNOSTIC_BYTES = 1_000_000;
const MAX_DETAIL_CHARS = 2_000;
const EVENT_RESULT_TTL_MS = 30_000;

const tokenMatches = (actual, expected) => {
  const candidate = Buffer.from(String(actual || ''));
  const secret = Buffer.from(String(expected || ''));
  return candidate.length === secret.length && candidate.length > 0 && timingSafeEqual(candidate, secret);
};

const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
};

const sha256 = value => createHash('sha256').update(String(value)).digest('hex');

const classifyError = error => {
  if (error?.code === 'HOOK_TIMEOUT') return 'hook-timeout';
  if (error?.code === 'HOOK_EXIT') return 'hook-exit';
  if (error?.code === 'HOOK_SPAWN') return 'hook-spawn';
  if (error?.message === 'invalid hook route') return 'invalid-route';
  if (error?.message === 'request body too large') return 'body-too-large';
  return 'hook-runtime';
};

const sanitizeDetail = (error, secrets = []) => {
  let detail = error instanceof Error ? error.message : String(error);
  for (const secret of secrets.filter(Boolean)) detail = detail.split(String(secret)).join('[REDACTED]');
  detail = detail
    .replace(/\b(?:sk|or|ghp|gho|ghu|ghs|ghr|xox[baprs])-[A-Za-z0-9_-]{12,}\b/gi, '[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{12,}\b/gi, '[REDACTED]')
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, '[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED]');
  return detail.slice(0, MAX_DETAIL_CHARS) || 'hook runtime unavailable';
};

async function appendDiagnostic(root, diagnostic) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const target = diagnosticsFile(root);
  const currentSize = await stat(target).then(value => value.size).catch(() => 0);
  if (currentSize >= MAX_DIAGNOSTIC_BYTES) await rename(target, `${target}.1`).catch(() => {});
  await appendFile(target, `${JSON.stringify(diagnostic)}\n`, { encoding: 'utf8', mode: 0o600 });
}

const local = request => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress || '');

const body = request => new Promise((resolveBody, reject) => {
  let value = '';
  request.setEncoding('utf8');
  request.on('data', chunk => {
    value += chunk;
    if (Buffer.byteLength(value) > MAX_BODY_BYTES) request.destroy(new Error('request body too large'));
  });
  request.on('end', () => resolveBody(value));
  request.on('error', reject);
});

export async function loadRegistry(root) {
  return JSON.parse(await readFile(join(root, 'tools', 'hook-service', 'registry.json'), 'utf8'));
}

// The daemon advertises this identity so bootstrap can replace stale owned runtimes safely.
export async function runtimeIdentity(root) {
  const registrySource = await readFile(join(root, 'tools', 'hook-service', 'registry.json'), 'utf8');
  const registry = JSON.parse(registrySource);
  const adapterFiles = [...new Set(Object.values(registry.routes)
    .map(entry => entry.worker_target)
    .filter(Boolean)
    .map(target => join(root, target)))];
  const runtimeRoot = join(resolve(fileURLToPath(import.meta.url), '..'));
  const runtimeFiles = [
    fileURLToPath(import.meta.url),
    join(runtimeRoot, 'worker-manager.mjs'),
    join(runtimeRoot, 'worker-host.mjs'),
    join(runtimeRoot, 'registry.mjs'),
    ...adapterFiles,
  ];
  const runtimeSources = await Promise.all(runtimeFiles.map(file => readFile(file, 'utf8')));
  return {
    rootFingerprint: fingerprint(resolve(root)),
    registryDigest: sha256(registrySource),
    runtimeDigest: sha256(runtimeSources.join('\n\\0\n')),
  };
}

export function isWithinRoot(root, target) {
  const windows = /^[a-z]:/i.test(root) || /^[a-z]:/i.test(target) || root.includes('\\') || target.includes('\\');
  const path = windows ? win32 : { resolve, relative, isAbsolute };
  const base = path.resolve(root);
  const resolvedTarget = path.resolve(base, target);
  const rel = path.relative(base, resolvedTarget);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export const adaptOutput = (event, stdout, stderr, exitCode) => {
  const output = stdout.trim();
  if (exitCode === 2) {
    // A command hook may emit a structured deny and exit 2. Prefer that decision
    // over launcher diagnostics on stderr (Windows tsx-runner used to append
    // `native:fail(2)`, replacing the real guard reason at the HTTP boundary).
    if (output) {
      try {
        const parsed = JSON.parse(output);
        if (parsed && !Array.isArray(parsed)) return parsed;
      } catch {
        // Legacy stderr/text blocking form below.
      }
    }
    const reason = stderr.trim() || output || 'Hook blocked';
    if (event === 'PreToolUse') return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
    return { decision: 'block', reason };
  }
  if (exitCode !== 0) {
    if (output) {
      try {
        const parsed = JSON.parse(output);
        if (parsed && !Array.isArray(parsed) && (parsed.decision || parsed.hookSpecificOutput)) return parsed;
      } catch {
        // A malformed payload must not mask the abnormal exit below.
      }
    }
    const error = new Error(stderr.trim() || `hook exited ${exitCode}`);
    error.code = 'HOOK_EXIT';
    error.exitCode = exitCode;
    throw error;
  }
  if (!output) return {};
  try {
    const parsed = JSON.parse(output);
    return parsed && !Array.isArray(parsed) ? parsed : { additionalContext: output };
  } catch {
    return { additionalContext: output };
  }
};

function boundedCapture(maxBytes = MAX_OUTPUT_BYTES) {
  let value = '';
  let bytes = 0;
  return {
    append(chunk) {
      const text = String(chunk);
      const size = Buffer.byteLength(text);
      if (bytes + size > maxBytes) {
        const error = new Error(`hook output exceeded ${maxBytes} bytes`);
        error.code = 'HOOK_OUTPUT_LIMIT';
        throw error;
      }
      value += text;
      bytes += size;
    },
    value: () => value,
  };
}

/** Legacy executor remains the compatibility boundary for one-shot scripts. */
export async function execute(entry, input, root, event, workerManager, route = '') {
  if (!entry || entry.event !== event || !isWithinRoot(root, entry.target)) throw new Error('invalid hook route');
  if (workerManager?.canUse(entry)) {
    if (!isWithinRoot(root, entry.worker_target)) throw new Error('invalid worker route');
    return await workerManager.execute(route, entry, input, event);
  }

  const target = resolve(root, entry.target);
  const args = entry.target.endsWith('.ts')
    ? ['-e', `require(${JSON.stringify(join(root, 'tools', '_shared', 'bootstrap.cjs'))})`, '--', target, ...(entry.args || [])]
    : [target, ...(entry.args || [])];
  return await new Promise((resolveRun, reject) => {
    let child;
    try {
      child = spawn(process.execPath, args, {
        cwd: process.env.CLAUDE_PROJECT_DIR || root,
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: root },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (cause) {
      const error = new Error(cause.message);
      error.code = 'HOOK_SPAWN';
      reject(error);
      return;
    }
    const stdout = boundedCapture();
    const stderr = boundedCapture();
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const terminate = error => {
      if (settled) return;
      child.kill();
      finish(reject, error);
    };
    timer = setTimeout(() => {
      const error = new Error('hook timed out');
      error.code = 'HOOK_TIMEOUT';
      terminate(error);
    }, Math.max(1, entry.timeout || 30) * 1000);
    child.stdout.on('data', chunk => { try { stdout.append(chunk); } catch (error) { terminate(error); } });
    child.stderr.on('data', chunk => { try { stderr.append(chunk); } catch (error) { terminate(error); } });
    child.on('error', cause => {
      const error = new Error(cause.message);
      error.code = 'HOOK_SPAWN';
      finish(reject, error);
    });
    child.on('close', code => {
      if (settled) return;
      try { finish(resolveRun, adaptOutput(event, stdout.value(), stderr.value(), code ?? 1)); } catch (error) { finish(reject, error); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

/**
 * Execute a logical event in registry order without changing public route identity.
 * Each route keeps its own result so Claude Code does not receive one route's
 * context or decision repeatedly when the host sends the event fanout.
 */
export async function executeEvent(registry, event, input, root, workerManager) {
  const routes = Object.entries(registry.routes)
    .filter(([, entry]) => entry.event === event)
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }));
  const outputs = {};
  const failures = [];
  for (const [route, entry] of routes) {
    try { outputs[route] = await execute(entry, input, root, event, workerManager, route); }
    catch (error) { failures.push({ route, error }); }
  }
  return { outputs, failures };
}

const routeResult = (result, route) => {
  const failure = result.failures.find(item => item.route === route);
  if (failure) throw failure.error;
  return result.outputs[route] || {};
};

export async function startServer({ pluginRoot, token, port = PORT, stateRoot = stateDir() } = {}) {
  const registry = await loadRegistry(pluginRoot);
  const { registryDigest, rootFingerprint, runtimeDigest } = await runtimeIdentity(pluginRoot);
  const workerManager = new WorkerManager({ root: pluginRoot });
  const eventFlights = new Map();
  const dispatchEvent = async (event, input, route) => {
    if (event !== 'Stop') return execute(registry.routes[route], input, pluginRoot, event, workerManager, route);
    const sessionId = input && typeof input.session_id === 'string' ? input.session_id : '';
    const key = sessionId ? `${event}:${sessionId}` : '';
    if (!key) return execute(registry.routes[route], input, pluginRoot, event, workerManager, route);
    const now = Date.now();
    const existing = eventFlights.get(key);
    if (existing && existing.expiresAt > now) {
      existing.seen.add(route);
      return existing.promise.then(result => routeResult(result, route));
    }
    if (existing) clearTimeout(existing.expiryTimer);
    const expected = new Set(Object.entries(registry.routes)
      .filter(([, entry]) => entry.event === event)
      .map(([routeId]) => routeId));
    const state = { seen: new Set([route]), expected, expiresAt: now + EVENT_RESULT_TTL_MS, expiryTimer: null, promise: null };
    state.expiryTimer = setTimeout(() => {
      if (eventFlights.get(key) === state) eventFlights.delete(key);
    }, EVENT_RESULT_TTL_MS);
    state.expiryTimer.unref?.();
    state.promise = executeEvent(registry, event, input, pluginRoot, workerManager);
    eventFlights.set(key, state);
    return state.promise.then(result => routeResult(result, route));
  };
  const server = http.createServer(async (request, response) => {
    let route = '';
    try {
      if (!local(request)) return json(response, 403, { error: 'loopback only' });
      const url = new URL(request.url || '/', `http://${HOST}:${port}`);
      if (!tokenMatches(request.headers['x-dev-pomogator-token'], token)) return json(response, 401, { error: 'unauthorized' });
      if (url.pathname === '/health') return json(response, 200, {
        service: 'dev-pomogator-hook-service',
        version: VERSION,
        tokenFingerprint: fingerprint(token),
        rootFingerprint,
        registryDigest,
        runtimeDigest,
      });
      if (request.method !== 'POST') return json(response, 405, { error: 'POST required' });
      let input;
      try { input = JSON.parse(await body(request)); } catch { return json(response, 400, { error: 'invalid JSON' }); }
      if (url.pathname === '/v1/register') return json(response, 200, { registered: Boolean(input.session_id) });
      route = decodeURIComponent(url.pathname.replace('/v1/dispatch/', ''));
      const entry = registry.routes[route];
      if (!entry || url.pathname !== `/v1/dispatch/${encodeURIComponent(route)}`) return json(response, 404, { error: 'unknown route' });
      return json(response, 200, await dispatchEvent(route.split('/')[0], input, route));
    } catch (error) {
      const incidentId = randomUUID();
      const detail = sanitizeDetail(error, [token]);
      const diagnostic = {
        schema: 1,
        incidentId,
        timestamp: new Date().toISOString(),
        route: route || null,
        code: classifyError(error),
        detail,
        exitCode: Number.isInteger(error?.exitCode) ? error.exitCode : null,
        pid: process.pid,
        tokenFingerprint: fingerprint(token),
        rootFingerprint,
        registryDigest,
        runtimeDigest,
      };
      await appendDiagnostic(stateRoot, diagnostic).catch(() => {});
      return json(response, 503, { error: 'hook runtime unavailable', incidentId, detail });
    }
  });
  server.once('close', () => workerManager.close());
  server.workerManager = workerManager;
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => { server.off('error', reject); resolveListen(); });
  });
  return server;
}

async function atomicState(path, content) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, path);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pluginRoot = process.env.DEV_POMOGATOR_PLUGIN_ROOT || process.cwd();
  const token = (await readFile(tokenFile(), 'utf8')).trim();
  await mkdir(stateDir(), { recursive: true, mode: 0o700 });
  const identity = await runtimeIdentity(pluginRoot);
  const server = await startServer({ pluginRoot, token });
  await atomicState(stateFile(), `${JSON.stringify({
    pid: process.pid,
    port: PORT,
    version: VERSION,
    startedAt: new Date().toISOString(),
    ...identity,
  })}\n`);
  const close = () => server.close(async () => { await unlink(stateFile()).catch(() => {}); process.exit(0); });
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
}
