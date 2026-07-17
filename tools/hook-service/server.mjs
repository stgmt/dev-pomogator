import { timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { join, resolve, relative, isAbsolute, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint } from './credential.mjs';

export const HOST = '127.0.0.1', PORT = 42619, VERSION = '1.0.0';
export const stateDir = () => process.env.DEV_POMOGATOR_STATE_DIR || join(process.env.LOCALAPPDATA || process.env.XDG_STATE_HOME || process.env.HOME || '.', 'dev-pomogator', 'hook-service');
export const stateFile = () => join(stateDir(), 'service.json');
export const tokenFile = () => join(stateDir(), 'token');
const MAX_BODY_BYTES = 2_000_000;

const tokenMatches = (actual, expected) => {
  const candidate = Buffer.from(String(actual || ''));
  const secret = Buffer.from(String(expected || ''));
  return candidate.length === secret.length && candidate.length > 0 && timingSafeEqual(candidate, secret);
};

const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
};

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

export function isWithinRoot(root, target) {
  const windows = /^[a-z]:/i.test(root) || /^[a-z]:/i.test(target) || root.includes('\\') || target.includes('\\');
  const path = windows ? win32 : { resolve, relative, isAbsolute };
  const base = path.resolve(root);
  const resolvedTarget = path.resolve(base, target);
  const rel = path.relative(base, resolvedTarget);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

const adaptOutput = (event, stdout, stderr, exitCode) => {
  const output = stdout.trim();
  if (exitCode === 2) {
    const reason = stderr.trim() || output || 'Hook blocked';
    if (event === 'PreToolUse') return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
    return { decision: 'block', reason };
  }
  if (exitCode !== 0) throw new Error(stderr.trim() || `hook exited ${exitCode}`);
  if (!output) return {};
  try {
    const parsed = JSON.parse(output);
    return parsed && !Array.isArray(parsed) ? parsed : { additionalContext: output };
  } catch {
    return { additionalContext: output };
  }
};

export async function execute(entry, input, root, event) {
  if (!entry || entry.event !== event || !isWithinRoot(root, entry.target)) throw new Error('invalid hook route');
  const target = resolve(root, entry.target);
  const args = entry.target.endsWith('.ts')
    ? ['-e', `require(${JSON.stringify(join(root, 'tools', '_shared', 'bootstrap.cjs'))})`, '--', target, ...(entry.args || [])]
    : [target, ...(entry.args || [])];
  return await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.env.CLAUDE_PROJECT_DIR || root,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: root },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('hook timed out')); }, Math.max(1, entry.timeout || 30) * 1000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      try { resolveRun(adaptOutput(event, stdout, stderr, code ?? 1)); } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

export async function startServer({ pluginRoot, token, port = PORT } = {}) {
  const registry = await loadRegistry(pluginRoot);
  const server = http.createServer(async (request, response) => {
    try {
      if (!local(request)) return json(response, 403, { error: 'loopback only' });
      const url = new URL(request.url || '/', `http://${HOST}:${port}`);
      if (!tokenMatches(request.headers['x-dev-pomogator-token'], token)) return json(response, 401, { error: 'unauthorized' });
      if (url.pathname === '/health') return json(response, 200, { service: 'dev-pomogator-hook-service', version: VERSION, tokenFingerprint: fingerprint(token) });
      if (request.method !== 'POST') return json(response, 405, { error: 'POST required' });
      let input;
      try { input = JSON.parse(await body(request)); } catch { return json(response, 400, { error: 'invalid JSON' }); }
      if (url.pathname === '/v1/register') return json(response, 200, { registered: Boolean(input.session_id) });
      const id = decodeURIComponent(url.pathname.replace('/v1/dispatch/', ''));
      const entry = registry.routes[id];
      if (!entry || url.pathname !== `/v1/dispatch/${encodeURIComponent(id)}`) return json(response, 404, { error: 'unknown route' });
      return json(response, 200, await execute(entry, input, pluginRoot, id.split('/')[0]));
    } catch (error) {
      return json(response, 503, { error: 'hook runtime unavailable', detail: error.message });
    }
  });
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
  const server = await startServer({ pluginRoot, token });
  await atomicState(stateFile(), `${JSON.stringify({ pid: process.pid, port: PORT, version: VERSION })}\n`);
  const close = () => server.close(async () => { await unlink(stateFile()).catch(() => {}); process.exit(0); });
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
}
