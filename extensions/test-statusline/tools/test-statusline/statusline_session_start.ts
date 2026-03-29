#!/usr/bin/env node
/**
 * SessionStart Hook for test-statusline extension
 * FR-6: Creates status directory, writes env var to CLAUDE_ENV_FILE
 * FR-7: Cleans stale status files (>24h or idle >1h)
 * NFR-R1: Fail-open — always exit 0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { log as _logShared } from '../../../_shared/hook-utils.js';

// ---------------------------------------------------------------------------
// Logging (stderr only — stdout reserved for hook JSON output)
// ---------------------------------------------------------------------------

const VERBOSE = process.env.DEV_POMOGATOR_HOOK_VERBOSE === '1';
const LOG_PREFIX = 'TEST-STATUSLINE';

function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  if (level !== 'ERROR' && !VERBOSE) return;
  _logShared(level, LOG_PREFIX, message);
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

function getYamlField(content: string, field: string): string {
  const match = content.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
  return match ? match[1].replace(/"/g, '').replace(/\r/g, '').trim() : '';
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function rewriteRunningToFailed(content: string, pid: number): string {
  const message = `Process died unexpectedly (PID: ${pid})`;
  return content
    .replace(/^state:\s*.*$/m, 'state: failed')
    .replace(/^running:\s*.*$/m, 'running: 0')
    .replace(/^percent:\s*.*$/m, 'percent: 0')
    .replace(/^error_message:\s*.*$/m, `error_message: "${message}"`)
    .replace(/^updated_at:\s*.*$/m, `updated_at: "${new Date().toISOString()}"`);
}

function writeFileAtomic(filePath: string, content: string): void {
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpFile, content, 'utf-8');
    fs.renameSync(tmpFile, filePath);
  } finally {
    if (fs.existsSync(tmpFile)) {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // Ignore temp cleanup failures
      }
    }
  }
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

    if (process.env.TEST_STATUSLINE_ENABLED === 'false') {
      log('DEBUG', 'Test statusline disabled');
      process.stdout.write('{}');
      return;
    }

    const SESSION_PREFIX_LEN = 8;
    const prefix = sessionId.substring(0, SESSION_PREFIX_LEN);

    // Create status directory (FR-6)
    const statusDir = path.join(cwd, '.dev-pomogator', '.test-status');
    fs.mkdirSync(statusDir, { recursive: true });
    log('INFO', `Status directory ensured: ${statusDir}`);

    // Write session env vars
    const envLines = [
      `TEST_STATUSLINE_SESSION=${prefix}`,
      `TEST_STATUSLINE_PROJECT=${cwd}`,
      `SESSION_PREFIX_LEN=${SESSION_PREFIX_LEN}`,
    ].join('\n') + '\n';

    // Primary: write session.env file (works regardless of CLAUDE_ENV_FILE bug)
    const sessionEnvFile = path.join(statusDir, 'session.env');
    writeFileAtomic(sessionEnvFile, envLines);
    log('INFO', `Wrote session.env: ${sessionEnvFile}`);

    // Secondary: also write to CLAUDE_ENV_FILE if available
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (envFile) {
      fs.appendFileSync(envFile, envLines, 'utf-8');
      log('INFO', `Wrote env vars to CLAUDE_ENV_FILE: ${envFile}`);
    } else {
      log('DEBUG', 'CLAUDE_ENV_FILE not set (known Claude Code bug #15840)');
    }

    // Clean stale files (FR-7)
    cleanStaleFiles(statusDir);

    // Clean stale bg-task markers from previous sessions (glob .bg-task-active*)
    const devPomDir = path.join(cwd, '.dev-pomogator');
    try {
      const entries = fs.readdirSync(devPomDir);
      for (const entry of entries) {
        if (entry === '.bg-task-active' || entry.startsWith('.bg-task-active.')) {
          const markerPath = path.join(devPomDir, entry);
          try {
            fs.unlinkSync(markerPath);
            log('INFO', `Cleaned stale bg-task marker: ${entry}`);
          } catch (e) {
            log('DEBUG', `Could not clean bg-task marker ${entry}: ${e}`);
          }
        }
      }
    } catch (e) {
      log('DEBUG', `Could not read .dev-pomogator dir for cleanup: ${e}`);
    }

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

        const content = fs.readFileSync(filePath, 'utf-8');
        const state = getYamlField(content, 'state');
        const pid = Number.parseInt(getYamlField(content, 'pid'), 10);

        // Rule 1.5: Repair running files whose PID is no longer alive
        if (state === 'running' && Number.isInteger(pid) && pid > 0 && !isProcessAlive(pid)) {
          writeFileAtomic(filePath, rewriteRunningToFailed(content, pid));
          log('INFO', `Repaired dead running file: ${file}`);
          continue;
        }

        // Rule 2: idle files older than 1 hour
        if (age > ONE_HOUR && state === 'idle') {
          fs.unlinkSync(filePath);
          log('INFO', `Removed stale idle file (>1h): ${file}`);
          continue;
        }

        // Rule 3: "Process died" failed files older than 1 hour (zombie cleanup)
        const errorMessage = getYamlField(content, 'error_message');
        if (age > ONE_HOUR && state === 'failed' && errorMessage.includes('Process died')) {
          fs.unlinkSync(filePath);
          log('INFO', `Removed zombie failed file (>1h): ${file}`);
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
