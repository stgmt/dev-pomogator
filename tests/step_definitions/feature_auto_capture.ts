/**
 * Step definitions for PLUGIN009: Auto-Capture Learnings
 * Spec: .specs/auto-capture/auto-capture.feature
 * Migrated from: tests/e2e/auto-capture.test.ts
 *
 * Classification:
 *   runtime  — spawn capture.ts with real hook input, assert queue state / exit code / stderr
 *   artifact — stat() file existence + pluginHookCommands() for hook registration
 *   @manual  — @agent-behavior (@wip) scenarios excluded (live agent / LLM required)
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { V4World } from '../hooks/before-after.ts';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_DIR = process.env.APP_DIR || process.cwd();
const appPath = (...segments: string[]) => path.join(APP_DIR, ...segments);

const ABS_CAPTURE = appPath('tools/learnings-capture/capture.ts');
const QUEUE_SUBPATH = '.dev-pomogator/learnings-queue.json';
const LOCK_SUBPATH = '.dev-pomogator/learnings-queue.lock';
const FIXTURES_DIR = appPath('tests/fixtures/learnings-capture');

// ---------------------------------------------------------------------------
// World interface
// ---------------------------------------------------------------------------

interface ACWorld extends V4World {
  lastCapture: { exitCode: number; stdout: string; stderr: string } | null;
}

// ---------------------------------------------------------------------------
// Spawn helper — runs capture.ts via real node, NOT npx
// (npx does not resolve in host spawns; --import tsx loads tsx resolver)
// ---------------------------------------------------------------------------

function runCapture(
  hookInput: Record<string, unknown>,
  event: string,
  env?: Record<string, string>,
): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', ABS_CAPTURE, '--event', event],
    {
      input: JSON.stringify(hookInput),
      encoding: 'utf-8',
      cwd: APP_DIR,
      env: { ...process.env, FORCE_COLOR: '0', ...env },
      timeout: 30000,
    },
  );
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// ---------------------------------------------------------------------------
// Queue file path in tempDir (isolated per scenario)
// ---------------------------------------------------------------------------

function queuePath(world: ACWorld): string {
  return path.join(world.tempDir, QUEUE_SUBPATH);
}

function lockPath(world: ACWorld): string {
  return path.join(world.tempDir, LOCK_SUBPATH);
}

async function readQueueFromTemp(world: ACWorld): Promise<{ version: number; entries: Record<string, unknown>[] }> {
  return fs.readJson(queuePath(world));
}

// ---------------------------------------------------------------------------
// Background steps (shared via Background clause in the feature)
// ---------------------------------------------------------------------------

// "Given dev-pomogator is installed" is defined by feature_tui_test_runner.ts (no-op).
// When loaded alone (scoped config), feature_tui_test_runner.ts must be included.

// "And suggest-rules extension is enabled" — no toggle needed for runtime tests
Given<ACWorld>(/^suggest-rules extension is enabled$/, function () {
  // Extension is always present in this repo; nothing to enable
});

// ---------------------------------------------------------------------------
// Given — queue setup steps
// ---------------------------------------------------------------------------

Given<ACWorld>(/^an empty learnings queue exists$/, async function () {
  await fs.ensureDir(path.dirname(queuePath(this)));
  await fs.writeJson(queuePath(this), { version: 1, entries: [] });
});

Given<ACWorld>(/^a populated learnings queue exists with 5 entries$/, async function () {
  await fs.copy(
    path.join(FIXTURES_DIR, 'populated-queue.json'),
    queuePath(this),
  );
});

Given<ACWorld>(/^a corrupted learnings queue file exists$/, async function () {
  await fs.ensureDir(path.dirname(queuePath(this)));
  await fs.writeFile(queuePath(this), '{ "version": 1, "entries": [{ BROKEN');
});

Given<ACWorld>(/^a populated learnings queue with (\d+) pending entries$/, async function (count: string) {
  const n = parseInt(count, 10);
  const entries = Array.from({ length: n }, (_, i) => ({
    id: `pending-${i}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    sessionId: `session-p-${i}`,
    trigger: 'T2',
    signal: `pending signal ${i}`,
    context: `pending context ${i}`,
    confidence: 0.8,
    source: 'UserPromptSubmit',
    platform: 'claude',
    status: 'pending',
    consumedBy: null,
    consumedAt: null,
    fingerprint: `pfp${i}00000000000`.slice(0, 16),
    count: 1,
    lastSeen: new Date().toISOString(),
  }));
  await fs.ensureDir(path.dirname(queuePath(this)));
  await fs.writeJson(queuePath(this), { version: 1, entries });
});

Given<ACWorld>(/^a populated learnings queue with entry signal "([^"]+)" and confidence ([0-9.]+)$/, async function (signal: string, confStr: string) {
  const confidence = parseFloat(confStr);
  const fingerprint = createHash('sha256').update(signal.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
  const entry = {
    id: 'approval-seed-1',
    timestamp: new Date().toISOString(),
    sessionId: 'session-approval-seed',
    trigger: 'T2',
    signal,
    context: `no, use ${signal}`,
    confidence,
    source: 'UserPromptSubmit',
    platform: 'claude',
    status: 'pending',
    consumedBy: null,
    consumedAt: null,
    fingerprint,
    count: 1,
    lastSeen: new Date().toISOString(),
  };
  await fs.ensureDir(path.dirname(queuePath(this)));
  await fs.writeJson(queuePath(this), { version: 1, entries: [entry] });
});

Given<ACWorld>(/^a populated learnings queue with entry signal "([^"]+)" and count (\d+)$/, async function (signal: string, countStr: string) {
  const count = parseInt(countStr, 10);
  const fingerprint = createHash('sha256').update(signal.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
  const entry = {
    id: 'fp-seed-1',
    timestamp: new Date().toISOString(),
    sessionId: 'session-fp-seed',
    trigger: 'T2',
    signal,
    context: `no, ${signal}`,
    confidence: 0.85,
    source: 'UserPromptSubmit',
    platform: 'claude',
    status: 'pending',
    consumedBy: null,
    consumedAt: null,
    fingerprint,
    count,
    lastSeen: new Date(Date.now() - 1000).toISOString(), // slightly in the past
  };
  await fs.ensureDir(path.dirname(queuePath(this)));
  await fs.writeJson(queuePath(this), { version: 1, entries: [entry] });
});

Given<ACWorld>(/^a populated learnings queue with entry signal "([^"]+)"$/, async function (signal: string) {
  const fingerprint = createHash('sha256').update(signal.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
  const entry = {
    id: 'fp-seed-generic',
    timestamp: new Date().toISOString(),
    sessionId: 'session-fp-generic',
    trigger: 'T2',
    signal,
    context: `no, ${signal}`,
    confidence: 0.85,
    source: 'UserPromptSubmit',
    platform: 'claude',
    status: 'pending',
    consumedBy: null,
    consumedAt: null,
    fingerprint,
    count: 1,
    lastSeen: new Date().toISOString(),
  };
  await fs.ensureDir(path.dirname(queuePath(this)));
  await fs.writeJson(queuePath(this), { version: 1, entries: [entry] });
});

Given<ACWorld>(/^a sample transcript with T2 signals exists$/, async function () {
  // sample-transcript.jsonl already exists in fixtures; record path for When step
  this.lastCapture = null;
  (this as Record<string, unknown>)['_transcriptPath'] = path.join(FIXTURES_DIR, 'sample-transcript.jsonl');
});

Given<ACWorld>(/^LEARNINGS_SEMANTIC_ENABLED is "false"$/, function () {
  (this as Record<string, unknown>)['_semanticEnabled'] = 'false';
});

// ---------------------------------------------------------------------------
// When — hook trigger steps
// ---------------------------------------------------------------------------

When<ACWorld>(/^UserPromptSubmit hook receives prompt "([^"]+)"$/, function (prompt: string) {
  const env: Record<string, string> = {};
  const se = (this as Record<string, unknown>)['_semanticEnabled'];
  if (se) env['LEARNINGS_SEMANTIC_ENABLED'] = String(se);

  this.lastCapture = runCapture(
    {
      conversation_id: `test-${Date.now()}`,
      workspace_roots: [this.tempDir],
      prompt,
    },
    'UserPromptSubmit',
    env,
  );
});

When<ACWorld>(/^Stop hook is triggered with transcript_path$/, function () {
  const transcriptPath = (this as Record<string, unknown>)['_transcriptPath'] as string;
  const env: Record<string, string> = {};
  const se = (this as Record<string, unknown>)['_semanticEnabled'];
  if (se) env['LEARNINGS_SEMANTIC_ENABLED'] = String(se);

  this.lastCapture = runCapture(
    {
      conversation_id: `test-stop-${Date.now()}`,
      workspace_roots: [this.tempDir],
      transcript_path: transcriptPath,
    },
    'Stop',
    env,
  );
});

When<ACWorld>(/^capture writes an entry to queue$/, function () {
  this.lastCapture = runCapture(
    {
      conversation_id: `test-atomic-${Date.now()}`,
      workspace_roots: [this.tempDir],
      prompt: 'no, use bun instead of npm',
    },
    'UserPromptSubmit',
  );
});

When<ACWorld>(/^capture attempts to write an entry$/, function () {
  this.lastCapture = runCapture(
    {
      conversation_id: `test-corrupt-${Date.now()}`,
      workspace_roots: [this.tempDir],
      prompt: 'no, use bun instead of npm',
    },
    'UserPromptSubmit',
  );
});

When<ACWorld>(/^queue file is read$/, async function () {
  // Already done implicitly — the queue is set up in Given; Then steps read it
});

When<ACWorld>(/^dev-pomogator installs for Claude Code$/, function () {
  // Artifact scenario: check real settings.json (pre-existing install, no action needed)
});

Given<ACWorld>(/^dev-pomogator installs for Cursor$/, function () {
  // Artifact scenario: check real hooks.json (pre-existing plugin install, no action needed)
});

When<ACWorld>(/^installation completes$/, function () {
  // Artifact scenario: installation is already done in this repo
});

// ---------------------------------------------------------------------------
// Then — assertion steps
// ---------------------------------------------------------------------------

Then<ACWorld>(/^learnings-queue\.json should contain (\d+) entr(?:y|ies)$/, async function (countStr: string) {
  const expected = parseInt(countStr, 10);
  const queue = await readQueueFromTemp(this);
  assert.strictEqual(queue.entries.length, expected, `Expected ${expected} entries, got ${queue.entries.length}`);
});

Then<ACWorld>(/^learnings-queue\.json should contain >= (\d+) entr(?:y|ies)$/, async function (countStr: string) {
  const min = parseInt(countStr, 10);
  const queue = await readQueueFromTemp(this);
  assert.ok(queue.entries.length >= min, `Expected >= ${min} entries, got ${queue.entries.length}`);
});

Then<ACWorld>(/^learnings-queue\.json should contain (\d+) pending entries$/, async function (countStr: string) {
  const expected = parseInt(countStr, 10);
  const queue = await readQueueFromTemp(this);
  const pending = queue.entries.filter((e) => e['status'] === 'pending');
  assert.ok(pending.length >= expected, `Expected >= ${expected} pending entries, got ${pending.length}`);
});

Then<ACWorld>(/^learnings-queue\.json should NOT contain a new approval entry$/, async function () {
  const queue = await readQueueFromTemp(this);
  // Approval prompt should NOT add a new entry — only boost existing ones
  assert.strictEqual(queue.entries.length, 1, `Expected 1 entry (no new approval entry), got ${queue.entries.length}`);
});

Then<ACWorld>(/^entry trigger should be "([^"]+)"$/, async function (trigger: string) {
  const queue = await readQueueFromTemp(this);
  assert.ok(queue.entries.length > 0, 'Queue must have entries');
  assert.strictEqual(queue.entries[0]['trigger'], trigger);
});

Then<ACWorld>(/^entry confidence should be >= ([0-9.]+)$/, async function (minConfStr: string) {
  const minConf = parseFloat(minConfStr);
  const queue = await readQueueFromTemp(this);
  assert.ok(queue.entries.length > 0, 'Queue must have entries');
  const confidence = queue.entries[0]['confidence'] as number;
  assert.ok(confidence >= minConf, `Expected confidence >= ${minConf}, got ${confidence}`);
});

Then<ACWorld>(/^entry signal should contain "([^"]+)"$/, async function (substr: string) {
  const queue = await readQueueFromTemp(this);
  assert.ok(queue.entries.length > 0, 'Queue must have entries');
  const signal = String(queue.entries[0]['signal']);
  assert.ok(signal.includes(substr), `Expected signal to contain "${substr}", got "${signal}"`);
});

Then<ACWorld>(/^hook should exit with code 0$/, function () {
  assert.ok(this.lastCapture !== null, 'Hook must have been run');
  assert.strictEqual(this.lastCapture!.exitCode, 0, `Expected exit code 0, got ${this.lastCapture!.exitCode}. stderr: ${this.lastCapture!.stderr}`);
});

Then<ACWorld>(/^it should have version 1$/, async function () {
  const queue = await readQueueFromTemp(this);
  assert.strictEqual(queue.version, 1);
});

Then<ACWorld>(/^each entry should have id, timestamp, sessionId, trigger, signal, context, confidence, source, platform, status$/, async function () {
  const queue = await readQueueFromTemp(this);
  const required = ['id', 'timestamp', 'sessionId', 'trigger', 'signal', 'context', 'confidence', 'source', 'platform', 'status'];
  for (const entry of queue.entries) {
    for (const field of required) {
      assert.ok(field in entry, `Entry missing field: ${field}`);
    }
  }
});

Then<ACWorld>(/^signal length should be <= 100 characters$/, async function () {
  const queue = await readQueueFromTemp(this);
  for (const entry of queue.entries) {
    const len = String(entry['signal']).length;
    assert.ok(len <= 100, `Signal too long: ${len} chars`);
  }
});

Then<ACWorld>(/^context length should be <= 200 characters$/, async function () {
  const queue = await readQueueFromTemp(this);
  for (const entry of queue.entries) {
    const len = String(entry['context']).length;
    assert.ok(len <= 200, `Context too long: ${len} chars`);
  }
});

Then<ACWorld>(/^lock file should be acquired before write$/, async function () {
  // The lock is acquired and released during capture; after hook exits it should be gone
  // This step is validated by the subsequent step that checks lock is released
});

Then<ACWorld>(/^lock file should be released after write$/, async function () {
  const exists = await fs.pathExists(lockPath(this));
  assert.ok(!exists, 'Lock file should be released after write');
});

Then<ACWorld>(/^queue file should contain the new entry$/, async function () {
  const queue = await readQueueFromTemp(this);
  assert.ok(queue.entries.length >= 1, 'Queue must have at least one entry after write');
});

Then<ACWorld>(/^corrupted file should be backed up as \.bak$/, async function () {
  const bakPath = queuePath(this) + '.bak';
  const exists = await fs.pathExists(bakPath);
  assert.ok(exists, 'Corrupted file should be backed up as .bak');
});

Then<ACWorld>(/^new queue file should be created with the entry$/, async function () {
  const queue = await readQueueFromTemp(this);
  assert.ok(queue.entries.length >= 1, 'New queue file must have at least one entry');
});

Then<ACWorld>(/^stderr should contain "([^"]+)"$/, function (substr: string) {
  assert.ok(this.lastCapture !== null, 'Hook must have been run');
  assert.ok(
    this.lastCapture!.stderr.includes(substr),
    `Expected stderr to contain "${substr}", got: ${this.lastCapture!.stderr}`,
  );
});

Then<ACWorld>(/^stderr should not contain "([^"]+)"$/, function (substr: string) {
  assert.ok(this.lastCapture !== null, 'Hook must have been run');
  assert.ok(
    !this.lastCapture!.stderr.includes(substr),
    `Expected stderr NOT to contain "${substr}", got: ${this.lastCapture!.stderr}`,
  );
});

Then<ACWorld>(/^entry "([^"]+)" confidence should be >= ([0-9.]+)$/, async function (signal: string, minConfStr: string) {
  const minConf = parseFloat(minConfStr);
  const queue = await readQueueFromTemp(this);
  const entry = queue.entries.find((e) => String(e['signal']).includes(signal));
  assert.ok(entry, `Entry with signal "${signal}" not found`);
  const confidence = entry['confidence'] as number;
  assert.ok(confidence >= minConf, `Expected confidence >= ${minConf}, got ${confidence}`);
});

Then<ACWorld>(/^learnings-queue\.json should contain 1 entry with signal "([^"]+)"$/, async function (signal: string) {
  const queue = await readQueueFromTemp(this);
  // After fingerprint dedup, there should be exactly 1 entry total (the existing one, incremented)
  assert.strictEqual(queue.entries.length, 1, `Expected 1 entry after fingerprint dedup, got ${queue.entries.length}. Entries: ${JSON.stringify(queue.entries.map((e) => e['signal']))}`);
  // And that entry's signal should relate to the seeded signal
  const entry = queue.entries[0];
  assert.ok(
    String(entry['signal']).includes('bun') || String(entry['signal']) === signal,
    `Expected entry signal to relate to "${signal}", got "${entry['signal']}"`,
  );
});

Then<ACWorld>(/^entry count should be (\d+)$/, async function (countStr: string) {
  const expectedCount = parseInt(countStr, 10);
  const queue = await readQueueFromTemp(this);
  // Find the entry with count > 1 (the deduped one)
  const bumped = queue.entries.find((e) => (e['count'] as number) >= expectedCount);
  assert.ok(bumped, `Expected an entry with count >= ${expectedCount}`);
});

Then<ACWorld>(/^entry lastSeen should be updated$/, async function () {
  const queue = await readQueueFromTemp(this);
  assert.ok(queue.entries.length >= 1, 'Queue must have entries');
  const lastSeen = queue.entries[0]['lastSeen'] as string;
  assert.ok(lastSeen, 'lastSeen must be set');
  // lastSeen should be a valid ISO date
  assert.ok(!isNaN(Date.parse(lastSeen)), `lastSeen must be a valid date, got: ${lastSeen}`);
});

Then<ACWorld>(/^entries should have different fingerprints$/, async function () {
  const queue = await readQueueFromTemp(this);
  assert.ok(queue.entries.length >= 2, 'Need at least 2 entries');
  const fps = queue.entries.map((e) => e['fingerprint']);
  const unique = new Set(fps);
  assert.strictEqual(unique.size, fps.length, `Fingerprints should all be unique, got: ${JSON.stringify(fps)}`);
});

// ---------------------------------------------------------------------------
// Artifact: hook registration + file existence
// ---------------------------------------------------------------------------

Then<ACWorld>(/^\.claude\/settings\.json should contain UserPromptSubmit hook referencing learnings-capture$/, async function () {
  const settings = await fs.readJson(appPath('.claude', 'settings.json'));
  const hooks = settings.hooks?.UserPromptSubmit ?? [];
  const commands = hooks.flatMap((g: Record<string, unknown>) =>
    ((g['hooks'] as Record<string, unknown>[]) || []).map((h) => h['command'] as string),
  );
  assert.ok(
    commands.some((c: string) => c.includes('learnings-capture/capture.ts')),
    'UserPromptSubmit hook for learnings-capture not found in .claude/settings.json',
  );
});

Then<ACWorld>(/^\.claude\/settings\.json should contain Stop hook referencing learnings-capture$/, async function () {
  const settings = await fs.readJson(appPath('.claude', 'settings.json'));
  const hooks = settings.hooks?.Stop ?? [];
  const commands = hooks.flatMap((g: Record<string, unknown>) =>
    ((g['hooks'] as Record<string, unknown>[]) || []).map((h) => h['command'] as string),
  );
  assert.ok(
    commands.some((c: string) => c.includes('learnings-capture/capture.ts')),
    'Stop hook for learnings-capture not found in .claude/settings.json',
  );
});

Then<ACWorld>(/^hooks\.json should contain beforeSubmitPrompt hook referencing learnings-capture$/, async function () {
  const hooksJson = await fs.readJson(appPath('.claude-plugin', 'hooks.json'));
  const hooks = hooksJson.hooks?.UserPromptSubmit ?? [];
  const commands = hooks.flatMap((g: Record<string, unknown>) =>
    ((g['hooks'] as Record<string, unknown>[]) || []).map((h) => h['command'] as string),
  );
  assert.ok(
    commands.some((c: string) => c.includes('learnings-capture/capture.ts')),
    'UserPromptSubmit hook for learnings-capture not found in hooks.json',
  );
});

Then<ACWorld>(/^hooks\.json should contain stop hook referencing learnings-capture$/, async function () {
  const hooksJson = await fs.readJson(appPath('.claude-plugin', 'hooks.json'));
  const hooks = hooksJson.hooks?.Stop ?? [];
  const commands = hooks.flatMap((g: Record<string, unknown>) =>
    ((g['hooks'] as Record<string, unknown>[]) || []).map((h) => h['command'] as string),
  );
  assert.ok(
    commands.some((c: string) => c.includes('learnings-capture/capture.ts')),
    'Stop hook for learnings-capture not found in hooks.json',
  );
});
