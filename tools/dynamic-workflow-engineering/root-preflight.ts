import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { WorkflowPacket } from './packet.ts';

export interface RootPreflightEvidence {
  ok: boolean;
  reasonCode: string | null;
  expectedRoot: string;
  actualRoot: string | null;
  expectedWorktree: string;
  actualSha: string | null;
  dirtyPaths: string[];
  unexpectedDirtyPaths: string[];
}

function canonical(target: string): string {
  const resolved = path.resolve(target);
  try {
    return realpathSync.native(resolved).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  } catch {
    return resolved.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  }
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function verifyRootPreflight(packet: WorkflowPacket): RootPreflightEvidence {
  const expectedRoot = canonical(packet.expectedRoot);
  const expectedWorktree = canonical(packet.worktree.path);
  let actualRoot: string | null = null;
  let actualSha: string | null = null;
  let dirtyPaths: string[] = [];
  try {
    actualRoot = canonical(git(packet.worktree.path, ['rev-parse', '--show-toplevel']));
    actualSha = git(packet.worktree.path, ['rev-parse', 'HEAD']);
    dirtyPaths = git(packet.worktree.path, ['status', '--porcelain=v1'])
      .split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replace(/\\/g, '/'));
  } catch {
    return { ok: false, reasonCode: 'DWE_GIT_ROOT_UNAVAILABLE', expectedRoot, actualRoot, expectedWorktree, actualSha, dirtyPaths, unexpectedDirtyPaths: dirtyPaths };
  }
  const allowed = packet.dirtyPathAllowlist.map((entry) => entry.replace(/\\/g, '/'));
  const unexpectedDirtyPaths = dirtyPaths.filter((entry) => !allowed.some((allowedPath) => entry === allowedPath || entry.startsWith(`${allowedPath}/`)));
  let reasonCode: string | null = null;
  if (actualRoot !== expectedRoot || actualRoot !== expectedWorktree) reasonCode = 'DWE_ROOT_WORKTREE_MISMATCH';
  else if (actualSha !== packet.worktree.baseSha) reasonCode = 'DWE_BASE_SHA_MISMATCH';
  else if (unexpectedDirtyPaths.length) reasonCode = 'DWE_DIRTY_PATH_OUTSIDE_ALLOWLIST';
  else if (packet.worktree.mode === 'isolated') reasonCode = 'DWE_ISOLATED_WORKTREE_UNPROVEN';
  return { ok: reasonCode === null, reasonCode, expectedRoot, actualRoot, expectedWorktree, actualSha, dirtyPaths, unexpectedDirtyPaths };
}
