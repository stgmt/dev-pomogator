/**
 * Test helpers for worktree-setup e2e (CORE024).
 *
 * Real temp git repos (not the fake initGitRepo) so `git check-ignore` /
 * `git worktree list` behave correctly. Tracks created paths for afterEach cleanup.
 */
import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const created: string[] = [];

/** Make a real git repo in a temp dir with the given files + optional .gitignore. */
export function makeTempGitRepo(
  files: Record<string, string> = {},
  gitignore?: string,
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-repo-'));
  created.push(dir);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  if (gitignore !== undefined) {
    fs.writeFileSync(path.join(dir, '.gitignore'), gitignore);
  }
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.ensureDirSync(path.dirname(full));
    fs.writeFileSync(full, content);
  }
  return dir;
}

/** Make an empty temp dir (e.g. a target "worktree" for env-sync). */
export function makeTempDir(prefix = 'wt-dest-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

/** Set HOME + USERPROFILE to a temp dir; returns a restore() fn. */
export function isolateHome(): { home: string; restore: () => void } {
  const home = makeTempDir('wt-home-');
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return {
    home,
    restore: () => {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = prevProfile;
    },
  };
}

/** Remove all temp paths created during the test run. */
export function cleanupTempPaths(): void {
  for (const p of created.splice(0)) {
    try {
      fs.removeSync(p);
    } catch {
      /* best-effort */
    }
  }
}

/** True if `git` is usable in this environment. */
export function gitAvailable(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf-8' }).status === 0;
}
