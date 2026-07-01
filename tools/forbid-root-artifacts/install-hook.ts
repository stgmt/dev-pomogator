// SessionStart hook: auto-install the forbid-root-artifacts git pre-commit hook (FR-7).
//
// Design (mirrors tools/mcp-setup/mcp-bootstrap.ts + tools/claude-mem-bootstrap/install-claude-mem.ts):
//   - FR-7 idempotent SessionStart installer: in a git repo, ensure the pre-commit hook is wired.
//   - FR-9 auto-provision python deps (pre-commit + pyyaml) via the existing deps-install.py before
//     delegating the real install to setup.py (DRY — never re-implements the YAML wiring).
//
// Contract (must never disrupt a session):
//   - FAIL-OPEN: any error → {continue:true, suppressOutput:true}, exit 0. Never throws, never blocks.
//   - IDEMPOTENT: a fast-path read of .pre-commit-config.yaml for `id: forbid-root-artifacts` skips
//     without spawning python.
//   - OPT-OUT: DEV_POMOGATOR_ROOT_ARTIFACTS_SETUP=off → install nothing.
//   - BACKOFF: a failed attempt is not retried more than once per 6h (lock file in .dev-pomogator/).
//   - DEPS-ABSENT SAFE: node builtins + child_process only (ships in plugin, runs with no node_modules).
//
// Test seams (deterministic BDD, no real pip): DEV_POMOGATOR_ROOT_ARTIFACTS_DEPS_LAUNCHER /
// DEV_POMOGATOR_ROOT_ARTIFACTS_SETUP_LAUNCHER — when set, run `node <launcher> <phase>` instead of the
// python scripts; DEV_POMOGATOR_ROOT_ARTIFACTS_FORCE_DEPS_MISSING=1 forces the deps probe to fail.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { log as logShared } from '../_shared/hook-utils.ts';

const LOG_PREFIX = 'forbid-root-artifacts-install';
const VERBOSE = process.env.DEV_POMOGATOR_HOOK_VERBOSE === '1';
const OPT_OUT_ENV = 'DEV_POMOGATOR_ROOT_ARTIFACTS_SETUP';
const DEPS_LAUNCHER_ENV = 'DEV_POMOGATOR_ROOT_ARTIFACTS_DEPS_LAUNCHER';
const SETUP_LAUNCHER_ENV = 'DEV_POMOGATOR_ROOT_ARTIFACTS_SETUP_LAUNCHER';
const FORCE_DEPS_MISSING_ENV = 'DEV_POMOGATOR_ROOT_ARTIFACTS_FORCE_DEPS_MISSING';
const HOOK_ID = 'forbid-root-artifacts';
const PRECOMMIT_CONFIG = '.pre-commit-config.yaml';
const LOCK_REL = path.join('.dev-pomogator', '.root-artifacts-setup.lock');
const BACKOFF_MS = 6 * 60 * 60 * 1000; // 6h

function log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', msg: string): void {
  if (level !== 'ERROR' && level !== 'WARN' && !VERBOSE) return;
  try {
    logShared(level, LOG_PREFIX, msg);
  } catch {
    /* best-effort */
  }
}

// ─── Pure decision (SOLID: single responsibility, no I/O — mirrors mcpInstallDecision) ──────────────
export type InstallDecision =
  | 'install'
  | 'skip:opt-out'
  | 'skip:not-git'
  | 'skip:already'
  | 'skip:backoff';

export interface InstallState {
  optOut: boolean;
  isGitRepo: boolean;
  alreadyInstalled: boolean;
  backoffActive: boolean;
}

export function rootArtifactsInstallDecision(state: InstallState): InstallDecision {
  if (state.optOut) return 'skip:opt-out';
  if (!state.isGitRepo) return 'skip:not-git';
  if (state.alreadyInstalled) return 'skip:already';
  if (state.backoffActive) return 'skip:backoff';
  return 'install';
}

// ─── I/O probes (builtins only) ─────────────────────────────────────────────────────────────────────
/** Repo root: hook input cwd → CLAUDE_PROJECT_DIR → DEV_POMOGATOR_REPO_ROOT → process.cwd(). */
export function resolveRepoRoot(inputCwd?: string): string {
  return (
    inputCwd ||
    process.env.CLAUDE_PROJECT_DIR ||
    process.env.DEV_POMOGATOR_REPO_ROOT ||
    process.cwd()
  );
}

/** A `.git` entry (dir for a normal clone, file for a worktree) marks a git repo. */
export function isGitRepo(root: string): boolean {
  try {
    return fs.existsSync(path.join(root, '.git'));
  } catch {
    return false;
  }
}

/** Fast-path idempotency: the hook id present in .pre-commit-config.yaml → already wired. */
export function isAlreadyInstalled(root: string): boolean {
  try {
    const cfg = path.join(root, PRECOMMIT_CONFIG);
    if (!fs.existsSync(cfg)) return false;
    return fs.readFileSync(cfg, 'utf8').includes(`id: ${HOOK_ID}`);
  } catch {
    return false;
  }
}

/** A fresh (<6h) lock means the last attempt failed and we should not hammer pip every session. */
export function backoffActive(root: string, nowMs: number): boolean {
  try {
    const lock = path.join(root, LOCK_REL);
    if (!fs.existsSync(lock)) return false;
    return nowMs - fs.statSync(lock).mtimeMs < BACKOFF_MS;
  } catch {
    return false;
  }
}

function writeBackoffLock(root: string): void {
  try {
    const lock = path.join(root, LOCK_REL);
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, new Date().toISOString(), 'utf8');
  } catch {
    /* best-effort */
  }
}

/** First working python interpreter, or null. */
function resolvePython(): string | null {
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  for (const c of candidates) {
    try {
      if (spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0) return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Deps (pre-commit + pyyaml) available? Test seam: FORCE_DEPS_MISSING=1 forces "missing" — but if
 * DEV_POMOGATOR_ROOT_ARTIFACTS_DEPS_MARKER points at an existing file, deps count as provisioned
 * (lets a BDD deps-launcher simulate a successful `pip install` without touching the real env).
 */
export function depsAvailable(python: string | null): boolean {
  if (process.env[FORCE_DEPS_MISSING_ENV] === '1') {
    const marker = process.env['DEV_POMOGATOR_ROOT_ARTIFACTS_DEPS_MARKER'];
    try {
      return !!marker && fs.existsSync(marker);
    } catch {
      return false;
    }
  }
  if (process.env['DEV_POMOGATOR_ROOT_ARTIFACTS_FORCE_DEPS_OK'] === '1') return true;
  if (!python) return false;
  const ok = (cmd: string, args: string[]): boolean => {
    try {
      return spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
    } catch {
      return false;
    }
  };
  const preCommit = ok('pre-commit', ['--version']) || ok(python, ['-m', 'pre_commit', '--version']);
  const pyyaml = ok(python, ['-c', 'import yaml']);
  return preCommit && pyyaml;
}

/** Run a python script, or its launcher test-seam (node <launcher> <phase>) when the env is set. */
function runPhase(phase: 'deps' | 'setup', root: string, toolDir: string, python: string | null): number {
  const launcher = process.env[phase === 'deps' ? DEPS_LAUNCHER_ENV : SETUP_LAUNCHER_ENV];
  if (launcher) {
    const r = spawnSync(process.execPath, [launcher, phase], { cwd: root, stdio: 'inherit' });
    return r.status ?? 1;
  }
  if (!python) return 1;
  const script = phase === 'deps' ? 'deps-install.py' : 'setup.py';
  const r = spawnSync(python, [path.join(toolDir, script)], {
    cwd: root,
    stdio: VERBOSE ? 'inherit' : 'ignore',
    timeout: 55_000,
  });
  return r.status ?? 1;
}

/** Perform the install: deps (if missing) then setup. Fail-open with a backoff lock. */
function performInstall(root: string, toolDir: string): void {
  const python = resolvePython();
  if (!depsAvailable(python)) {
    runPhase('deps', root, toolDir, python);
    if (!depsAvailable(python)) {
      log('WARN', 'WARNING: pre-commit/pyyaml unavailable after deps-install — hook NOT wired. ' +
        'Install manually: pip install pre-commit pyyaml. Retrying no sooner than 6h.');
      writeBackoffLock(root);
      return; // fail-open
    }
  }
  const status = runPhase('setup', root, toolDir, python);
  if (status !== 0) {
    log('WARN', `setup.py exited ${status} — hook may not be wired. Retrying no sooner than 6h.`);
    writeBackoffLock(root);
  }
}

// ─── Hook I/O protocol ────────────────────────────────────────────────────────────────────────────
function readStdinCwd(): string | undefined {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return undefined;
    const parsed = JSON.parse(raw);
    return typeof parsed?.cwd === 'string' ? parsed.cwd : undefined;
  } catch {
    return undefined;
  }
}

function writeContinue(): void {
  try {
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch {
    /* best-effort */
  }
}

export function main(nowMs: number): void {
  const inputCwd = readStdinCwd();
  const root = resolveRepoRoot(inputCwd);
  const toolDir = path.dirname(fileURLToPath(import.meta.url));

  const state: InstallState = {
    optOut: process.env[OPT_OUT_ENV] === 'off',
    isGitRepo: isGitRepo(root),
    alreadyInstalled: isAlreadyInstalled(root),
    backoffActive: backoffActive(root, nowMs),
  };
  const decision = rootArtifactsInstallDecision(state);
  log('INFO', `decision=${decision} root=${root}`);
  if (decision === 'install') {
    performInstall(root, toolDir);
  }
  writeContinue();
}

// Entry-guard: run only when invoked directly (bootstrap.cjs launcher), not on import (tests).
const isDirect = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
  } catch {
    return false;
  }
})();
if (isDirect) {
  try {
    main(Date.now());
  } catch (err) {
    log('ERROR', `fatal (fail-open): ${(err as Error)?.message ?? err}`);
    writeContinue();
  } finally {
    process.exit(0);
  }
}
