#!/usr/bin/env node
/**
 * SessionStart Hook for tui-test-runner extension
 * FR-10: Creates status directory, writes env vars to CLAUDE_ENV_FILE
 * NFR-R1: Fail-open — always exit 0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HookInput } from './adapters/types.js';

function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [TUI-TEST-RUNNER] [${level}] ${message}\n`);
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
    if (process.env.TUI_TEST_RUNNER_ENABLED === 'false') {
      log('DEBUG', 'TUI test runner disabled');
      process.stdout.write('{}');
      return;
    }

    const prefix = sessionId.substring(0, 8);

    // Create status directory
    const statusDir = path.join(cwd, '.dev-pomogator', '.test-status');
    fs.mkdirSync(statusDir, { recursive: true });
    log('INFO', `Status directory ensured: ${statusDir}`);

    // Write env vars to CLAUDE_ENV_FILE
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (envFile) {
      const envLines = [
        `TUI_TEST_RUNNER_SESSION=${prefix}`,
        `TUI_TEST_RUNNER_STATUS_DIR=${statusDir}`,
      ].join('\n') + '\n';
      fs.appendFileSync(envFile, envLines, 'utf-8');
      log('INFO', `Wrote TUI_TEST_RUNNER env vars to ${envFile}`);
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
