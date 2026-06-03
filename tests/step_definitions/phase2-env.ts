/**
 * Phase 2 / FR-14 + FR-16 BDD step definitions — multi-environment behaviour.
 * Covers SPECGEN004_31 (MCP returns repo-relative paths) and SPECGEN004_33
 * (second MCP start in a DIFFERENT env is denied) against the REAL builder +
 * lock-manager — no mocks.
 *
 *   _31 builds a real SpecGraph from an absolute tmpdir repoRoot (the stand-in
 *       for a bind-mounted /workspace) and asserts get_trace leaks no absolute
 *       path — this exercises parseMarkdownFile's path.relative relativisation,
 *       not a hand-built relative fixture.
 *   _33 writes a live host lock, then calls acquireLock from a container env
 *       and asserts the env-mismatch deny + that session A's lock is intact
 *       (no takeover ⇒ no second server could have spawned).
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_31, _33
 * @see ../../tools/spec-graph/builder.ts (path relativisation)
 * @see ../../tools/spec-mcp-server/lock-manager.ts (acquireLock env gate)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { acquireLock, readLock, type LockHandle } from '../../tools/spec-mcp-server/lock-manager.ts';
import { startLifecycle, type LifecycleHandle } from '../../tools/spec-mcp-server/lifecycle.ts';

interface EnvWorld extends V4World {
  traceResponse?: unknown;
  lockError?: Error & { code?: string; envMismatch?: boolean };
  sessionAHandle?: LockHandle;
  lifecycle?: LifecycleHandle;
}

/** Absolute path = Windows drive (`D:\` / `C:/`) or POSIX root (`/workspace`). */
const ABS_PATH = /^(?:[A-Za-z]:[\\/]|\/)/;

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}

function absolutePathsIn(response: unknown): string[] {
  const strings: string[] = [];
  collectStrings(response, strings);
  return strings.filter((s) => ABS_PATH.test(s));
}

// ── SPECGEN004_31 — MCP returns relative paths in tool responses ────────────

Given(/runs inside a VS Code devcontainer with bind-mounted workspace/, function (this: EnvWorld) {
  // The tmpDir (an absolute host path) stands in for the bind-mounted
  // /workspace. Seed a real spec so get_trace has FR + AC + Scenario + Task
  // file fields to relativise.
  const specDir = path.join(this.tempDir, '.specs', 'auth');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-001: Login\n\nThe system SHALL authenticate users.\n');
  fs.writeFileSync(
    path.join(specDir, 'ACCEPTANCE_CRITERIA.md'),
    '## AC-001 (FR-001)\n\nWHEN a user submits credentials THEN the system SHALL grant access.\n',
  );
  fs.writeFileSync(
    path.join(specDir, 'TASKS.md'),
    '## Tasks\n\n- [ ] Implement login flow for FR-001 — id: T-1 — Status: todo\n',
  );
  const featDir = path.join(this.tempDir, 'tests', 'features');
  fs.mkdirSync(featDir, { recursive: true });
  fs.writeFileSync(
    path.join(featDir, 'auth.feature'),
    '@FR-001\nFeature: Auth\n  Scenario: SPECGEN-login\n    Given a user\n    When they log in\n    Then access is granted\n',
  );
});

When(/agent calls .get_trace\("FR-001"\). from inside the container/, async function (this: EnvWorld) {
  const graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
  const tool = buildToolRegistry(() => graph).find((t) => t.name === 'get_trace')!;
  const res = await tool.handler({ node_id: 'FR-001' });
  this.traceResponse = JSON.parse(res.content[0].text);
});

Then(/all file paths in response are relative to repo root/, function (this: EnvWorld) {
  // The node itself must resolve to a relative file — proves the FR was found
  // and its path relativised (not an empty / absent response).
  const node = (this.traceResponse as { node?: { file?: string } }).node;
  assert.ok(node?.file, 'expected get_trace to return a node with a file');
  assert.ok(!ABS_PATH.test(node.file), `node.file should be repo-relative, got "${node.file}"`);
});

Then(/no absolute paths .* appear in any field/, function (this: EnvWorld) {
  const offenders = absolutePathsIn(this.traceResponse);
  assert.equal(offenders.length, 0, `absolute paths leaked into get_trace response: ${offenders.join(', ')}`);
});

// ── SPECGEN004_33 — second MCP start in a different env is denied ────────────

Given(/session A is running MCP server with .env: "host". in .\.mcp-lock\.json./, function (this: EnvWorld) {
  // Acquire a real host lock owned by THIS (alive) process — session A.
  this.sessionAHandle = acquireLock({ repoRoot: this.tempDir, env: 'host' });
  const held = readLock(this.tempDir);
  assert.equal(held?.env, 'host');
  assert.equal(held?.pid, process.pid);
});

When(/session B tries to start MCP from inside a container on the same worktree/, function (this: EnvWorld) {
  try {
    acquireLock({ repoRoot: this.tempDir, env: 'container:sessionB' });
    assert.fail('expected acquireLock to throw ELOCK_HELD for the env-mismatched second start');
  } catch (err) {
    this.lockError = err as Error & { code?: string; envMismatch?: boolean };
  }
});

Then(/session B detects the existing lock has different .env. tag/, function (this: EnvWorld) {
  assert.equal(this.lockError?.code, 'ELOCK_HELD');
  assert.equal(this.lockError?.envMismatch, true);
});

Then(/session B exits with clear message/, function (this: EnvWorld) {
  const msg = this.lockError?.message ?? '';
  assert.ok(msg.includes('MCP already running in env host'), `message missing env-mismatch lead: ${msg}`);
  assert.ok(msg.includes(`(pid ${process.pid})`), `message missing owner pid: ${msg}`);
  assert.ok(msg.includes('restart Claude Code in same env'), `message missing restart hint: ${msg}`);
});

Then(/no second MCP process is spawned/, function (this: EnvWorld) {
  // acquireLock threw before writing ⇒ session A's record is untouched. An
  // intact lock means no takeover happened, so no second server could start.
  const held = readLock(this.tempDir);
  assert.equal(held?.pid, process.pid, 'session A lock must be intact (no takeover)');
  assert.equal(held?.env, 'host', 'session A env tag must be unchanged');
  this.sessionAHandle?.release();
});

// ── SPECGEN004_32 — chokidar auto-polling fallback when events unreliable ────

Given(/the workspace is bind-mounted from Docker Desktop on Windows/, function (this: EnvWorld) {
  const specDir = path.join(this.tempDir, '.specs', 'auth');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1: Login\n');
});

When(/the MCP server starts and runs touch test/, function () {
  // The lifecycle start happens once the probe outcome is known — see the
  // next step ("the touch event is not received within 500ms"), which injects
  // the unreliable-bind-mount condition that a real Docker-Desktop host hits.
});

When(/the touch event is not received within 500ms/, async function (this: EnvWorld) {
  this.lifecycle = await startLifecycle({
    repoRoot: this.tempDir,
    env: 'host',
    skipNdjson: true,
    autoDetectWatchMode: true,
    watchProbe: async () => false, // touch event never arrives → unreliable
    pollIntervalMs: 1000,
  });
});

Then(/the chokidar watcher auto-falls-back to polling mode .1s interval./, function (this: EnvWorld) {
  assert.equal(this.lifecycle?.watchMode, 'polling');
  assert.equal(this.lifecycle?.pollIntervalMs, 1000);
});

Then(/the decision is logged to .*watcher\.log/, function (this: EnvWorld) {
  const logFile = path.join(this.tempDir, '.dev-pomogator', 'logs', 'watcher.log');
  assert.ok(fs.existsSync(logFile), `expected watcher.log at ${logFile}`);
  const log = fs.readFileSync(logFile, 'utf8');
  assert.match(log, /falling back to polling/);
  assert.match(log, /1000ms interval/);
});

Then(/subsequent file changes are detected via polling/, async function (this: EnvWorld) {
  await new Promise((r) => setTimeout(r, 250));
  fs.writeFileSync(path.join(this.tempDir, '.specs', 'auth', 'FR2.md'), '## FR-2: Logout\n');
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && !this.lifecycle!.graph.nodes.has('FR-2')) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(this.lifecycle!.graph.nodes.has('FR-2'), 'polling watcher should surface FR2.md');
  await this.lifecycle!.shutdown();
});
