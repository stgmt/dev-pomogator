#!/usr/bin/env node
// Test Statusline Render Script (Node.js port of statusline_render.sh)
// Reads Claude Code JSON from stdin, finds session-specific canonical v2 YAML, renders status line.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// --- Spinner ---
const SPINNER = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];

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

// session.env fallback: use when stdin session_id has no matching YAML file.
// Claude Code passes its internal session_id which differs from wrapper's session_id.
if (cwd !== '.') {
  const hasYaml = sessionId && fs.existsSync(
    path.join(cwd, '.dev-pomogator', '.test-status', `status.${sessionId.substring(0, 8)}.yaml`)
  );
  if (!hasYaml) {
    try {
      const envContent = fs.readFileSync(
        path.join(cwd, '.dev-pomogator', '.test-status', 'session.env'), 'utf-8'
      );
      for (const line of envContent.split('\n')) {
        const m = line.match(/^TEST_STATUSLINE_SESSION=(.+)/);
        if (m) sessionId = m[1].trim();
      }
    } catch (_) { /* session.env not found */ }
  }
}

const sessionPrefix = sessionId ? sessionId.substring(0, 8) : '';


// --- Colors ---
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// --- Idle indicator ---
function renderIdle() {
  process.stdout.write(`${DIM}no test runs${RESET}`);
  process.exit(0);
}

if (!sessionPrefix) renderIdle();

const statusFile = path.join(cwd, '.dev-pomogator', '.test-status', `status.${sessionPrefix}.yaml`);

// --- Parse top-level YAML fields (flat, no nested) ---
let yamlContent;
try { yamlContent = fs.readFileSync(statusFile, 'utf-8'); } catch (_) { renderIdle(); }

const fields = {};
for (const rawLine of yamlContent.split('\n')) {
  const line = rawLine.replace(/\r$/, '');
  if (!line || line.startsWith(' ') || line.startsWith('- ')) continue;
  if (line === 'suites:' || line === 'phases:') break;
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) continue;
  const key = line.substring(0, colonIdx).trim();
  let val = line.substring(colonIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  fields[key] = val;
}

if (fields.version !== '2' || !fields.state) renderIdle();

let state = fields.state;
const pid = parseInt(fields.pid, 10) || 0;
const total = parseInt(fields.total, 10) || 0;
const passed = parseInt(fields.passed, 10) || 0;
const failed = parseInt(fields.failed, 10) || 0;
const skipped = parseInt(fields.skipped, 10) || 0;
let running = parseInt(fields.running, 10) || 0;
const durationMs = parseInt(fields.duration_ms, 10) || 0;
let errorMsg = fields.error_message || '';

// --- PID liveness check ---
function rewriteDeadRunning(deadPid) {
  const message = `Process died unexpectedly (PID: ${deadPid})`;
  const updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  try {
    let content = fs.readFileSync(statusFile, 'utf-8');
    content = content
      .replace(/^state: .*/m, 'state: failed')
      .replace(/^running: .*/m, 'running: 0')
      .replace(/^percent: .*/m, 'percent: 100')
      .replace(/^error_message: .*/m, `error_message: "${message}"`)
      .replace(/^updated_at: .*/m, `updated_at: "${updatedAt}"`);
    fs.writeFileSync(statusFile, content, 'utf-8');
    state = 'failed';
    running = 0;
    errorMsg = message;
  } catch (_) { /* ignore */ }
}

if (state === 'running' && pid > 0) {
  try { process.kill(pid, 0); } catch (_) { rewriteDeadRunning(pid); }
}

// --- Format duration ---
const durationS = Math.floor(durationMs / 1000);
const durationStr = `${Math.floor(durationS / 60)}:${String(durationS % 60).padStart(2, '0')}`;

// --- Spinner frame ---
const spin = SPINNER[durationS % SPINNER.length];

// --- Render ---
let line = '';
switch (state) {
  case 'running': {
    const completed = passed + failed + skipped;
    if (total === 0) {
      // Phase 1: Docker build / vitest startup — no tests yet
      line = `${CYAN}${spin}${RESET} ${DIM}starting...${RESET} ${DIM}${durationStr}${RESET}`;
    } else {
      // Phase 2: tests running — show count + spinner
      line = `${CYAN}${spin}${RESET} ${GREEN}${passed}${RESET}`;
      if (failed > 0) line += ` ${RED}${failed}\u274C${RESET}`;
      line += ` ${DIM}${durationStr}${RESET}`;
    }
    break;
  }
  case 'passed':
    line = `\u2705 ${GREEN}${passed}/${total}${RESET} ${DIM}${durationStr}${RESET}`;
    break;
  case 'failed':
    line = failed > 0
      ? `\u274C ${passed}/${total} ${RED}(${failed} failed)${RESET} ${DIM}${durationStr}${RESET}`
      : `\u274C ${passed}/${total} ${DIM}${durationStr}${RESET}`;
    break;
  case 'error':
    line = `\u274C ${RED}ERR${RESET} ${errorMsg || 'unknown error'}`;
    break;
  default:
    renderIdle();
}

process.stdout.write(line);
