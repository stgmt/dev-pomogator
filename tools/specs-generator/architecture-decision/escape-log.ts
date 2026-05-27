/**
 * Atomic JSONL append helper для architecture-decision escape-hatch audit log.
 * Mirror variant-matrix/escape-log.ts. O_APPEND — concurrent writes не corrupt.
 * Log dir override через ARCHITECTURE_LOG_DIR env (для eval-runner изоляции).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';

export interface EscapeLogEntry {
  ts: string;
  spec: string;
  axis_id: string;
  reason: string;
  session_id: string;
  cwd?: string;
}

const LOG_FILENAME = 'spec-architecture-escapes.jsonl';

/** FR-12: completeness-dimension escapes log to a sibling file (separate concern from axis escapes). */
export const COMPLETENESS_LOG_FILENAME = 'spec-completeness-escapes.jsonl';

function resolveLogPath(cwd: string, filename: string = LOG_FILENAME): string {
  const override = process.env.ARCHITECTURE_LOG_DIR;
  if (override) return path.join(override, filename);
  return path.join(cwd, '.claude', 'logs', filename);
}

export async function appendEscapeLog(
  cwd: string,
  entry: EscapeLogEntry,
  filename: string = LOG_FILENAME,
): Promise<void> {
  const logPath = resolveLogPath(cwd, filename);
  await fsp.mkdir(path.dirname(logPath), { recursive: true });
  const line = JSON.stringify({ ...entry, cwd: entry.cwd ?? cwd }) + '\n';
  const handle = await fsp.open(logPath, 'a');
  try {
    await handle.write(line);
  } finally {
    await handle.close();
  }
}

export function appendEscapeLogSync(
  cwd: string,
  entry: EscapeLogEntry,
  filename: string = LOG_FILENAME,
): void {
  const logPath = resolveLogPath(cwd, filename);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const line = JSON.stringify({ ...entry, cwd: entry.cwd ?? cwd }) + '\n';
  const fd = fs.openSync(logPath, 'a');
  try {
    fs.writeSync(fd, line);
  } finally {
    fs.closeSync(fd);
  }
}
