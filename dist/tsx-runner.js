#!/usr/bin/env node
/**
 * tsx-runner.js — Resilient TypeScript runner with multi-strategy fallback.
 *
 * Execution order (first success wins):
 *   0.    Node 22+ native: --experimental-strip-types (zero deps, ~50ms)
 *   1.    Local tsx: node_modules/.bin/tsx (no npx dependency)
 *   1.25  Home tsx: ~/.dev-pomogator/node_modules/.bin/tsx (user-level, cross-platform)
 *   1.5   Global tsx: tsx on PATH (e.g. installed globally via npm i -g tsx)
 *   2.    npx tsx (standard approach)
 *   3.    On npx error → clean cache → npm install (repair) → retry npx
 *
 * On Windows, the npx _npx/ cache directory can become corrupted
 * (ENOTEMPTY, MODULE_NOT_FOUND), causing all tsx-based hooks to fail.
 * Strategy 1 bypasses npx entirely, making hooks resilient to broken npx.
 *
 * Usage (via node -e portable pattern):
 *   node -e "require('<path>/tsx-runner.js')" -- <script.ts> [args...]
 *
 * Or directly:
 *   node tsx-runner.js <script.ts> [args...]
 */

'use strict';

const { execSync, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const VERBOSE = process.env.DEV_POMOGATOR_HOOK_VERBOSE === '1';
const IS_WIN = process.platform === 'win32';
/** Resolve bare command name to .cmd on Windows for execFileSync compatibility */
function cmd(name) { return IS_WIN ? name + '.cmd' : name; }
/**
 * execFileSync wrapper for .cmd files on Windows.
 * Node 20.12+ (CVE-2024-27980) no longer auto-wraps .cmd in cmd.exe,
 * so execFileSync('file.cmd', args) silently fails (exit null, no output).
 * Fix: route .cmd through COMSPEC (cmd.exe /c).
 */
function execCmd(bin, args, opts) {
  if (IS_WIN && /\.cmd$/i.test(bin)) {
    return execFileSync(process.env.COMSPEC || 'cmd.exe', ['/c', bin, ...args], opts);
  }
  return execFileSync(bin, args, opts);
}
const TSX_EXEC_TIMEOUT = (() => {
  const v = Number(process.env.TSX_RUNNER_TIMEOUT);
  return Number.isFinite(v) && v > 0 ? v : 180000;
})(); // 3 minutes default; override with TSX_RUNNER_TIMEOUT env var
const startTime = Date.now();
const strategyLog = [];

// Parse args: find the .ts/.tsx script path in argv, pass everything after it as script args.
// When invoked via `node -e "require(runner)" -- script.ts --framework vitest -- bash ...`,
// Node consumes the first "--", so argv = [node, -e, script.ts, --framework, vitest, --, bash, ...].
// We must NOT use indexOf('--') because a later "--" may be part of the CHILD script's args.
// Instead, find the .ts file first — it's always the script to run.
let args;
if (process.argv[2] && /\.tsx?$/i.test(process.argv[2])) {
  // `node -e "require(runner)" -- script.ts [child-args...]`
  // Node consumed "--", argv[2] is the script, rest is for the child
  args = process.argv.slice(2);
} else if (process.argv[1] && /\.tsx?$/i.test(process.argv[1])) {
  // `node tsx-runner.js script.ts [child-args...]` (direct invocation)
  args = process.argv.slice(1);
} else {
  // Fallback: look for "--" separator
  const dashIdx = process.argv.indexOf('--');
  if (dashIdx !== -1) {
    args = process.argv.slice(dashIdx + 1);
  } else {
    args = process.argv.slice(2);
  }
}

if (args.length === 0) {
  // No script provided — nothing to do (silent exit for hook compatibility)
  process.exit(0);
}

/**
 * Resolve script path — handles CWD mismatch when IDE runs from subdirectory.
 * Tries: absolute → CWD-relative → walk up to git root(s).
 */
function resolveScriptPath(rawPath) {
  // Absolute and exists — use as-is
  if (path.isAbsolute(rawPath) && fs.existsSync(rawPath)) return rawPath;

  // Relative from CWD
  const cwdResolved = path.resolve(process.cwd(), rawPath);
  if (fs.existsSync(cwdResolved)) return cwdResolved;

  // Walk up to find git root where script exists
  let dir = path.resolve(process.cwd());
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      const candidate = path.resolve(dir, rawPath);
      if (fs.existsSync(candidate)) return candidate;
    }
    dir = path.dirname(dir);
  }

  // Not found anywhere — return original (will fail with clear error)
  return rawPath;
}

const scriptPath = resolveScriptPath(args[0]);
const scriptArgs = args.slice(1);

/**
 * Check if an error looks like a corrupted npx cache issue.
 */
function isNpxCacheError(error) {
  const msg = String(error.message || error.stderr || error);
  return (
    msg.includes('ENOTEMPTY') ||
    msg.includes('MODULE_NOT_FOUND') ||
    msg.includes('Cannot find module') ||
    msg.includes('ERR_MODULE_NOT_FOUND')
  );
}

/**
 * Clean the npx cache directory (_npx/ inside npm cache).
 */
function cleanNpxCache() {
  try {
    const cache = execSync('npm config get cache', {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const npxDir = path.join(cache, '_npx');
    if (fs.existsSync(npxDir)) {
      fs.rmSync(npxDir, { recursive: true, force: true });
      console.error('dev-pomogator: cleaned corrupted npx cache, retrying...');
    }
  } catch {
    // Can't clean cache — will retry anyway
  }
}

/**
 * Remove a directory, trying chmod and rename-aside as fallbacks.
 * On Linux/devcontainers, stale dirs may be owned by root so rmSync fails with EACCES.
 * rename() only needs write permission on the parent dir, not on contents.
 * Duplicated from extensions.ts — this is a standalone CJS bundle, keep in sync.
 */
function forceRemoveDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return;
  } catch { /* fall through */ }

  if (process.platform !== 'win32') {
    try {
      execSync(`chmod -R u+w "${dirPath}"`, { stdio: 'pipe', timeout: 5000 });
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch { /* fall through */ }
  }

  const aside = `${dirPath}-purge-${Date.now()}`;
  fs.renameSync(dirPath, aside);
}

/**
 * Clean stale npm temp directories in node_modules/.
 * npm leaves behind .package-name-randomHash dirs on failed renames (ENOTEMPTY).
 * Duplicated from extensions.ts — this is a standalone CJS bundle, keep in sync.
 */
const STALE_NPM_DIR_PATTERN = /-.{8,}$/;
function cleanStaleNodeModulesDirs() {
  try {
    const nmDir = path.join(process.cwd(), 'node_modules');
    for (const entry of fs.readdirSync(nmDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('.') && STALE_NPM_DIR_PATTERN.test(entry.name)) {
        try {
          forceRemoveDir(path.join(nmDir, entry.name));
        } catch { /* skip */ }
      }
    }
  } catch { /* skip — node_modules may not exist */ }
}

/**
 * Find local tsx binary in node_modules/.bin/ by walking up from a starting dir.
 * Returns the path to tsx binary or null if not found.
 */
function findTsxBin(startDir) {
  const binName = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  let dir = path.resolve(startDir);
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', '.bin', binName);
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Find local tsx binary — searches from script directory first, then CWD.
 */
function findLocalTsx() {
  // Search from script's directory (most likely to have tsx installed)
  const fromScript = findTsxBin(path.dirname(scriptPath));
  if (fromScript) return fromScript;

  // Search from CWD
  const fromCwd = findTsxBin(process.cwd());
  if (fromCwd) return fromCwd;

  return null;
}

/**
 * Strategy 1.25: Find tsx in ~/.dev-pomogator/node_modules/.bin/
 * User-level tsx installed by dev-pomogator installer — works regardless
 * of which project is active, cross-platform (Windows/Linux/Mac).
 */
function findHomeTsx() {
  const homeDir = require('os').homedir();
  const binName = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const candidate = path.join(homeDir, '.dev-pomogator', 'node_modules', '.bin', binName);
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

/**
 * Strategy 1.25: Run tsx from ~/.dev-pomogator/node_modules/.bin/
 * Returns true if successful, false if tsx not found.
 * Throws on execution error (script error, not tsx-not-found).
 */
function runHomeTsx() {
  const tsxBin = findHomeTsx();
  if (!tsxBin) return false;

  execCmd(tsxBin, [scriptPath, ...scriptArgs], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: getSafeEnv(),
    timeout: TSX_EXEC_TIMEOUT,
  });
  return true;
}

/**
 * Get MSYS-safe env for Windows.
 * Duplicated from src/utils/msys.ts:getMsysSafeEnv — keep in sync.
 */
function getSafeEnv() {
  const env = { ...process.env };
  if (process.platform === 'win32') {
    env.MSYS_NO_PATHCONV = '1';
    env.MSYS2_ARG_CONV_EXCL = '*';
  }
  return env;
}

/**
 * Strategy 1: Run tsx directly from node_modules/.bin/ (no npx dependency).
 * Returns true if successful, false if tsx not found.
 * Throws on execution error (script error, not tsx-not-found).
 */
function runLocalTsx() {
  const tsxBin = findLocalTsx();
  if (!tsxBin) return false;

  execCmd(tsxBin, [scriptPath, ...scriptArgs], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: getSafeEnv(),
    timeout: TSX_EXEC_TIMEOUT,
  });
  return true;
}

/**
 * Strategy 1.5: Run tsx from global PATH (e.g. `npm i -g tsx`).
 * Returns true if successful, false if tsx not on PATH.
 * Throws on execution error (script error, not tsx-not-found).
 */
function runGlobalTsx() {
  try {
    execCmd(cmd('tsx'), ['--version'], {
      stdio: 'pipe',
      timeout: 5000,
      env: getSafeEnv(),
    });
  } catch {
    return false;
  }

  execCmd(cmd('tsx'), [scriptPath, ...scriptArgs], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: getSafeEnv(),
    timeout: TSX_EXEC_TIMEOUT,
  });
  return true;
}

/**
 * Strategy 2: Run tsx via npx (standard approach).
 */
function runNpxTsx() {
  execCmd(cmd('npx'), ['tsx', scriptPath, ...scriptArgs], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: getSafeEnv(),
    timeout: TSX_EXEC_TIMEOUT,
  });
}

/**
 * Attempt to repair broken npm/npx by running `npm install`.
 * Called during Strategy 3 (npx failed) before retry.
 */
function repairNpmSync() {
  try {
    console.error('dev-pomogator: npx broken, running npm install to repair...');
    execCmd(cmd('npm'), ['install'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: TSX_EXEC_TIMEOUT,
      env: getSafeEnv(),
    });
    console.error('dev-pomogator: npm install completed, retrying...');
  } catch {
    // npm install failed — will retry npx anyway
  }
}

/**
 * Centralized log file at ~/.dev-pomogator/logs/tsx-runner.log.
 * Persists across sessions — check after "startup hook error" to see what failed.
 */
function getLogFile() {
  const logsDir = path.join(require('os').homedir(), '.dev-pomogator', 'logs');
  try { fs.mkdirSync(logsDir, { recursive: true }); } catch { /* ignore */ }
  return path.join(logsDir, 'tsx-runner.log');
}

function appendLog(line) {
  try {
    fs.appendFileSync(getLogFile(), line + '\n', 'utf-8');
  } catch { /* non-fatal */ }
}

/**
 * Diagnostic logging — file always, stderr on failure or verbose.
 */
function logResult(success) {
  const scriptName = path.basename(scriptPath);
  const elapsed = Date.now() - startTime;
  const trace = strategyLog.join(',');
  const ts = new Date().toISOString();
  const status = success ? 'OK' : 'FAIL';
  const logLine = `[${ts}] [tsx-runner] ${status} script=${scriptName} strategies=${trace} elapsed=${elapsed}ms`;

  // Always write to file
  appendLog(logLine);

  // stderr: always on failure, verbose on success
  if (!success) {
    process.stderr.write(logLine + '\n');
  } else if (VERBOSE) {
    process.stderr.write(logLine + '\n');
  }
}

/**
 * Strategy 0: Node 22.6+ native TypeScript execution.
 * Uses --experimental-strip-types (strips TS annotations, runs natively).
 * Zero external dependencies, ~50ms cold start.
 * --experimental-default-type=module ensures .ts files are treated as ESM
 * regardless of nearest package.json.
 */
function runNodeNativeTs() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 6)) return false;

  execFileSync(process.execPath, [
    '--experimental-strip-types',
    '--experimental-default-type=module',
    scriptPath,
    ...scriptArgs,
  ], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: { ...getSafeEnv(), NODE_NO_WARNINGS: '1' },
    timeout: 30000,
  });
  return true;
}

// Main: Strategy 0 (native) → 1 (local) → 1.25 (home) → 1.5 (global) → 2 (npx) → 3 (clean + repair + retry npx)
try {
  // Strategy 0: Node 22+ native --experimental-strip-types (zero deps, ~50ms)
  if (runNodeNativeTs()) {
    strategyLog.push('0:native');
    logResult(true);
    process.exit(0);
  }
  strategyLog.push('0:skip');
} catch (nativeError) {
  // Check if it's a script error (has exit code) vs strip-types incompatibility
  const msg = String(nativeError.stderr || nativeError.message || '');
  if (nativeError.status && !msg.includes('ERR_UNSUPPORTED_NODE_OPTION') && !msg.includes('SyntaxError')) {
    // Script ran but failed — real error
    strategyLog.push(`0:fail(${nativeError.status})`);
    logResult(false);
    process.exit(nativeError.status);
  }
  // strip-types not supported or TS incompatible — fall through
  strategyLog.push('0:unsupported');
}

try {
  // Strategy 1: direct local tsx — bypasses npx entirely
  if (runLocalTsx()) {
    strategyLog.push('1:local');
    logResult(true);
    process.exit(0);
  }
  strategyLog.push('1:notfound');
} catch (localError) {
  // Local tsx found but script failed — this is a real error, not a fallback case
  strategyLog.push(`1:fail(${localError.status || 1})`);
  logResult(false);
  process.exit(localError.status || 1);
}

try {
  // Strategy 1.25: tsx from ~/.dev-pomogator/ (user-level, cross-platform)
  if (runHomeTsx()) {
    strategyLog.push('1.25:home');
    logResult(true);
    process.exit(0);
  }
  strategyLog.push('1.25:notfound');
} catch (homeError) {
  // Home tsx found but script failed — real error
  strategyLog.push(`1.25:fail(${homeError.status || 1})`);
  logResult(false);
  process.exit(homeError.status || 1);
}

try {
  // Strategy 1.5: global tsx on PATH (e.g. npm i -g tsx)
  if (runGlobalTsx()) {
    strategyLog.push('1.5:global');
    logResult(true);
    process.exit(0);
  }
  strategyLog.push('1.5:notfound');
} catch (globalError) {
  // Global tsx found but script failed — real error
  strategyLog.push(`1.5:fail(${globalError.status || 1})`);
  logResult(false);
  process.exit(globalError.status || 1);
}

try {
  // Strategy 2: npx tsx
  runNpxTsx();
  strategyLog.push('2:npx');
  logResult(true);
} catch (error) {
  if (isNpxCacheError(error)) {
    strategyLog.push('2:cache-error');
    // Strategy 3: clean npx cache + repair npm + retry
    cleanNpxCache();
    cleanStaleNodeModulesDirs();
    repairNpmSync();
    try {
      runNpxTsx();
      strategyLog.push('3:repaired');
      logResult(true);
    } catch (retryError) {
      strategyLog.push(`3:fail(${retryError.status || 1})`);
      logResult(false);
      process.exit(retryError.status || 1);
    }
  } else {
    strategyLog.push(`2:fail(${error.status || 1})`);
    logResult(false);
    process.exit(error.status || 1);
  }
}
