/**
 * diag.ts â€” FR-9/FR-10: Ð´Ð¸Ð°Ð³Ð½Ð¾ÑÑ‚Ð¸ÐºÐ° Ð¿Ð°Ñ€Ð°Ð»Ð»ÐµÐ»ÑŒÐ½Ð¾ÑÑ‚Ð¸.
 *  - `--who-wrote <path>`: ÑÐµÑÑÐ¸Ð¸ Ñ Ð½ÐµÐ´Ð°Ð²Ð½Ð¸Ð¼Ð¸ Edit/Write Ð¿Ð¾ Ð¿ÑƒÑ‚Ð¸ (Ð¸Ð· Ñ‚Ñ€Ð°Ð½ÑÐºÑ€Ð¸Ð¿Ñ‚Ð¾Ð²), Ð¿Ð¾ÑÐ»ÐµÐ´Ð½Ð¸Ð¹ Ð¿Ð¸ÑÐ°Ñ‚ÐµÐ»ÑŒ.
 *  - `diag` (ÑÐ²Ð¾Ð´ÐºÐ°): Ð°ÐºÑ‚Ð¸Ð²Ð½Ñ‹Ðµ ÑÐµÑÑÐ¸Ð¸ + Ð»Ð¾ÐºÐ°Ð»Ð¸ + Ð¿Ð¸ÑÐ°Ñ‚ÐµÐ»Ð¸ ÑÐ¿Ð¾Ñ€Ð½Ñ‹Ñ… Ñ„Ð°Ð¹Ð»Ð¾Ð² â†’ ok/dirty/conflict.
 *
 * Read-only Ð´Ð»Ñ Ð°Ð´Ð²Ð¸Ð·Ð¾Ñ€Ð°: ÐÐ• Ð¼ÑƒÑ‚Ð¸Ñ€ÑƒÐµÑ‚ Ñ„Ð°Ð¹Ð»Ñ‹/ÑÐ¾ÑÑ‚Ð¾ÑÐ½Ð¸Ðµ Ð²Ð¾Ñ€ÐºÐµÑ€Ð°. Ð•ÑÐ»Ð¸ Ð°ÐºÑ‚Ð¸Ð²Ð½Ñ‹Ð¹ Ð²Ð¾Ñ€ÐºÐµÑ€ Ð¿Ð¸ÑˆÐµÑ‚
 * <path> ÑÐµÐ¹Ñ‡Ð°Ñ â†’ Ð¿Ð¾Ð¼ÐµÑ‡Ð°ÐµÑ‚ÑÑ conflict single-writer (Ð°Ð´Ð²Ð¸Ð·Ð¾Ñ€ Ð½Ðµ Ð¿ÐµÑ€ÐµÐ·Ð°Ð¿Ð¸ÑˆÐµÑ‚).
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface WriterHit {
  session: string;
  lastWriteMs: number;
  file: string;
}

export const WRITER_WINDOW_MS = 24 * 3600 * 1000;

/** Ð¡ÐµÑÑÐ¸Ð¸, Ñ‡ÐµÐ¹ Ð½ÐµÐ´Ð°Ð²Ð½Ð¸Ð¹ Edit/Write Ð·Ð°Ñ‚Ñ€Ð°Ð³Ð¸Ð²Ð°ÐµÑ‚ `path` (Ð¿Ð¾ Ð²ÑÐµÐ¼ Ñ‚Ñ€Ð°Ð½ÑÐºÑ€Ð¸Ð¿Ñ‚Ð°Ð¼ projects). */
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
          const text = readFileSync(full, 'utf8');
          // Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð½Ð¾Ð²ÐµÐ¹ÑˆÐ¸Ðµ 512KB â€” bounded
          const tail = text.slice(-512 * 1024);
          if (tail.includes(`"file_path": "${target}`) || tail.includes(`"file_path":"${target}`)) {
            const ts = statSync(full).mtimeMs;
            rows.push({ session: `${dir}/${sub.name}`, lastWriteMs: ts, file: target });
          }
        }
      }
    };
    walk(base);
  }
  rows.sort((a, b) => b.lastWriteMs - a.lastWriteMs);
  return { rows, last: rows[0] };
}

export interface DiagSummary {
  activeSessions: number;
  locks: number;
  conflicts: WriterHit[];
  rows: Array<{ verdict: 'ok' | 'dirty' | 'conflict'; reason: string }>;
}

/** Ð¡Ð²Ð¾Ð´ÐºÐ° ok/dirty/conflict. ÐŸÑ€Ð¸ Ð¾Ñ‚ÑÑƒÑ‚ÑÑ‚Ð²Ð¸Ð¸ Ñ‡ÑƒÐ¶Ð¸Ñ… ÑÐµÑÑÐ¸Ð¹ â€” ÐºÐ¾Ñ€Ð¾Ñ‚ÐºÐ°Ñ. */
export function summarize(rows: WriterHit[]): DiagSummary {
  const distinct = new Map<string, WriterHit>();
  for (const r of rows) distinct.set(r.session, r);
  const conflicts = [...distinct.values()].filter((r) => Date.now() - r.lastWriteMs < 60 * 1000);
  return {
    activeSessions: distinct.size,
    locks: 0,
    conflicts,
    rows: rows.map((r) => ({
      verdict: Date.now() - r.lastWriteMs < 60 * 1000 ? 'conflict' : 'dirty',
      reason: `${r.session} (last ${(Date.now() - r.lastWriteMs) / 1000 | 0}s ago)`,
    })),
  };
}

function main() {
  const args = process.argv.slice(2);
  const projectsRoot = (() => {
    const i = args.indexOf('--projects-root');
    return i >= 0 ? args[i + 1] : join(homedir(), '.claude', 'projects');
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
    console.error('usage: diag.ts <path> | diag.ts --who-wrote <path> [--projects-root <dir>]');
    process.exitCode = 2;
    return;
  }
  const { rows } = whoWrote(target, projectsRoot);
  console.log(JSON.stringify(summarize(rows), null, 2));
}

if (process.argv[1] && /diag\.ts$/.test(process.argv[1])) main();

export const __test = { whoWrote, summarize };