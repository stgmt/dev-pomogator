// SessionStart trigger for Marksman (FR-7 / Option D — the missing "install trigger").
//
// dev-pomogator ships as a Claude Code marketplace plugin, NOT an npm package the
// user installs — so `package.json` postinstall never fires in the user's env. The
// trigger MUST be a hook. On SessionStart we resolve Marksman package-first
// (PATH → managed); if nothing is present we fire a DETACHED background download
// (the managed fallback) so the next session resolves it. PATH-installed Marksman
// needs zero action — server boot() resolves it live.
//
// Fast by design: a PATH scan + at most a fire-and-forget spawn. The 22MB
// download happens in the unref'd child, never blocking session start. Idempotent
// via a back-off so a failed/offline attempt isn't retried every session.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveMarksmanBinary } from './resolve-binary.ts';
import { readLog, type InstallLog } from './install-log.ts';

const BACKOFF_MS = 6 * 60 * 60 * 1000; // 6h between failed download attempts

/**
 * Should the trigger fire a managed download? Only reached when no binary
 * resolved. Backs off after a recent FAILED attempt; re-installs immediately if
 * a previously-successful binary has since vanished.
 */
export function shouldAttemptInstall(log: InstallLog | null, now: number, backoffMs = BACKOFF_MS): boolean {
  if (!log) return true;
  const m = log.marksman;
  if (!m.installed_at) return true;
  const age = now - Date.parse(m.installed_at);
  if (Number.isNaN(age)) return true;
  // Recent failure (a `reason` is recorded) → back off; otherwise (re)install.
  return !(m.reason && age < backoffMs);
}

/** Spawn the managed download detached so the hook returns immediately. */
export function triggerBackgroundInstall(repoRoot: string): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const postinstall = path.join(here, 'postinstall.ts');
  const child = spawn(process.execPath, ['--import', 'tsx', postinstall], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, DEV_POMOGATOR_REPO_ROOT: repoRoot },
  });
  child.unref();
}

export interface EnsureOutcome {
  action: 'use-resolved' | 'install-triggered' | 'backoff';
  source?: 'path' | 'managed';
}

/** Pure decision + side-effect orchestration, injectable for tests. */
export function ensureMarksman(opts: {
  repoRoot: string;
  now?: number;
  resolve?: typeof resolveMarksmanBinary;
  read?: typeof readLog;
  trigger?: (repoRoot: string) => void;
}): EnsureOutcome {
  const resolved = (opts.resolve ?? resolveMarksmanBinary)({ repoRoot: opts.repoRoot });
  if (resolved) return { action: 'use-resolved', source: resolved.source };

  const log = (opts.read ?? readLog)(opts.repoRoot);
  if (!shouldAttemptInstall(log, opts.now ?? Date.now())) return { action: 'backoff' };

  (opts.trigger ?? triggerBackgroundInstall)(opts.repoRoot);
  return { action: 'install-triggered' };
}

function main(): void {
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.env.DEV_POMOGATOR_REPO_ROOT || process.cwd();
  try {
    ensureMarksman({ repoRoot });
  } catch {
    // SessionStart hooks must never break the session — best-effort only.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
