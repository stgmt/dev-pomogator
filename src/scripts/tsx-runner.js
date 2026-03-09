#!/usr/bin/env node
/**
 * tsx-runner.js — Resilient TypeScript runner with multi-strategy fallback.
 *
 * Execution order (first success wins):
 *   1. Local tsx: node_modules/.bin/tsx (no npx dependency)
 *   2. npx tsx (standard approach)
 *   3. On npx error → clean cache → npm install (repair) → retry npx
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

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Parse args: everything after "--" or after the script name itself.
// When invoked via `node -e "require(runner)" -- script.ts --event Stop`,
// Node consumes "--" and puts script.ts in argv[1], so indexOf('--') = -1.
// Detect this case: if argv[1] looks like a .ts script path, include it.
const dashIdx = process.argv.indexOf('--');
let args;
if (dashIdx !== -1) {
  args = process.argv.slice(dashIdx + 1);
} else if (process.argv[1] && /\.tsx?$/.test(process.argv[1])) {
  // argv[1] is a .ts file — node consumed "--", include argv[1] onwards
  args = process.argv.slice(1);
} else {
  args = process.argv.slice(2);
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

  const cmd = [tsxBin, scriptPath, ...scriptArgs].map(p => `"${p}"`).join(' ');
  execSync(cmd, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: getSafeEnv(),
    timeout: 120000,
    shell: true,
  });
  return true;
}

/**
 * Strategy 2: Run tsx via npx (standard approach).
 */
function runNpxTsx() {
  const parts = ['npx', 'tsx', scriptPath, ...scriptArgs];
  const cmd = parts.map(p => `"${p}"`).join(' ');
  execSync(cmd, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: getSafeEnv(),
    timeout: 120000,
    shell: true,
  });
}

/**
 * Attempt to repair broken npm/npx by running `npm install`.
 * Called during Strategy 3 (npx failed) before retry.
 */
function repairNpmSync() {
  try {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    console.error('dev-pomogator: npx broken, running npm install to repair...');
    execSync(`"${npmCmd}" install`, {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 120000,
      shell: true,
      env: getSafeEnv(),
    });
    console.error('dev-pomogator: npm install completed, retrying...');
  } catch {
    // npm install failed — will retry npx anyway
  }
}

// Main: Strategy 1 (local tsx) → Strategy 2 (npx tsx) → Strategy 3 (clean + repair + retry npx)
try {
  // Strategy 1: direct local tsx — bypasses npx entirely
  if (runLocalTsx()) process.exit(0);
} catch (localError) {
  // Local tsx found but script failed — this is a real error, not a fallback case
  process.exit(localError.status || 1);
}

try {
  // Strategy 2: npx tsx
  runNpxTsx();
} catch (error) {
  if (isNpxCacheError(error)) {
    // Strategy 3: clean npx cache + repair npm + retry
    cleanNpxCache();
    cleanStaleNodeModulesDirs();
    repairNpmSync();
    try {
      runNpxTsx();
    } catch (retryError) {
      process.exit(retryError.status || 1);
    }
  } else {
    process.exit(error.status || 1);
  }
}
