/**
 * Audit Logger for form-guards (spec-generator-v3).
 *
 * Append-only writer for ~/.dev-pomogator/logs/form-guards.log.
 * Format per line: `{ISO-8601}Z {event} {hookName} {filepath} {reason?}`
 *
 * Events: DENY | ALLOW_VALID | ALLOW_AFTER_MIGRATION | PARSER_CRASH
 *
 * Rotation: on every write, if log is > 10MB or contains entries older
 * than 30 days, truncates stale entries. Best-effort; failure to log
 * is never surfaced to the caller (no throw).
 *
 * @see .specs/spec-generator-v3/FR.md FR-12
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

export type AuditEvent =
  | 'DENY'
  | 'ALLOW_VALID'
  | 'ALLOW_AFTER_MIGRATION'
  | 'PARSER_CRASH';

const LOG_DIR = path.join(os.homedir(), '.dev-pomogator', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'form-guards.log');
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const RETENTION_DAYS = 30;

/**
 * Append a single audit event. Fails silently on error.
 */
export function logEvent(
  hookName: string,
  event: AuditEvent,
  filepath: string,
  reason?: string,
): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const iso = new Date().toISOString();
    const safeReason = reason ? ` ${reason.replace(/\r?\n/g, ' ').slice(0, 500)}` : '';
    const line = `${iso} ${event} ${hookName} ${filepath}${safeReason}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf-8');
  } catch {
    // Never throw from audit logger.
  }
}

/**
 * Read all events within the last N hours. Returns array of parsed entries,
 * oldest first. Fails silently (returns empty array).
 */
export interface AuditEntry {
  timestamp: Date;
  event: AuditEvent;
  hookName: string;
  filepath: string;
  reason: string;
  raw: string;
}

export function readRecentEvents(withinHours = 24): AuditEntry[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);
    const entries: AuditEntry[] = [];
    for (const line of lines) {
      const parsed = parseLogLine(line);
      if (!parsed) continue;
      if (parsed.timestamp >= cutoff) {
        entries.push(parsed);
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Parse a single log line into an AuditEntry. Returns null if malformed.
 */
function parseLogLine(line: string): AuditEntry | null {
  // ISO timestamp is 20-27 chars (with ms): 2026-04-23T14:22:01.123Z
  const m = line.match(
    /^(\S+)\s+(DENY|ALLOW_VALID|ALLOW_AFTER_MIGRATION|PARSER_CRASH)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/,
  );
  if (!m) return null;
  const [, tsStr, event, hookName, filepath, reason = ''] = m;
  const timestamp = new Date(tsStr);
  if (isNaN(timestamp.getTime())) return null;
  return {
    timestamp,
    event: event as AuditEvent,
    hookName,
    filepath,
    reason,
    raw: line,
  };
}

/**
 * Count events grouped by type within a time window.
 */
export function summarizeRecent(withinHours = 24): {
  DENY: number;
  ALLOW_VALID: number;
  ALLOW_AFTER_MIGRATION: number;
  PARSER_CRASH: number;
  total: number;
  parserCrashHooks: string[];
} {
  const entries = readRecentEvents(withinHours);
  const summary = {
    DENY: 0,
    ALLOW_VALID: 0,
    ALLOW_AFTER_MIGRATION: 0,
    PARSER_CRASH: 0,
    total: entries.length,
    parserCrashHooks: [] as string[],
  };
  for (const e of entries) {
    summary[e.event]++;
    if (e.event === 'PARSER_CRASH' && !summary.parserCrashHooks.includes(e.hookName)) {
      summary.parserCrashHooks.push(e.hookName);
    }
  }
  return summary;
}

/**
 * Rotation: truncate entries older than RETENTION_DAYS; if file is still
 * > MAX_SIZE_BYTES, keep only tail half. Invoked periodically by
 * validate-specs.ts UserPromptSubmit hook (once per session).
 */
export function rotateLog(): void {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const stat = fs.statSync(LOG_FILE);
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let fresh = lines.filter((line) => {
      const parsed = parseLogLine(line);
      return parsed && parsed.timestamp >= cutoff;
    });
    // Size cap: if still > MAX_SIZE_BYTES after retention cut, keep tail half
    if (fresh.join('\n').length > MAX_SIZE_BYTES) {
      fresh = fresh.slice(Math.floor(fresh.length / 2));
    }
    if (fresh.length < lines.length || stat.size > MAX_SIZE_BYTES) {
      const tempFile = LOG_FILE + '.tmp';
      fs.writeFileSync(tempFile, fresh.join('\n') + '\n', 'utf-8');
      fs.renameSync(tempFile, LOG_FILE);
    }
  } catch {
    // Best-effort.
  }
}
