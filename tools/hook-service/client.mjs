#!/usr/bin/env node
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ensureUp } from './ensure-up.mjs';
import { diagnosticsFile, stateDir } from './server.mjs';
import { fingerprint } from './credential.mjs';

const MAX_BODY_BYTES = 2_000_000;
const MAX_DIAGNOSTIC_BYTES = 1_000_000;
const CONNECT_TIMEOUT_MS = 3_000;
const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET']);

const readInput = () => new Promise((resolveInput, reject) => {
  let value = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    value += chunk;
    if (Buffer.byteLength(value) > MAX_BODY_BYTES) reject(new Error('hook input too large'));
  });
  process.stdin.on('end', () => resolveInput(value || '{}'));
  process.stdin.on('error', reject);
});

const errorCode = error => error?.code || error?.cause?.code || '';
export const connectionFailure = error => CONNECTION_CODES.has(errorCode(error))
  || /fetch failed|connect timeout|socket.*closed/i.test(error instanceof Error ? error.message : String(error));

const sanitizedDetail = error => {
  const code = errorCode(error);
  return code || (error instanceof Error ? error.name : 'transport-unavailable');
};

async function appendClientDiagnostic({ route, error, token = '', root = stateDir() }) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const target = diagnosticsFile(root);
  const currentSize = await stat(target).then(value => value.size).catch(() => 0);
  if (currentSize >= MAX_DIAGNOSTIC_BYTES) await rename(target, `${target}.1`).catch(() => {});
  await appendFile(target, `${JSON.stringify({
    incidentId: randomUUID(),
    at: new Date().toISOString(),
    route,
    code: 'hook-transport',
    detail: sanitizedDetail(error),
    tokenFingerprint: token ? fingerprint(token) : '',
  })}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function dispatch({ route, input, service, fetchImpl }) {
  return fetchImpl(`http://127.0.0.1:${service.port}/v1/dispatch/${encodeURIComponent(route)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-pomogator-token': service.token,
    },
    body: input,
    signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
  });
}

export async function runManagedHook({
  route,
  input,
  pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  ensureUpImpl = ensureUp,
  fetchImpl = fetch,
  diagnosticRoot = stateDir(),
} = {}) {
  if (!route) return { delivered: false, failOpen: true, reason: 'missing-route' };
  let service;
  try {
    service = await ensureUpImpl(pluginRoot);
    if (!service.ready) throw Object.assign(new Error(service.reason || 'hook service unavailable'), { code: 'SERVICE_NOT_READY' });
    let response;
    try {
      response = await dispatch({ route, input, service, fetchImpl });
    } catch (error) {
      if (!connectionFailure(error)) throw error;
      service = await ensureUpImpl(pluginRoot);
      if (!service.ready) throw Object.assign(new Error(service.reason || 'hook service recovery failed'), { code: 'SERVICE_NOT_READY' });
      response = await dispatch({ route, input, service, fetchImpl });
    }
    const body = await response.text();
    return { delivered: true, status: response.status, body };
  } catch (error) {
    await appendClientDiagnostic({ route, error, token: service?.token || '', root: diagnosticRoot }).catch(() => {});
    return { delivered: false, failOpen: true, reason: sanitizedDetail(error) };
  }
}

async function main() {
  const route = process.argv[2] || '';
  const input = await readInput();
  const result = await runManagedHook({ route, input });
  if (result.delivered && result.body) process.stdout.write(result.body);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Managed hooks are fail-open even if the client itself cannot initialize.
  });
}
