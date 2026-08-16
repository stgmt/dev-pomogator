/**
 * inventory.ts — FR-8: инвентаризация живых Claude/агентных сессий по нескольким репо.
 *
 * Standalone (без dashboard): обходит `~/.claude/projects/<encoded>/*.jsonl` +
 * живые процессы (по `claude`/`node` с --resume/--session-*), относит каждый к репо по
 * пути/session-id, мёртвые/неполные — `unknown`. Детерминированный список:
 *   {repo, pid, session, ts, alive}
 *
 * CLI: inventory.ts --repos a,b [--projects-root ~/.claude/projects]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface InvRow {
  repo: string;
  pid: number | null;
  session: string;
  ts: string;
  alive: boolean;
}

export function encodeRepo(repoPath: string): string {
  return repoPath.replace(/[\\/]/g, '-').replace(/:/g, '-');
}

export function discoverSessions(projectsRoot: string, repos: string[]): InvRow[] {
  const rows: InvRow[] = [];
  const repoIndex = new Map<string, string>();
  for (const r of repos) repoIndex.set(encodeRepo(r), r);
  if (!existsSync(projectsRoot)) return rows;

  for (const dirName of readdirSync(projectsRoot)) {
    const dir = join(projectsRoot, dirName);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    const repo = repoIndex.get(dirName) ?? 'unknown';
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.jsonl')) continue;
      if (file.startsWith('agent-')) continue; // legacy inline subagent
      const session = file.slice(0, -'.jsonl'.length);
      const mtime = statSync(join(dir, file)).mtimeMs;
      rows.push({
        repo,
        pid: null,
        session,
        ts: new Date(mtime).toISOString(),
        alive: Date.now() - mtime < 12 * 3600 * 1000,
      });
    }
  }
  return rows;
}

export function discoverActiveProcesses(repos: string[]): InvRow[] {
  const rows: InvRow[] = [];
  let ps: string;
  try {
    // массив аргументов (shell:false): без cmd-обёртки, чей cmdline сам матчит паттерн
    // (self-match → фантомная строка cmd.exe в инвентаре); $PID исключает сам запрос
    ps = execFileSync(
      'powershell',
      ['-NoProfile', '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'claude|node' -and $_.CommandLine -match 'resume|session' -and $_.ProcessId -ne $PID } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"],
      { encoding: 'utf8', timeout: 20000 },
    );
  } catch (e) {
    if ((e as any).stdout) ps = String((e as any).stdout);
    else ps = '';
  }
  if (!ps || ps.trim() === '{"$..."}') return rows;
  try {
    const data = JSON.parse(ps);
    const list = Array.isArray(data) ? data : [data];
    for (const p of list) {
      const pid = Number(p.ProcessId);
      const cmd = String(p.CommandLine ?? '');
      const m = cmd.match(/--resume\s+([A-Za-z0-9-]+)|--session\s+([A-Za-z0-9-]+)/);
      const session = m ? (m[1] ?? m[2]) : 'unknown';
      const repo = repos.find((r) => cmd.includes(r)) ?? 'unknown';
      rows.push({ repo, pid, session, ts: new Date().toISOString(), alive: true });
    }
  } catch { /* part of diagnostics */ }
  return rows;
}

export function inventory(repos: string[], projectsRoot: string): InvRow[] {
  return [...discoverSessions(projectsRoot, repos), ...discoverActiveProcesses(repos)];
}

function main() {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--repos');
  const repos = ri >= 0 ? args[ri + 1].split(',').filter(Boolean) : [];
  const pi = args.indexOf('--projects-root');
  const projectsRoot = pi >= 0 ? args[pi + 1] : join(homedir(), '.claude', 'projects');
  const rows = inventory(repos, projectsRoot);
  console.log(JSON.stringify({ rows, count: rows.length }, null, 2));
}

if (process.argv[1] && /inventory\.ts$/.test(process.argv[1])) main();

export const __test = { inventory, discoverSessions, encodeRepo };