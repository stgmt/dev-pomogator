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
 *     [--override] [--escape-audit <file>]
 *     → {ok, decision: "ok"|"warn"|"block", conflicts: string[], reason}
 *   git-guard.ts --hook   (PreToolUse Bash hook: stdin JSON; override-маркер
 *     `[skip-git-guard: <reason>]` в тексте команды или GIT_GUARD_SKIP=1 → escape-audit
 *     `.dev-pomogator/git-guard-escapes.jsonl`; block = exit 2 + stderr; fail-open = exit 0)
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface GitGuardResult {
  ok: boolean;
  decision: 'ok' | 'warn' | 'block';
  conflicts: string[];
  reason: string;
}

const ADD_ALL_RE = /\bgit\s+add\s+(-A|\.|--all|--no-ignore-removal)\b/;
const SKIP_MARKER_RE = /\[skip-git-guard:\s*([^\]]+)\]/;

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

/** Appenda override-строки в escape-audit (fail-open: ошибки записи не роняют гейт). */
export function logEscape(
  auditPath: string,
  row: { event: string; command: string; reason: string },
): void {
  try {
    mkdirSync(dirname(auditPath), { recursive: true });
    appendFileSync(auditPath, `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`, 'utf8');
  } catch {
    /* fail-open */
  }
}

export function checkGitAdd(options: {
  command: string;
  allowList?: string[];
  transcriptsDir?: string;
  cwd?: string;
  stagedFilesOverride?: string[];
  windowMs?: number;
  override?: boolean;
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
    ? (options.override ? 'ok' : 'block')
    : 'ok';
  return {
    ok: !hasConflicts || Boolean(options.override),
    decision,
    conflicts,
    reason: hasConflicts
      ? (options.override
          ? `override применён пользователем: ${conflicts.join(', ')}`
          : `обнаружено пересечение: ${conflicts.join(', ')} (require override)`)
      : hasTranscripts
        ? 'staged не пересекается с чужими правками'
        : 'нет транскриптов других сессий (warn/open)',
  };
}

/** PreToolUse Bash hook: stdin JSON → block (exit 2) | override+audit (exit 0) | fail-open. */
export async function hookMain() {
  if (process.stdin.isTTY) {
    process.exit(0); // no piped input — fail-open
  }
  let inputData = '';
  for await (const chunk of process.stdin) inputData += chunk;
  if (!inputData.trim()) {
    process.exit(0); // пустой input — fail-open
  }
  let command = '';
  try {
    const input = JSON.parse(inputData) as { tool_name?: string; tool_input?: { command?: string } };
    command = input.tool_input?.command ?? '';
  } catch {
    process.exit(0); // невалидный input — fail-open
  }
  const skipEnv = process.env.GIT_GUARD_SKIP === '1';
  const skipMarker = SKIP_MARKER_RE.exec(command);
  const overrideReason = skipEnv ? 'GIT_GUARD_SKIP=1' : skipMarker ? skipMarker[1].trim() : '';
  if (overrideReason.length < 8) {
    const result = checkGitAdd({ command });
    if (result.decision === 'block') {
      process.stderr.write(`[git-guard] ${result.reason}; используй явные пути (no-git-add-all-shared-tree) или осознанный override: [skip-git-guard: <причина ≥8 символов>] в тексте команды либо GIT_GUARD_SKIP=1`);
      process.exit(2);
    }
    process.exit(0);
  }
  logEscape('.dev-pomogator/git-guard-escapes.jsonl', {
    event: 'git-add-all-override',
    command: command.slice(0, 300),
    reason: overrideReason,
  });
  process.exit(0);
}

export function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'check') {
    const read = (k: string) => {
      const i = args.indexOf(k);
      return i >= 0 ? args[i + 1] : undefined;
    };
    const override = args.includes('--override');
    const result = checkGitAdd({
      command: read('--command') ?? '',
      allowList: (read('--allow-list') ?? '').split(',').filter(Boolean),
      transcriptsDir: read('--transcripts-dir'),
      cwd: read('--cwd'),
      stagedFilesOverride: (read('--staged-files') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      windowMs: read('--window-ms') !== undefined ? Number(read('--window-ms')) : undefined,
      override,
    });
    if (override && result.conflicts.length > 0) {
      const audit = read('--escape-audit') ?? '.dev-pomogator/git-guard-escapes.jsonl';
      logEscape(audit, {
        event: 'git-add-all-override',
        command: read('--command') ?? '',
        reason: 'override flag',
      });
    }
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } else if (args[0] === '--hook') {
    hookMain();
  } else {
    console.error('usage: git-guard.ts check --command "git add -A" [--allow-list ...] [--transcripts-dir ...] | git-guard.ts --hook');
    process.exitCode = 2;
  }
}

if (process.argv[1] && /git-guard\.ts$/.test(process.argv[1])) main();

export const __test = { checkGitAdd, classifyCommand, collectForeignPaths, logEscape, hookMain };