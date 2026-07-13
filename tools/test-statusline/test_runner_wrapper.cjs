#!/usr/bin/env node
/**
 * Stable JavaScript entry point for the TypeScript test runner.
 *
 * This file is intentionally dependency-free: test-guard can invoke it from a
 * canonical plugin installation before any project dependencies are available.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const scriptDir = __dirname;
const repoRoot = path.resolve(scriptDir, '..', '..');
const args = process.argv.slice(2);

function firstExisting(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function reportLaunchFailure(result, command) {
  if (result.error) {
    process.stderr.write(`[dev-pomogator] Failed to launch ${command}: ${result.error.message}\n`);
  }
  if (result.signal) {
    process.stderr.write(`[dev-pomogator] ${command} terminated by signal ${result.signal}\n`);
  }
  return result.status ?? 1;
}

/** Remove shim-only options before directly launching a child command. */
function directCommand(argv) {
  const command = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') {
      command.push(...argv.slice(index + 1));
      break;
    }
    if (argument === '--framework') {
      index += 1;
      continue;
    }
    if (argument.startsWith('--framework=')) continue;
    command.push(argument);
  }
  return command;
}

function run(command, commandArgs, environment) {
  // Do not set cwd: Windows rejects UNC working directories.  The child
  // inherits the usable working directory chosen by its caller instead.
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    env: environment,
  });
  return reportLaunchFailure(result, command);
}

function loadSessionEnvironment() {
  if (process.env.TEST_STATUSLINE_SESSION) return;
  for (const sessionEnvPath of [
    path.join(repoRoot, '.dev-pomogator', '.test-status', 'session.env'),
    path.join(repoRoot, '.dev-pomogator', '.docker-status', 'session.env'),
  ]) {
    if (!fs.existsSync(sessionEnvPath)) continue;
    for (const line of fs.readFileSync(sessionEnvPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
    }
    break;
  }
}

function runTypeScript(wrapper, tsxRunner) {
  const environment = { ...process.env };
  if (!environment.TSX_RUNNER_TIMEOUT) environment.TSX_RUNNER_TIMEOUT = '1860000';
  const runner = tsxRunner.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return run(process.execPath, ['-e', `require('${runner}')`, '--', wrapper, ...args], environment);
}

function runDirect() {
  const command = directCommand(args);
  if (command.length === 0) {
    process.stderr.write('[dev-pomogator] No test command supplied after wrapper options.\n');
    return 1;
  }
  return run(command[0], command.slice(1), process.env);
}

loadSessionEnvironment();

const tuiWrapper = firstExisting([
  path.join(repoRoot, 'tools', 'tui-test-runner', 'test_runner_wrapper.ts'),
  path.join(repoRoot, '.dev-pomogator', 'tools', 'tui-test-runner', 'test_runner_wrapper.ts'),
  path.join(repoRoot, 'extensions', 'tui-test-runner', 'tools', 'tui-test-runner', 'test_runner_wrapper.ts'),
]);
const tsxRunner = firstExisting([
  path.join(repoRoot, 'tools', '_shared', 'tsx-runner.js'),
  path.join(scriptDir, '..', '_shared', 'tsx-runner.js'),
  path.join(os.homedir(), '.dev-pomogator', 'tsx-runner.js'),
]);

process.exit(tuiWrapper && tsxRunner ? runTypeScript(tuiWrapper, tsxRunner) : runDirect());
