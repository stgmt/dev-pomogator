#!/usr/bin/env node
/**
 * SessionStart Hook for test-statusline extension
 * FR-6: Creates status directory, writes env var to CLAUDE_ENV_FILE
 * FR-7: Cleans stale status files (>24h or idle >1h)
 * NFR-R1: Fail-open — always exit 0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Logging (stderr only — stdout reserved for hook JSON output)
// ---------------------------------------------------------------------------

function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [TEST-STATUSLINE] [${level}] ${message}\n`);
}

// ---------------------------------------------------------------------------
// Stdin reader
// ---------------------------------------------------------------------------

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      process.stdout.write('{}');
      return;
    }

    const input = JSON.parse(raw);
    const sessionId: string = input.session_id || '';
    const cwd: string = input.cwd || process.cwd();

    if (!sessionId) {
      log('DEBUG', 'No session_id in hook input, skipping');
      process.stdout.write('{}');
      return;
    }

    // Session prefix = first 8 characters (FR-5)
    const prefix = sessionId.substring(0, 8);

    // Create status directory (FR-6)
    const statusDir = path.join(cwd, '.dev-pomogator', '.test-status');
    fs.mkdirSync(statusDir, { recursive: true });
    log('INFO', `Status directory ensured: ${statusDir}`);

    // Write env var to CLAUDE_ENV_FILE (FR-6)
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (envFile) {
      const envLine = `TEST_STATUSLINE_SESSION=${prefix}\n`;
      fs.appendFileSync(envFile, envLine, 'utf-8');
      log('INFO', `Wrote TEST_STATUSLINE_SESSION=${prefix} to ${envFile}`);
    } else {
      log('DEBUG', 'CLAUDE_ENV_FILE not set, skipping env write');
    }

    // Clean stale files (FR-7)
    cleanStaleFiles(statusDir);

  } catch (err) {
    log('ERROR', `Hook error: ${err}`);
  }

  // Always output {} and exit 0 (NFR-R1: fail-open)
  process.stdout.write('{}');
}

// ---------------------------------------------------------------------------
// Stale cleanup (FR-7)
// ---------------------------------------------------------------------------

function cleanStaleFiles(statusDir: string): void {
  try {
    const files = fs.readdirSync(statusDir);
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const ONE_HOUR = 60 * 60 * 1000;

    for (const file of files) {
      if (!file.startsWith('status.') || !file.endsWith('.yaml')) continue;

      const filePath = path.join(statusDir, file);
      try {
        const stat = fs.statSync(filePath);
        const age = now - stat.mtimeMs;

        // Rule 1: Any file older than 24 hours
        if (age > TWENTY_FOUR_HOURS) {
          fs.unlinkSync(filePath);
          log('INFO', `Removed stale file (>24h): ${file}`);
          continue;
        }

        // Rule 2: idle files older than 1 hour
        if (age > ONE_HOUR) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const stateMatch = content.match(/^state:\s*(.*)$/m);
          const state = stateMatch ? stateMatch[1].replace(/"/g, '').replace(/\r/g, '').trim() : '';
          if (state === 'idle') {
            fs.unlinkSync(filePath);
            log('INFO', `Removed stale idle file (>1h): ${file}`);
          }
        }
      } catch (fileErr) {
        log('DEBUG', `Could not process ${file}: ${fileErr}`);
      }
    }
  } catch (err) {
    log('DEBUG', `Cleanup error: ${err}`);
  }
}

main();
