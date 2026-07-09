#!/usr/bin/env node
import path from 'node:path';
import { createRequire } from 'node:module';
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

const require = createRequire(import.meta.url);
const runtime = require('./run-lint.cjs') as {
  runLintSelfBootstrap(options?: LintSelfBootstrapOptions): LintSelfBootstrapResult;
};

export const runLintSelfBootstrap = runtime.runLintSelfBootstrap;

function invokedDirectly(): boolean {
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return invoked !== '' && fileURLToPath(import.meta.url) === invoked;
}

if (invokedDirectly()) {
  const result = runLintSelfBootstrap();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.exitCode);
}
