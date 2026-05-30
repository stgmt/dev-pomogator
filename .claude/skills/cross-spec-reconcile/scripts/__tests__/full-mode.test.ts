// Tests for cross-spec-reconcile full mode (FR-17 + FR-8).
//
// Verifies the orchestration around `runJudge`:
//   • mechanical findings still ship (full mode is a superset)
//   • semantic-drift fires when injected spawn returns DRIFT
//   • semantic-drift suppressed when mechanical contradictory-fr
//     already flagged the same pair (no double-count)
//   • maxCalls cap is honoured (no runaway)
//   • denyOverrides short-circuit per spec
//
// Uses an injectable `spawn` so no real `claude` binary is invoked.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { runFullMode } from '../full-mode.ts';

function seedSpec(root: string, slug: string, files: Record<string, string>): void {
  const dir = path.join(root, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body);
  }
}

const LONG_TEXT_A =
  'User logs in with email and password. System validates credentials against the database, issues a JWT token, and redirects to the dashboard route after the login completes successfully.';
const LONG_TEXT_B =
  'User submits email and password. System checks credentials against the database, issues a JWT token, and redirects to the dashboard for the user after the validation completes correctly.';

describe('cross-spec-reconcile full mode (LLM-judge wrapper)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `fullmode-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('fires cross-spec/semantic-drift when injected spawn returns DRIFT', async () => {
    seedSpec(root, 'spec-a', { 'FR.md': `## FR-1: Auth flow\n${LONG_TEXT_A}\n` });
    seedSpec(root, 'spec-b', { 'FR.md': `## FR-1: Auth flow\n${LONG_TEXT_B}\n` });
    const fakeSpawn = async (_p: string) =>
      JSON.stringify({ result: 'DRIFT', explanation: 'fake drift', severity: 'error' });
    const reports = await runFullMode({ repoRoot: root, spawn: fakeSpawn, maxCalls: 5 });
    expect(reports[0].subprocess_calls).toBe(1);
    expect(reports[0].drift_detected).toBe(1);
    const drift = reports
      .flatMap((r) => r.findings)
      .filter((f) => f.code === 'cross-spec/semantic-drift');
    // Same finding attached to both specs.
    expect(drift.length).toBeGreaterThanOrEqual(2);
    expect(drift[0].severity).toBe('CRITICAL');
    expect(drift[0].suggested_fix).toContain('fake drift');
  });

  it('does NOT fire semantic-drift when injected spawn returns NO_DRIFT_DETECTED', async () => {
    seedSpec(root, 'spec-a', { 'FR.md': `## FR-1: Auth flow\n${LONG_TEXT_A}\n` });
    seedSpec(root, 'spec-b', { 'FR.md': `## FR-1: Auth flow\n${LONG_TEXT_B}\n` });
    const fakeSpawn = async (_p: string) => JSON.stringify({ result: 'NO_DRIFT_DETECTED' });
    const reports = await runFullMode({ repoRoot: root, spawn: fakeSpawn, maxCalls: 5 });
    expect(reports[0].subprocess_calls).toBe(1);
    expect(reports[0].drift_detected).toBe(0);
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/semantic-drift'),
    ).toBeUndefined();
  });

  it('still ships mechanical findings (full mode is a superset) — shared namespace opt-in', async () => {
    seedSpec(root, 'spec-a', { 'FR.md': `## FR-1: Auth\n${LONG_TEXT_A}\n` });
    seedSpec(root, 'spec-b', { 'FR.md': `## FR-1: Auth\n${LONG_TEXT_B}\n` });
    const fakeSpawn = async (_p: string) => JSON.stringify({ result: 'NO_DRIFT_DETECTED' });
    const reports = await runFullMode({
      repoRoot: root,
      spawn: fakeSpawn,
      crossSpecFrNamespace: 'shared',
    });
    const codes = new Set(reports.flatMap((r) => r.findings.map((f) => f.code)));
    // duplicate-fr-id is the mechanical signal — must still appear in shared ns mode.
    expect(codes.has('cross-spec/duplicate-fr-id')).toBe(true);
  });

  it('honours maxCalls — second pair never triggers spawn', async () => {
    seedSpec(root, 'spec-a', { 'FR.md': `## FR-1: A\n${LONG_TEXT_A}\n` });
    seedSpec(root, 'spec-b', { 'FR.md': `## FR-1: B\n${LONG_TEXT_B}\n` });
    seedSpec(root, 'spec-c', { 'FR.md': `## FR-1: C\n${LONG_TEXT_A}\n` });
    let spawnCalls = 0;
    const fakeSpawn = async (_p: string) => {
      spawnCalls++;
      return JSON.stringify({ result: 'NO_DRIFT_DETECTED' });
    };
    await runFullMode({ repoRoot: root, spawn: fakeSpawn, maxCalls: 1 });
    expect(spawnCalls).toBe(1);
  });

  it('denyOverrides short-circuits spawn per spec', async () => {
    seedSpec(root, 'spec-a', { 'FR.md': `## FR-1: A\n${LONG_TEXT_A}\n` });
    seedSpec(root, 'spec-b', { 'FR.md': `## FR-1: B\n${LONG_TEXT_B}\n` });
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
    expect(spawnCalls).toBe(0);
    expect(reports[0].deny_list_skips).toBe(1);
  });

  it('skips FR pairs with <60-char bodies (no meaningful judging signal)', async () => {
    seedSpec(root, 'spec-a', { 'FR.md': '## FR-1\nShort.\n' });
    seedSpec(root, 'spec-b', { 'FR.md': '## FR-1\nAlso short.\n' });
    let spawnCalls = 0;
    const fakeSpawn = async (_p: string) => {
      spawnCalls++;
      return JSON.stringify({ result: 'NO_DRIFT_DETECTED' });
    };
    await runFullMode({ repoRoot: root, spawn: fakeSpawn });
    expect(spawnCalls).toBe(0);
  });
});
