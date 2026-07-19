import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const stateDir = () => process.env.DEV_POMOGATOR_STATE_DIR || join(process.env.LOCALAPPDATA || process.env.XDG_STATE_HOME || process.env.HOME || '.', 'dev-pomogator', 'hook-service');

const MAX_BYTES = 10 * 1024 * 1024;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const ALLOWED_OUTCOMES = new Set(['startup','shutdown','registered','success','denied','failed','timeout','invalid_request','bootstrap_fail_open','identity_mismatch','recovered']);

export const auditFile = () => join(stateDir(), 'events.jsonl');
export const digest = value => createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
export const correlationId = () => randomUUID();

const safe = value => typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,160}$/.test(value) ? value : undefined;
const number = value => Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;

export function sanitizeEvent(input = {}) {
  const event = {
    schema: 1,
    ts: new Date().toISOString(),
    id: safe(input.id) || correlationId(),
    outcome: ALLOWED_OUTCOMES.has(input.outcome) ? input.outcome : 'failed',
  };
  for (const key of ['route','event','stage','exitClass','serviceId','rootDigest','registryDigest','code']) {
    const value = safe(input[key]);
    if (value !== undefined) event[key] = value;
  }
  for (const key of ['durationMs','timeoutMs']) {
    const value = number(input[key]);
    if (value !== undefined) event[key] = value;
  }
  return event;
}

async function rotate(file) {
  let info;
  try { info = await stat(file); } catch { return; }
  if (info.size <= MAX_BYTES) return;
  const lockPath = `${file}.rotate.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx'); } catch { return; }
  try {
    const cutoff = Date.now() - RETENTION_MS;
    const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
    let kept = lines.filter(line => { try { return Date.parse(JSON.parse(line).ts) >= cutoff; } catch { return false; } });
    while (Buffer.byteLength(kept.join('\n')) > MAX_BYTES / 2) kept.shift();
    const temp = `${file}.tmp-${process.pid}`;
    await writeFile(temp, kept.length ? `${kept.join('\n')}\n` : '', 'utf8');
    await rename(temp, file);
  } finally {
    await lock.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}

export async function writeAudit(input, file = auditFile()) {
  try {
    await mkdir(stateDir(), { recursive: true, mode: 0o700 });
    await appendFile(file, `${JSON.stringify(sanitizeEvent(input))}\n`, { encoding: 'utf8', mode: 0o600 });
    await rotate(file);
    return true;
  } catch { return false; }
}

export async function readAudit({ file = auditFile(), errors = false, route, sinceMs, limit = 100 } = {}) {
  try {
    const cutoff = sinceMs ? Date.now() - sinceMs : 0;
    const rows = (await readFile(file, 'utf8')).split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    return rows.filter(row => (!errors || ['failed','timeout','bootstrap_fail_open','identity_mismatch'].includes(row.outcome)) && (!route || row.route === route) && (!cutoff || Date.parse(row.ts) >= cutoff)).slice(-Math.max(1, Math.min(limit, 1000)));
  } catch { return []; }
}
