#!/usr/bin/env node
// Test Runner Wrapper — thin shim to canonical v2 writer (Node.js port)
// Delegates to tui-test-runner's test_runner_wrapper.ts for v2 YAML status
// FR-2: YAML Protocol, FR-4: Test Runner Wrapper, FR-5: Session Isolation

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const scriptDir = __dirname;
// Resolve project root: .dev-pomogator/tools/X -> 3 up; extensions/X/tools/X -> 4 up
const repoRoot = scriptDir.includes('.dev-pomogator')
  ? path.resolve(scriptDir, '..', '..', '..')
  : path.resolve(scriptDir, '..', '..', '..', '..');

const tuiWrapper = path.join(repoRoot, '.dev-pomogator', 'tools', 'tui-test-runner', 'test_runner_wrapper.ts');
const tuiWrapperSrc = path.join(repoRoot, 'extensions', 'tui-test-runner', 'tools', 'tui-test-runner', 'test_runner_wrapper.ts');
const tsxRunner = path.join(os.homedir(), '.dev-pomogator', 'scripts', 'tsx-runner.js');

const args = process.argv.slice(2);

// Read session.env fallback when TEST_STATUSLINE_SESSION not set in env
// (SessionStart hook writes session.env to .dev-pomogator/.test-status/;
//  Docker CMD entry point relies on this fallback)
if (!process.env.TEST_STATUSLINE_SESSION) {
  const sessionEnvPaths = [
    path.join(repoRoot, '.dev-pomogator', '.test-status', 'session.env'),
    path.join(repoRoot, '.dev-pomogator', '.docker-status', 'session.env'),
  ];
  for (const sessionEnvPath of sessionEnvPaths) {
    try {
      const envContent = fs.readFileSync(sessionEnvPath, 'utf-8');
      for (const line of envContent.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].trim();
        }
      }
      if (process.env.TEST_STATUSLINE_SESSION) break;
    } catch { /* no session.env at this path — try next */ }
  }
}

function runViaTsxRunner(scriptPath) {
  const result = spawnSync('node', ['-e', `require('${tsxRunner.replace(/\\/g, '\\\\')}')`, '--', scriptPath, ...args], {
    stdio: 'inherit',
    cwd: repoRoot,
    env: process.env,
  });
  process.exit(result.status ?? (result.signal ? 1 : 0));
}

function runViaNpxTsx(scriptPath) {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npxCmd, ['tsx', scriptPath, ...args], {
    stdio: 'inherit',
    cwd: repoRoot,
    env: process.env,
  });
  process.exit(result.status ?? (result.signal ? 1 : 0));
}

function runDirect() {
  if (args.length === 0) process.exit(0);
  const result = spawnSync(args[0], args.slice(1), {
    stdio: 'inherit',
    cwd: repoRoot,
    env: process.env,
  });
  process.exit(result.status ?? (result.signal ? 1 : 0));
}

// Try installed wrapper first, then source, then direct fallback
const wrapperPath = fs.existsSync(tuiWrapper) ? tuiWrapper
  : fs.existsSync(tuiWrapperSrc) ? tuiWrapperSrc
  : null;

if (wrapperPath) {
  if (fs.existsSync(tsxRunner)) {
    runViaTsxRunner(wrapperPath);
  } else {
    runViaNpxTsx(wrapperPath);
  }
} else {
  runDirect();
}
