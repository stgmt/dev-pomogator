/**
 * pr-creator — FR-4: push the worktree branch and open a draft PR.
 *
 * Given a resolved owner/repo, push `feat/<slug>` from the worktree and run
 * `gh pr create --draft`. Never auto-creates the repo (NFR-S4) — a 404 is
 * surfaced as a `gh repo create` hint. Best-effort on the push/create itself.
 */
import { spawnSync } from 'node:child_process';

export interface PrResult {
  ok: boolean;
  url?: string;
  message: string;
}

/**
 * Push `feat/<slug>` from `worktreePath` to origin and open a draft PR on
 * `owner/repo`. Adds the `origin` remote if missing.
 */
export function createDraftPr(
  worktreePath: string,
  slug: string,
  owner: string,
  repo: string,
): PrResult {
  const branch = `feat/${slug}`;
  const remoteUrl = `https://github.com/${owner}/${repo}.git`;

  // Add origin if missing (idempotent).
  const hasOrigin = spawnSync('git', ['-C', worktreePath, 'remote', 'get-url', 'origin'], {
    encoding: 'utf-8',
  });
  if (hasOrigin.status !== 0) {
    spawnSync('git', ['-C', worktreePath, 'remote', 'add', 'origin', remoteUrl], {
      encoding: 'utf-8',
    });
  }

  const push = spawnSync('git', ['-C', worktreePath, 'push', '-u', 'origin', branch], {
    encoding: 'utf-8',
  });
  if (push.status !== 0) {
    return {
      ok: false,
      message: `git push failed (exit ${push.status}): ${(push.stderr || '').trim()}`,
    };
  }

  const pr = spawnSync(
    'gh',
    [
      'pr',
      'create',
      '--draft',
      '--repo',
      `${owner}/${repo}`,
      '--head',
      branch,
      '--title',
      `feat(${slug}): WIP`,
      '--body',
      'Auto-created by worktree-setup skill',
    ],
    { cwd: worktreePath, encoding: 'utf-8' },
  );
  if (pr.status !== 0) {
    const err = (pr.stderr || '').trim();
    if (/404|not found|could not resolve/i.test(err)) {
      return {
        ok: false,
        message: `Repo ${owner}/${repo} not found. Create it first: gh repo create ${owner}/${repo}`,
      };
    }
    return { ok: false, message: `gh pr create failed (exit ${pr.status}): ${err}` };
  }
  const url = (pr.stdout || '').trim().split('\n').filter(Boolean).pop();
  return { ok: true, url, message: `Draft PR created: ${url}` };
}
