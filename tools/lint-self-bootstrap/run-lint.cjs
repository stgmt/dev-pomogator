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

function packageNameFromSpecifier(specifier) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('node:') ||
    specifier.startsWith('data:')
  ) {
    return null;
  }
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  return parts[0] || null;
}

function lintConfigPackages(cwd) {
  const configPath = path.join(cwd, 'eslint.config.mjs');
  if (!fs.existsSync(configPath)) return [];
  const content = fs.readFileSync(configPath, 'utf-8');
  const packages = new Set();
  for (const match of content.matchAll(/\bimport(?:\s+[^'";]+?\s+from)?\s+['"]([^'"]+)['"]/g)) {
    const packageName = packageNameFromSpecifier(match[1]);
    if (packageName) packages.add(packageName);
  }
  return [...packages].sort();
}

function requiredLintPackages(cwd) {
  return [...new Set(['eslint', ...lintConfigPackages(cwd)])].sort();
}

function declaredVersion(pkg, packageName) {
  const deps = pkg && pkg.dependencies;
  const devDeps = pkg && pkg.devDependencies;
  if (deps && typeof deps[packageName] === 'string') return deps[packageName];
  if (devDeps && typeof devDeps[packageName] === 'string') return devDeps[packageName];
  return null;
}

function missingDeclaredLintPackages(pkg, requiredPackages) {
  if (!pkg) return requiredPackages;
  return requiredPackages.filter((packageName) => !declaredVersion(pkg, packageName));
}

function localEslintPath(cwd) {
  return path.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
}

function localPackagePath(cwd, packageName) {
  return path.join(cwd, 'node_modules', ...packageName.split('/'));
}

function missingLocalLintRuntime(cwd, requiredPackages) {
  const missing = [];
  const eslintPath = localEslintPath(cwd);
  if (!fs.existsSync(eslintPath)) missing.push(`executable:${path.relative(cwd, eslintPath)}`);
  for (const packageName of requiredPackages) {
    const packagePath = localPackagePath(cwd, packageName);
    if (!fs.existsSync(packagePath)) missing.push(`package:${packageName}`);
  }
  return missing;
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
  const requiredPackages = requiredLintPackages(cwd);

  const pkg = readPackageJson(cwd);
  const missingDeclarations = missingDeclaredLintPackages(pkg, requiredPackages);
  if (missingDeclarations.length > 0) {
    return {
      exitCode: 1,
      installAttempted: false,
      lintAttempted: false,
      usedLocalEslint: false,
      installCommand,
      lintCommand,
      logPath,
      stdout: '',
      stderr: `Lint dependency setup failed: package.json does not declare lint runtime package(s): ${missingDeclarations.join(', ')} in dependencies or devDependencies.`,
    };
  }

  let installAttempted = false;
  let missingRuntime = missingLocalLintRuntime(cwd, requiredPackages);
  if (missingRuntime.length > 0) {
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

  missingRuntime = missingLocalLintRuntime(cwd, requiredPackages);
  if (missingRuntime.length > 0) {
    return {
      exitCode: 1,
      installAttempted,
      lintAttempted: false,
      usedLocalEslint: false,
      installCommand,
      lintCommand,
      logPath,
      stdout: '',
      stderr: `Lint dependency setup failed: local lint runtime is incomplete after install (missing: ${missingRuntime.join(', ')}). Log: ${logPath}`,
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
