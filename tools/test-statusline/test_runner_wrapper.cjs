#!/usr/bin/env node
// Test Runner Wrapper — thin shim to canonical v2 writer (Node.js port)
// Delegates to tui-test-runner's test_runner_wrapper.ts for v2 YAML status
// FR-2: YAML Protocol, FR-4: Test Runner Wrapper, FR-5: Session Isolation

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const scriptDir = __dirname;
// Resolve project root across layouts:
//   .dev-pomogator/tools/X -> 3 up  (legacy installed copy)
//   extensions/X/tools/X    -> 4 up  (legacy source tree)
//   tools/X                 -> 2 up  (canonical plugin v2 — tools at repo root)
const repoRoot = scriptDir.includes('.dev-pomogator')
  ? path.resolve(scriptDir, '..', '..', '..')
  : scriptDir.includes('extensions')
    ? path.resolve(scriptDir, '..', '..', '..', '..')
    : path.resolve(scriptDir, '..', '..');

// Candidate locations for the self-contained v2 bundle. CLAUDE_PLUGIN_ROOT is
// present for canonical installs; scriptDir/repoRoot covers source and legacy copies.
// The bundle is required because canonical plugin caches deliberately have no node_modules.
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
const tuiWrapperCandidates = [
  pluginRoot && path.join(pluginRoot, 'tools', 'tui-test-runner', 'test_runner_wrapper.bundle.mjs'),
  path.join(repoRoot, 'tools', 'tui-test-runner', 'test_runner_wrapper.bundle.mjs'),
  path.join(repoRoot, '.dev-pomogator', 'tools', 'tui-test-runner', 'test_runner_wrapper.bundle.mjs'),
  path.join(repoRoot, 'extensions', 'tui-test-runner', 'tools', 'tui-test-runner', 'test_runner_wrapper.bundle.mjs'),
].filter(Boolean);

const args = process.argv.slice(2);

function formatCommand(commandArgs) {
  return commandArgs.map((arg) => JSON.stringify(arg)).join(' ');
}

function fail(stage, commandArgs, error) {
  process.stderr.write(`[test-runner-wrapper] stage=${stage} command=${formatCommand(commandArgs)} error=${error}\n`);
  process.exit(1);
}

function directCommandArgs(rawArgs) {
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--') return rawArgs.slice(i + 1);
    if (arg === '--framework') {
      if (i + 1 >= rawArgs.length || rawArgs[i + 1] === '--') {
        fail('arguments', rawArgs, 'missing value for --framework');
      }
      i++;
      continue;
    }
    if (arg.startsWith('--framework=')) {
      if (arg.length === '--framework='.length) {
        fail('arguments', rawArgs, 'missing value for --framework');
      }
      continue;
    }
    return rawArgs.slice(i);
  }
  return [];
}

function exitForResult(stage, commandArgs, result) {
  if (result.error) {
    fail(stage, commandArgs, result.error.message || String(result.error));
  }
  if (typeof result.status === 'number') {
    process.exit(result.status);
  }
  const reason = result.signal ? `terminated by signal ${result.signal}` : 'process returned no exit status';
  fail(stage, commandArgs, reason);
}

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

function runBundled(scriptPath) {
  const commandArgs = [scriptPath, ...args];
  const result = spawnSync(process.execPath, commandArgs, {
    stdio: 'inherit',
    env: process.env,
  });
  exitForResult('bundle', [process.execPath, ...commandArgs], result);
}

function runDirect() {
  const commandArgs = directCommandArgs(args);
  if (commandArgs.length === 0) {
    fail('arguments', args, 'no test command supplied');
  }
  const result = spawnSync(commandArgs[0], commandArgs.slice(1), {
    stdio: 'inherit',
    env: process.env,
  });
  exitForResult('direct', commandArgs, result);
}

// Try canonical/installed/source wrapper locations, then direct fallback.
const wrapperPath = tuiWrapperCandidates.find((p) => fs.existsSync(p)) || null;

if (wrapperPath) {
  runBundled(wrapperPath);
} else {
  runDirect();
}
