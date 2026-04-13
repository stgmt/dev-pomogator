#!/usr/bin/env node
/**
 * SessionStart Hook for tui-test-runner extension
 * FR-10: Creates status directory, writes env vars to CLAUDE_ENV_FILE
 * NFR-R1: Fail-open — always exit 0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HookInput } from './adapters/types.ts';

import { log as _logShared } from '../_shared/hook-utils.ts';

const LOG_PREFIX = 'TUI-TEST-RUNNER';
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

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      process.stdout.write('{}');
      return;
    }

    const input: HookInput = JSON.parse(raw);
    const sessionId = input.session_id || '';
    const cwd = input.cwd || process.cwd();

    if (!sessionId) {
      log('DEBUG', 'No session_id in hook input, skipping');
      process.stdout.write('{}');
      return;
    }

    // Check if extension is enabled
    if (process.env.TEST_STATUSLINE_ENABLED === 'false') {
      log('DEBUG', 'TUI test runner disabled');
      process.stdout.write('{}');
      return;
    }

    const prefix = sessionId.substring(0, 8);

    // Create status directory
    const statusDir = path.join(cwd, '.dev-pomogator', '.test-status');
    fs.mkdirSync(statusDir, { recursive: true });
    log('INFO', `Status directory ensured: ${statusDir}`);

    // Kill stale TUI process from previous session (FR-9)
    const tuiPidFile = path.join(statusDir, 'tui.pid');
    try {
      const raw = fs.readFileSync(tuiPidFile, 'utf-8').trim();
      const pid = parseInt(raw, 10);
      if (pid > 0) {
        try {
          process.kill(pid, 'SIGTERM');
          log('INFO', `Killed stale TUI PID: ${pid}`);
        } catch {
          log('DEBUG', `Stale TUI PID ${pid} already dead`);
        }
      }
      try { fs.unlinkSync(tuiPidFile); } catch { /* gone already */ }
    } catch { /* no tui.pid — nothing to clean */ }

    // Write env vars to CLAUDE_ENV_FILE
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (envFile) {
      const envLines = [
        `TEST_STATUSLINE_SESSION=${prefix}`,
        `TEST_STATUSLINE_PROJECT=${cwd}`,
      ].join('\n') + '\n';
      fs.appendFileSync(envFile, envLines, 'utf-8');
      log('INFO', `Wrote TEST_STATUSLINE env vars to ${envFile}`);
    } else {
      log('DEBUG', 'CLAUDE_ENV_FILE not set, skipping env write');
    }
  } catch (err) {
    log('ERROR', `Hook error: ${err}`);
  }

  // Always output {} and exit 0 (NFR-R1: fail-open)
  process.stdout.write('{}');
}

main();
