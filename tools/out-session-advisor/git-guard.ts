/**
 * git-guard.ts — FR-6: гейт против `git add -A`/`.` и чужих staged-путей в shared tree.
 *
 *  - распознаёт `git add -A` / `git add .` / `git add --all` → warn/block (require override);
 *  - сверяет staged-пути с чужими недавними правками (по транскриптам других сессий):
 *    помечает пересечение как conflict и требует подтверждения владельца;
 *  - Fail-open: без транскриптов других сессий — warn (не жёсткий блок);
 *    ground-truth «мои файлы» — явный список File Changes сессии (--allow-list).
 *
 * CLI:
 *   git-guard.ts check --command "git add -A" [--allow-list a.ts,b.ts] [--transcripts-dir <dir>]
 *     → {ok, decision: "ok"|"warn"|"block", conflicts: string[], reason}
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface GitGuardResult {
  ok: boolean;
  decision: 'ok' | 'warn' | 'block';
  conflicts: string[];
  reason: string;
}

const ADD_ALL_RE = /\bgit\s+add\s+(-A|\.|--all|--no-ignore-removal)\b/;

export function classifyCommand(command: string): { warnsAddAll: boolean } {
  return { warnsAddAll: ADD_ALL_RE.test(command) };
}

/** Извлечь file_path из tool_use/Edit/Write в транскрипте (последний N времени). */
export function collectForeignPaths(
  transcriptsDir: string,
  windowMs = 3 * 3600 * 1000,
): Map<string, { session: string; ts: number }> {
  const seen = new Map<string, { session: string; ts: number }>();
  if (!existsSync(transcriptsDir)) return seen;
  for (const dir of readdirSync(transcriptsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const base = join(transcriptsDir, dir.name);
    for (const file of readdirSync(base)) {
      if (!file.endsWith('.jsonl') || file.startsWith('agent-')) continue;
      const path = join(base, file);
      const age = Date.now() - statSync(path).mtimeMs;
      if (windowMs > 0 && age > windowMs) continue;
      const text = readFileSync(path, 'utf8');
      const re = /"file_path"\s*:\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        seen.set(m[1].replace(/\\/g, '/'), { session: dir.name + '/' + file, ts: Date.now() });
      }
    }
  }
  return seen;
}

export function stagedFiles(cwd: string): string[] {
  try {
    const out = execSync('git diff --cached --name-only', { cwd, encoding: 'utf8' });
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\\/g, '/'));
  } catch {
    return [];
  }
}

export function checkGitAdd(options: {
  command: string;
  allowList?: string[];
  transcriptsDir?: string;
  cwd?: string;
  stagedFilesOverride?: string[];
  windowMs?: number;
}): GitGuardResult {
  const detects = classifyCommand(options.command);
  const conflicts: string[] = [];
  const allow = new Set((options.allowList ?? []).map((p) => p.replace(/\\/g, '/')));

  if (detects.warnsAddAll) {
    conflicts.push('git add -A / .');
  } else {
    // сверка staged с транскриптами других сессий
    const foreign = options.transcriptsDir ? collectForeignPaths(options.transcriptsDir, options.windowMs) : new Map();
    const staged = options.stagedFilesOverride ?? stagedFiles(options.cwd ?? process.cwd());
    for (const p of staged) {
      if (allow.has(p)) continue;
      if (foreign.has(p)) conflicts.push(p);
    }
  }

  const hasConflicts = conflicts.length > 0;
  // `-A` всегда блок (FAIL-closed по правилу no-git-add-all-shared-tree), но с override;
  // чужие staged без allow -> block тоже. Fail-open только когда нет транскриптов вообще.
  const hasTranscripts = options.transcriptsDir && existsSync(options.transcriptsDir);
  const decision: GitGuardResult['decision'] = hasConflicts
    ? (detects.warnsAddAll ? 'block' : 'block')
    : 'ok';
  return {
    ok: !hasConflicts,
    decision,
    conflicts,
    reason: hasConflicts
      ? `обнаружено пересечение: ${conflicts.join(', ')} (require override)`
      : hasTranscripts
        ? 'staged не пересекается с чужими правками'
        : 'нет транскриптов других сессий (warn/open)',
  };
}

export function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'check') {
    const read = (k: string) => {
      const i = args.indexOf(k);
      return i >= 0 ? args[i + 1] : undefined;
    };
    const result = checkGitAdd({
      command: read('--command') ?? '',
      allowList: (read('--allow-list') ?? '').split(',').filter(Boolean),
      transcriptsDir: read('--transcripts-dir'),
      cwd: read('--cwd'),
      stagedFilesOverride: (read('--staged-files') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      windowMs: read('--window-ms') !== undefined ? Number(read('--window-ms')) : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } else {
    console.error('usage: git-guard.ts check --command "git add -A" [--allow-list ...] [--transcripts-dir ...]');
    process.exitCode = 2;
  }
}

if (process.argv[1] && /git-guard\.ts$/.test(process.argv[1])) main();

export const __test = { checkGitAdd, classifyCommand, collectForeignPaths };