/**
 * @feature14 step definitions — plugin hook commands are deps-absent-safe (FR-14).
 *
 * Drives the actual pre-Node hook dispatcher: the scenario verifies that platform
 * selection never falls back from Windows node.exe to POSIX node, and that recovery
 * diagnostics remain scoped to the Claude project even with one shared HOME.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findDepsUnsafeHooks } from '../../tools/plugin-deps-guard/check.ts';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const dispatcher = path.join(REPO_ROOT, 'tools', '_shared', 'hook-runtime.sh');

interface DepsWorld extends V4World {
  scanRoot?: string;
  offenders?: string[];
  dispatch?: ReturnType<typeof spawnSync>;
  migration?: ReturnType<typeof spawnSync>;
  projectSentinels?: Map<string, Buffer>;
  globalSentinels?: Map<string, Buffer>;
  migrationHome?: string;
  migrationProject?: string;
}

Given(/^the real canonical plugin hooks manifest$/, function (this: DepsWorld) {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, '.claude-plugin', 'hooks.json')), 'hooks.json must exist');
  this.scanRoot = REPO_ROOT;
});

Given(/^a synthetic plugin tree whose raw-\.ts hook imports a real npm package$/, function (this: DepsWorld) {
  const root = this.tempDir;
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tools', 'evil'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'evil', 'evil.ts'), "import { z } from 'zod';\nexport const x = z;\n");
  fs.writeFileSync(path.join(root, '.claude-plugin', 'hooks.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node --import tsx tools/evil/evil.ts' }] }] } }));
  this.scanRoot = root;
});

When(/^the deps-safety guard scans that tree$/, function (this: DepsWorld) {
  this.offenders = findDepsUnsafeHooks(this.scanRoot!);
});

Then(/^no hook command reaches a real npm package$/, function (this: DepsWorld) {
  assert.deepEqual(this.offenders, [], `Unsafe raw TypeScript hooks:\n${(this.offenders ?? []).join('\n')}`);
});

Then(/^the guard flags the offending hook citing `([^`]+)`$/, function (this: DepsWorld, pkg: string) {
  assert.equal(this.offenders!.length, 1, `expected exactly one offender, got ${JSON.stringify(this.offenders)}`);
  assert.match(this.offenders![0], /tools\/evil\/evil\.ts/);
  assert.ok(this.offenders![0].includes(pkg), `offender must name ${pkg}: ${this.offenders![0]}`);
});

Given(/^a canonical plugin hook launcher invoked from a POSIX shell in a foreign project CWD$/, function (this: DepsWorld) {
  const project = path.join(this.tempDir, 'foreign-project');
  fs.mkdirSync(project, { recursive: true });
  this.scanRoot = project;
});

Given(/^its doctor result is unavailable or malformed$/, function () {
  // The pre-Node dispatcher deliberately does not depend on a doctor process.
  // This is the unavailable/malformed-result seam: dispatch remains fail-open.
});

When(/^the launcher receives a prohibited host BDD command$/, function (this: DepsWorld) {
  this.dispatch = spawnSync('sh', [dispatcher, '-e', 'process.exit(99)'], {
    cwd: this.scanRoot,
    input: JSON.stringify({ tool_input: { command: 'node tools/run-bdd.mjs' } }),
    encoding: 'utf8', env: { ...process.env },
  });
});

Then(/^the shell dispatch rejects the command before Node starts$/, function (this: DepsWorld) {
  assert.equal(this.dispatch?.status, 2, `dispatcher stderr: ${this.dispatch?.stderr}`);
  assert.match(this.dispatch?.stderr ?? '', /Host BDD command refused/);
});

function makeExecutable(file: string, contents: string): void {
  fs.writeFileSync(file, contents);
  fs.chmodSync(file, 0o755);
}

function dispatch(env: NodeJS.ProcessEnv, cwd: string) {
  return spawnSync('sh', [dispatcher, '-e', 'process.exit(0)'], { cwd, input: '{}', encoding: 'utf8', env });
}

Then(/^a POSIX permitted hook invocation uses `node`, not `node\.exe`$/, function (this: DepsWorld) {
  const bin = path.join(this.tempDir, 'posix-bin');
  fs.mkdirSync(bin, { recursive: true });
  makeExecutable(path.join(bin, 'node'), '#!/bin/sh\nprintf node\n');
  makeExecutable(path.join(bin, 'node.exe'), '#!/bin/sh\nprintf node.exe >&2\nexit 88\n');
  const result = dispatch({ ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` }, this.scanRoot!);
  assert.equal(result.status, 0, `POSIX dispatch stderr: ${result.stderr}`);
  assert.equal(result.stdout, 'node');
  assert.doesNotMatch(result.stderr, /node\.exe/);
});

Then(/^a Windows-family permitted hook invocation uses `node\.exe`, not `node`$/, function (this: DepsWorld) {
  const bin = path.join(this.tempDir, 'windows-bin');
  fs.mkdirSync(bin, { recursive: true });
  makeExecutable(path.join(bin, 'uname'), '#!/bin/sh\nprintf MINGW64_NT-10.0\n');
  makeExecutable(path.join(bin, 'node'), '#!/bin/sh\nprintf WRONG-NODE >&2\nexit 91\n');
  makeExecutable(path.join(bin, 'node.exe'), '#!/bin/sh\nprintf node.exe\n');
  const result = dispatch({ ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` }, this.scanRoot!);
  assert.equal(result.status, 0, `Windows dispatch stderr: ${result.stderr}`);
  assert.equal(result.stdout, 'node.exe');
  assert.doesNotMatch(result.stderr, /WRONG-NODE/);
});

Then(/^a permitted hook invocation uses `node`, not `node\.exe`$/, function (this: DepsWorld) {
  const bin = path.join(this.tempDir, 'legacy-posix-bin');
  fs.mkdirSync(bin, { recursive: true });
  makeExecutable(path.join(bin, 'node'), '#!/bin/sh\nprintf node\n');
  makeExecutable(path.join(bin, 'node.exe'), '#!/bin/sh\nprintf node.exe >&2\nexit 88\n');
  const result = dispatch({ ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` }, this.scanRoot!);
  assert.equal(result.status, 0, `POSIX dispatch stderr: ${result.stderr}`);
  assert.equal(result.stdout, 'node');
  assert.doesNotMatch(result.stderr, /node\.exe/);
});

Then(/^the permitted hook invocation continues fail-open despite the doctor failure$/, function (this: DepsWorld) {
  const bin = path.join(this.tempDir, 'legacy-fail-open-bin');
  const home = path.join(this.tempDir, 'legacy-fail-open-home');
  fs.mkdirSync(bin, { recursive: true });
  makeExecutable(path.join(bin, 'uname'), '#!/bin/sh\nprintf MINGW64_NT-10.0\n');
  makeExecutable(path.join(bin, 'node'), '#!/bin/sh\nprintf POSIX-FALLBACK >&2\nexit 99\n');
  const result = dispatch({ ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, HOME: home, CLAUDE_SESSION_ID: 'doctor-unavailable', CLAUDE_PROJECT_DIR: this.scanRoot }, this.scanRoot!);
  assert.equal(result.status, 0, `fail-open stderr: ${result.stderr}`);
  assert.match(result.stderr, /Node runtime is unavailable/);
  assert.doesNotMatch(result.stderr, /POSIX-FALLBACK/);
});

Then(/^plugin-installed dispatch anchors on CLAUDE_PLUGIN_ROOT and repository-dogfood dispatch anchors on CLAUDE_PROJECT_DIR, not process CWD$/, function () {
  const canonical = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'hooks.json'), 'utf8')) as { hooks: unknown };
  const dogfood = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude', 'settings.json'), 'utf8')) as { hooks: unknown };
  const commands = (value: unknown): string[] => {
    const found: string[] = [];
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if ('command' in node && typeof (node as { command?: unknown }).command === 'string') {
        found.push((node as { command: string }).command);
      }
      for (const child of Object.values(node)) visit(child);
    };
    visit(value);
    return found;
  };
  const canonicalCommands = commands(canonical.hooks);
  const dogfoodCommands = commands(dogfood.hooks);
  assert.ok(canonicalCommands.length > 0, 'canonical manifest must contain hook commands');
  assert.ok(dogfoodCommands.length > 0, 'dogfood settings must contain hook commands');
  for (const command of canonicalCommands) assert.match(command, /CLAUDE_PLUGIN_ROOT/);
  // Shell-only hooks may remain plugin-root anchored. Every dispatcher-backed
  // dogfood command must resolve its child through the real project anchor,
  // rather than a raw CWD. The prior dispatcher scenarios execute the real
  // shell runtime from a foreign CWD; this assertion covers the configuration
  // branch passed to that runtime.
  const dispatchedDogfood = dogfoodCommands.filter((value) => value.includes('hook-runtime.sh'));
  assert.ok(dispatchedDogfood.length > 0, 'dogfood settings must route hooks through the runtime dispatcher');
  for (const command of dispatchedDogfood) {
    assert.match(command, /CLAUDE_PROJECT_DIR/);
    assert.doesNotMatch(command, /process\.cwd\(\).*tools\/_shared\/bootstrap/);
  }
});

Then(/^unavailable Windows `node\.exe` recovers separately for two projects sharing one HOME$/, function (this: DepsWorld) {
  const bin = path.join(this.tempDir, 'missing-windows-node-bin');
  const home = path.join(this.tempDir, 'shared-home');
  const first = path.join(this.tempDir, 'project-one');
  const second = path.join(this.tempDir, 'project-two');
  const nested = path.join(first, 'nested');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(second, { recursive: true });
  makeExecutable(path.join(bin, 'uname'), '#!/bin/sh\nprintf MINGW64_NT-10.0\n');
  // A visible POSIX node makes the assertion mutation-resistant: Windows must not fall back to it.
  makeExecutable(path.join(bin, 'node'), '#!/bin/sh\nprintf POSIX-FALLBACK >&2\nexit 99\n');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, HOME: home, CLAUDE_SESSION_ID: 'same-session' };
  const firstRun = dispatch({ ...env, CLAUDE_PROJECT_DIR: first }, first);
  // A syntactically different anchor to the same project must share its marker.
  const duplicate = dispatch({ ...env, CLAUDE_PROJECT_DIR: `${first}${path.sep}` }, nested);
  const secondRun = dispatch({ ...env, CLAUDE_PROJECT_DIR: second }, second);
  for (const result of [firstRun, duplicate, secondRun]) assert.equal(result.status, 0, result.stderr);
  assert.match(firstRun.stderr, /Node runtime is unavailable/);
  assert.equal(duplicate.stderr, '', 'the same project/session reports recovery only once');
  assert.match(secondRun.stderr, /Node runtime is unavailable/);
  assert.doesNotMatch(`${firstRun.stderr}${secondRun.stderr}`, /POSIX-FALLBACK/);
});

Given(/^a v1 global install and an independent project with v2 sentinels$/, function (this: DepsWorld) {
  const home = path.join(this.tempDir, 'migration-home');
  const project = path.join(this.tempDir, 'independent-project');
  const legacyRunner = path.join(home, '.dev-pomogator', 'scripts', 'tsx-runner.js');
  const v2Launcher = path.join(home, '.dev-pomogator', 'scripts', 'launch-context-menu.ps1');
  const v2Log = path.join(home, '.dev-pomogator', 'logs', 'keep.log');
  const projectMarker = path.join(project, '.dev-pomogator', 'keep.txt');
  const projectSettings = path.join(project, '.claude', 'settings.local.json');
  const globalSettings = path.join(home, '.claude', 'settings.json');
  for (const file of [legacyRunner, v2Launcher, v2Log, projectMarker, projectSettings, globalSettings]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  fs.writeFileSync(legacyRunner, 'legacy v1 runner\n');
  fs.writeFileSync(v2Launcher, 'v2 launcher\n');
  fs.writeFileSync(v2Log, 'v2 log\n');
  fs.writeFileSync(projectMarker, 'project v2 state\n');
  fs.writeFileSync(projectSettings, '{"project":"keep"}\n');
  fs.writeFileSync(globalSettings, JSON.stringify({ hooks: { Stop: [{ hooks: [
    { command: 'node .dev-pomogator/scripts/tsx-runner-bootstrap.cjs' },
    { command: 'keep-unrelated-v2-hook' },
  ] }] } }, null, 2));
  this.migrationHome = home;
  this.migrationProject = project;
  this.projectSentinels = new Map([projectMarker, projectSettings].map((f) => [f, fs.readFileSync(f)]));
  this.globalSentinels = new Map([v2Launcher, v2Log].map((f) => [f, fs.readFileSync(f)]));
});

When(/^I run the v1 migration with `--global-only`$/, function (this: DepsWorld) {
  const script = path.join(REPO_ROOT, 'tools', 'migrate-v1-to-v2', 'migrate-v1-to-v2.ts');
  this.migration = spawnSync(process.execPath, ['--experimental-strip-types', script, '--global-only'], {
    cwd: this.migrationProject,
    encoding: 'utf8',
    env: { ...process.env, HOME: this.migrationHome, USERPROFILE: this.migrationHome },
  });
});

Then(/^only recognized global v1 artifacts and their global settings hooks are removed$/, function (this: DepsWorld) {
  assert.equal(this.migration?.status, 0, this.migration?.stderr);
  assert.ok(!fs.existsSync(path.join(this.migrationHome!, '.dev-pomogator', 'scripts', 'tsx-runner.js')));
  const settings = fs.readFileSync(path.join(this.migrationHome!, '.claude', 'settings.json'), 'utf8');
  assert.doesNotMatch(settings, /tsx-runner-bootstrap/);
  assert.match(settings, /keep-unrelated-v2-hook/);
});

Then(/^project sentinels and unrelated v2 global artifacts remain byte-for-byte unchanged$/, function (this: DepsWorld) {
  for (const sentinels of [this.projectSentinels, this.globalSentinels]) {
    for (const [file, expected] of sentinels!) {
      assert.deepEqual(fs.readFileSync(file), expected, `${file} was unexpectedly mutated`);
    }
  }
});
