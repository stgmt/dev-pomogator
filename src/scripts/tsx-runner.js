#!/usr/bin/env node
/**
 * tsx-runner.js — Resilient TypeScript runner via npx tsx.
 *
 * Wraps `npx tsx <script>` with automatic retry on corrupted npx cache.
 * On Windows, the npx _npx/ cache directory can become corrupted
 * (ENOTEMPTY, MODULE_NOT_FOUND), causing all tsx-based hooks to fail.
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

// Parse args: everything after "--" or after the script name itself
const dashIdx = process.argv.indexOf('--');
const args = dashIdx !== -1
  ? process.argv.slice(dashIdx + 1)
  : process.argv.slice(2);

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
 * Build the npx tsx command parts.
 */
function buildCommand() {
  const parts = ['npx', 'tsx', scriptPath, ...scriptArgs];
  return parts.map(p => `"${p}"`).join(' ');
}

/**
 * Run the tsx command.
 */
function run() {
  // Duplicated from src/utils/msys.ts:getMsysSafeEnv — keep in sync
  const env = { ...process.env };
  if (process.platform === 'win32') {
    env.MSYS_NO_PATHCONV = '1';
    env.MSYS2_ARG_CONV_EXCL = '*';
  }
  execSync(buildCommand(), {
    stdio: 'inherit',
    cwd: process.cwd(),
    env,
    timeout: 120000,
    shell: true,
  });
}

// Main: try → on cache error → clean → retry once
try {
  run();
} catch (error) {
  if (isNpxCacheError(error)) {
    cleanNpxCache();
    try {
      run();
    } catch (retryError) {
      process.exit(retryError.status || 1);
    }
  } else {
    process.exit(error.status || 1);
  }
}
