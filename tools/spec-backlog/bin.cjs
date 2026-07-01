#!/usr/bin/env node
// CJS launcher for dev-pomogator-spec-backlog CLI.
'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const cliPath = path.join(__dirname, 'cli.ts');
const child = spawn(
  process.execPath,
  ['--import', 'tsx', cliPath, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  process.stderr.write(`[spec-backlog] launch failed: ${err.message}\n`);
  process.exit(1);
});
