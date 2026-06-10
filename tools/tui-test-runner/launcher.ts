/**
 * TUI Launcher — Python process manager
 * FR-9: Detects Python, checks Textual, spawns TUI process
 * NFR-R1: Fail-open — exit 0 if Python unavailable
 */

import { execSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { log as _logShared } from '../_shared/hook-utils.ts';

const LOG_PREFIX = 'TUI-LAUNCHER';
function log(level: 'INFO' | 'ERROR' | 'WARN', message: string): void {
  _logShared(level, LOG_PREFIX, message);
}

/**
 * Windows-only: does `bin` resolve ONLY to the Microsoft Store execution-alias
 * stub (`…\WindowsApps\python.exe`)? EXECUTING that stub is what pops the Store —
 * so we must detect it WITHOUT running it. `where` only reads PATH (no execution),
 * so it never triggers the Store. If every resolved path is under WindowsApps,
 * the only "python" is the stub → treat as absent and NEVER probe `--version`.
 */
/** Pure: are ALL resolved paths the Microsoft Store execution-alias stub? (the
 *  bug-prevention core — `≥1` real interpreter path means it's safe to execute).
 *  Empty = nothing resolved (not the alias case). Exported for cross-platform test. */
export function everyPathIsStoreAlias(paths: readonly string[]): boolean {
  const real = paths.map((s) => s.trim()).filter(Boolean);
  return real.length > 0 && real.every((p) => /[\\/]WindowsApps[\\/]/i.test(p));
}

export function resolvesToStoreAliasOnly(bin: string): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const out = execSync(`where ${bin}`, { encoding: 'utf-8', timeout: 5000 }).trim();
    return everyPathIsStoreAlias(out.split(/\r?\n/));
  } catch {
    return false; // `where` failed = not on PATH; the normal probe will ENOENT, no Store
  }
}

/** Check if Python 3.9+ is available — WITHOUT ever executing the Store stub. */
export function detectPython(): string | null {
  // Windows: `py -3` (the real Python Launcher py.exe — never the Store alias)
  // FIRST, so we prefer a genuine interpreter and only fall back to bare
  // `python`/`python3` after filtering out the WindowsApps execution-alias stub.
  const candidates = process.platform === 'win32'
    ? ['py -3', 'python', 'python3']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    const bin = cmd.split(' ')[0];
    // NEVER execute a bin that resolves only to the Microsoft Store alias —
    // running it opens the Store (the bug behind "что за питон-менеджер открылся").
    if (resolvesToStoreAliasOnly(bin)) {
      log('WARN', `Skipping '${bin}' — resolves only to the Microsoft Store alias (not a real interpreter); not executed`);
      continue;
    }
    try {
      const output = execSync(`${cmd} --version`, { encoding: 'utf-8', timeout: 5000 }).trim();
      const match = output.match(/Python\s+(\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        if (major >= 3 && minor >= 9) {
          log('INFO', `Found ${output} via '${cmd}'`);
          return cmd; // keep the full invocation ('py -3' OR 'python') so callers run the SAME interpreter
        }
      }
    } catch { /* not found, try next */ }
  }

  return null;
}

/** Check if Textual is installed */
export function checkTextual(pythonCmd: string): boolean {
  try {
    execSync(`${pythonCmd} -c "import textual"`, { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Install Textual and PyYAML */
export function installDeps(pythonCmd: string): boolean {
  try {
    log('INFO', 'Installing textual and pyyaml...');
    execSync(`${pythonCmd} -m pip install --user textual pyyaml`, {
      encoding: 'utf-8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    log('INFO', 'Dependencies installed successfully');
    return true;
  } catch (err) {
    log('ERROR', `Failed to install dependencies: ${err}`);
    return false;
  }
}

export function buildTuiLaunchArgs(statusFile: string, logFile: string, framework: string): string[] {
  const args = [
    '-m', 'tui',
    '--status-file', statusFile,
    '--log-file', logFile,
    '--framework', framework,
  ];

  // Add .docker-status/ as fallback for Docker test YAML
  if (statusFile.includes('.test-status')) {
    const dockerFallbackDir = path.dirname(statusFile.replace('.test-status', '.docker-status'));
    args.push('--fallback-dir', dockerFallbackDir);
  }

  return args;
}

/** Launch TUI process */
export function launchTui(
  pythonCmd: string,
  tuiPackagePath: string,
  statusFile: string,
  logFile: string,
  framework: string,
): void {
  const pidFile = statusFile.replace(/status\..+\.yaml$/, 'tui.pid');
  const entrypoint = path.join(tuiPackagePath, '__main__.py');

  // Check if already running
  if (fs.existsSync(pidFile)) {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
      process.kill(pid, 0); // check if alive
      log('INFO', `TUI already running (PID ${pid})`);
      return;
    } catch {
      // Process not running, cleanup stale PID file
      fs.unlinkSync(pidFile);
    }
  }

  if (!fs.existsSync(entrypoint)) {
    log('ERROR', `TUI entrypoint not found: ${entrypoint}`);
    return;
  }

  // pythonCmd may be a multi-token invocation ('py -3'); spawn needs exe + args
  // split (spawn treats the whole string as one executable name otherwise).
  const [exe, ...preArgs] = pythonCmd.split(' ');
  const child = spawn(exe, [...preArgs, ...buildTuiLaunchArgs(statusFile, logFile, framework)], {
    cwd: path.dirname(tuiPackagePath),
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  if (child.pid) {
    fs.writeFileSync(pidFile, String(child.pid), 'utf-8');
    log('INFO', `TUI launched (PID ${child.pid})`);
  }
}

// --- CLI entry point ---
if (process.argv[1] === import.meta.url?.replace('file://', '') || process.argv.includes('--launch')) {
  const statusFile = process.argv.find((_, i, a) => a[i - 1] === '--status-file') || '';
  const logFile = process.argv.find((_, i, a) => a[i - 1] === '--log-file') || '';
  const framework = process.argv.find((_, i, a) => a[i - 1] === '--framework') || 'auto';

  const python = detectPython();
  if (!python) {
    log('ERROR', 'Python 3.9+ required for TUI test runner. Install Python and try again.');
    process.exit(0); // fail-open
  }

  if (!checkTextual(python)) {
    if (!installDeps(python)) {
      log('ERROR', 'Could not install textual. Run: pip install textual pyyaml');
      process.exit(0);
    }
  }

  if (statusFile) {
    const tuiPath = path.join(__dirname, 'tui');
    launchTui(python, tuiPath, statusFile, logFile, framework);
  } else {
    log('WARN', 'No --status-file provided');
  }
}
