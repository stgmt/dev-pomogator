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

/** Check if Python 3.9+ is available */
export function detectPython(): string | null {
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py -3']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const output = execSync(`${cmd} --version`, { encoding: 'utf-8', timeout: 5000 }).trim();
      const match = output.match(/Python\s+(\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        if (major >= 3 && minor >= 9) {
          log('INFO', `Found ${output} via '${cmd}'`);
          return cmd.split(' ')[0]; // return just the binary name
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

  const child = spawn(pythonCmd, buildTuiLaunchArgs(statusFile, logFile, framework), {
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
