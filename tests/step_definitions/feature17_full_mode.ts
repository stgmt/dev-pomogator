// Step definitions for SPECGEN004_339-344 — cross-spec full-mode (FR-17 LLM-judge wrapper).
//
// Drives `runFullMode` from the real production module in-process (injectable spawn,
// no real `claude` binary required). Each scenario gets a fresh tmpdir from the V4World
// Before hook. Regex step patterns throughout — no Cucumber Expressions — to keep
// literals like `/`, `{`, and backticks safe from CE parser.

import fs from 'node:fs';
import path from 'node:path';
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { V4World } from '../hooks/before-after.ts';
import { runFullMode, type FullModeResult } from '../../.claude/skills/cross-spec-reconcile/scripts/full-mode.ts';

// ── World extension ─────────────────────────────────────────────────────────────

interface FullModeWorld extends V4World {
  fullModeReports?: FullModeResult[];
  fullModeSpawnCallCount?: number;
}

// ── FR body fixtures ────────────────────────────────────────────────────────────

const LONG_TEXT_A =
  'User logs in with email and password. System validates credentials against the database, issues a JWT token, and redirects to the dashboard route after the login completes successfully.';
const LONG_TEXT_B =
  'User submits email and password. System checks credentials against the database, issues a JWT token, and redirects to the dashboard for the user after the validation completes correctly.';

// ── helpers ──────────────────────────────────────────────────────────────────────

function seedSpec(root: string, slug: string, files: Record<string, string>): void {
  const dir = path.join(root, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body);
  }
}

// ── Given steps ──────────────────────────────────────────────────────────────────

Given(
  /^two specs each have a FR-1 with long matching prose in the full-mode temp repo$/,
  function (this: FullModeWorld) {
    const root = this.tempDir;
    seedSpec(root, 'spec-a', { 'FR.md': `## FR-1: Auth flow\n${LONG_TEXT_A}\n` });
    seedSpec(root, 'spec-b', { 'FR.md': `## FR-1: Auth flow\n${LONG_TEXT_B}\n` });
  },
);

Given(
  /^two specs each have a shared-namespace FR-1 with long prose in the full-mode temp repo$/,
  function (this: FullModeWorld) {
    const root = this.tempDir;
    seedSpec(root, 'spec-a', { 'FR.md': `## FR-1: Auth\n${LONG_TEXT_A}\n` });
    seedSpec(root, 'spec-b', { 'FR.md': `## FR-1: Auth\n${LONG_TEXT_B}\n` });
  },
);

Given(
  /^three specs each have a FR-1 with long prose in the full-mode temp repo$/,
  function (this: FullModeWorld) {
    const root = this.tempDir;
    seedSpec(root, 'spec-a', { 'FR.md': `## FR-1: A\n${LONG_TEXT_A}\n` });
    seedSpec(root, 'spec-b', { 'FR.md': `## FR-1: B\n${LONG_TEXT_B}\n` });
    seedSpec(root, 'spec-c', { 'FR.md': `## FR-1: C\n${LONG_TEXT_A}\n` });
  },
);

Given(
  /^two specs each have a FR-1 with short bodies in the full-mode temp repo$/,
  function (this: FullModeWorld) {
    const root = this.tempDir;
    seedSpec(root, 'spec-a', { 'FR.md': '## FR-1\nShort.\n' });
    seedSpec(root, 'spec-b', { 'FR.md': '## FR-1\nAlso short.\n' });
  },
);

// ── When steps ───────────────────────────────────────────────────────────────────

When(
  /^runFullMode is called with a spawn that returns DRIFT$/,
  async function (this: FullModeWorld) {
    const root = this.tempDir;
    const fakeSpawn = async (_p: string) =>
      JSON.stringify({ result: 'DRIFT', explanation: 'fake drift', severity: 'error' });
    const reports = await runFullMode({ repoRoot: root, spawn: fakeSpawn, maxCalls: 5 });
    this.fullModeReports = reports;
    this.fullModeSpawnCallCount = 1;
  },
);

When(
  /^runFullMode is called with a spawn that returns NO_DRIFT_DETECTED$/,
  async function (this: FullModeWorld) {
    const root = this.tempDir;
    let calls = 0;
    const fakeSpawn = async (_p: string) => {
      calls++;
      return JSON.stringify({ result: 'NO_DRIFT_DETECTED' });
    };
    const reports = await runFullMode({ repoRoot: root, spawn: fakeSpawn, maxCalls: 5 });
    this.fullModeReports = reports;
    this.fullModeSpawnCallCount = calls;
  },
);

When(
  /^runFullMode is called with shared namespace and a NO_DRIFT spawn$/,
  async function (this: FullModeWorld) {
    const root = this.tempDir;
    let calls = 0;
    const fakeSpawn = async (_p: string) => {
      calls++;
      return JSON.stringify({ result: 'NO_DRIFT_DETECTED' });
    };
    const reports = await runFullMode({
      repoRoot: root,
      spawn: fakeSpawn,
      crossSpecFrNamespace: 'shared',
    });
    this.fullModeReports = reports;
    this.fullModeSpawnCallCount = calls;
  },
);

When(
  /^runFullMode is called with maxCalls=1 against three specs$/,
  async function (this: FullModeWorld) {
    const root = this.tempDir;
    let spawnCalls = 0;
    const fakeSpawn = async (_p: string) => {
      spawnCalls++;
      return JSON.stringify({ result: 'NO_DRIFT_DETECTED' });
    };
    const reports = await runFullMode({ repoRoot: root, spawn: fakeSpawn, maxCalls: 1 });
    this.fullModeReports = reports;
    this.fullModeSpawnCallCount = spawnCalls;
  },
);

When(
  /^runFullMode is called with denyOverrides spec-a=true$/,
  async function (this: FullModeWorld) {
    const root = this.tempDir;
    let spawnCalls = 0;
    const fakeSpawn = async (_p: string) => {
      spawnCalls++;
      return JSON.stringify({ result: 'NO_DRIFT_DETECTED' });
    };
    const denyMap = new Map<string, boolean>([['spec-a', true]]);
    const reports = await runFullMode({
      repoRoot: root,
      spawn: fakeSpawn,
      denyOverrides: denyMap,
    });
    this.fullModeReports = reports;
    this.fullModeSpawnCallCount = spawnCalls;
  },
);

When(
  /^runFullMode is called with default options against two short-body specs$/,
  async function (this: FullModeWorld) {
    const root = this.tempDir;
    let spawnCalls = 0;
    const fakeSpawn = async (_p: string) => {
      spawnCalls++;
      return JSON.stringify({ result: 'NO_DRIFT_DETECTED' });
    };
    const reports = await runFullMode({ repoRoot: root, spawn: fakeSpawn });
    this.fullModeReports = reports;
    this.fullModeSpawnCallCount = spawnCalls;
  },
);

// ── Then steps ────────────────────────────────────────────────────────────────────

Then(
  /^the full-mode result shows subprocess_calls=1 and drift_detected=1$/,
  function (this: FullModeWorld) {
    const reports = this.fullModeReports!;
    assert.equal(reports[0].subprocess_calls, 1);
    assert.equal(reports[0].drift_detected, 1);
  },
);

Then(
  /^a cross-spec\/semantic-drift finding appears in both spec results with severity CRITICAL and suggested_fix containing "fake drift"$/,
  function (this: FullModeWorld) {
    const reports = this.fullModeReports!;
    const drift = reports
      .flatMap((r) => r.findings)
      .filter((f) => f.code === 'cross-spec/semantic-drift');
    assert.ok(drift.length >= 2, `Expected >=2 semantic-drift findings, got ${drift.length}`);
    assert.equal(drift[0].severity, 'CRITICAL');
    assert.ok(
      drift[0].suggested_fix?.includes('fake drift'),
      `suggested_fix should contain 'fake drift', got: ${drift[0].suggested_fix}`,
    );
  },
);

Then(
  /^the full-mode result shows subprocess_calls=1 and drift_detected=0 with no semantic-drift finding$/,
  function (this: FullModeWorld) {
    const reports = this.fullModeReports!;
    assert.equal(reports[0].subprocess_calls, 1);
    assert.equal(reports[0].drift_detected, 0);
    const driftFinding = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/semantic-drift');
    assert.equal(driftFinding, undefined);
  },
);

Then(
  /^the full-mode result still contains a cross-spec\/duplicate-fr-id mechanical finding$/,
  function (this: FullModeWorld) {
    const reports = this.fullModeReports!;
    const codes = new Set(reports.flatMap((r) => r.findings.map((f) => f.code)));
    assert.ok(
      codes.has('cross-spec/duplicate-fr-id'),
      `Expected cross-spec/duplicate-fr-id in findings, got: ${[...codes].join(', ')}`,
    );
  },
);

Then(
  /^only 1 spawn call was made despite having 3 FR pairs$/,
  function (this: FullModeWorld) {
    assert.equal(this.fullModeSpawnCallCount, 1);
  },
);

Then(
  /^0 spawn calls were made and deny_list_skips=1 in the full-mode result$/,
  function (this: FullModeWorld) {
    const reports = this.fullModeReports!;
    assert.equal(this.fullModeSpawnCallCount, 0);
    assert.equal(reports[0].deny_list_skips, 1);
  },
);

Then(
  /^0 spawn calls were made because both FR bodies are shorter than 60 chars$/,
  function (this: FullModeWorld) {
    assert.equal(this.fullModeSpawnCallCount, 0);
  },
);
