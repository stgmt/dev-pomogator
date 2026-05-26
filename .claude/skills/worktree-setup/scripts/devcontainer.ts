/**
 * devcontainer — FR-12a: bring up the per-worktree devcontainer.
 *
 * When `--devcontainer` is passed, after build/deps-sync the skill runs
 * `docker compose build` then `docker compose up -d` in `<worktree>/.devcontainer`
 * with a compose project name derived from the worktree directory (sanitized) and
 * the worktree-unique ports env-sync already wrote to `.devcontainer/.env`.
 *
 * Best-effort (NFR-R9): if Docker is missing or compose fails, return a failure
 * with the manual command — the caller continues without aborting.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface DevcontainerResult {
  ran: boolean;
  ok: boolean;
  message: string;
}

/** Compose project name = sanitized lowercase worktree dir (mirrors launch-worktree.ps1:162). */
export function composeProjectName(worktreePath: string): string {
  return path.basename(worktreePath).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dockerAvailable(): boolean {
  const r = spawnSync('docker', ['--version'], { encoding: 'utf-8' });
  return r.status === 0;
}

/**
 * Build and start the worktree's devcontainer. Returns `ran:false` when there is
 * no compose file (nothing to do); otherwise `ok` reflects success.
 */
export function bringUpDevcontainer(worktreePath: string): DevcontainerResult {
  const dcDir = path.join(worktreePath, '.devcontainer');
  const composeFile = path.join(dcDir, 'docker-compose.yml');
  if (!fs.existsSync(composeFile)) {
    return {
      ran: false,
      ok: false,
      message: 'No .devcontainer/docker-compose.yml in worktree — skipped devcontainer bring-up.',
    };
  }
  const manual = `cd ${dcDir} && docker compose up -d --build`;
  if (!dockerAvailable()) {
    return { ran: true, ok: false, message: `Docker not available. Bring up manually: ${manual}` };
  }
  const project = composeProjectName(worktreePath);
  const env = { ...process.env };
  const common = { cwd: dcDir, encoding: 'utf-8' as const, env };

  const build = spawnSync('docker', ['compose', '-p', project, 'build'], common);
  if (build.status !== 0) {
    return {
      ran: true,
      ok: false,
      message: `docker compose build failed (exit ${build.status}). Retry: ${manual}`,
    };
  }
  const up = spawnSync('docker', ['compose', '-p', project, 'up', '-d'], common);
  if (up.status !== 0) {
    return {
      ran: true,
      ok: false,
      message: `docker compose up failed (exit ${up.status}). Retry: ${manual}`,
    };
  }
  return { ran: true, ok: true, message: `DevContainer up (project ${project}).` };
}
