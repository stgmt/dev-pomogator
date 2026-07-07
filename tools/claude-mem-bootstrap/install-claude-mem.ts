// SessionStart trigger that bootstraps the `claude-mem` plugin for dev-pomogator users.
//
// Why: dev-pomogator ships as a Claude Code marketplace plugin (no npm postinstall in the
// user's env), and the v1 installer that used to set claude-mem up was dropped in the v2
// canonical refactor (commit 43cf9462, src/installer/) with no replacement. This hook is that
// replacement: on SessionStart, if claude-mem is not installed yet, it fires the official
// installer DETACHED so the next session has memory.
//
// The claude-mem installer is INTERACTIVE (it multi-selects IDEs + asks provider/model). We
// suppress every prompt by (a) passing the non-interactive flags it documents
// (--ide/--provider/--model/--runtime) and (b) spawning WITHOUT a TTY + with CI/DO_NOT_TRACK,
// which short-circuits the remaining `if (!isInteractive)` / telemetry prompts. Verified against
// thedotmack/claude-mem@13.8.0 src/npx-cli/commands/install.ts + index.ts.
//
// Contract (must never disrupt a session):
//   - FAST: a JSON read + at most a fire-and-forget spawn.
//   - NON-BLOCKING: the (slow, network) install runs in an unref'd detached child.
//   - FAIL-OPEN: any error → exit 0 with a continue payload. Never throw, never block.
//   - IDEMPOTENT: skip if already installed; a lock file backs off repeated attempts.
//   - DEPS-ABSENT SAFE: pure node builtins only (ships in the plugin, runs with no node_modules).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { log as logShared } from '../_shared/hook-utils.ts';

const LOG_PREFIX = 'claude-mem-bootstrap';
const VERBOSE = process.env.DEV_POMOGATOR_HOOK_VERBOSE === '1';
const BACKOFF_MS = 6 * 60 * 60 * 1000; // 6h between attempts — a failing/offline install isn't retried every session

/** The confirmed non-interactive installer arguments (dev-pomogator defaults). */
export const INSTALL_ARGS = [
  '-y',
  'claude-mem',
  'install',
  '--ide',
  'claude-code',
  '--provider',
  'claude',
  '--model',
  'claude-haiku-4-5-20251001',
  '--runtime',
  'worker',
] as const;

/** Env that silences the prompts no flag covers (telemetry + email opt-in) and forces non-interactive. */
export const INSTALL_ENV: Record<string, string> = {
  DO_NOT_TRACK: '1',
  CI: '1',
  CLAUDE_MEM_ONLINE_OPTIN: 'false',
};

function log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', msg: string): void {
  if (level !== 'ERROR' && !VERBOSE) return;
  try {
    logShared(level, LOG_PREFIX, msg);
  } catch {
    /* best-effort */
  }
}

export interface InstallInvocation {
  cmd: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * Build the platform-correct invocation. Windows requires `cmd /c npx ...` (Claude Code's own
 * MCP launcher uses the same wrapping) because `npx` is a `.cmd` shim there.
 */
export function buildInstallInvocation(platform: NodeJS.Platform): InstallInvocation {
  const args = [...INSTALL_ARGS];
  if (platform === 'win32') {
    return { cmd: 'cmd', args: ['/c', 'npx', ...args], env: { ...INSTALL_ENV } };
  }
  return { cmd: 'npx', args, env: { ...INSTALL_ENV } };
}

export type BootstrapDecision = 'install' | 'skip-installed' | 'skip-optout' | 'skip-backoff';

/** Pure decision: given observed state, should we install? Order: opt-out → installed → backoff. */
export function claudeMemBootstrapDecision(state: {
  installed: boolean;
  optOut: boolean;
  lockFresh: boolean;
}): BootstrapDecision {
  if (state.optOut) return 'skip-optout';
  if (state.installed) return 'skip-installed';
  if (state.lockFresh) return 'skip-backoff';
  return 'install';
}

/**
 * Is the claude-mem plugin already present? Source of truth is Claude Code's
 * installed_plugins.json (any `claude-mem@<marketplace>` key with a non-empty entry list);
 * the worker pid/db file is a fallback for an install that registered outside that manifest.
 */
export function isClaudeMemInstalled(homeDir: string): boolean {
  try {
    const manifest = path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
    const raw = fs.readFileSync(manifest, 'utf-8');
    const data = JSON.parse(raw) as { plugins?: Record<string, unknown[]> };
    const plugins = data.plugins ?? {};
    for (const key of Object.keys(plugins)) {
      if (key.startsWith('claude-mem@') && Array.isArray(plugins[key]) && plugins[key].length > 0) {
        return true;
      }
    }
  } catch {
    /* missing/malformed → fall through to worker-file check */
  }
  try {
    const memDir = path.join(homeDir, '.claude-mem');
    return (
      fs.existsSync(path.join(memDir, '.worker.pid')) ||
      fs.existsSync(path.join(memDir, 'claude-mem.db'))
    );
  } catch {
    return false;
  }
}

function lockPath(homeDir: string): string {
  return path.join(homeDir, '.dev-pomogator', '.claude-mem-bootstrap.lock');
}

export function lockIsFresh(homeDir: string, now: number, backoffMs = BACKOFF_MS): boolean {
  try {
    return now - fs.statSync(lockPath(homeDir)).mtimeMs < backoffMs;
  } catch {
    return false;
  }
}

function stampLock(homeDir: string): void {
  try {
    const p = lockPath(homeDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, new Date().toISOString());
  } catch {
    /* best-effort */
  }
}

/**
 * Fire the installer. In production it's DETACHED (fire-and-forget). A test seam:
 * `CLAUDE_MEM_INSTALL_LAUNCHER` redirects the spawn through a stub binary (receiving the real
 * intended argv + env) and runs SYNCHRONOUSLY so a test can assert the recorded invocation
 * deterministically — never hitting the network.
 */
function fireInstaller(): void {
  const inv = buildInstallInvocation(process.platform);
  const launcher = process.env.CLAUDE_MEM_INSTALL_LAUNCHER;
  const env = { ...process.env, ...inv.env };
  if (launcher) {
    spawnSync(process.execPath, [launcher, inv.cmd, ...inv.args], {
      stdio: 'ignore',
      env,
      timeout: 10_000,
    });
    return;
  }
  const child = spawn(inv.cmd, inv.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env,
  });
  child.unref();
}

async function drainStdin(): Promise<void> {
  try {
    for await (const _chunk of process.stdin) {
      /* consume — hook protocol */
    }
  } catch {
    /* best-effort */
  }
}

function writeContinue(): void {
  try {
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  } catch {
    /* best-effort */
  }
}

async function main(): Promise<void> {
  await drainStdin();

  const optOut = (process.env.DEV_POMOGATOR_CLAUDE_MEM ?? '').toLowerCase() === 'off';
  const homeDir = os.homedir();
  const installed = optOut ? false : isClaudeMemInstalled(homeDir);
  const lockFresh = optOut || installed ? false : lockIsFresh(homeDir, Date.now());

  const decision = claudeMemBootstrapDecision({ installed, optOut, lockFresh });
  if (decision === 'install') {
    stampLock(homeDir);
    fireInstaller();
    log('INFO', 'claude-mem not installed — fired the non-interactive installer in the background.');
  } else {
    log('DEBUG', `no action: ${decision}`);
  }
  writeContinue();
}

// SessionStart: exit 0 = continue. Never block, never throw.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => {
      log('ERROR', `skipped: ${e && (e as Error).message ? (e as Error).message : e}`);
      writeContinue();
    })
    .finally(() => process.exit(0));
}
