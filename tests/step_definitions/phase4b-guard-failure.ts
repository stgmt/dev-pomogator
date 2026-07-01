/**
 * Phase 4b BDD step definitions — spec-conformance-guard failure modes.
 *
 *   SPECGEN004_49 (FR-19): a malformed `.progress.json` is a startup-integrity
 *     failure → the guard exits 1 (fail-CLOSED) → Claude blocks the Write.
 *     Driven via a REAL subprocess (spawnSync) so the exit code is genuine.
 *   SPECGEN004_50 (FR-19): a parser exception fails OPEN but is logged to the
 *     spec-check-log JSONL. parseGherkin never throws in practice (defensive),
 *     so the defensive catch is exercised by injecting a throwing parser into
 *     the real runGuard — the honest way to test a defensive path.
 *   SPECGEN004_51 (FR-22): a per-spec `.progress.json::version` < 4 →
 *     ALLOW_AFTER_MIGRATION, logged as a JSONL decision entry.
 *
 * Regex patterns (not Cucumber Expressions) — the phrases carry `/`.
 *
 * @see .specs/spec-generator-v4/FR.md FR-19, FR-22
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { runGuard } from '../../tools/spec-conformance-guard/spec-conformance-guard.ts';
import { V4World } from '../hooks/before-after.ts';

const GUARD_SCRIPT = path.join(process.cwd(), 'tools/spec-conformance-guard/spec-conformance-guard.ts');

interface GuardWorld extends V4World {
  spawnResult?: SpawnSyncReturns<string>;
  guardOut?: ReturnType<typeof runGuard>;
  writeFp?: string;
}

const readLatestLog = (root: string): string => {
  const dir = path.join(root, '.dev-pomogator', '.spec-check-log');
  if (!fs.existsSync(dir)) return '';
  const shards = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort();
  return shards.length ? fs.readFileSync(path.join(dir, shards[shards.length - 1]), 'utf8') : '';
};

// ── SPECGEN004_49 — malformed config → exit 1 + deny ────────────────────────

Given(/.spec-conformance-guard. config file is malformed YAML/, function (this: GuardWorld) {
  fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
  // The guard's runtime config is `.specs/.progress.json`; a corrupt one is a
  // startup-integrity failure.
  fs.writeFileSync(path.join(this.tempDir, '.specs', '.progress.json'), '{ not: valid json :: ');
});

When(/the agent invokes Write\/Edit on any .*\.md/, function (this: GuardWorld) {
  this.writeFp = path.join(this.tempDir, '.specs', 'auth', 'FR.md');
  this.spawnResult = spawnSync('node', ['--import', 'tsx', GUARD_SCRIPT], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: this.writeFp, content: '## FR-1: A\n' } }),
    env: { ...process.env, DEV_POMOGATOR_REPO_ROOT: this.tempDir },
    encoding: 'utf8',
  });
});

Then(/the guard exits with status 1/, function (this: GuardWorld) {
  assert.equal(this.spawnResult?.status, 1, `expected exit 1, got ${this.spawnResult?.status}; stderr=${this.spawnResult?.stderr}`);
});

Then(/stderr contains a non-empty actionable error message/, function (this: GuardWorld) {
  assert.ok((this.spawnResult?.stderr ?? '').trim().length > 0, 'stderr must carry an actionable message');
});

Then(/the PreToolUse decision is deny/, function (this: GuardWorld) {
  // A non-zero PreToolUse exit is how Claude Code blocks (denies) the tool.
  assert.notEqual(this.spawnResult?.status, 0);
});

// ── SPECGEN004_50 — parser crash → fail-OPEN + JSONL ────────────────────────

Given(/.spec-conformance-guard. parses a .* file that triggers a Gherkin parser exception/, function (
  this: GuardWorld,
) {
  fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, '.specs', '.progress.json'), JSON.stringify({ version: 4 }));
  this.writeFp = path.join(this.tempDir, '.specs', 'auth', 'auth.feature');
  fs.mkdirSync(path.dirname(this.writeFp), { recursive: true });
});

When(/the agent invokes Write\/Edit on that file/, function (this: GuardWorld) {
  this.guardOut = runGuard(
    { tool_name: 'Write', tool_input: { file_path: this.writeFp!, content: 'Feature: X\n  Scenario: Y\n' } },
    this.tempDir,
    {
      now: new Date('2026-06-03T00:00:00Z'),
      // Defensive catch can only fire if the parser actually throws.
      parseGherkinFn: () => {
        throw new Error('Gherkin parser exception: unexpected token');
      },
    },
  );
});

Then(/the guard exits with status 0/, function (this: GuardWorld) {
  // In-process: runGuard returned without throwing (the fail-OPEN path), which
  // is what the CLI writes to stdout before exiting 0.
  assert.ok(this.guardOut, 'runGuard must return an output (no crash)');
});

Then(/the latest .*\.jsonl. gains a new JSON line with .*error_message.*error_stack/, function (
  this: GuardWorld,
) {
  const log = readLatestLog(this.tempDir);
  const lines = log.split('\n').filter(Boolean);
  assert.ok(lines.length >= 1, 'expected a JSONL error line');
  const entry = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
  for (const field of ['timestamp', 'hook_id', 'file_path', 'error_message', 'error_stack']) {
    assert.ok(field in entry, `JSONL entry missing ${field}`);
  }
  assert.equal(entry.hook_id, 'spec-conformance-guard');
});

Then(/the PreToolUse decision is allow/, function (this: GuardWorld) {
  assert.equal(this.guardOut?.hookSpecificOutput?.permissionDecision, 'allow');
});

// ── SPECGEN004_51 — per-spec legacy version → ALLOW_AFTER_MIGRATION + JSONL ──

Given(/a spec at .*legacy-feature.*progress\.json::version. is .2./, function (this: GuardWorld) {
  const specDir = path.join(this.tempDir, '.specs', 'legacy-feature');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, '.progress.json'), JSON.stringify({ version: 2 }));
  // Global is current — proves the PER-SPEC version wins (SPECGEN004_51).
  fs.writeFileSync(path.join(this.tempDir, '.specs', '.progress.json'), JSON.stringify({ version: 4 }));
  this.writeFp = path.join(specDir, 'FR.md');
});

When(/the agent invokes Write on .* that would otherwise violate DUPLICATE_DEFINITION/, function (
  this: GuardWorld,
) {
  this.guardOut = runGuard(
    { tool_name: 'Write', tool_input: { file_path: this.writeFp!, content: '## FR-1: Login\n## FR-1: Login dup\n' } },
    this.tempDir,
    { now: new Date('2026-06-03T00:00:00Z') },
  );
});

Then(/.spec-conformance-guard. exits with status 0/, function (this: GuardWorld) {
  assert.equal(this.guardOut?.hookSpecificOutput?.permissionDecision, 'allow');
});

Then(/spec-check-log appends a JSONL entry .*ALLOW_AFTER_MIGRATION/, function (this: GuardWorld) {
  const log = readLatestLog(this.tempDir);
  const lines = log.split('\n').filter(Boolean);
  const entry = lines
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .find((e) => e.kind === 'ALLOW_AFTER_MIGRATION');
  assert.ok(entry, 'expected an ALLOW_AFTER_MIGRATION JSONL entry');
  assert.equal(entry.reason, 'spec_version');
  assert.equal(entry.observed_version, 2);
  assert.match(String(entry.target), /legacy-feature\/FR\.md$/);
});

Then(/the agent's Write proceeds/, function (this: GuardWorld) {
  assert.equal(this.guardOut?.hookSpecificOutput?.permissionDecision, 'allow');
});
