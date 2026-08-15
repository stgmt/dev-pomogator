/**
 * lock.ts — FR-7 атомарный лок-сервис `flag:'wx'` (О_EXCL) + владелец + stale-восстановление.
 *
 * Правила (SCHEMA + atomic-update-lock rule):
 *  - создание атомарно `writeFile(lock, payload, {flag:'wx'})`; второй acquire -> EEXIST,
 *    без порчи первого;
 *  - stale = owner_pid не жив -> recover_stale: удалить и пересоздать атомарно + audit;
 *  - каждый лок хранит {owner_pid, owner_cmd, path, created}.
 *
 * CLI: lock.ts acquire|release|status|recover-stale <path> [--locks-dir <dir>] [--owner-cmd ".."]
 */
import { hasOwn } from 'node:os';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export interface LockPayload {
  owner_pid: number;
  owner_cmd: string;
  path: string;
  created: string;
  file?: string;
}

export const DEFAULT_LOCK_DIR = '.dev-pomogator/parallel-locks';

export function lockFileForPath(path: string, locksDir = DEFAULT_LOCK_DIR): string {
  const hash = createHash('sha256').update(path.replace(/\\/g, '/')).digest('hex').slice(0, 16);
  return join(locksDir, `${hash}.lock`);
}

export function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readLock(file: string): LockPayload | null {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as LockPayload;
    return { ...raw, file };
  } catch {
    return null;
  }
}

function writeVerdict(o: LockPayload | 'EEXIST' | 'not-held', status: string, reason: string) {
  return { status, reason, lock: o === 'EEXIST' ? null : o === 'not-held' ? null : o };
}

/** Чистое: верну lock если он сейчас не кем-то живым не удерживается. */
export function acquire(
  path: string,
  opts: { ownerCmd?: string; locksDir?: string } = {},
): { status: 'ok' | 'EEXIST'; lock?: LockPayload; reason: string } {
  const dir = opts.locksDir ?? DEFAULT_LOCK_DIR;
  mkdirSync(dir, { recursive: true });
  const file = lockFileForPath(path, dir);
  const existing = existsSync(file) ? readLock(file) : null;
  if (existing && pidAlive(existing.owner_pid)) {
    return { status: 'EEXIST', lock: existing, reason: `лок удерживается pid ${existing.owner_pid}` };
  }
  // мёртвый/невалидный -> discover+пересоздать (recover-stale неявный) или просто перезаписать атомарно
  if (existing) {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
  const payload: LockPayload = {
    owner_pid: process.pid,
    owner_cmd: opts.ownerCmd ?? process.argv.slice(1).join(' '),
    path,
    created: new Date().toISOString(),
  };
  try {
    writeFileSync(file, JSON.stringify(payload, null, 2), { flag: 'wx' });
    return { status: 'ok', lock: { ...payload, file }, reason: 'лок создан атомарно (wx)' };
  } catch (e) {
    const l = readLock(file);
    if (l && pidAlive(l.owner_pid)) {
      return { status: 'EEXIST', lock: l, reason: 'гонка: другой процесс выиграл wx' };
    }
    return { status: 'EEXIST', lock: l ?? undefined, reason: `EEXIST: ${(e as Error).message}` };
  }
}

export function release(path: string, locksDir = DEFAULT_LOCK_DIR): { status: string; reason: string } {
  const file = lockFileForPath(path, locksDir);
  if (!existsSync(file)) {
    return { status: 'not-held', reason: 'лок не существует' };
  }
  const lock = readLock(file);
  if (lock && lock.owner_pid !== process.pid) {
    return {
      status: 'foreign',
      reason: `лок принадлежит pid ${lock.owner_pid}, не нашему (${process.pid})`,
    };
  }
  unlinkSync(file);
  return { status: 'released', reason: file };
}

export function status(path: string, locksDir = DEFAULT_LOCK_DIR) {
  const file = lockFileForPath(path, locksDir);
  const lock = existsSync(file) ? readLock(file) : null;
  if (!lock) return { status: 'free', reason: 'лок свободен' };
  const alive = pidAlive(lock.owner_pid);
  return {
    status: alive ? 'held' : 'stale',
    lock,
    reason: alive ? `держится pid ${lock.owner_pid}` : `stale: owner pid ${lock.owner_pid} не жив`,
  };
}

export function recoverStale(path: string, ownerCmd: string, locksDir = DEFAULT_LOCK_DIR) {
  const st = status(path, locksDir);
  if (st.status === 'stale' && st.lock) {
    unlinkSync(st.lock.file!);
    return { ...acquire(path, { ownerCmd, locksDir }), recovered: true };
  }
  return { ...acquire(path, { ownerCmd, locksDir }), recovered: false };
}

export function listLocks(locksDir = DEFAULT_LOCK_DIR): { file: string; lock: LockPayload | null }[] {
  if (!existsSync(locksDir)) return [];
  return readdirSync(locksDir)
    .filter((f) => f.endsWith('.lock'))
    .map((f) => {
      const file = join(locksDir, f);
      return { file, lock: readLock(file) };
    });
}

/* ---------- CLI ---------- */
function main() {
  const [op, path] = process.argv.slice(2);
  const locksDir = process.env.PARALLEL_LOCK_DIR ?? DEFAULT_LOCK_DIR;
  if (!op || !path) {
    console.error('usage: lock.ts acquire|release|status|recover-stale <path> [--owner-cmd ".."]');
    process.exitCode = 2;
    return;
  }
  const oi = process.argv.indexOf('--owner-cmd');
  const ownerCmd = oi >= 0 ? process.argv[oi + 1] : process.argv.slice(1).join(' ');
  let res;
  switch (op) {
    case 'acquire': res = acquire(path, { ownerCmd, locksDir }); break;
    case 'release': res = release(path, locksDir); break;
    case 'status': res = status(path, locksDir); break;
    case 'recover-stale': res = recoverStale(path, ownerCmd, locksDir); break;
    default: console.error(`unknown op ${op}`); process.exitCode = 2; return;
  }
  console.log(JSON.stringify(res, null, 2));
  if (op === 'acquire' && (res as any).status !== 'ok') process.exitCode = 3;
}

if (process.argv[1] && /lock\.ts$/.test(process.argv[1])) main();

export const __test = { acquire, release, status, recoverStale, lockFileForPath, readLock, pidAlive, listLocks };