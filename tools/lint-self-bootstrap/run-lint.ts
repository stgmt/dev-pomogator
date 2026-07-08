#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface LintSelfBootstrapResult {
  exitCode: number;
  installAttempted: boolean;
  lintAttempted: boolean;
  usedLocalEslint: boolean;
  installCommand: string;
  lintCommand: string;
  logPath: string;
  stdout: string;
  stderr: string;
}

export interface LintSelfBootstrapOptions {
  cwd?: string;
  installCommand?: string;
  lintCommand?: string;
  logDir?: string;
}

function readPackageJson(cwd: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function hasDeclaredEslint(pkg: Record<string, unknown> | null): boolean {
  const deps = pkg?.dependencies as Record<string, unknown> | undefined;
  const devDeps = pkg?.devDependencies as Record<string, unknown> | undefined;
  return typeof deps?.eslint === 'string' || typeof devDeps?.eslint === 'string';
}

function localEslintPath(cwd: string): string {
  return path.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
}

function shellRun(command: string, cwd: string): { status: number; stdout: string; stderr: string } {
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

function writeInstallLog(logPath: string, command: string, result: { status: number; stdout: string; stderr: string }): void {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    logPath,
    [`$ ${command}`, `exit=${result.status}`, result.stdout, result.stderr].filter(Boolean).join('\n'),
    'utf-8',
  );
}

export function runLintSelfBootstrap(options: LintSelfBootstrapOptions = {}): LintSelfBootstrapResult {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const installCommand = options.installCommand ?? process.env.LINT_SELF_BOOTSTRAP_INSTALL_CMD ?? 'npm install';
  const logDir = path.resolve(options.logDir ?? process.env.LINT_SELF_BOOTSTRAP_LOG_DIR ?? path.join(cwd, '.dev-pomogator', '.lint-self-bootstrap'));
  const logPath = path.join(logDir, 'install.log');
  const eslintPath = localEslintPath(cwd);
  const lintCommand = options.lintCommand ?? process.env.LINT_SELF_BOOTSTRAP_LINT_CMD ?? `"${eslintPath}" .claude tools`;

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

function invokedDirectly(): boolean {
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return invoked !== '' && fileURLToPath(import.meta.url) === invoked;
}

if (invokedDirectly()) {
  const result = runLintSelfBootstrap();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.exitCode);
}
