import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = process.cwd();
const SOURCE_WRAPPER = path.join(REPO_ROOT, 'tools', 'test-statusline', 'test_runner_wrapper.cjs');

type ProcessResult = { stdout: string; stderr: string; status: number | null };

interface CjsWrapperWorld extends V4World {
  cjsTempDir?: string;
  cjsWrapperPath?: string;
  cjsPluginRoot?: string;
  cjsResult?: ProcessResult;
  cjsResults?: ProcessResult[];
  cjsReceivedArgs?: string[];
}

function runWrapper(wrapperPath: string, args: string[], env: Record<string, string> = {}): ProcessResult {
  const result = spawnSync(process.execPath, [wrapperPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
}

function makeIsolatedWrapper(world: CjsWrapperWorld): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin011-cjs-'));
  const wrapperPath = path.join(dir, 'test_runner_wrapper.cjs');
  fs.copyFileSync(SOURCE_WRAPPER, wrapperPath);
  world.cjsTempDir = dir;
  world.cjsWrapperPath = wrapperPath;
  return wrapperPath;
}

function writeRecordingBundle(world: CjsWrapperWorld): { wrapperPath: string; pluginRoot: string } {
  const wrapperPath = makeIsolatedWrapper(world);
  const pluginRoot = path.join(world.cjsTempDir!, 'plugin-root');
  const bundleDir = path.join(pluginRoot, 'tools', 'tui-test-runner');
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(
    path.join(bundleDir, 'test_runner_wrapper.bundle.mjs'),
    "import fs from 'node:fs';\nfs.writeFileSync(process.env.PLUGIN011_ARGS_FILE, JSON.stringify(process.argv.slice(2)));\n",
    'utf-8',
  );
  world.cjsPluginRoot = pluginRoot;
  return { wrapperPath, pluginRoot };
}

After(function (this: CjsWrapperWorld) {
  if (this.cjsTempDir) fs.rmSync(this.cjsTempDir, { recursive: true, force: true });
});

Given(/^an isolated CJS test runner wrapper has no bundle$/, function (this: CjsWrapperWorld) {
  makeIsolatedWrapper(this);
});

When(/^the CJS wrapper runs a successful direct child command$/, function (this: CjsWrapperWorld) {
  this.cjsResult = runWrapper(this.cjsWrapperPath!, ['--framework=generic', '--', process.execPath, '-e', 'process.exit(0)']);
});

When(/^the CJS wrapper runs a direct child command that exits 7$/, function (this: CjsWrapperWorld) {
  this.cjsResult = runWrapper(this.cjsWrapperPath!, ['--framework', 'generic', '--', process.execPath, '-e', 'process.exit(7)']);
});

When(/^the CJS wrapper runs a missing child executable$/, function (this: CjsWrapperWorld) {
  this.cjsResult = runWrapper(this.cjsWrapperPath!, ['--framework', 'generic', '--', 'plugin011-definitely-missing-executable']);
});

When(/^the CJS wrapper exercises both supported framework syntaxes$/, function (this: CjsWrapperWorld) {
  this.cjsResults = [
    runWrapper(this.cjsWrapperPath!, ['--framework', 'generic', '--', process.execPath, '-e', 'process.exit(0)']),
    runWrapper(this.cjsWrapperPath!, ['--framework=generic', '--', process.execPath, '-e', 'process.exit(0)']),
  ];
});

When(/^the CJS wrapper receives only framework options$/, function (this: CjsWrapperWorld) {
  this.cjsResult = runWrapper(this.cjsWrapperPath!, ['--framework=generic']);
});

Given(/^a CLAUDE_PLUGIN_ROOT bundle records its received arguments$/, function (this: CjsWrapperWorld) {
  writeRecordingBundle(this);
});

When(/^the CJS wrapper runs with source options and a command separator$/, function (this: CjsWrapperWorld) {
  const argsFile = path.join(this.cjsTempDir!, 'bundle-args.json');
  const args = ['--framework=generic', '--source-options', '--import', 'tsx', '--', process.execPath, '-e', 'process.exit(0)'];
  this.cjsResult = runWrapper(this.cjsWrapperPath!, args, { CLAUDE_PLUGIN_ROOT: this.cjsPluginRoot!, PLUGIN011_ARGS_FILE: argsFile });
  this.cjsReceivedArgs = JSON.parse(fs.readFileSync(argsFile, 'utf-8')) as string[];
});

When(/^the CJS wrapper runs with a UNC source option and import export flags$/, function (this: CjsWrapperWorld) {
  const argsFile = path.join(this.cjsTempDir!, 'bundle-args.json');
  const args = ['--source-options', '\\\\server\\share\\suite.mjs', '--import', 'tsx', '--export', 'reporter', '--', process.execPath, '-e', 'process.exit(0)'];
  this.cjsResult = runWrapper(this.cjsWrapperPath!, args, { CLAUDE_PLUGIN_ROOT: this.cjsPluginRoot!, PLUGIN011_ARGS_FILE: argsFile });
  this.cjsReceivedArgs = JSON.parse(fs.readFileSync(argsFile, 'utf-8')) as string[];
});

Then(/^the CJS wrapper should exit with code (\d+)$/, function (this: CjsWrapperWorld, code: string) {
  assert.equal(this.cjsResult?.status, Number(code), this.cjsResult?.stderr);
});

Then(/^the CJS wrapper should fail closed with direct launch diagnostics$/, function (this: CjsWrapperWorld) {
  assert.equal(this.cjsResult?.status, 1);
  assert.match(this.cjsResult?.stderr || '', /stage=direct/);
  assert.match(this.cjsResult?.stderr || '', /plugin011-definitely-missing-executable/);
});

Then(/^both CJS wrapper invocations should execute the intended child command$/, function (this: CjsWrapperWorld) {
  assert.deepEqual(this.cjsResults?.map((result) => result.status), [0, 0]);
});

Then(/^the CJS wrapper should reject the missing test command$/, function (this: CjsWrapperWorld) {
  assert.equal(this.cjsResult?.status, 1);
  assert.match(this.cjsResult?.stderr || '', /stage=arguments.*no test command supplied/);
});

Then(/^the plugin-root bundle should receive the unchanged wrapper arguments$/, function (this: CjsWrapperWorld) {
  assert.equal(this.cjsResult?.status, 0, this.cjsResult?.stderr);
  assert.deepEqual(this.cjsReceivedArgs, ['--framework=generic', '--source-options', '--import', 'tsx', '--', process.execPath, '-e', 'process.exit(0)']);
});

Then(/^the plugin-root bundle should receive the unchanged UNC source option arguments$/, function (this: CjsWrapperWorld) {
  assert.equal(this.cjsResult?.status, 0, this.cjsResult?.stderr);
  assert.deepEqual(this.cjsReceivedArgs, ['--source-options', '\\\\server\\share\\suite.mjs', '--import', 'tsx', '--export', 'reporter', '--', process.execPath, '-e', 'process.exit(0)']);
});
