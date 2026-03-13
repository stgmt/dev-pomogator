#!/usr/bin/env node
// Minimal test runner wrapper. Spawns test command, writes YAML status file.
// Supports optional adapter for real-time progress; falls back to exit-code mode.
// Source: extracted from extensions/tui-test-runner/tools/tui-test-runner/test_runner_wrapper.ts

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

// --- YAML helpers ---
const THROTTLE_MS = 1000;
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
  status.duration_ms = Date.now() - new Date(status.started_at).getTime();
  const tmpFile = `${statusFile}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpFile, toYaml(status), 'utf-8');
    fs.renameSync(tmpFile, statusFile);
    lastWriteTime = Date.now();
  } catch (_) {
    try { fs.unlinkSync(tmpFile); } catch (__) { /* ignore */ }
  }
}

function writeIfNeeded() {
  if (Date.now() - lastWriteTime < THROTTLE_MS) return;
  writeStatus();
}

// --- Write initial status ---
writeStatus();

// --- Run test command ---
const result = spawnSync(testCommand, {
  encoding: 'utf-8',
  shell: true,
  windowsHide: true,
  stdio: ['inherit', 'pipe', 'inherit'],
  timeout: 600000, // 10 min max
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
const exitCode = result.status ?? 1;
status.state = exitCode === 0 ? 'passed' : 'failed';
status.percent = 100;
status.running = 0;

if (exitCode !== 0 && !status.error_message) {
  status.error_message = `Test command exited with code ${exitCode}`;
}

writeStatus();
process.exit(exitCode);
