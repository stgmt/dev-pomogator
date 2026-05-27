#!/usr/bin/env node
/**
 * Bun Runner - Finds and executes Bun even when not in PATH
 *
 * This script solves the fresh install problem where:
 * 1. smart-install.js installs Bun to ~/.bun/bin/bun
 * 2. But Bun isn't in PATH until terminal restart
 * 3. Subsequent hooks fail because they can't find `bun`
 *
 * Usage: node bun-runner.js <script> [args...]
 *
 * Fixes #818: Worker fails to start on fresh install
 * Patched by dev-pomogator/bun-oom-guard: --smol, streaming stdin, stderr filter
 */
import { spawnSync, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Find Bun executable - checks PATH first, then common install locations
 */
function findBun() {
  // Try PATH first
  const pathCheck = spawnSync(IS_WINDOWS ? 'where' : 'which', ['bun'], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: IS_WINDOWS
  });

  if (pathCheck.status === 0 && pathCheck.stdout.trim()) {
    return 'bun'; // Found in PATH
  }

  // Check common installation paths (handles fresh installs before PATH reload)
  // Windows: Bun installs to ~/.bun/bin/bun.exe (same as smart-install.js)
  // Unix: Check default location plus common package manager paths
  const bunPaths = IS_WINDOWS
    ? [join(homedir(), '.bun', 'bin', 'bun.exe')]
    : [
        join(homedir(), '.bun', 'bin', 'bun'),
        '/usr/local/bin/bun',
        '/opt/homebrew/bin/bun',
        '/home/linuxbrew/.linuxbrew/bin/bun'
      ];

  for (const bunPath of bunPaths) {
    if (existsSync(bunPath)) {
      return bunPath;
    }
  }

  return null;
}

// Get args: node bun-runner.js <script> [args...]
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node bun-runner.js <script> [args...]');
  process.exit(1);
}

const bunPath = findBun();

if (!bunPath) {
  console.error('Error: Bun not found. Please install Bun: https://bun.sh');
  console.error('After installation, restart your terminal.');
  process.exit(1);
}

// Spawn Bun with the provided script and args
// --smol: reduces JSC heap size ~6x (343MB→54MB), prevents OOM on large sessions
// Use spawn (not spawnSync) to properly handle stdio
// Note: Don't use shell mode on Windows - it breaks paths with spaces in usernames
// Use windowsHide to prevent a visible console window from spawning on Windows
const child = spawn(bunPath, ['--smol', ...args], {
  stdio: ['pipe', 'inherit', 'pipe'],
  windowsHide: true,
  env: process.env
});

// Fix #646: Stream stdin via pipe() instead of buffering entire transcript.
// Creates a fresh pipe (Bun doesn't inherit Claude Code's fd → no fstat crash on Linux).
// Memory: ~64KB pipe buffer instead of 500MB+ with Buffer.concat().
if (!process.stdin.isTTY) {
  process.stdin.pipe(child.stdin);
} else {
  child.stdin.end();
}

// Collect stderr to filter Bun crash dumps
const stderrChunks = [];
child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

child.on('error', (err) => {
  console.error(`Failed to start Bun: ${err.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  if (code && code !== 0) {
    const stderr = Buffer.concat(stderrChunks).toString();
    if (stderr.includes('panic') || stderr.includes('Bun has crashed')) {
      console.error('claude-mem: Bun crashed (known Windows issue). Memory sync skipped.');
      const logDir = join(homedir(), '.claude', 'logs');
      try {
        mkdirSync(logDir, { recursive: true });
        writeFileSync(join(logDir, 'bun-crash.log'), `${new Date().toISOString()}\n${stderr}`);
      } catch {}
    } else {
      process.stderr.write(Buffer.concat(stderrChunks));
    }
  }
  process.exit(code || 0);
});
