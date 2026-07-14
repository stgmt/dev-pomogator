/**
 * @feature14 step definitions — plugin hook commands are deps-absent-safe (FR-14).
 *
 * Migrated from tests/e2e/plugin-deps-safe.test.ts. Drives the REAL guard
 * `tools/plugin-deps-guard/check.ts::findDepsUnsafeHooks` over (a) the real
 * .claude-plugin/hooks.json (regression: zero offenders) and (b) a synthetic plugin
 * tree whose raw-.ts hook imports a real package (positive: the guard flags it — the
 * built-in mutation-resistance, proving the scenario is not fake-green).
 *
 * @see .specs/dev-pomogator-canonical-plugin/FR.md FR-14
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findDepsUnsafeHooks } from '../../tools/plugin-deps-guard/check.ts';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');

interface DepsWorld extends V4World {
  scanRoot?: string;
  offenders?: string[];
  dispatch?: ReturnType<typeof spawnSync>;
  selectedNode?: string;
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
  fs.writeFileSync(
    path.join(root, '.claude-plugin', 'hooks.json'),
    JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'node --import tsx tools/evil/evil.ts' }] }],
      },
    }),
  );
  this.scanRoot = root;
});

When(/^the deps-safety guard scans that tree$/, function (this: DepsWorld) {
  this.offenders = findDepsUnsafeHooks(this.scanRoot!);
});

Then(/^no hook command reaches a real npm package$/, function (this: DepsWorld) {
  assert.deepEqual(
    this.offenders,
    [],
    `These hooks launch a raw .ts that pulls a real package -> they CRASH for plugin users ` +
      `(no node_modules). Bundle them or rewrite builtins-only:\n${(this.offenders ?? []).join('\n')}`,
  );
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
  // The dispatcher intentionally has no Node-side doctor dependency. This is the
  // unavailable-result seam: launch must remain fail-open before Node starts.
});

When(/^the launcher receives a prohibited host BDD command$/, function (this: DepsWorld) {
  const dispatcher = path.join(REPO_ROOT, 'tools', '_shared', 'hook-runtime.sh');
  this.dispatch = spawnSync('sh', [dispatcher, '-e', 'process.exit(99)'], {
    cwd: this.scanRoot,
    input: JSON.stringify({ tool_input: { command: 'node tools/run-bdd.mjs' } }),
    encoding: 'utf8',
    env: { ...process.env, PATH: process.env.PATH ?? '' },
  });
});

Then(/^the shell dispatch rejects the command before Node starts$/, function (this: DepsWorld) {
  assert.equal(this.dispatch?.status, 2, `dispatcher stderr: ${this.dispatch?.stderr}`);
  assert.match(this.dispatch?.stderr ?? '', /Host BDD command refused/);
});

Then(/^a permitted hook invocation uses `node`, not `node\.exe`$/, function (this: DepsWorld) {
  const bin = path.join(this.tempDir, 'fake-bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\nprintf node\n');
  fs.writeFileSync(path.join(bin, 'node.exe'), '#!/bin/sh\nprintf node.exe >&2\nexit 88\n');
  fs.chmodSync(path.join(bin, 'node'), 0o755);
  fs.chmodSync(path.join(bin, 'node.exe'), 0o755);
  this.selectedNode = bin;
});

Then(/^the permitted hook invocation continues fail-open despite the doctor failure$/, function (this: DepsWorld) {
  const dispatcher = path.join(REPO_ROOT, 'tools', '_shared', 'hook-runtime.sh');
  const result = spawnSync('sh', [dispatcher, '-e', 'process.exit(0)'], {
    cwd: this.scanRoot,
    input: '{}',
    encoding: 'utf8',
    env: { ...process.env, PATH: `${this.selectedNode!}:${process.env.PATH ?? ''}` },
  });
  assert.equal(result.status, 0, `permitted dispatch stderr: ${result.stderr}`);
  assert.equal(result.stdout, 'node');
  assert.doesNotMatch(result.stderr, /node\.exe/);
});
