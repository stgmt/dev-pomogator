/**
 * diag.ts — FR-9/FR-10: диагностика параллельности.
 *  - `--who-wrote <path>`: сессии с недавними Edit/Write по пути (из транскриптов), последний писатель.
 *  - `diag <path>` (сводка): активные сессии (repo/sid/pid) + локалы с владельцем +
 *    писатели спорного файла → вердикт ok/dirty/conflict по каждому.
 *
 * Read-only для адвизора: НЕ мутирует файлы/состояние воркера. Если активный воркер пишет
 * <path> сейчас (свежая правка + живой процесс сессии) → помечается conflict single-writer
 * (адвизор не перезапишет).
 */
import { readdirSync, readFileSync, statSync, existsSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { listLocks, pidAlive, type LockPayload } from './lock.ts';

/** Читает только последние n байт файла (bounded read — транскрипт может быть ГБ-ным). */
export function tailBytes(file: string, n: number): string {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - n);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

export interface WriterHit {
  session: string;
  repo: string;
  sid: string;
  lastWriteMs: number;
  file: string;
}

export interface LockRow {
  path: string;
  owner_pid: number;
  owner_cmd: string;
  status: 'held' | 'stale';
}

export interface SummaryRow {
  verdict: 'ok' | 'dirty' | 'conflict';
  reason: string;
  session: string;
  repo: string;
  sid: string;
  pid: number | null;
  file: string;
}

export interface DiagSummary {
  activeSessions: number;
  locks: LockRow[];
  conflicts: SummaryRow[];
  rows: SummaryRow[];
  summary: string;
}

export const WRITER_WINDOW_MS = 24 * 3600 * 1000;
export const LIVE_WRITE_WINDOW_MS = 60 * 1000;

/** Живые pid'ы, чей cmdline содержит `sidSubstr` (win32: Get-CimInstance; POSIX: /proc, fallback ps). */
export function livePids(sidSubstr: string): number[] {
  if (!sidSubstr) return [];
  try {
    if (process.platform === 'win32') {
      // self-match-защита: execSync(string) оборачивается cmd.exe, чей cmdline содержит
      // паттерн → фантомный pid. Спавним powershell напрямую (массив аргументов, shell:false)
      // и исключаем сам запрос через $PID.
      const safe = sidSubstr.replace(/[\\'"]/g, '');
      const out = execFileSync(
        'powershell',
        ['-NoProfile', '-Command',
          `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${safe}*' -and $_.ProcessId -ne $PID } | Select-Object -ExpandProperty ProcessId`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return out.split(/\r?\n/).map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    }
    if (existsSync('/proc')) {
      const pids: number[] = [];
      for (const d of readdirSync('/proc')) {
        if (!/^\d+$/.test(d)) continue;
        try {
          const cmd = readFileSync(join('/proc', d, 'cmdline'), 'utf8').replace(/\0/g, ' ');
          if (cmd.includes(sidSubstr)) pids.push(Number(d));
        } catch {
          /* процесс исчез между readdir и readFile */
        }
      }
      return pids;
    }
    const out = execSync(`ps -eo pid=,args=`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const pids: number[] = [];
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(sidSubstr)) continue;
      const m = line.trim().match(/^(\d+)/);
      if (m) pids.push(Number(m[1]));
    }
    return pids;
  } catch {
    return [];
  }
}

/** Сессии, чей недавний Edit/Write затрагивает `path` (по всем транскриптам projects). */
export function whoWrote(path: string, projectsRoot: string): { rows: WriterHit[]; last?: WriterHit } {
  const rows: WriterHit[] = [];
  const target = path.replace(/\\/g, '/');
  if (!existsSync(projectsRoot)) return { rows };
  for (const dir of readdirSync(projectsRoot)) {
    const base = join(projectsRoot, dir);
    if (!statSync(base).isDirectory()) continue;
    const walk = (d: string) => {
      for (const sub of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, sub.name);
        if (sub.isDirectory()) walk(full);
        else if (sub.isFile() && sub.name.endsWith('.jsonl')) {
          // bounded: только последние 512KB (пишущий воркер — это хвост транскрипта)
          const tail = tailBytes(full, 512 * 1024);
          if (tail.includes(`"file_path": "${target}`) || tail.includes(`"file_path":"${target}`)) {
            const ts = statSync(full).mtimeMs;
            rows.push({ session: `${dir}/${sub.name}`, repo: dir, sid: sub.name, lastWriteMs: ts, file: target });
          }
        }
      }
    };
    walk(base);
  }
  rows.sort((a, b) => b.lastWriteMs - a.lastWriteMs);
  return { rows, last: rows[0] };
}

/** Сводка ok/dirty/conflict. Пустая — короткая «0 active, 0 locks, 0 conflicts». */
export function summarize(
  rows: WriterHit[],
  locks: LockPayload[] = [],
  now = Date.now(),
): DiagSummary {
  const distinct = new Map<string, WriterHit>();
  for (const r of rows) distinct.set(r.session, r);
  const lockRows: LockRow[] = locks.map((l) => ({
    path: l.path,
    owner_pid: l.owner_pid,
    owner_cmd: l.owner_cmd,
    status: pidAlive(l.owner_pid) ? ('held' as const) : ('stale' as const),
  }));
  const summaryRows: SummaryRow[] = [...distinct.values()].map((r) => {
    const writingNow = now - r.lastWriteMs < LIVE_WRITE_WINDOW_MS;
    const pids = writingNow ? livePids(r.sid) : [];
    if (pids.length > 0) {
      return {
        verdict: 'conflict' as const,
        reason: `сессия ${r.session} пишет сейчас (живой pid ${pids[0]}) — single-writer, read-only для адвизора`,
        session: r.session, repo: r.repo, sid: r.sid, pid: pids[0], file: r.file,
      };
    }
    if (writingNow) {
      return {
        verdict: 'dirty' as const,
        reason: `сессия ${r.session} недавно писала (last ${(now - r.lastWriteMs) / 1000 | 0}s ago), живой процесс не найден`,
        session: r.session, repo: r.repo, sid: r.sid, pid: null, file: r.file,
      };
    }
    return {
      verdict: 'ok' as const,
      reason: `сессия ${r.session} писала ${(now - r.lastWriteMs) / 3600000 | 0}h назад — не конфликт`,
      session: r.session, repo: r.repo, sid: r.sid, pid: null, file: r.file,
    };
  });
  const conflicts = summaryRows.filter((r) => r.verdict === 'conflict');
  const activeSessions = distinct.size;
  const summary = activeSessions === 0 && lockRows.length === 0 && conflicts.length === 0
    ? '0 active, 0 locks, 0 conflicts'
    : `${activeSessions} active, ${lockRows.length} locks, ${conflicts.length} conflicts`;
  return { activeSessions, locks: lockRows, conflicts, rows: summaryRows, summary };
}

function main() {
  const args = process.argv.slice(2);
  const projectsRoot = (() => {
    const i = args.indexOf('--projects-root');
    return i >= 0 ? args[i + 1] : join(homedir(), '.claude', 'projects');
  })();
  const locksDir = (() => {
    const i = args.indexOf('--locks-dir');
    return i >= 0 ? args[i + 1] : undefined;
  })();
  const whoIdx = args.indexOf('--who-wrote');
  if (whoIdx >= 0) {
    const path = args[whoIdx + 1];
    const { rows, last } = whoWrote(path, projectsRoot);
    console.log(JSON.stringify({ file: path, rows: rows.slice(0, 5), last }, null, 2));
    return;
  }
  const target = args[0];
  if (!target) {
    console.error('usage: diag.ts <path> | diag.ts --who-wrote <path> [--projects-root <dir>] [--locks-dir <dir>]');
    process.exitCode = 2;
    return;
  }
  const { rows } = whoWrote(target, projectsRoot);
  const locks = locksDir ? listLocks(locksDir).map((l) => l.lock).filter((l): l is LockPayload => l !== null) : [];
  console.log(JSON.stringify(summarize(rows, locks), null, 2));
}

if (process.argv[1] && /diag\.ts$/.test(process.argv[1])) main();

export const __test = { whoWrote, summarize, livePids, tailBytes };