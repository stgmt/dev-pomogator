#!/usr/bin/env node
// Test Statusline Render Script (Node.js port of statusline_render.sh)
// Reads Claude Code JSON from stdin, finds session-specific canonical v2 YAML, renders status line.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// --- Read stdin ---
let input = '';
try { input = fs.readFileSync(0, 'utf-8'); } catch (_) { /* empty stdin */ }

// --- Parse session_id and cwd from JSON ---
let sessionId = '';
let cwd = '.';
try {
  const json = JSON.parse(input);
  sessionId = json.session_id || '';
  cwd = json.cwd || '.';
} catch (_) { /* invalid JSON */ }

if (!sessionId) sessionId = process.env.TEST_STATUSLINE_SESSION || '';
if (cwd === '.') cwd = process.env.TEST_STATUSLINE_PROJECT || '.';

const sessionPrefix = sessionId ? sessionId.substring(0, 8) : '';
if (!sessionPrefix) process.exit(0);

const statusFile = path.join(cwd, '.dev-pomogator', '.test-status', `status.${sessionPrefix}.yaml`);

// --- Parse top-level YAML fields (flat, no nested) ---
// Read directly without existsSync to avoid TOCTOU race (one fewer syscall per refresh)
let yamlContent;
try { yamlContent = fs.readFileSync(statusFile, 'utf-8'); } catch (_) { process.exit(0); }

const fields = {};
for (const rawLine of yamlContent.split('\n')) {
  const line = rawLine.replace(/\r$/, '');
  if (!line || line.startsWith(' ') || line.startsWith('- ')) continue;
  if (line === 'suites:' || line === 'phases:') break;
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) continue;
  const key = line.substring(0, colonIdx).trim();
  let val = line.substring(colonIdx + 1).trim();
  // strip YAML quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  fields[key] = val;
}

if (fields.version !== '2' || !fields.state || !fields.total) process.exit(0);

let state = fields.state;
const pid = parseInt(fields.pid, 10) || 0;
const total = parseInt(fields.total, 10) || 0;
const passed = parseInt(fields.passed, 10) || 0;
const failed = parseInt(fields.failed, 10) || 0;
let running = parseInt(fields.running, 10) || 0;
let percent = parseInt(fields.percent, 10) || 0;
const durationMs = parseInt(fields.duration_ms, 10) || 0;
let errorMsg = fields.error_message || '';

// --- PID liveness check ---
// Note: duplicates rewriteRunningToFailed logic from statusline_session_start.ts
// because this .cjs must run without tsx (CJS runtime constraint).
function rewriteDeadRunning(deadPid) {
  const message = `Process died unexpectedly (PID: ${deadPid})`;
  const updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const tmpFile = statusFile + '.tmp.' + process.pid;
  try {
    let content = fs.readFileSync(statusFile, 'utf-8');
    content = content
      .replace(/^state: .*/m, 'state: failed')
      .replace(/^running: .*/m, 'running: 0')
      .replace(/^percent: .*/m, 'percent: 100')
      .replace(/^error_message: .*/m, `error_message: "${message}"`)
      .replace(/^updated_at: .*/m, `updated_at: "${updatedAt}"`);
    fs.writeFileSync(tmpFile, content, 'utf-8');
    fs.renameSync(tmpFile, statusFile);
    // Mutate in-memory state only after successful file rewrite
    state = 'failed';
    running = 0;
    percent = 100;
    errorMsg = message;
  } catch (_) {
    try { fs.unlinkSync(tmpFile); } catch (__) { /* ignore */ }
  }
}

if (state === 'running' && pid > 0) {
  try { process.kill(pid, 0); } catch (_) { rewriteDeadRunning(pid); }
}

// --- Format duration ---
const durationS = Math.floor(durationMs / 1000);
const durationStr = `${Math.floor(durationS / 60)}:${String(durationS % 60).padStart(2, '0')}`;

// --- Progress bar ---
const filled = Math.floor(percent * 10 / 100);
const empty = 10 - filled;
const bar = '\u2593'.repeat(filled) + '\u2591'.repeat(empty);

// --- Colors ---
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let barColor = GREEN;
if (total > 0 && failed > 0) {
  const failPct = Math.floor(failed * 100 / total);
  barColor = failPct >= 10 ? RED : YELLOW;
}

// --- Render ---
let line = '';
switch (state) {
  case 'running':
    line = `${barColor}${percent}%${RESET} [${barColor}${bar}${RESET}]`;
    if (passed > 0) line += ` ${passed}\u2705`;
    if (failed > 0) line += ` ${failed}\u274C`;
    if (running > 0) line += ` ${running}\u23F3`;
    line += ` ${DIM}${durationStr}${RESET}`;
    break;
  case 'passed':
    line = `\u2705 ${passed}/${total} ${DIM}${durationStr}${RESET}`;
    break;
  case 'failed':
    line = failed > 0
      ? `\u274C ${passed}/${total} ${DIM}(${failed} failed)${RESET} ${DIM}${durationStr}${RESET}`
      : `\u274C ${passed}/${total} ${DIM}${durationStr}${RESET}`;
    break;
  case 'error':
    line = `\u274C ${RED}ERR${RESET} ${errorMsg || 'unknown error'}`;
    break;
  default: // idle
    process.exit(0);
}

process.stdout.write(line);
