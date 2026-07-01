/**
 * Marksman install-log writer (`.dev-pomogator/install-log.json`).
 *
 * A single JSON object per install attempt — overwritten on each run so the
 * MCP server's startup probe can read «is marksman available right now?»
 * without scanning a journal. The schema is intentionally tiny:
 *
 *   {
 *     marksman: {
 *       available: boolean,
 *       version?: string,         // present when installed
 *       binary_path?: string,     // absolute, present when installed
 *       reason?: string,          // present when NOT installed
 *       expected_sha?: string,    // present on sha256 mismatch
 *       got_sha?: string,         // present on sha256 mismatch
 *       installed_at: string,     // ISO timestamp of last attempt
 *     }
 *   }
 *
 * Atomic write per [`atomic-config-save`](../../.claude/rules/atomic-config-save.md) — temp file + rename.
 */

import fs from 'node:fs';
import path from 'node:path';

export type Reason =
  | 'sha256_mismatch'
  | 'offline'
  | 'unsupported_platform'
  | 'download_failed'
  | 'extract_failed';

export interface MarksmanState {
  available: boolean;
  version?: string;
  binary_path?: string;
  reason?: Reason;
  expected_sha?: string;
  got_sha?: string;
  installed_at: string;
}

export interface InstallLog {
  marksman: MarksmanState;
}

export function logPath(repoRoot: string): string {
  return path.join(repoRoot, '.dev-pomogator', 'install-log.json');
}

export function writeLog(repoRoot: string, state: MarksmanState): void {
  const p = logPath(repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ marksman: state } satisfies InstallLog, null, 2));
  fs.renameSync(tmp, p);
}

export function readLog(repoRoot: string): InstallLog | null {
  const p = logPath(repoRoot);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as InstallLog;
  } catch {
    return null;
  }
}
