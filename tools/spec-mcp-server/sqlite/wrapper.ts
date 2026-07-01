// SQLite WAL wrapper for the SpecGraph cross-session index (FR-10).
//
// Opt-in via .spec-config.json::storage.sqlite_enabled. When enabled, the
// MCP server persists the graph + last-result rows to an on-disk SQLite
// database in WAL mode so a sibling session can warm-start without
// rebuilding from scratch.
//
// `better-sqlite3` is an OPTIONAL runtime dependency — when it isn't
// loadable (no native binding, Docker --ignore-scripts skip, offline npm
// install) the wrapper falls back to a no-op stub. Callers see the same
// API; the in-memory cold path stays authoritative until a real install
// happens.
//
// PRAGMA integrity_check + corruption recovery (NFR-Reliability-5) live in
// `./recovery.ts` so the wrapper itself stays small + sync.
//
// See also: ./schema.sql, ../lock-manager.ts, FR-10, NFR-Reliability-5.

import fs from 'node:fs';
import path from 'node:path';

export interface SqliteBackend {
  available: boolean;
  reason?: 'native_binding_missing' | 'load_failed' | 'corrupt';
  exec(sql: string): void;
  prepare(sql: string): {
    run: (...params: unknown[]) => { changes: number };
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
  pragma(spec: string): unknown;
  close(): void;
}

const SCHEMA_VERSION = 1;
const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  file TEXT NOT NULL,
  line INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS edges (
  src TEXT NOT NULL,
  dst TEXT NOT NULL,
  type TEXT NOT NULL,
  PRIMARY KEY (src, dst, type)
);
CREATE TABLE IF NOT EXISTS definitions (
  alias TEXT PRIMARY KEY,
  file TEXT NOT NULL,
  line INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst);
`;

export interface OpenOptions {
  repoRoot: string;
  /** Override the import path of better-sqlite3 for tests. */
  loader?: () => { default: unknown } | unknown;
}

export interface SqliteHandle {
  backend: SqliteBackend;
  dbPath: string;
  /** Returns the recorded schema version (or 0 if uninitialised). */
  schemaVersion(): number;
}

function dbPathFor(repoRoot: string): string {
  return path.join(repoRoot, '.dev-pomogator', '.spec-index.sqlite');
}

/**
 * Try to load `better-sqlite3`. Return null on any failure (native binding
 * missing, import throws, sandbox blocks loadAddon). The caller treats
 * null as «opt-in disabled at runtime».
 */
async function loadBetterSqlite(loader?: OpenOptions['loader']): Promise<unknown | null> {
  try {
    const mod = loader ? loader() : await import('better-sqlite3');
    // ESM default-interop: better-sqlite3 exports a constructor.
    return (mod as { default?: unknown }).default ?? mod;
  } catch {
    return null;
  }
}

function noopBackend(reason: NonNullable<SqliteBackend['reason']>): SqliteBackend {
  const stub = (): never => {
    throw new Error('SQLite backend unavailable; opt-in disabled at runtime.');
  };
  return {
    available: false,
    reason,
    exec: stub,
    prepare: stub,
    pragma: stub,
    close: () => {
      /* noop */
    },
  };
}

export async function openDatabase(opts: OpenOptions): Promise<SqliteHandle> {
  const dbPath = dbPathFor(opts.repoRoot);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const ctor = await loadBetterSqlite(opts.loader);
  if (typeof ctor !== 'function') {
    return {
      backend: noopBackend('native_binding_missing'),
      dbPath,
      schemaVersion: () => 0,
    };
  }
  // The constructor matches `new BetterSqlite3(path: string, opts?)`.
  let db: unknown;
  try {
    db = new (ctor as new (p: string, o?: object) => unknown)(dbPath, { fileMustExist: false });
  } catch {
    return { backend: noopBackend('load_failed'), dbPath, schemaVersion: () => 0 };
  }
  const concrete = db as {
    exec: (sql: string) => void;
    prepare: (sql: string) => unknown;
    pragma: (spec: string) => unknown;
    close: () => void;
  };
  // A corrupt / not-a-database file passes the constructor (lazy open) but
  // throws here on first access. Close the connection before propagating so
  // the recovery path can rename the file aside (Windows holds a lock on an
  // open handle).
  try {
    concrete.exec(SCHEMA_SQL);
    // Stamp the schema version on first open.
    const setMeta = (concrete.prepare(
      'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ) as { run: (...args: unknown[]) => unknown });
    setMeta.run('schema_version', String(SCHEMA_VERSION));
  } catch (e) {
    try {
      concrete.close();
    } catch {
      /* ignore secondary close failure */
    }
    throw e;
  }
  const backend: SqliteBackend = {
    available: true,
    exec: concrete.exec.bind(concrete),
    prepare: concrete.prepare.bind(concrete) as SqliteBackend['prepare'],
    pragma: concrete.pragma.bind(concrete),
    close: concrete.close.bind(concrete),
  };
  return {
    backend,
    dbPath,
    schemaVersion(): number {
      const row = backend.prepare('SELECT value FROM meta WHERE key=?').get('schema_version') as
        | { value: string }
        | undefined;
      return row ? parseInt(row.value, 10) : 0;
    },
  };
}

/**
 * Run `PRAGMA integrity_check`. Returns `ok` on healthy DB, otherwise
 * returns the diagnostic string SQLite produced. NFR-Reliability-5
 * recovery uses this — when the DB is corrupt, the caller moves it aside
 * and reopens fresh.
 */
export function integrityCheck(handle: SqliteHandle): string {
  if (!handle.backend.available) return 'unavailable';
  const rows = handle.backend.pragma('integrity_check') as Array<{ integrity_check: string }>;
  if (!Array.isArray(rows) || rows.length === 0) return 'no_rows';
  return rows[0].integrity_check;
}

/**
 * Move a corrupt DB file aside with a `.corrupt-<ts>` suffix per
 * NFR-Reliability-5 + tools/spec-mcp-server/lifecycle handles the rebuild.
 */
export function quarantineCorrupt(dbPath: string, now: Date = new Date()): string | null {
  if (!fs.existsSync(dbPath)) return null;
  const suffix = now.toISOString().replace(/[:.]/g, '-');
  const target = `${dbPath}.corrupt-${suffix}`;
  fs.renameSync(dbPath, target);
  return target;
}

/** Append a WARN line to `.dev-pomogator/logs/sqlite.log` (best-effort). */
function logSqliteWarning(repoRoot: string, message: string, now: Date): void {
  try {
    const logDir = path.join(repoRoot, '.dev-pomogator', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'sqlite.log'), `${now.toISOString()} [WARN] ${message}\n`);
  } catch {
    /* telemetry is best-effort — never block startup on a log write */
  }
}

export interface RecoveryResult {
  handle: SqliteHandle;
  /** True when a corrupt DB was detected, quarantined, and reopened fresh. */
  recovered: boolean;
  /** Path the corrupt file was moved to, when `recovered`. */
  quarantinedTo?: string;
}

/**
 * Startup open with corruption recovery (SPECGEN004_23 / NFR-Reliability-5).
 *
 * Opens the on-disk index; if the open throws (not-a-database) OR
 * `PRAGMA integrity_check` fails, the corrupt file is moved aside
 * (`.corrupt-<ts>`), a warning is logged to `sqlite.log`, and a fresh DB is
 * opened in its place so the lifecycle rebuilds the graph from source. When
 * `better-sqlite3` is unavailable the stub backend is returned unchanged
 * (nothing to corrupt).
 */
export async function openDatabaseWithRecovery(
  opts: OpenOptions & { now?: Date },
): Promise<RecoveryResult> {
  const now = opts.now ?? new Date();
  const dbPath = dbPathFor(opts.repoRoot);

  let handle: SqliteHandle | null = null;
  let corrupt = false;
  try {
    handle = await openDatabase(opts);
    // Stub backend (no native binding) can't be corrupt — pass it through.
    if (handle.backend.available && integrityCheck(handle) !== 'ok') corrupt = true;
  } catch {
    corrupt = true; // open/exec threw → not-a-database (openDatabase already closed it)
  }

  if (!corrupt) {
    return { handle: handle as SqliteHandle, recovered: false };
  }

  try {
    handle?.backend.close();
  } catch {
    /* may already be closed inside openDatabase's throw path */
  }
  const quarantinedTo = quarantineCorrupt(dbPath, now) ?? undefined;
  logSqliteWarning(
    opts.repoRoot,
    `corrupt SQLite index detected at startup — quarantined to ${quarantinedTo ?? '(missing)'}; ` +
      `falling back to in-memory rebuild from source`,
    now,
  );
  const fresh = await openDatabase(opts); // corrupt file is aside → fresh empty DB
  return { handle: fresh, recovered: true, quarantinedTo };
}

export { SCHEMA_VERSION };
