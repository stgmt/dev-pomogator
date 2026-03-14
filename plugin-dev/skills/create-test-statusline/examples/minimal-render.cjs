#!/usr/bin/env node
// Minimal statusline render script for test progress.
// Reads JSON stdin from Claude Code, finds session YAML status file, renders ANSI progress bar.
// Source: extracted from extensions/test-statusline/tools/test-statusline/statusline_render.cjs

'use strict';

const fs = require('node:fs');
const path = require('node:path');
// NOTE: No diagnostic logging in the render script — it runs on a hot path (every 3-5s).
// Add logging only when debugging. See minimal-wrapper.cjs for the logging pattern.

// --- Read stdin (Claude Code passes JSON with session_id and cwd) ---
let input = '';
try { input = fs.readFileSync(0, 'utf-8'); } catch (_) { /* empty stdin */ }

let sessionId = '';
let cwd = '.';
try {
  const json = JSON.parse(input);
  sessionId = json.session_id || '';
  cwd = json.cwd || '.';
} catch (_) { /* invalid JSON */ }

// Fallback: env vars written by SessionStart hook
if (!sessionId) sessionId = process.env.TEST_STATUSLINE_SESSION || '';
if (cwd === '.') cwd = process.env.TEST_STATUSLINE_PROJECT || '.';

const prefix = sessionId ? sessionId.substring(0, 8) : '';

// --- Idle indicator (shown when no test data available) ---
function renderIdle() {
  const DIM = '\x1b[2m';
  const RESET = '\x1b[0m';
  const bar = '\u2591'.repeat(10);
  process.stdout.write(`${DIM}0% [${bar}] no test runs${RESET}`);
  process.exit(0);
}

if (!prefix) renderIdle();

const statusFile = path.join(cwd, '.dev-pomogator', '.test-status', `status.${prefix}.yaml`);

// --- Parse flat YAML fields (no library needed) ---
let yamlContent;
try { yamlContent = fs.readFileSync(statusFile, 'utf-8'); } catch (_) { renderIdle(); }

const fields = {};
for (const rawLine of yamlContent.split('\n')) {
  const line = rawLine.replace(/\r$/, ''); // normalize Windows newlines
  if (!line || line.startsWith(' ') || line.startsWith('- ')) continue;
  if (line === 'suites:' || line === 'phases:') break; // stop at nested sections
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) continue;
  const key = line.substring(0, colonIdx).trim();
  let val = line.substring(colonIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  fields[key] = val;
}

if (fields.version !== '2' || !fields.state || !fields.total) renderIdle();

const state = fields.state;
const total = parseInt(fields.total, 10) || 0;
const passed = parseInt(fields.passed, 10) || 0;
const failed = parseInt(fields.failed, 10) || 0;
const running = parseInt(fields.running, 10) || 0;
const percent = parseInt(fields.percent, 10) || 0;
const durationMs = parseInt(fields.duration_ms, 10) || 0;

// --- Format duration as m:ss ---
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
  barColor = Math.floor(failed * 100 / total) >= 10 ? RED : YELLOW;
}

// --- Render based on state ---
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
    line = `\u274C ${RED}ERR${RESET} ${fields.error_message || 'unknown error'}`;
    break;
  default:
    renderIdle();
}

process.stdout.write(line);
