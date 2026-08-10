import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import {
  JournalSkipError,
  MAX_TOTAL_BYTES,
  MIN_FREE_BYTES,
  RETENTION_MS,
  ROTATION_BYTES,
  appendRawEntry,
} from '../../tools/spec-check-log/writer.ts';
import { projectHasSpecs, resolveHookProjectRoot } from '../../tools/_shared/hook-project-root.mjs';

interface JournalWorld extends V4World {
  pluginRoot?: string;
  projectRoot?: string;
  otherProject?: string;
  resolvedRoot?: string | null;
  journalResult?: string;
  diagnostics?: string[];
  guardOutput?: Record<string, unknown>;
  pushOutput?: string;
  retained?: string[];
  skipped?: unknown[];
  escapedTarget?: string;
}

const fixedNow = new Date('2026-08-11T12:00:00.000Z');
const journalDir = (root: string) => path.join(root, '.dev-pomogator', '.spec-check-log');
const makeProject = (root: string, withSpecs = true) => {
  fs.mkdirSync(root, { recursive: true });
  if (withSpecs) fs.mkdirSync(path.join(root, '.specs'), { recursive: true });
  return root;
};
const writeSized = (file: string, size: number, mtime = fixedNow) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x'.repeat(size));
  fs.utimesSync(file, mtime, mtime);
};

Given(/^an installed plugin cache and a different caller project with specs$/, function (this: JournalWorld) {
  this.pluginRoot = path.join(this.tempDir, 'installed-cache', 'dev-pomogator', '2.0.6');
  this.projectRoot = makeProject(path.join(this.tempDir, 'caller-project'));
  fs.mkdirSync(path.join(this.pluginRoot, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(this.pluginRoot, 'tools', 'code-marker.mjs'), 'export default true;');
});

When(/^the real hook request path resolves code and data roots$/, function (this: JournalWorld) {
  this.resolvedRoot = resolveHookProjectRoot({
    input: { cwd: this.projectRoot },
    env: { CLAUDE_PLUGIN_ROOT: this.pluginRoot },
  });
  this.journalResult = appendRawEntry({ kind: 'root-proof' }, {
    repoRoot: this.resolvedRoot!, now: fixedNow, minFreeBytes: 0,
  });
});

Then(/^executable resources come from the plugin cache and all spec reads and state writes stay in the caller project$/, function (this: JournalWorld) {
  assert.equal(fs.existsSync(path.join(this.pluginRoot!, 'tools', 'code-marker.mjs')), true);
  assert.equal(this.resolvedRoot, fs.realpathSync.native(this.projectRoot!));
  assert.equal(this.journalResult!.startsWith(journalDir(this.projectRoot!)), true);
  assert.equal(projectHasSpecs(this.resolvedRoot!), true);
  assert.equal(fs.existsSync(path.join(this.pluginRoot!, '.dev-pomogator')), false);
});

Then(/^daemon startup cwd and plugin root never become project identity$/, function (this: JournalWorld) {
  const unresolved = resolveHookProjectRoot({
    input: {},
    env: { CLAUDE_PLUGIN_ROOT: this.pluginRoot, DEV_POMOGATOR_REPO_ROOT: this.pluginRoot },
  });
  assert.equal(unresolved, null);
});

Given(/^an installed hook request for a project without a specs directory$/, function (this: JournalWorld) {
  this.pluginRoot = path.join(this.tempDir, 'plugin-cache');
  this.projectRoot = makeProject(path.join(this.tempDir, 'plain-project'), false);
  fs.mkdirSync(this.pluginRoot, { recursive: true });
});

When(/^spec conformance push and guard run$/, function (this: JournalWorld) {
  const input = JSON.stringify({ cwd: this.projectRoot, session_id: 'no-specs', tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'x' } });
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: this.pluginRoot!, CLAUDE_PROJECT_DIR: this.projectRoot! };
  this.pushOutput = execFileSync(process.execPath, [path.join(process.cwd(), 'tools/spec-conformance-push/spec-conformance-push.bundle.mjs')], { input, env, encoding: 'utf8' });
  this.guardOutput = JSON.parse(execFileSync(process.execPath, [path.join(process.cwd(), 'tools/spec-conformance-guard/spec-conformance-guard.bundle.mjs')], { input, env, encoding: 'utf8' }));
});

Then(/^both return fail open without creating a spec check journal in the project or plugin cache$/, function (this: JournalWorld) {
  assert.equal(this.pushOutput, '');
  assert.equal((this.guardOutput?.hookSpecificOutput as { permissionDecision?: string })?.permissionDecision, 'allow');
  assert.equal(fs.existsSync(journalDir(this.projectRoot!)), false);
  assert.equal(fs.existsSync(journalDir(this.pluginRoot!)), false);
});

Given(/^a project journal with an active shard and enough closed shards to exceed its limits$/, function (this: JournalWorld) {
  this.projectRoot = makeProject(path.join(this.tempDir, 'bounded-project'));
  const dir = journalDir(this.projectRoot);
  writeSized(path.join(dir, '2026-08-09.jsonl'), 300, new Date('2026-08-09T00:00:00Z'));
  writeSized(path.join(dir, '2026-08-10.jsonl'), 300, new Date('2026-08-10T00:00:00Z'));
  writeSized(path.join(dir, '2026-08-11.jsonl'), 95, fixedNow);
});

When(/^append and retention maintenance complete$/, function (this: JournalWorld) {
  this.journalResult = appendRawEntry({ payload: 'rotation-proof' }, {
    repoRoot: this.projectRoot!, now: fixedNow, rotationBytes: 100, maxTotalBytes: 640, minFreeBytes: 0,
  });
  this.retained = fs.readdirSync(journalDir(this.projectRoot!)).filter(name => name.endsWith('.jsonl'));
});

Then(/^the active shard rotates at ten MiB and total retained journal bytes are at most sixty four MiB$/, function (this: JournalWorld) {
  assert.equal(ROTATION_BYTES, 10 * 1024 * 1024);
  assert.equal(MAX_TOTAL_BYTES, 64 * 1024 * 1024);
  assert.equal(path.basename(this.journalResult!), '2026-08-11-1.jsonl');
  const total = this.retained!.reduce((sum, name) => sum + fs.statSync(path.join(journalDir(this.projectRoot!), name)).size, 0);
  assert.ok(total <= 640);
});

Then(/^oldest closed shards are removed before the active shard is ever considered$/, function (this: JournalWorld) {
  assert.equal(this.retained!.includes('2026-08-09.jsonl'), false);
  assert.equal(this.retained!.includes('2026-08-11-1.jsonl'), true);
});

Given(/^active and closed journal shards on both sides of the thirty day boundary$/, function (this: JournalWorld) {
  this.projectRoot = makeProject(path.join(this.tempDir, 'aged-project'));
  const dir = journalDir(this.projectRoot);
  writeSized(path.join(dir, '2026-06-01.jsonl'), 20, new Date('2026-06-01T00:00:00Z'));
  writeSized(path.join(dir, '2026-08-08.jsonl'), 20, new Date('2026-08-08T00:00:00Z'));
  writeSized(path.join(dir, '2026-08-11.jsonl'), 20, new Date('2026-06-01T00:00:00Z'));
});

When(/^retention maintenance runs$/, function (this: JournalWorld) {
  appendRawEntry({ payload: 'age-proof' }, { repoRoot: this.projectRoot!, now: fixedNow, minFreeBytes: 0 });
  this.retained = fs.readdirSync(journalDir(this.projectRoot!));
});

Then(/^expired closed shards are removed and nonexpired shards remain subject to the aggregate cap$/, function (this: JournalWorld) {
  assert.equal(RETENTION_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(this.retained!.includes('2026-06-01.jsonl'), false);
  assert.equal(this.retained!.includes('2026-08-08.jsonl'), true);
});

Then(/^the active shard is preserved regardless of timestamp$/, function (this: JournalWorld) {
  assert.equal(this.retained!.includes('2026-08-11.jsonl'), true);
});

Given(/^a projected journal append would leave less than one GiB free$/, function (this: JournalWorld) {
  this.projectRoot = makeProject(path.join(this.tempDir, 'low-disk-project'));
  writeSized(path.join(journalDir(this.projectRoot), '2026-08-10.jsonl'), 100);
  this.diagnostics = [];
});

When(/^low disk maintenance cannot restore the reserve by pruning eligible closed shards$/, function (this: JournalWorld) {
  this.skipped = [];
  for (let index = 0; index < 2; index += 1) {
    try {
      appendRawEntry({ payload: 'must-skip' }, {
        repoRoot: this.projectRoot!, now: fixedNow, freeBytes: () => 0,
        minFreeBytes: 1_000, onDiagnostic: message => this.diagnostics!.push(message),
      });
    } catch (error) { this.skipped.push(error); }
  }
});

Then(/^the append is skipped fail open with one bounded rate limited diagnostic outside the journal$/, function (this: JournalWorld) {
  assert.equal(MIN_FREE_BYTES, 1024 * 1024 * 1024);
  assert.equal(this.skipped!.every(error => error instanceof JournalSkipError), true);
  assert.equal(this.diagnostics!.length, 1);
  assert.ok(Buffer.byteLength(this.diagnostics![0]) <= 512);
  assert.equal(fs.readdirSync(journalDir(this.projectRoot!)).some(name => name.endsWith('.jsonl')), false);
});

Given(/^concurrent journal writers and active unrelated traversal and escaped shard candidates$/, function (this: JournalWorld) {
  this.projectRoot = makeProject(path.join(this.tempDir, 'confined-project'));
  const dir = journalDir(this.projectRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.maintenance.lock'), 'held');
  fs.writeFileSync(path.join(dir, 'unrelated.txt'), 'keep');
  fs.mkdirSync(path.join(dir, '2026-01-01.jsonl'));
  fs.writeFileSync(path.join(this.projectRoot, 'outside.jsonl'), 'keep');
  this.escapedTarget = path.join(this.tempDir, 'escaped-target.jsonl');
  fs.writeFileSync(this.escapedTarget, 'escaped-keep');
  fs.symlinkSync(this.escapedTarget, path.join(dir, '2026-02-02.jsonl'), 'file');
});

When(/^rotation and retention race$/, function (this: JournalWorld) {
  this.skipped = [];
  try {
    appendRawEntry({ payload: 'locked' }, { repoRoot: this.projectRoot!, now: fixedNow, minFreeBytes: 0, lockWaitMs: 10 });
  } catch (error) { this.skipped.push(error); }
  fs.unlinkSync(path.join(journalDir(this.projectRoot!), '.maintenance.lock'));
  this.journalResult = appendRawEntry({ payload: 'after-lock' }, { repoRoot: this.projectRoot!, now: fixedNow, minFreeBytes: 0 });
});

Then(/^maintenance is serialized and only recognized closed shards inside the project journal can be deleted$/, function (this: JournalWorld) {
  assert.equal(this.skipped![0] instanceof JournalSkipError, true);
  assert.equal(fs.readFileSync(path.join(journalDir(this.projectRoot!), 'unrelated.txt'), 'utf8'), 'keep');
  assert.equal(fs.statSync(path.join(journalDir(this.projectRoot!), '2026-01-01.jsonl')).isDirectory(), true);
  assert.equal(fs.readFileSync(path.join(this.projectRoot!, 'outside.jsonl'), 'utf8'), 'keep');
  assert.equal(fs.readFileSync(this.escapedTarget!, 'utf8'), 'escaped-keep');
  assert.equal(fs.lstatSync(path.join(journalDir(this.projectRoot!), '2026-02-02.jsonl')).isSymbolicLink(), true);
  assert.equal(fs.existsSync(this.journalResult!), true);
});

Given(/^a dependency absent installed cache and a separate real project containing specs$/, function (this: JournalWorld) {
  this.pluginRoot = makeProject(path.join(this.tempDir, 'dependency-absent-cache'), false);
  this.projectRoot = makeProject(path.join(this.tempDir, 'real-project'));
  const specDir = path.join(this.projectRoot, '.specs', 'demo');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '# Functional requirements\n\n## FR-1: Demo\n');
});

When(/^the client service and conformance chain processes the project request$/, function (this: JournalWorld) {
  const input = JSON.stringify({ cwd: this.projectRoot, session_id: 'installed-layout', tool_name: 'Write', tool_input: { file_path: '.specs/demo/FR.md' } });
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: this.pluginRoot!, CLAUDE_PROJECT_DIR: this.projectRoot! };
  this.pushOutput = execFileSync(process.execPath, [path.join(process.cwd(), 'tools/spec-conformance-push/spec-conformance-push.bundle.mjs')], { input, env, encoding: 'utf8' });
});

Then(/^every observed read write and delete path is project scoped$/, function (this: JournalWorld) {
  assert.equal(fs.existsSync(path.join(this.projectRoot!, '.dev-pomogator')), true);
  assert.equal(fs.existsSync(path.join(this.pluginRoot!, '.dev-pomogator')), false);
});

Then(/^no dev pomogator state exists below the installed cache$/, function (this: JournalWorld) {
  assert.equal(fs.existsSync(path.join(this.pluginRoot!, '.dev-pomogator')), false);
});
