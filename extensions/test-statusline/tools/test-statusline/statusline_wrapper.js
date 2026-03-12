#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const COMMAND_TIMEOUT_MS = 2000;

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

function runCommand(command, input) {
  if (!command) {
    return '';
  }

  const result = spawnSync(command, {
    input,
    encoding: 'utf-8',
    shell: true,
    windowsHide: true,
    timeout: COMMAND_TIMEOUT_MS,
  });

  if (result.error) {
    return '';
  }

  return normalizeOutput(result.stdout);
}

const input = fs.readFileSync(0, 'utf-8');
const userCommand = decodeBase64(readFlag('--user-b64'));
const managedCommand = decodeBase64(readFlag('--managed-b64'));

const userOutput = runCommand(userCommand, input);
const managedOutput = runCommand(managedCommand, input);

if (userOutput && managedOutput) {
  process.stdout.write(`${userOutput} | ${managedOutput}`);
} else if (userOutput) {
  process.stdout.write(userOutput);
} else if (managedOutput) {
  process.stdout.write(managedOutput);
}
