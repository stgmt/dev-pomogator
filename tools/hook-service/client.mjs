#!/usr/bin/env node
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ensureUp } from './ensure-up.mjs';
import { diagnosticsFile, stateDir } from './server.mjs';
import { fingerprint } from './credential.mjs';
import { encodeProjectRootHeader, resolveHookProjectRoot } from '../_shared/hook-project-root.mjs';

const MAX_BODY_BYTES = 2_000_000;
const MAX_DIAGNOSTIC_BYTES = 1_000_000;
const TRANSPORT_OVERHEAD_MS = 5_000;
const DEFAULT_ROUTE_TIMEOUT_MS = 30_000;
const MAX_REQUEST_TIMEOUT_MS = 15 * 60_000;
// Retry only failures known to happen before the request reaches a listener.
// Reset/closed-socket/EPIPE failures are delivery-uncertain and must not replay
// Stop work that may already have completed in the daemon.
const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);

export const readInput = (stream = process.stdin, { maxBytes = MAX_BODY_BYTES } = {}) => new Promise((resolveInput, reject) => {
  const chunks = [];
  let bytes = 0;
  let settled = false;
  const cleanup = () => {
    stream.off('data', onData);
    stream.off('end', onEnd);
    stream.off('error', onError);
  };
  const fail = error => {
    if (settled) return;
    settled = true;
    cleanup();
    stream.pause?.();
    stream.destroy?.();
    reject(error);
  };
  const onData = chunk => {
    const chunkBytes = Buffer.byteLength(chunk);
    if (bytes + chunkBytes > maxBytes) return fail(new Error('hook input too large'));
    bytes += chunkBytes;
    chunks.push(chunk);
  };
  const onEnd = () => {
    if (settled) return;
    settled = true;
    cleanup();
    resolveInput(chunks.join('') || '{}');
  };
  const onError = error => fail(error);
  stream.setEncoding('utf8');
  stream.on('data', onData);
  stream.on('end', onEnd);
  stream.on('error', onError);
});

export async function routeRequestTimeoutMs(pluginRoot, route) {
  try {
    const registry = JSON.parse(await readFile(join(pluginRoot, 'tools', 'hook-service', 'registry.json'), 'utf8'));
    const routeIds = registry.groups?.[route] || [route];
    const executionMs = routeIds.reduce((total, routeId) => {
      const seconds = Number(registry.routes?.[routeId]?.timeout);
      return total + Math.max(1, Number.isFinite(seconds) ? seconds : DEFAULT_ROUTE_TIMEOUT_MS / 1000) * 1000;
    }, 0);
    return Math.min(MAX_REQUEST_TIMEOUT_MS, Math.max(DEFAULT_ROUTE_TIMEOUT_MS, executionMs) + TRANSPORT_OVERHEAD_MS);
  } catch {
    return DEFAULT_ROUTE_TIMEOUT_MS + TRANSPORT_OVERHEAD_MS;
  }
}

const errorCode = error => error?.code || error?.cause?.code || '';
export const connectionFailure = error => CONNECTION_CODES.has(errorCode(error))
  || /connect (?:timeout|ECONNREFUSED)|connection refused/i.test(error instanceof Error ? error.message : String(error));

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

async function dispatch({ route, input, service, fetchImpl, projectRoot, timeoutMs }) {
  const projectHeader = encodeProjectRootHeader(projectRoot);
  return fetchImpl(`http://127.0.0.1:${service.port}/v1/dispatch/${encodeURIComponent(route)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-pomogator-token': service.token,
      ...(projectHeader ? { 'x-dev-pomogator-project-root': projectHeader } : {}),
    },
    body: input,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function runManagedHook({
  route,
  input,
  pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || fileURLToPath(new URL('../..', import.meta.url)),
  ensureUpImpl = ensureUp,
  fetchImpl = fetch,
  diagnosticRoot = stateDir(),
} = {}) {
  if (!route) return { delivered: false, failOpen: true, reason: 'missing-route' };
  let parsedInput = {};
  try { parsedInput = JSON.parse(input || '{}'); } catch { /* server returns the canonical invalid JSON response */ }
  const projectRoot = resolveHookProjectRoot({ input: parsedInput });
  let service;
  try {
    const timeoutMs = await routeRequestTimeoutMs(pluginRoot, route);
    service = await ensureUpImpl(pluginRoot);
    if (!service.ready) throw Object.assign(new Error(service.reason || 'hook service unavailable'), { code: 'SERVICE_NOT_READY' });
    let response;
    try {
      response = await dispatch({ route, input, service, fetchImpl, projectRoot, timeoutMs });
    } catch (error) {
      if (!connectionFailure(error)) throw error;
      service = await ensureUpImpl(pluginRoot);
      if (!service.ready) throw Object.assign(new Error(service.reason || 'hook service recovery failed'), { code: 'SERVICE_NOT_READY' });
      response = await dispatch({ route, input, service, fetchImpl, projectRoot, timeoutMs });
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
