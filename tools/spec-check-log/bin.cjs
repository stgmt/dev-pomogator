#!/usr/bin/env node
// CJS launcher for the spec-check-log CLI — invoked by the `dev-pomogator-
// spec-check-log` bin entry. Loads the canonical bootstrap (Node 22.6+
// native strip-types → tsx fallback) and forwards to ./cli.ts.
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
  process.stderr.write(`[spec-check-log] launch failed: ${err.message}\n`);
  process.exit(1);
});
