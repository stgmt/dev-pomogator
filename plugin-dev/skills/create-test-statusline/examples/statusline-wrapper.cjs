#!/usr/bin/env node
// Statusline coexistence wrapper.
// Runs two statusline commands in parallel (user's + managed), combines output.
// Commands are passed as base64-encoded arguments to avoid shell escaping issues.
// Source: extracted from extensions/test-statusline/tools/test-statusline/statusline_wrapper.js

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const COMMAND_TIMEOUT_MS = 5000;
const LOG_DIR = path.join(os.homedir(), '.dev-pomogator', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'statusline.log');
const MAX_LOG_SIZE = 512 * 1024; // 512KB

// --- Diagnostic logging (never fails, never blocks) ---
function logDiag(message) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > MAX_LOG_SIZE) {
        try { fs.unlinkSync(LOG_FILE + '.old'); } catch (_) {}
        fs.renameSync(LOG_FILE, LOG_FILE + '.old');
      }
    } catch (_) {}
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
  } catch (_) {}
}

// --- Read CLI flag value ---
function readFlag(flag) {
  const idx = process.argv.indexOf(flag);
  return (idx !== -1 && idx + 1 < process.argv.length) ? process.argv[idx + 1] : '';
}

// --- Base64 decode with round-trip validation ---
function decodeBase64(value) {
  if (!value) return '';
  if (!/^[A-Za-z0-9+/=]+$/.test(value) || value.length % 4 !== 0) return '';
  const decoded = Buffer.from(value, 'base64').toString('utf-8');
  const normalizedInput = value.replace(/=+$/, '');
  const normalizedRoundTrip = Buffer.from(decoded, 'utf-8').toString('base64').replace(/=+$/, '');
  return normalizedInput === normalizedRoundTrip ? decoded : '';
}

// --- Normalize output: strip \r, preserve internal \n, strip trailing \n ---
function normalizeOutput(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
}

// --- Run a statusline command with timeout ---
function runCommand(label, command, input) {
  if (!command) return '';
  const start = Date.now();
  const result = spawnSync(command, {
    input,
    encoding: 'utf-8',
    shell: true,
    windowsHide: true,
    timeout: COMMAND_TIMEOUT_MS,
  });
  const elapsed = Date.now() - start;
  if (result.error) {
    const reason = result.error.code === 'ETIMEDOUT'
      ? `TIMEOUT(${COMMAND_TIMEOUT_MS}ms)` : result.error.message;
    logDiag(`${label}: ${reason} after ${elapsed}ms cmd=${command.substring(0, 40)}`);
    return '';
  }
  const output = normalizeOutput(result.stdout);
  logDiag(`${label}: ${elapsed}ms exit=${result.status} out=${output.length}b`);
  return output;
}

// --- Main ---
const input = fs.readFileSync(0, 'utf-8');
const userCommand = decodeBase64(readFlag('--user-b64'));
const managedCommand = decodeBase64(readFlag('--managed-b64'));

const userOutput = runCommand('user', userCommand, input);
const managedOutput = runCommand('managed', managedCommand, input);

// Combine outputs: append managed to last line of user output
if (userOutput && managedOutput) {
  const lastNewline = userOutput.lastIndexOf('\n');
  if (lastNewline >= 0) {
    // Multi-line user output: keep all lines, append managed to last
    process.stdout.write(
      `${userOutput.substring(0, lastNewline)}\n${userOutput.substring(lastNewline + 1)} | ${managedOutput}`
    );
  } else {
    process.stdout.write(`${userOutput} | ${managedOutput}`);
  }
} else if (userOutput) {
  process.stdout.write(userOutput);
} else if (managedOutput) {
  process.stdout.write(managedOutput);
}
