/**
 * Bounded append-only JSONL writer for conformance findings.
 *
 * Project state is kept below `<repoRoot>/.dev-pomogator/.spec-check-log`.
 * Rotation, age retention, aggregate retention, and the disk reserve are
 * maintained while holding a short cross-process lock. Only recognized,
 * regular, realpath-confined closed shards are ever removed; the active shard
 * is immutable to maintenance.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Finding } from '../spec-graph/conformance.ts';

export const ROTATION_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_FREE_BYTES = 1024 * 1024 * 1024;
const DIR_REL = '.dev-pomogator/.spec-check-log';
const LOCK_NAME = '.maintenance.lock';
const LOCK_WAIT_MS = 500;
const LOCK_STALE_MS = 30_000;
const DIAGNOSTIC_INTERVAL_MS = 60_000;
const MAX_DIAGNOSTIC_BYTES = 512;
const SHARD_RE = /^\d{4}-\d{2}-\d{2}(?:-\d+)?\.jsonl$/;
const diagnostics = new Map<string, number>();

export interface LogEntry {
  timestamp: string;
  finding_code: string;
  severity: 'error' | 'warning' | 'info';
  location: { file: string; line: number };
  message: string;
  spec_slug?: string;
  node_id?: string;
  related_id?: string;
  session_id?: string;
  source: string;
}

export interface AppendOptions {
  repoRoot: string;
  sessionId?: string;
  source: string;
  now?: Date;
  rotationBytes?: number;
  maxTotalBytes?: number;
  retentionMs?: number;
  minFreeBytes?: number;
  lockWaitMs?: number;
  freeBytes?: (repoRoot: string) => number;
  onDiagnostic?: (message: string) => void;
}

type RawAppendOptions = Omit<AppendOptions, 'source' | 'sessionId'>;

export class JournalSkipError extends Error {
  code = 'SPEC_CHECK_LOG_SKIPPED';
  constructor(message: string) {
    super(message);
    this.name = 'JournalSkipError';
  }
}

function utcDateStamp(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function specSlugOf(filePath: string): string | undefined {
  const m = filePath.replace(/\\/g, '/').match(/(?:^|\/)\.specs\/([^/]+)\//);
  return m ? m[1] : undefined;
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function emitDiagnostic(opts: RawAppendOptions | AppendOptions, code: string, detail: string): void {
  const now = (opts.now ?? new Date()).getTime();
  const key = `${path.resolve(opts.repoRoot)}:${code}`;
  if (now - (diagnostics.get(key) ?? 0) < DIAGNOSTIC_INTERVAL_MS) return;
  diagnostics.set(key, now);
  const message = `[spec-check-log] ${code}: ${detail}`.slice(0, MAX_DIAGNOSTIC_BYTES);
  if (opts.onDiagnostic) opts.onDiagnostic(message);
  else process.stderr.write(`${message}\n`);
}

function skip(opts: RawAppendOptions | AppendOptions, code: string, detail: string): never {
  emitDiagnostic(opts, code, detail);
  throw new JournalSkipError(`${code}: ${detail}`);
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock(dir: string, opts: RawAppendOptions | AppendOptions): () => void {
  const lock = path.join(dir, LOCK_NAME);
  const deadline = Date.now() + (opts.lockWaitMs ?? LOCK_WAIT_MS);
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx', 0o600);
      const owner = JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: randomUUID() });
      fs.writeFileSync(fd, owner);
      return () => {
        try { fs.closeSync(fd); } catch { /* already closed */ }
        try {
          if (fs.readFileSync(lock, 'utf8') === owner) fs.unlinkSync(lock);
        } catch { /* best effort; never unlink a replacement owner's lock */ }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') skip(opts, 'lock-error', 'maintenance lock unavailable');
      try {
        const age = Date.now() - fs.statSync(lock).mtimeMs;
        if (age > LOCK_STALE_MS) {
          let ownerPid = 0;
          try { ownerPid = Number(JSON.parse(fs.readFileSync(lock, 'utf8')).pid) || 0; } catch { /* malformed stale lock */ }
          let alive = false;
          if (ownerPid > 0) {
            try { process.kill(ownerPid, 0); alive = true; }
            catch (probeError) { alive = (probeError as NodeJS.ErrnoException).code === 'EPERM'; }
          }
          if (!alive) {
            fs.unlinkSync(lock);
            continue;
          }
        }
      } catch { /* another writer released it */ }
      if (Date.now() >= deadline) skip(opts, 'lock-timeout', 'maintenance lock is busy');
      sleepSync(5);
    }
  }
}

interface SafeShard {
  name: string;
  file: string;
  real: string;
  size: number;
  mtimeMs: number;
}

function confinedJournal(repoRoot: string, opts: RawAppendOptions | AppendOptions): { repo: string; dir: string } {
  let repo: string;
  try {
    repo = fs.realpathSync.native(repoRoot);
    if (!fs.statSync(repo).isDirectory()) skip(opts, 'unsafe-root', 'project root is not a directory');
  } catch {
    skip(opts, 'unsafe-root', 'project root cannot be resolved');
  }
  const dir = path.join(repo, DIR_REL);
  fs.mkdirSync(dir, { recursive: true });
  const realDir = fs.realpathSync.native(dir);
  if (!isWithin(repo, realDir)) skip(opts, 'unsafe-journal', 'journal escapes project root');
  return { repo, dir: realDir };
}

function safeShards(dir: string, opts: RawAppendOptions | AppendOptions): SafeShard[] {
  const result: SafeShard[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!SHARD_RE.test(name)) continue;
    const file = path.join(dir, name);
    try {
      const lst = fs.lstatSync(file);
      if (!lst.isFile() || lst.isSymbolicLink()) {
        emitDiagnostic(opts, 'unsafe-shard', `ignored non-regular shard ${name}`);
        continue;
      }
      const real = fs.realpathSync.native(file);
      if (!isWithin(dir, real)) {
        emitDiagnostic(opts, 'unsafe-shard', `ignored escaped shard ${name}`);
        continue;
      }
      const stat = fs.statSync(real);
      result.push({ name, file, real, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // A concurrent observer may remove an entry, but this writer only mutates
      // while locked and can safely ignore an entry that disappeared.
    }
  }
  return result;
}

function suffixFor(name: string, dateStamp: string): number | null {
  if (name === `${dateStamp}.jsonl`) return 0;
  const match = name.match(new RegExp(`^${dateStamp}-(\\d+)\\.jsonl$`));
  return match ? Number.parseInt(match[1], 10) : null;
}

/** Highest numbered safe shard for the current UTC day. */
export function activeShardPath(repoRoot: string, dateStamp: string): string {
  const dir = path.join(repoRoot, DIR_REL);
  const base = path.join(dir, `${dateStamp}.jsonl`);
  if (!fs.existsSync(dir)) return base;
  let bestName: string | null = null;
  let bestSuffix = -1;
  for (const name of fs.readdirSync(dir)) {
    const suffix = suffixFor(name, dateStamp);
    if (suffix === null) continue;
    const file = path.join(dir, name);
    try {
      const lst = fs.lstatSync(file);
      if (!lst.isFile() || lst.isSymbolicLink()) continue;
    } catch { continue; }
    if (suffix > bestSuffix) {
      bestSuffix = suffix;
      bestName = name;
    }
  }
  return bestName ? path.join(dir, bestName) : base;
}

function nextShard(current: string, dateStamp: string): string {
  const dir = path.dirname(current);
  const suffix = suffixFor(path.basename(current), dateStamp) ?? 0;
  return path.join(dir, `${dateStamp}-${suffix + 1}.jsonl`);
}

function availableBytes(repoRoot: string, opts: RawAppendOptions | AppendOptions): number {
  if (opts.freeBytes) return opts.freeBytes(repoRoot);
  const stat = fs.statfsSync(repoRoot);
  return Number(stat.bavail) * Number(stat.bsize);
}

function removeClosed(shard: SafeShard, dir: string, opts: RawAppendOptions | AppendOptions): number {
  const currentReal = fs.realpathSync.native(shard.file);
  if (currentReal !== shard.real || !isWithin(dir, currentReal)) skip(opts, 'unsafe-delete', 'shard changed before deletion');
  const lst = fs.lstatSync(shard.file);
  if (!lst.isFile() || lst.isSymbolicLink() || !SHARD_RE.test(path.basename(shard.file))) {
    skip(opts, 'unsafe-delete', 'candidate is not a confined regular shard');
  }
  fs.unlinkSync(shard.file);
  return shard.size;
}

function selectShardAndMaintain(
  repo: string,
  dir: string,
  dateStamp: string,
  entryBytes: number,
  opts: RawAppendOptions | AppendOptions,
): string {
  const rotationAt = opts.rotationBytes ?? ROTATION_BYTES;
  const maxTotal = opts.maxTotalBytes ?? MAX_TOTAL_BYTES;
  const retention = opts.retentionMs ?? RETENTION_MS;
  const minFree = opts.minFreeBytes ?? MIN_FREE_BYTES;
  if (entryBytes > rotationAt) skip(opts, 'entry-limit', 'one journal entry exceeds the shard limit');
  let active = activeShardPath(repo, dateStamp);
  const activeSize = fs.existsSync(active) ? fs.statSync(active).size : 0;
  if (activeSize > 0 && activeSize + entryBytes > rotationAt) active = nextShard(active, dateStamp);

  let shards = safeShards(dir, opts);
  const activeName = path.basename(active);
  const oldestFirst = () => shards
    .filter(shard => shard.name !== activeName)
    .sort((left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name, undefined, { numeric: true }));

  const cutoff = (opts.now ?? new Date()).getTime() - retention;
  for (const shard of oldestFirst().filter(item => item.mtimeMs < cutoff)) {
    removeClosed(shard, dir, opts);
    shards = shards.filter(item => item.name !== shard.name);
  }

  let total = shards.reduce((sum, shard) => sum + shard.size, 0);
  for (const shard of oldestFirst()) {
    if (total + entryBytes <= maxTotal) break;
    total -= removeClosed(shard, dir, opts);
    shards = shards.filter(item => item.name !== shard.name);
  }
  if (total + entryBytes > maxTotal) skip(opts, 'aggregate-limit', 'active shard leaves no room for append');

  let free: number;
  try { free = availableBytes(repo, opts); }
  catch { skip(opts, 'disk-probe', 'free disk space cannot be determined'); }
  for (const shard of oldestFirst()) {
    if (free - entryBytes >= minFree) break;
    const reclaimed = removeClosed(shard, dir, opts);
    free += reclaimed;
    total -= reclaimed;
    shards = shards.filter(item => item.name !== shard.name);
  }
  if (free - entryBytes < minFree) skip(opts, 'low-disk', 'append would violate the 1 GiB reserve');
  return active;
}

export function composeEntry(finding: Finding, opts: AppendOptions, now: Date): LogEntry {
  const entry: LogEntry = {
    timestamp: now.toISOString(),
    finding_code: finding.code,
    severity: finding.severity,
    location: { file: finding.location.file, line: finding.location.line },
    message: finding.message,
    source: opts.source,
  };
  const slug = specSlugOf(finding.location.file);
  if (slug) entry.spec_slug = slug;
  if (finding.nodeId) entry.node_id = finding.nodeId;
  if (finding.relatedId) entry.related_id = finding.relatedId;
  if (opts.sessionId) entry.session_id = opts.sessionId;
  return entry;
}

function appendSerializedBatch(serializedEntries: string[], opts: RawAppendOptions | AppendOptions): string[] {
  const now = opts.now ?? new Date();
  const { repo, dir } = confinedJournal(opts.repoRoot, opts);
  const release = acquireLock(dir, opts);
  try {
    return serializedEntries.map(serialized => {
      const line = `${serialized}\n`;
      const shard = selectShardAndMaintain(repo, dir, utcDateStamp(now), Buffer.byteLength(line), opts);
      fs.appendFileSync(shard, line, { encoding: 'utf8', flag: 'a' });
      return shard;
    });
  } finally {
    release();
  }
}

export function appendFinding(finding: Finding, opts: AppendOptions): string {
  const now = opts.now ?? new Date();
  return appendSerializedBatch([JSON.stringify(composeEntry(finding, opts, now))], { ...opts, now })[0];
}

/** A batch shares one timestamp and one maintenance lock. */
export function appendFindings(findings: Finding[], opts: AppendOptions): string[] {
  if (findings.length === 0) return [];
  const now = opts.now ?? new Date();
  return appendSerializedBatch(findings.map(finding => JSON.stringify(composeEntry(finding, opts, now))), { ...opts, now });
}

export function appendRawEntry(entry: Record<string, unknown>, opts: RawAppendOptions): string {
  const now = opts.now ?? new Date();
  return appendSerializedBatch([JSON.stringify({ timestamp: entry.timestamp ?? now.toISOString(), ...entry })], { ...opts, now })[0];
}
