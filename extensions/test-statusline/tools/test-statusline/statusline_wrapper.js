#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const COMMAND_TIMEOUT_MS = 5000;
const LOG_DIR = path.join(os.homedir(), '.dev-pomogator', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'statusline.log');
const MAX_LOG_SIZE = 512 * 1024; // 512KB

function logDiag(message) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    // Rotate if too large
    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > MAX_LOG_SIZE) {
        try { fs.unlinkSync(LOG_FILE + '.old'); } catch (_) { /* ignore */ }
        fs.renameSync(LOG_FILE, LOG_FILE + '.old');
      }
    } catch (_) { /* file doesn't exist yet */ }
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
  } catch (_) { /* never fail on logging */ }
}

function readFlag(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return '';
  }
  return process.argv[index + 1];
}

function decodeBase64(value) {
  if (!value) {
    return '';
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(value) || value.length % 4 !== 0) {
    return '';
  }

  const decoded = Buffer.from(value, 'base64').toString('utf-8');
  const normalizedInput = value.replace(/=+$/, '');
  const normalizedRoundTrip = Buffer.from(decoded, 'utf-8')
    .toString('base64')
    .replace(/=+$/, '');

  return normalizedInput === normalizedRoundTrip ? decoded : '';
}

function normalizeOutput(value) {
  const lines = String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.join(' ');
}

function runCommand(label, command, input) {
  if (!command) {
    return '';
  }

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
    const reason = result.error.code === 'ETIMEDOUT' ? `TIMEOUT(${COMMAND_TIMEOUT_MS}ms)` : result.error.message;
    logDiag(`${label}: ${reason} after ${elapsed}ms cmd=${command.substring(0, 40)}`);
    return '';
  }

  const output = normalizeOutput(result.stdout);
  logDiag(`${label}: ${elapsed}ms exit=${result.status} out=${output.length}b`);
  return output;
}

const input = fs.readFileSync(0, 'utf-8');
const userCommand = decodeBase64(readFlag('--user-b64'));
const managedCommand = decodeBase64(readFlag('--managed-b64'));

const userOutput = runCommand('user', userCommand, input);
const managedOutput = runCommand('managed', managedCommand, input);

if (userOutput && managedOutput) {
  process.stdout.write(`${userOutput} | ${managedOutput}`);
} else if (userOutput) {
  process.stdout.write(userOutput);
} else if (managedOutput) {
  process.stdout.write(managedOutput);
}
