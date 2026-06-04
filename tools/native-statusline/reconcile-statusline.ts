/**
 * native-statusline: reconcile + atomic-write the NATIVE Claude Code statusLine
 * (the main status bar = ccstatusline, git/model info) into ~/.claude/settings.json.
 *
 * Domain: NATIVE statusLine ONLY. This is NOT the test-progress statusline
 * (TUI compact_bar.py / tools/test-statusline). Do not couple the two — see
 * .specs/native-statusline/ FR-9 and .claude/rules/pomogator/verify-render-target.md.
 *
 * Port of the deleted v1 src/utils/statusline.ts resolveClaudeStatusLine logic,
 * relocated into a SessionStart-hook-friendly module (canonical plugin model).
 * Reference pattern: ShivaeDev/pardes reconcile-settings.ts.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** The command we install when the slot is empty. Documented Claude Code statusline tool. */
export const DEFAULT_STATUSLINE_COMMAND = 'npx -y ccstatusline@latest';

/** Ownership marker — any statusLine command containing this substring is "ours". */
export const OWNERSHIP_MARKER = 'ccstatusline';

export type ReconcileAction = 'install' | 'noop' | 'keep-user';

export interface ReconcileResult {
  action: ReconcileAction;
  command: string;
}

/**
 * Pure classification of the current statusLine.command (FR-1, FR-4). No I/O.
 * - empty/undefined  → install (default ccstatusline command)
 * - contains marker  → noop (already ours/compatible — leave it)
 * - foreign command  → keep-user (never overwrite a user's custom bar)
 */
export function reconcileStatusLine(existing: string | undefined): ReconcileResult {
  const cmd = (existing ?? '').trim();
  if (!cmd) {
    return { action: 'install', command: DEFAULT_STATUSLINE_COMMAND };
  }
  if (cmd.includes(OWNERSHIP_MARKER)) {
    return { action: 'noop', command: cmd };
  }
  return { action: 'keep-user', command: cmd };
}

export interface WriteResult {
  changed: boolean;
  action: ReconcileAction;
}

export interface WriteOptions {
  /** Home dir override (tests). Defaults to os.homedir(). */
  home?: string;
}

function settingsPathFor(home: string): string {
  return path.join(home, '.claude', 'settings.json');
}

/**
 * Read ~/.claude/settings.json, reconcile, and atomically write ONLY when the
 * slot is empty (action=install). Preserves all other settings fields
 * (read-modify-write). Fail-open: a corrupt/unreadable existing file is left
 * untouched. Idempotent: noop/keep-user perform no write (FR-2, FR-8).
 */
export function writeNativeStatusLine(opts: WriteOptions = {}): WriteResult {
  const home = opts.home ?? os.homedir();
  const settingsFile = settingsPathFor(home);

  let settings: Record<string, unknown> = {};
  let existingCommand: string | undefined;

  try {
    const raw = fs.readFileSync(settingsFile, 'utf-8');
    settings = JSON.parse(raw) as Record<string, unknown>;
    const sl = settings.statusLine as { command?: unknown } | undefined;
    existingCommand = typeof sl?.command === 'string' ? sl.command : undefined;
  } catch {
    // File missing → we may create it. File present but invalid JSON → DO NOT
    // overwrite (fail-open, preserve whatever the user has).
    if (fs.existsSync(settingsFile)) {
      return { changed: false, action: 'keep-user' };
    }
    settings = {};
    existingCommand = undefined;
  }

  const resolved = reconcileStatusLine(existingCommand);
  if (resolved.action !== 'install') {
    return { changed: false, action: resolved.action };
  }

  const existingSl = (settings.statusLine ?? {}) as Record<string, unknown>;
  settings.statusLine = { ...existingSl, type: 'command', command: resolved.command };

  writeJsonAtomic(settingsFile, settings);
  return { changed: true, action: 'install' };
}

/** Atomic config save: temp file + rename (.claude/rules/atomic-config-save.md). */
function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
    fs.renameSync(tmp, filePath);
  } finally {
    if (fs.existsSync(tmp)) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore temp cleanup failure
      }
    }
  }
}
