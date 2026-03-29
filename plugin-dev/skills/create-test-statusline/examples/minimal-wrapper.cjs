#!/usr/bin/env node
// Minimal test runner wrapper. Spawns test command, writes YAML status file.
// Supports optional adapter for real-time progress; falls back to exit-code mode.
// Source: extracted from extensions/tui-test-runner/tools/tui-test-runner/test_runner_wrapper.ts

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

// --- Diagnostic logging (never fail on logging) ---
const LOG_DIR = path.join(os.homedir(), '.dev-pomogator', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'statusline.log');
let logDirReady = false;

function log(msg) {
  try {
    if (!logDirReady) { fs.mkdirSync(LOG_DIR, { recursive: true }); logDirReady = true; }
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [wrapper] ${msg}\n`);
  } catch (_) { /* never fail on logging */ }
}

// --- Parse arguments: --framework <name> -- <command...> ---
const args = process.argv.slice(2);
const fwIdx = args.indexOf('--framework');
const sepIdx = args.indexOf('--');
const framework = fwIdx !== -1 && fwIdx + 1 < args.length ? args[fwIdx + 1] : 'unknown';
const testCommand = sepIdx !== -1 ? args.slice(sepIdx + 1).join(' ') : '';

if (!testCommand) {
  process.stderr.write('Usage: node wrapper.cjs --framework <name> -- <command>\n');
  process.exit(1);
}

// --- Session and paths ---
const sessionPrefix = (process.env.TEST_STATUSLINE_SESSION || '').substring(0, 8);
const projectDir = process.env.TEST_STATUSLINE_PROJECT || process.cwd();
const statusDir = path.join(projectDir, '.dev-pomogator', '.test-status');
fs.mkdirSync(statusDir, { recursive: true });

const statusFile = sessionPrefix
  ? path.join(statusDir, `status.${sessionPrefix}.yaml`)
  : path.join(statusDir, `status.${process.pid}.yaml`);
const logFile = path.join(statusDir, `test.${sessionPrefix || process.pid}.log`);

// --- Constants ---
const THROTTLE_MS = 1000;
const TIMEOUT_MS = 600000; // 10 min max
const startEpoch = Date.now();
let lastWriteTime = 0;

const status = {
  version: 2,
  session_id: process.env.TEST_STATUSLINE_SESSION || '',
  pid: process.pid,
  started_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  state: 'running',
  framework,
  total: 0, passed: 0, failed: 0, skipped: 0, running: 0,
  percent: 0, duration_ms: 0,
  error_message: '',
  log_file: logFile,
};

function toYaml(obj) {
  return Object.entries(obj)
    .filter(([, v]) => typeof v !== 'object' || v === null)
    .map(([k, v]) => {
      if (typeof v === 'string') return `${k}: "${v.replace(/"/g, '\\"')}"`;
      return `${k}: ${v}`;
    })
    .join('\n') + '\n';
}

function writeStatus() {
  status.updated_at = new Date().toISOString();
  status.duration_ms = Date.now() - startEpoch;
  const tmpFile = `${statusFile}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpFile, toYaml(status), 'utf-8');
    fs.renameSync(tmpFile, statusFile);
    lastWriteTime = Date.now();
  } catch (e) {
    log(`Write failed: ${e.message}`);
    try { fs.unlinkSync(tmpFile); } catch (_) { /* may not exist */ }
  }
}

function writeIfNeeded() {
  if (Date.now() - lastWriteTime < THROTTLE_MS) return;
  writeStatus();
}

// --- Write initial status ---
writeStatus();
log(`Started: framework=${framework} cmd="${testCommand}"`);

// --- Run test command ---
const cmdParts = testCommand.split(/\s+/);
const result = spawnSync(cmdParts[0], cmdParts.slice(1), {
  encoding: 'utf-8',
  windowsHide: true,
  stdio: ['inherit', 'pipe', 'inherit'],
  timeout: TIMEOUT_MS,
});

// --- Process output (adapter integration point) ---
// In fallback mode (no adapter), we just pass output through.
// With an adapter, pipe each line through adapter.parseLine(line) to update counters.
if (result.stdout) {
  process.stdout.write(result.stdout);

  // Write output to log file
  try { fs.writeFileSync(logFile, result.stdout, 'utf-8'); } catch (_) { /* ignore */ }
}

// --- Finalize ---
// Distinguish 'error' (spawn failure/timeout) from 'failed' (tests ran, non-zero exit)
if (result.error) {
  // Spawn failure or timeout — command couldn't run properly
  status.state = 'error';
  status.error_message = result.error.code === 'ETIMEDOUT'
    ? `Test command timed out after ${TIMEOUT_MS / 1000}s`
    : `Spawn error: ${result.error.message}`;
  log(`Error: ${status.error_message}`);
} else {
  const exitCode = result.status ?? 1;
  status.state = exitCode === 0 ? 'passed' : 'failed';
  if (exitCode !== 0) {
    status.error_message = `Test command exited with code ${exitCode}`;
  }
  log(`Finished: ${status.state} (exit ${exitCode})`);
}

status.percent = 100;
status.running = 0;
writeStatus();
process.exit(result.status ?? 1);
