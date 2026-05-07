#!/usr/bin/env node
/**
 * Stop Hook for tui-test-runner extension
 * FR-9: Kills TUI process by reading tui.pid from status directories
 * NFR-R1: Fail-open — always exit 0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { log as _logShared } from '../_shared/hook-utils.ts';

const LOG_PREFIX = 'TUI-STOP';
function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  _logShared(level, LOG_PREFIX, message);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function killTuiByPidFile(pidFile: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(pidFile, 'utf-8').trim();
  } catch {
    return; // file doesn't exist or unreadable
  }

  const pid = parseInt(raw, 10);
  if (!pid || pid <= 0) {
    try { fs.unlinkSync(pidFile); } catch { /* gone already */ }
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    log('INFO', `Sent SIGTERM to TUI PID ${pid}`);
  } catch {
    log('DEBUG', `TUI PID ${pid} already dead`);
  }

  try { fs.unlinkSync(pidFile); } catch { /* gone already */ }
}

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      process.stdout.write('{}');
      return;
    }

    const input = JSON.parse(raw);
    const cwd: string = input.cwd || process.cwd();

    // Kill TUI processes from both status directories
    const statusDirs = [
      path.join(cwd, '.dev-pomogator', '.test-status'),
      path.join(cwd, '.dev-pomogator', '.docker-status'),
    ];

    for (const dir of statusDirs) {
      const pidFile = path.join(dir, 'tui.pid');
      killTuiByPidFile(pidFile);
    }
  } catch (err) {
    log('ERROR', `Hook error: ${err}`);
  }

  // Always output {} and exit 0 (NFR-R1: fail-open)
  process.stdout.write('{}');
}

main();
