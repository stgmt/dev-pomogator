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
      // FR-14 / SPECGEN004_33: an alive owner in a DIFFERENT env tag is the
      // multi-env hazard (e.g. host session A vs container session B on the
      // same bind-mounted worktree). Surface an env-specific, actionable
      // message; the same-env case keeps the generic "already held" wording
      // the singleton tests pin.
      const envMismatch = existing.env !== record.env;
      const message = envMismatch
        ? `MCP already running in env ${existing.env} (pid ${existing.pid}), ` +
          `restart Claude Code in same env`
        : `MCP lock already held by pid ${existing.pid} in env ${existing.env} ` +
          `(started ${existing.started_at}).`;
      const e = new Error(message) as Error & {
        code: string;
        existing: LockRecord;
        envMismatch: boolean;
      };
      e.code = 'ELOCK_HELD';
      e.existing = existing;
      e.envMismatch = envMismatch;
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

/**
 * Result of {@link acquireLockOrReadOnly}: either we own the singleton write
 * lock (`writer`), or an alive sibling holds it (`reader`) and we boot a
 * read-only door. A `LockHandle` is ALWAYS returned so callers stay uniform —
 * the reader's handle is a no-op (it owns nothing, so `heartbeat`/`release`
 * must never touch the owner's file).
 */
export interface LockAcquisition {
  mode: 'writer' | 'reader';
  /** Real handle for `writer`; no-op stand-in for `reader`. */
  lock: LockHandle;
  /** The current owner's record — present only when `mode === 'reader'`. */
  holder?: LockRecord;
  /** FR-14 cross-env collision flag — present only when `mode === 'reader'`. */
  envMismatch?: boolean;
}

/**
 * A read-only stand-in handle. Owns NO lock: `heartbeat`/`release` are no-ops so
 * a reader session never overwrites or unlinks the writer's `.mcp-lock.json`.
 */
function noopLock(repoRoot: string): LockHandle {
  const now = new Date().toISOString();
  return {
    path: lockPath(repoRoot),
    record: { pid: process.pid, env: detectEnvironment(), started_at: now, last_heartbeat: now },
    heartbeat(): void {
      /* reader owns nothing */
    },
    release(): void {
      /* reader owns nothing */
    },
  };
}

/**
 * Non-fatal lock acquisition for the multi-session door (P21-1 / FR-14).
 *
 * Wraps {@link acquireLock}: on an alive-owner collision (`ELOCK_HELD`) it does
 * NOT throw — it returns a `reader` acquisition carrying the owner's record, so
 * the caller can boot a READ-ONLY door (queries + dry-runs stay live; mutations
 * refuse with the holder named). Stale (dead-pid) locks are still reclaimed by
 * the underlying {@link acquireLock} and yield a `writer`. Any non-`ELOCK_HELD`
 * error (e.g. EACCES) still propagates — that's a genuine fault, not contention.
 */
export function acquireLockOrReadOnly(opts: AcquireOptions): LockAcquisition {
  try {
    return { mode: 'writer', lock: acquireLock(opts) };
  } catch (err) {
    const e = err as Error & { code?: string; existing?: LockRecord; envMismatch?: boolean };
    if (e.code === 'ELOCK_HELD' && e.existing) {
      return {
        mode: 'reader',
        lock: noopLock(opts.repoRoot),
        holder: e.existing,
        envMismatch: !!e.envMismatch,
      };
    }
    throw err;
  }
}
