#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function readPackageJson(cwd) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasDeclaredEslint(pkg) {
  const deps = pkg && pkg.dependencies;
  const devDeps = pkg && pkg.devDependencies;
  return Boolean(
    deps && typeof deps.eslint === 'string' ||
    devDeps && typeof devDeps.eslint === 'string'
  );
}

function localEslintPath(cwd) {
  return path.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
}

function shellRun(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf-8',
    env: process.env,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function writeInstallLog(logPath, command, result) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    logPath,
    [`$ ${command}`, `exit=${result.status}`, result.stdout, result.stderr].filter(Boolean).join('\n'),
    'utf-8',
  );
}

function runLintSelfBootstrap(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const installCommand = options.installCommand || process.env.LINT_SELF_BOOTSTRAP_INSTALL_CMD || 'npm install';
  const logDir = path.resolve(options.logDir || process.env.LINT_SELF_BOOTSTRAP_LOG_DIR || path.join(cwd, '.dev-pomogator', '.lint-self-bootstrap'));
  const logPath = path.join(logDir, 'install.log');
  const eslintPath = localEslintPath(cwd);
  const lintCommand = options.lintCommand || process.env.LINT_SELF_BOOTSTRAP_LINT_CMD || `"${eslintPath}" .claude tools`;

  const pkg = readPackageJson(cwd);
  if (!hasDeclaredEslint(pkg)) {
    return {
      exitCode: 1,
      installAttempted: false,
      lintAttempted: false,
      usedLocalEslint: false,
      installCommand,
      lintCommand,
      logPath,
      stdout: '',
      stderr: 'Lint dependency setup failed: package.json does not declare eslint in dependencies or devDependencies.',
    };
  }

  let installAttempted = false;
  if (!fs.existsSync(eslintPath)) {
    installAttempted = true;
    const installResult = shellRun(installCommand, cwd);
    writeInstallLog(logPath, installCommand, installResult);
    if (installResult.status !== 0) {
      return {
        exitCode: installResult.status,
        installAttempted,
        lintAttempted: false,
        usedLocalEslint: false,
        installCommand,
        lintCommand,
        logPath,
        stdout: installResult.stdout,
        stderr: `Lint dependency setup failed: command "${installCommand}" exited ${installResult.status}. Log: ${logPath}`,
      };
    }
  }

  if (!fs.existsSync(eslintPath)) {
    return {
      exitCode: 1,
      installAttempted,
      lintAttempted: false,
      usedLocalEslint: false,
      installCommand,
      lintCommand,
      logPath,
      stdout: '',
      stderr: `Lint dependency setup failed: local eslint executable was not found after install. Log: ${logPath}`,
    };
  }

  const lintResult = shellRun(lintCommand, cwd);
  return {
    exitCode: lintResult.status,
    installAttempted,
    lintAttempted: true,
    usedLocalEslint: true,
    installCommand,
    lintCommand,
    logPath,
    stdout: lintResult.stdout,
    stderr: lintResult.stderr,
  };
}

if (require.main === module) {
  const result = runLintSelfBootstrap();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.exitCode);
}

module.exports = { runLintSelfBootstrap };
