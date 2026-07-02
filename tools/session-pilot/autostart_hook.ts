/**
 * session-pilot autostart — SessionStart hook (durable, self-healing, cross-OS).
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this hook, session-pilot only ever came up if a human had MANUALLY run
 * install.ps1 on that specific machine (which wrote a SessionStart entry into the
 * per-machine, non-distributed `.claude/settings.local.json`). Nothing travelled
 * to another machine and nothing self-healed — so the dashboard was "dead on
 * arrival" on any fresh checkout / plugin install. See
 * `audit-reports/session-pilot-durability-2026-07-02.md`.
 *
 * This hook is registered in BOTH `.claude-plugin/hooks.json` (canonical plugin
 * distribution — travels to every machine that installs dev-pomogator) and the
 * repo's `.claude/settings.json` (dogfood). On every SessionStart it idempotently
 * ensures the dashboard server is running, dispatching to the right OS starter:
 *   - Windows      → start-server.ps1  (via pwsh / powershell)
 *   - Linux/macOS  → start-server.sh   (via bash)
 * The starters are themselves idempotent (alive-PID check), so repeated
 * SessionStarts never spawn duplicates.
 *
 * DISCIPLINE
 * ----------
 * - builtins-only (node:child_process/os/path/fs/process) — no node_modules, so
 *   it runs for plugin users who have no installed deps (rule: dead-integration-guard).
 * - fail-open — ANY error → exit 0. A durability convenience must NEVER block a
 *   Claude Code session.
 * - non-blocking — spawns the starter detached + unref, returns immediately
 *   (SessionStart latency budget). The starter does not probe health.
 * - opt-out — SP_NO_AUTOSTART=1 (also honoured inside the starters) fully disables.
 * - observable — every decision lands in <state>/launcher.log so a silent no-op
 *   leaves a breadcrumb (Fix C at the hook level).
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

function stateDir(): string {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
    return path.join(base, 'session-pilot');
  }
  if (process.env.SP_STATE_DIR) return process.env.SP_STATE_DIR;
  const xdg = process.env.XDG_STATE_HOME || path.join(process.env.HOME || '', '.local', 'state');
  return path.join(xdg, 'session-pilot');
}

function log(msg: string): void {
  try {
    const dir = stateDir();
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString();
    fs.appendFileSync(path.join(dir, 'launcher.log'), `[${ts}] autostart_hook: ${msg}\n`);
  } catch {
    /* logging is best-effort — never throw from the log path */
  }
}

function isOptedOut(): boolean {
  const v = (process.env.SP_NO_AUTOSTART || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Resolve the session-pilot dir across all 3 contexts (plugin install / dogfood / cwd). */
function resolveSpDir(): string | null {
  const bases = [
    process.env.CLAUDE_PLUGIN_ROOT,
    process.env.CLAUDE_PROJECT_DIR,
    process.cwd(),
  ].filter(Boolean) as string[];
  for (const base of bases) {
    const cand = path.join(base, 'tools', 'session-pilot');
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

function findWindowsPowerShell(): string {
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return 'powershell.exe'; // last resort — on PATH for every Windows install
}

function main(): void {
  // Consume stdin (SessionStart delivers a JSON payload) so the pipe never blocks.
  try { fs.readFileSync(0, 'utf8'); } catch { /* no stdin — fine */ }

  if (isOptedOut()) { log('SP_NO_AUTOSTART set — skipping'); return; }

  const spDir = resolveSpDir();
  if (!spDir) { log('session-pilot dir not found in PLUGIN_ROOT/PROJECT_DIR/cwd — skipping'); return; }

  let cmd: string;
  let args: string[];
  if (process.platform === 'win32') {
    const starter = path.join(spDir, 'start-server.ps1');
    if (!fs.existsSync(starter)) { log(`start-server.ps1 missing at ${starter} — skipping`); return; }
    cmd = findWindowsPowerShell();
    args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', starter];
  } else {
    const starter = path.join(spDir, 'start-server.sh');
    if (!fs.existsSync(starter)) { log(`start-server.sh missing at ${starter} — skipping`); return; }
    cmd = 'bash';
    args = [starter];
  }

  log(`running starter: ${cmd} ${args[args.length - 1]}`);
  // Run the starter and WAIT for it to finish (NOT detached). The starter itself
  // is fast (~1-2s): it Start-Process/setsid's the python server as an independent
  // process and then exits. Waiting is essential on Windows — if the short-lived
  // node hook detaches the starter and exits immediately, the OS tears the starter
  // down (console/job teardown) BEFORE it reaches the spawn, so the server never
  // comes up. ~2s is trivially within the SessionStart hook budget.
  const child = spawn(cmd, args, { stdio: 'ignore' });
  let done = false;
  const finish = () => { if (!done) { done = true; process.exit(0); } };
  child.on('error', (e) => { log(`starter spawn error: ${e.message}`); finish(); });
  child.on('exit', (code) => { log(`starter exited (code ${code})`); finish(); });
  // Fail-safe: never block a session longer than 12s.
  setTimeout(() => { log('starter timeout (fail-open)'); finish(); }, 12000).unref();
}

try {
  main();
} catch (e) {
  log(`fatal (fail-open): ${e instanceof Error ? e.message : String(e)}`);
  process.exit(0);
}
