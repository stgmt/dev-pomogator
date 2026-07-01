#!/usr/bin/env node
// CJS launcher for the migrate-v3-to-v4 CLI — invoked by the
// `dev-pomogator-migrate-v3-to-v4` bin entry. Mirrors the spec-check-log
// launcher pattern: spawn `node --import tsx <cli.ts>` so end-users get
// the canonical TS entry without needing tsx pre-loaded.
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
  process.stderr.write(`[migrate-v3-to-v4] launch failed: ${err.message}\n`);
  process.exit(1);
});
