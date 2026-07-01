/**
 * FR-39b — spec-access audit log (P17-1).
 *
 * Every AGENT spec access through MCP (reads now; writes when FR-40 lands)
 * appends one JSONL line to `<repo>/.dev-pomogator/logs/spec-access.jsonl`:
 *   {ts, tool, args_digest, decision}
 * Append-only (O_APPEND semantics via appendFileSync), rotation mirrors
 * audit-logger (10MB / 30 days, best-effort). Node builtins only — the module
 * is bundled into `server.bundle.mjs` for plugin users.
 *
 * SOFT tier per NFR-Reliability-11: logging failure NEVER breaks the tool
 * call (try/catch, no throw). The log is the «контроль + лог» the wave exists
 * for — centralizing access is what makes this file possible.
 *
 * @see .specs/spec-generator-v4/FR.md FR-39, NFR.md NFR-Reliability-11
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const RETENTION_DAYS = 30;

export interface SpecAccessEvent {
  ts: string;
  tool: string;
  args_digest: string;
  decision: 'ok' | 'not_found' | 'denied' | 'error';
}

export function specAccessLogPath(repoRoot = process.cwd()): string {
  return path.join(repoRoot, '.dev-pomogator', 'logs', 'spec-access.jsonl');
}

/** Stable short digest of the call args — enough to audit, small enough to grep. */
export function digestArgs(args: unknown): string {
  try {
    return createHash('sha256').update(JSON.stringify(args) ?? 'null').digest('hex').slice(0, 16);
  } catch {
    return 'undigestable';
  }
}

export function logSpecAccess(
  tool: string,
  args: unknown,
  decision: SpecAccessEvent['decision'],
  repoRoot = process.cwd(),
): void {
  try {
    const file = specAccessLogPath(repoRoot);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotateIfNeeded(file);
    const event: SpecAccessEvent = {
      ts: new Date().toISOString(),
      tool,
      args_digest: digestArgs(args),
      decision,
    };
    fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf-8');
  } catch {
    // SOFT tier — never break the tool call over the audit log.
  }
}

function rotateIfNeeded(file: string): void {
  try {
    if (!fs.existsSync(file)) return;
    const stat = fs.statSync(file);
    if (stat.size <= MAX_SIZE_BYTES) return;
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const fresh = fs
      .readFileSync(file, 'utf-8')
      .split('\n')
      .filter((l) => {
        if (!l.trim()) return false;
        try {
          return new Date(JSON.parse(l).ts).getTime() >= cutoff;
        } catch {
          return false;
        }
      });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, fresh.join('\n') + '\n', 'utf-8');
    fs.renameSync(tmp, file);
  } catch {
    // best-effort
  }
}
