#!/usr/bin/env node
// SessionStart hook for test-statusline extension.
// Creates status directory, writes env vars to CLAUDE_ENV_FILE, cleans stale files.
// Always exits 0 (fail-open — hook failure must not block Claude Code).
// Source: ported from extensions/test-statusline/tools/test-statusline/statusline_session_start.ts

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function log(level, message) {
  process.stderr.write(`[${new Date().toISOString()}] [TEST-STATUSLINE] [${level}] ${message}\n`);
}

function getYamlField(content, field) {
  const match = content.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
  return match ? match[1].replace(/"/g, '').replace(/\r/g, '').trim() : '';
}

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}

function writeFileAtomic(filePath, content) {
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpFile, content, 'utf-8');
    fs.renameSync(tmpFile, filePath);
  } finally {
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

function cleanStaleFiles(statusDir) {
  try {
    const files = fs.readdirSync(statusDir);
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const HOUR = 60 * 60 * 1000;

    for (const file of files) {
      if (!file.startsWith('status.') || !file.endsWith('.yaml')) continue;
      const filePath = path.join(statusDir, file);
      try {
        const stat = fs.statSync(filePath);
        const age = now - stat.mtimeMs;

        if (age > DAY) {
          fs.unlinkSync(filePath);
          log('INFO', `Removed stale file (>24h): ${file}`);
          continue;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const state = getYamlField(content, 'state');
        const pid = parseInt(getYamlField(content, 'pid'), 10);

        if (state === 'running' && pid > 0 && !isProcessAlive(pid)) {
          const msg = `Process died unexpectedly (PID: ${pid})`;
          const updated = content
            .replace(/^state: .*/m, 'state: failed')
            .replace(/^running: .*/m, 'running: 0')
            .replace(/^percent: .*/m, 'percent: 100')
            .replace(/^error_message: .*/m, `error_message: "${msg}"`)
            .replace(/^updated_at: .*/m, `updated_at: "${new Date().toISOString()}"`);
          writeFileAtomic(filePath, updated);
          log('INFO', `Repaired dead running file: ${file}`);
          continue;
        }

        if (age > HOUR && state === 'idle') {
          fs.unlinkSync(filePath);
          log('INFO', `Removed stale idle file (>1h): ${file}`);
        }
      } catch (e) { log('DEBUG', `Could not process ${file}: ${e}`); }
    }
  } catch (e) { log('DEBUG', `Cleanup error: ${e}`); }
}

// --- Main (reads JSON from stdin, writes {} to stdout) ---
let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    if (!raw.trim()) { process.stdout.write('{}'); return; }

    const input = JSON.parse(raw);
    const sessionId = input.session_id || '';
    const cwd = input.cwd || process.cwd();

    if (!sessionId) {
      log('DEBUG', 'No session_id, skipping');
      process.stdout.write('{}');
      return;
    }

    const prefix = sessionId.substring(0, 8);
    const statusDir = path.join(cwd, '.dev-pomogator', '.test-status');
    fs.mkdirSync(statusDir, { recursive: true });
    log('INFO', `Status directory ensured: ${statusDir}`);

    // Write env vars to CLAUDE_ENV_FILE
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (envFile) {
      fs.appendFileSync(envFile, `TEST_STATUSLINE_SESSION=${prefix}\nTEST_STATUSLINE_PROJECT=${cwd}\n`, 'utf-8');
      log('INFO', `Wrote env vars to ${envFile}`);
    }

    cleanStaleFiles(statusDir);
  } catch (err) {
    log('ERROR', `Hook error: ${err}`);
  }

  process.stdout.write('{}');
});
