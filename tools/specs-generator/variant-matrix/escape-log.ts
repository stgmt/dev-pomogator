/**
 * Atomic JSONL append helper для escape-hatch audit log.
 *
 * Mirror existing scope-gate-marker-store pattern per atomic-config-save rule.
 * Uses O_APPEND semantic — concurrent writes от parallel sessions не corrupts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';

export interface EscapeLogEntry {
  ts: string;
  spec: string;
  fr: string;
  reason: string;
  session_id: string;
  cwd?: string;
}

const LOG_RELATIVE_PATH = path.join(
  '.claude',
  'logs',
  'spec-variant-matrix-escapes.jsonl',
);

/**
 * Append entry to JSONL log. Creates parent dir if missing. Atomic O_APPEND.
 */
export async function appendEscapeLog(
  cwd: string,
  entry: EscapeLogEntry,
): Promise<void> {
  const logPath = path.join(cwd, LOG_RELATIVE_PATH);
  const dir = path.dirname(logPath);

  await fsp.mkdir(dir, { recursive: true });

  const line = JSON.stringify({ ...entry, cwd: entry.cwd ?? cwd }) + '\n';

  // O_APPEND ensures atomic append semantic on POSIX (and on Windows for small writes).
  const handle = await fsp.open(logPath, 'a');
  try {
    await handle.write(line);
  } finally {
    await handle.close();
  }
}

/**
 * Synchronous variant for hook contexts that can't await.
 */
export function appendEscapeLogSync(
  cwd: string,
  entry: EscapeLogEntry,
): void {
  const logPath = path.join(cwd, LOG_RELATIVE_PATH);
  const dir = path.dirname(logPath);

  fs.mkdirSync(dir, { recursive: true });

  const line = JSON.stringify({ ...entry, cwd: entry.cwd ?? cwd }) + '\n';
  const fd = fs.openSync(logPath, 'a');
  try {
    fs.writeSync(fd, line);
  } finally {
    fs.closeSync(fd);
  }
}
