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
  // Initial commit so HEAD exists (`git worktree add` needs it). Gitignored
  // files (e.g. .env*) stay as working-tree-only, which is exactly the env-sync scenario.
  const gitId = ['-c', 'user.email=test@example.com', '-c', 'user.name=test'];
  spawnSync('git', [...gitId, 'add', '-A'], { cwd: dir });
  spawnSync('git', [...gitId, 'commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir });
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

/**
 * Make a temp `bin/` dir of executable shell shims and return a PATH string with
 * it prepended. `scripts` maps command name → shell body (after the shebang).
 * Used to mock `gh`/`docker` for canonical (no-installer) integration tests.
 */
export function makeMockBin(scripts: Record<string, string>): { bin: string; path: string } {
  const bin = makeTempDir('wt-mockbin-');
  for (const [name, body] of Object.entries(scripts)) {
    const f = path.join(bin, name);
    fs.writeFileSync(f, `#!/bin/sh\n${body}\n`);
    fs.chmodSync(f, 0o755);
  }
  return { bin, path: `${bin}${path.delimiter}${process.env.PATH}` };
}

/**
 * Write a mock `bin/cli.js` (Node) into a temp main repo, simulating the installer:
 * it records its cwd (the worktree) into `<HOME>/.dev-pomogator/config.json`.
 * `mode`: register the worktree (ok), register nothing (unregistered), or register
 * the parent dir (ancestor mismatch).
 */
export function writeMockInstaller(mainRepo: string, mode: 'register' | 'none' | 'ancestor'): void {
  const reg =
    mode === 'register'
      ? 'process.cwd()'
      : mode === 'ancestor'
        ? 'require("path").dirname(process.cwd())'
        : 'null';
  const body = `#!/usr/bin/env node
const fs=require('fs'),os=require('os'),path=require('path');
const dir=path.join(os.homedir(),'.dev-pomogator');
fs.mkdirSync(dir,{recursive:true});
const reg=${reg};
const cfg={installedExtensions:[{name:'mock',projectPaths:reg?[reg]:[]}]};
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(cfg,null,2));
`;
  const binDir = path.join(mainRepo, 'bin');
  fs.ensureDirSync(binDir);
  fs.writeFileSync(path.join(binDir, 'cli.js'), body);
}
