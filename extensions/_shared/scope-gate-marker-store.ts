/**
 * scope-gate — marker store
 *
 * Atomic read/write/GC of scope-verification markers.
 * Spec: .specs/verify-generic-scope-fix/FR.md#fr-5 + SCHEMA "Marker File"
 *
 * Path: {cwd}/.claude/.scope-verified/<session_id>-<shortdiffsha12>.json
 * TTL: 30 minutes; GC: files older than 24h, skipped if .last-gc mtime < 1h
 * Atomicity: temp file + fs.renameSync per .claude/rules/atomic-config-save.md
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export const TTL_MS = 30 * 60 * 1000;
export const GC_STALE_MS = 24 * 60 * 60 * 1000;
export const GC_THROTTLE_MS = 60 * 60 * 1000;

export interface MarkerVariant {
  file: string;
  kind: 'enum-item' | 'switch-case' | 'array-entry';
  name: string;
  lineNumber: number;
  reach: 'traced' | 'unreachable' | 'conditional';
  evidence: string;
}

export interface Marker {
  timestamp: number;
  diff_sha256: string;
  session_id: string;
  variants: MarkerVariant[];
  should_ship: boolean;
}

/** Compute sha256 of a string, return full 64-char hex. */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Return first 12 hex chars of sha256 — used in filename. */
export function shortSha(sha: string): string {
  return sha.slice(0, 12);
}

/**
 * Resolve marker store directory within cwd. Validated against path traversal.
 * Returns null if resolution escapes cwd (should never happen with valid inputs).
 */
export function markerDir(cwd: string): string | null {
  const base = path.resolve(cwd);
  const dir = path.resolve(base, '.claude', '.scope-verified');
  if (!dir.startsWith(base + path.sep) && dir !== base) return null;
  return dir;
}

/**
 * Resolve a marker filename within the store. Validates containment to prevent
 * path traversal via crafted session_id or sha.
 */
function markerPath(cwd: string, sessionId: string, shortDiffSha: string): string | null {
  const dir = markerDir(cwd);
  if (!dir) return null;
  // Strip any path separators from user-provided parts defensively
  const safeSession = sessionId.replace(/[^\w-]/g, '_');
  const safeSha = shortDiffSha.replace(/[^a-f0-9]/gi, '');
  const filename = `${safeSession}-${safeSha}.json`;
  const fullPath = path.resolve(dir, filename);
  if (!fullPath.startsWith(dir + path.sep)) return null;
  return fullPath;
}

/**
 * Write marker atomically: temp file with O_EXCL + rename.
 * Ensures dir exists. Retries once on EEXIST (stale temp file).
 */
export function writeMarker(cwd: string, marker: Marker): void {
  const filename = path.basename(markerPath(cwd, marker.session_id, shortSha(marker.diff_sha256)) ?? '');
  if (!filename) throw new Error('[marker-store] failed to resolve marker path');

  const dir = markerDir(cwd);
  if (!dir) throw new Error('[marker-store] failed to resolve marker dir');
  fs.mkdirSync(dir, { recursive: true });

  const finalPath = path.join(dir, filename);
  const tempPath = path.join(dir, `${filename}.${process.pid}.tmp`);
  const content = JSON.stringify(marker, null, 2);

  try {
    fs.writeFileSync(tempPath, content, { encoding: 'utf-8', flag: 'wx' });
  } catch (err) {
    // Retry once on stale temp: unlink then write
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      try { fs.unlinkSync(tempPath); } catch { /* noop */ }
      fs.writeFileSync(tempPath, content, { encoding: 'utf-8', flag: 'wx' });
    } else {
      throw err;
    }
  }

  fs.renameSync(tempPath, finalPath);
}

/**
 * Read marker if it exists, validate freshness. Returns null if:
 * - file missing
 * - JSON parse fails
 * - diff_sha256 mismatch
 * - session_id mismatch
 * - timestamp older than TTL_MS
 */
export function readFreshMarker(
  cwd: string,
  sessionId: string,
  diffSha: string,
): Marker | null {
  const full = markerPath(cwd, sessionId, shortSha(diffSha));
  if (!full) return null;
  if (!fs.existsSync(full)) return null;

  let raw: string;
  try {
    raw = fs.readFileSync(full, 'utf-8');
  } catch {
    return null;
  }

  let marker: Marker;
  try {
    marker = JSON.parse(raw) as Marker;
  } catch {
    return null; // corrupt — treat as absent
  }

  if (typeof marker.diff_sha256 !== 'string' || marker.diff_sha256 !== diffSha) return null;
  if (typeof marker.session_id !== 'string' || marker.session_id !== sessionId) return null;
  if (typeof marker.timestamp !== 'number' || Date.now() - marker.timestamp > TTL_MS) return null;

  return marker;
}

/**
 * GC stale markers (> 24h old). Throttled to at most once per hour via `.last-gc` sentinel.
 * Fail-open: any error → no-op (marker pollution is low priority, crash is unacceptable).
 */
export function runGC(cwd: string): void {
  const dir = markerDir(cwd);
  if (!dir) return;
  if (!fs.existsSync(dir)) return;

  const sentinel = path.join(dir, '.last-gc');

  // Throttle check
  try {
    if (fs.existsSync(sentinel)) {
      const stat = fs.statSync(sentinel);
      if (Date.now() - stat.mtimeMs < GC_THROTTLE_MS) return;
    }
  } catch { /* fail-open */ }

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (name === '.last-gc') continue;
    if (!name.endsWith('.json')) continue;
    const fp = path.join(dir, name);
    try {
      const stat = fs.statSync(fp);
      if (Date.now() - stat.mtimeMs > GC_STALE_MS) {
        fs.unlinkSync(fp);
      }
    } catch { /* fail-open per file */ }
  }

  try {
    fs.writeFileSync(sentinel, String(Date.now()), 'utf-8');
  } catch { /* fail-open */ }
}

/**
 * Append an entry to the escape-hatch audit log.
 * Spec: FR-3 + SCHEMA "Escape Log Entry (JSONL append-only)"
 * Format: newline-delimited JSON, one object per line.
 */
export interface EscapeLogEntry {
  ts: string;
  diff_sha256: string;
  reason: string;
  session_id: string;
  cwd: string;
}

export function appendEscapeLog(cwd: string, entry: EscapeLogEntry): void {
  const base = path.resolve(cwd);
  const logPath = path.resolve(base, '.claude', 'logs', 'scope-gate-escapes.jsonl');
  if (!logPath.startsWith(base + path.sep)) return;

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', { encoding: 'utf-8', flag: 'a' });
  } catch { /* fail-open */ }
}
