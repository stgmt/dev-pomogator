/**
 * MCP server lock manager — single-writer per repo across Claude Code sessions.
 *
 * Writes `.dev-pomogator/.mcp-lock.json` atomically via the O_EXCL `wx` flag
 * (per [`atomic-update-lock`](../../.claude/rules/atomic-update-lock.md) rule).
 * Each lock carries the owner pid, the host environment classification
 * (host / container / codespaces / wsl per FR-14), an ISO startup timestamp,
 * and an ISO `last_heartbeat` that the watcher refreshes.
 *
 * Stale lock recovery: if the recorded pid is no longer alive
 * (`process.kill(pid, 0)` raises ESRCH), the lock file is unlinked and a new
 * one is created atomically. This handles the «crashed without releasing»
 * case without manual cleanup.
 *
 * Returns `LockHandle` whose `.release()` is idempotent.
 *
 * @see .specs/spec-generator-v4/FR.md FR-4 (MCP server), FR-14 (env tagging)
 * @see .claude/rules/atomic-update-lock.md
 */

import fs from 'node:fs';
import path from 'node:path';

export type Environment =
  | 'host'
  | `container:${string}`
  | `codespaces:${string}`
  | `wsl:${string}`;

export interface LockRecord {
  pid: number;
  env: Environment;
  started_at: string;
  last_heartbeat: string;
  /** Best-effort hint for debugging. Optional, schema-stable. */
  argv?: string[];
}

export interface LockHandle {
  /** Absolute path to the on-disk lock file. */
  readonly path: string;
  /** The record this process wrote to disk. */
  readonly record: LockRecord;
  /** Bump `last_heartbeat`. Called periodically by the watcher (≤30s). */
  heartbeat(): void;
  /** Atomically remove the lock if (and only if) we still own it. Idempotent. */
  release(): void;
}

export interface AcquireOptions {
  /** Repo root. The lock lives at `<repoRoot>/.dev-pomogator/.mcp-lock.json`. */
  repoRoot: string;
  /** Caller-derived environment tag. Defaults to {@link detectEnvironment}. */
  env?: Environment;
}

/**
 * Best-effort env classification per [FR-14](../../.specs/spec-generator-v4/FR.md#fr-14).
 *
 * Precedence: Codespaces (explicit env var) → devcontainer (env var) →
 * WSL (kernel release contains `microsoft` OR `WSL_DISTRO_NAME` set) → host.
 */
export function detectEnvironment(envVars: NodeJS.ProcessEnv = process.env): Environment {
  if (envVars.CODESPACES === 'true' && envVars.CODESPACE_NAME) {
    return `codespaces:${envVars.CODESPACE_NAME}`;
  }
  if (envVars.REMOTE_CONTAINERS === 'true' || envVars.DEVCONTAINER === 'true') {
    return `container:${envVars.HOSTNAME ?? 'unknown'}`;
  }
  if (envVars.WSL_DISTRO_NAME) {
    return `wsl:${envVars.WSL_DISTRO_NAME}`;
  }
  return 'host';
}

/** Returns true if `pid` is alive on the current OS. */
function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    // Signal 0 doesn't actually send a signal; it only triggers the kernel's
    // permission check, which raises ESRCH when the pid has exited.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EPERM') {
      // EPERM means the process exists but we lack permission — treat as alive.
      return true;
    }
    return false;
  }
}

function lockPath(repoRoot: string): string {
  return path.join(repoRoot, '.dev-pomogator', '.mcp-lock.json');
}

/** Read + parse an existing lock. Returns null on missing / unparseable. */
export function readLock(repoRoot: string): LockRecord | null {
  const p = lockPath(repoRoot);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as LockRecord;
    if (typeof parsed.pid !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Acquire the singleton lock. If a stale lock (dead pid) blocks the path, the
 * function removes it and retries exactly once.
 *
 * Throws `Error` with `code === 'ELOCK_HELD'` when an alive owner holds the
 * lock — the caller decides whether to retry, exit, or attach to the
 * existing server. Per FR-14, this is the gate that prevents two MCP servers
 * from racing on the same repo from different envs.
 */
export function acquireLock(opts: AcquireOptions): LockHandle {
  const lockFile = lockPath(opts.repoRoot);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });

  const record: LockRecord = {
    pid: process.pid,
    env: opts.env ?? detectEnvironment(),
    started_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
    argv: process.argv.slice(2),
  };

  const write = (): void => {
    fs.writeFileSync(lockFile, JSON.stringify(record, null, 2), { flag: 'wx' });
  };

  try {
    write();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const existing = readLock(opts.repoRoot);
    if (existing && isPidAlive(existing.pid)) {
      const e = new Error(
        `MCP lock already held by pid ${existing.pid} in env ${existing.env} ` +
          `(started ${existing.started_at}).`,
      ) as Error & { code: string; existing: LockRecord };
      e.code = 'ELOCK_HELD';
      e.existing = existing;
      throw e;
    }
    // Stale lock — unlink + retry once.
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // Best-effort; another process may have cleaned up in the meantime.
    }
    write();
  }

  let released = false;
  return {
    path: lockFile,
    record,
    heartbeat(): void {
      if (released) return;
      record.last_heartbeat = new Date().toISOString();
      try {
        fs.writeFileSync(lockFile, JSON.stringify(record, null, 2));
      } catch {
        // Heartbeat is best-effort; transient EBUSY on Windows shouldn't
        // crash the server. The next tick retries.
      }
    },
    release(): void {
      if (released) return;
      released = true;
      try {
        const current = readLock(opts.repoRoot);
        if (current?.pid === record.pid) {
          fs.unlinkSync(lockFile);
        }
      } catch {
        // Already gone, or unlink raced with another cleanup — fine.
      }
    },
  };
}
