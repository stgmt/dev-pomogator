import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLintSelfBootstrap, type LintSelfBootstrapResult } from '../../tools/lint-self-bootstrap/run-lint.ts';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface LintBootWorld extends V4World {
  lintFixtureDir?: string;
  lintShouldFailInstall?: boolean;
  lintResult?: LintSelfBootstrapResult;
  lintInspection?: {
    packageJson: Record<string, unknown>;
    packageLock: Record<string, unknown>;
    hookText: string;
    lintScript: string;
  };
}

function writePackage(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({
      name: 'lint-fixture',
      version: '0.0.0',
      type: 'module',
      scripts: { lint: 'eslint .claude tools' },
      devDependencies: { eslint: '^9.39.4' },
    }, null, 2)}\n`,
    'utf-8',
  );
}

function fakeEslintPath(dir: string): string {
  return path.join(dir, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
}

function writeFakeEslint(dir: string, body = 'echo local-eslint'): void {
  const target = fakeEslintPath(dir);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (process.platform === 'win32') {
    fs.writeFileSync(target, `@echo off\r\necho local-eslint\r\n`, 'utf-8');
  } else {
    fs.writeFileSync(target, `#!/bin/sh\n${body}\n`, 'utf-8');
    fs.chmodSync(target, 0o755);
  }
}

function installCommandFor(dir: string): string {
  const scriptPath = path.join(dir, 'install-eslint.cjs');
  const fakeBody = process.platform === 'win32'
    ? '@echo off\r\necho local-eslint\r\n'
    : '#!/bin/sh\necho local-eslint\n';
  fs.writeFileSync(
    scriptPath,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      `const target = ${JSON.stringify(fakeEslintPath(dir))};`,
      "fs.mkdirSync(path.dirname(target), { recursive: true });",
      `fs.writeFileSync(target, ${JSON.stringify(fakeBody)});`,
      "try { fs.chmodSync(target, 0o755); } catch {}",
    ].join('\n'),
    'utf-8',
  );
  return `"${process.execPath}" "${scriptPath}"`;
}

function runFixture(world: LintBootWorld, installCommand?: string): void {
  assert.ok(world.lintFixtureDir, 'lint fixture dir must be set');
  world.lintResult = runLintSelfBootstrap({ cwd: world.lintFixtureDir, installCommand: installCommand ?? installCommandFor(world.lintFixtureDir) });
}

Given(/^a lint fixture package without a local eslint executable$/, function (this: LintBootWorld) {
  this.lintFixtureDir = path.join(this.tempDir, 'lint-fixture');
  writePackage(this.lintFixtureDir);
});

Given(/^a lint fixture package with an existing local eslint executable$/, function (this: LintBootWorld) {
  this.lintFixtureDir = path.join(this.tempDir, 'lint-fixture');
  writePackage(this.lintFixtureDir);
  writeFakeEslint(this.lintFixtureDir);
});

Given(/^a lint fixture package where dependency installation fails$/, function (this: LintBootWorld) {
  this.lintFixtureDir = path.join(this.tempDir, 'lint-fixture');
  this.lintShouldFailInstall = true;
  writePackage(this.lintFixtureDir);
});

Given(/^the dev-pomogator lint verification configuration is available$/, function (this: LintBootWorld) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as Record<string, unknown>;
  const packageLock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf-8')) as Record<string, unknown>;
  const hookText = fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'hooks.json'), 'utf-8');
  const scripts = packageJson.scripts as Record<string, string>;
  this.lintInspection = { packageJson, packageLock, hookText, lintScript: scripts.lint };
});

Given(/^the dev-pomogator package metadata and lockfile are available$/, function (this: LintBootWorld) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as Record<string, unknown>;
  const packageLock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf-8')) as Record<string, unknown>;
  this.lintInspection = { packageJson, packageLock, hookText: '', lintScript: ((packageJson.scripts as Record<string, string>).lint) };
});

When(/^the lint self-bootstrap verification runs$/, function (this: LintBootWorld) {
  const failingInstall = `${process.execPath} -e "process.exit(42)"`;
  runFixture(this, this.lintShouldFailInstall ? failingInstall : undefined);
});

When(/^the lint verification path is inspected$/, function () {
  // State is loaded by the Given step; this action exists to bind the feature text to the real metadata inspection.
});

When(/^lint dependency declarations are inspected$/, function () {
  // State is loaded by the Given step; this action exists to bind the feature text to the real metadata inspection.
});

Then(/^the local lint dependency is prepared before lint execution$/, function (this: LintBootWorld) {
  assert.ok(this.lintResult?.installAttempted, `expected dependency install attempt: ${JSON.stringify(this.lintResult)}`);
  assert.equal(this.lintResult?.lintAttempted, true, `lint should run after bootstrap: ${JSON.stringify(this.lintResult)}`);
  assert.equal(this.lintResult?.usedLocalEslint, true);
});

Then(/^the result is not a missing eslint command failure$/, function (this: LintBootWorld) {
  const output = `${this.lintResult?.stdout ?? ''}\n${this.lintResult?.stderr ?? ''}`;
  assert.equal(this.lintResult?.exitCode, 0, `lint bootstrap should succeed: ${output}`);
  assert.doesNotMatch(output, /eslint.*(not found|not recognized|command not found)/i);
});

Then(/^dependency installation is not attempted$/, function (this: LintBootWorld) {
  assert.equal(this.lintResult?.installAttempted, false, `existing local eslint must be reused: ${JSON.stringify(this.lintResult)}`);
});

Then(/^the existing local eslint executable is used$/, function (this: LintBootWorld) {
  assert.equal(this.lintResult?.usedLocalEslint, true);
  assert.equal(this.lintResult?.exitCode, 0);
});

Then(/^the result reports the failed install command and log location$/, function (this: LintBootWorld) {
  assert.equal(this.lintResult?.installAttempted, true);
  assert.match(this.lintResult?.stderr ?? '', /Lint dependency setup failed: command/);
  assert.match(this.lintResult?.stderr ?? '', /Log:/);
  assert.ok(this.lintResult?.logPath && fs.existsSync(this.lintResult.logPath), `install log must exist: ${this.lintResult?.logPath}`);
});

Then(/^lint execution is not attempted$/, function (this: LintBootWorld) {
  assert.equal(this.lintResult?.lintAttempted, false, `lint must not run after install failure: ${JSON.stringify(this.lintResult)}`);
});

Then(/^it resolves eslint from project-local tooling$/, function (this: LintBootWorld) {
  assert.ok(this.lintInspection, 'lint inspection must be loaded');
  assert.equal(this.lintInspection.lintScript, 'node tools/lint-self-bootstrap/run-lint.cjs');
  const devDeps = this.lintInspection.packageJson.devDependencies as Record<string, unknown>;
  assert.equal(typeof devDeps.eslint, 'string', 'eslint must be project-local in devDependencies');
});

Then(/^no always-on plugin hook imports eslint directly$/, function (this: LintBootWorld) {
  assert.ok(this.lintInspection, 'lint inspection must be loaded');
  assert.doesNotMatch(this.lintInspection.hookText, /eslint(\.config|\s|['"])/i, 'always-on hook manifest must not directly invoke/import eslint');
});

Then(/^eslint is declared in package metadata$/, function (this: LintBootWorld) {
  assert.ok(this.lintInspection, 'lint inspection must be loaded');
  const devDeps = this.lintInspection.packageJson.devDependencies as Record<string, unknown>;
  assert.equal(typeof devDeps.eslint, 'string', 'eslint must be declared in devDependencies');
});

Then(/^eslint is present in the lockfile$/, function (this: LintBootWorld) {
  assert.ok(this.lintInspection, 'lint inspection must be loaded');
  const packages = this.lintInspection.packageLock.packages as Record<string, unknown>;
  assert.ok(packages['node_modules/eslint'], 'package-lock must include node_modules/eslint');
});
