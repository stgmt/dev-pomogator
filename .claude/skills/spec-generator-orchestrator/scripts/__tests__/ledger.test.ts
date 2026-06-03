/**
 * Tests for the orchestrator self-improve ledger (FR-33 / AC-33.2..33.4).
 * Real file I/O against a tmpdir — no mocks.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  appendPendingEntry,
  readLedger,
  pendingReminder,
  applyApproved,
  ledgerPath,
} from '../ledger.ts';

const SLUG = 'demo-spec';

describe('self-improve ledger', () => {
  let root: string;
  let specDir: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `ledger-${randomUUID()}`);
    specDir = path.join(root, '.specs', SLUG);
    fs.mkdirSync(specDir, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const seed = (observation: string, when: string): void =>
    void appendPendingEntry(
      root,
      SLUG,
      { trigger: 'friction', observation, proposed_change: 'x', affected_files: ['SKILL.md'] },
      new Date(when),
    );

  it('appendPendingEntry writes a dated pending entry and nothing else (AC-33.2)', () => {
    fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1\n');
    const before = fs.readFileSync(path.join(specDir, 'FR.md'), 'utf8');
    const entry = appendPendingEntry(
      root, SLUG,
      { trigger: 'gap', observation: 'obs', proposed_change: 'pc', affected_files: ['a', 'b'] },
      new Date('2026-06-03T00:00:00Z'),
    );
    expect(entry.status).toBe('pending');
    expect(entry.date).toBe('2026-06-03');
    expect(entry.affected_files).toEqual(['a', 'b']);
    // No spec/code mutation.
    expect(fs.readFileSync(path.join(specDir, 'FR.md'), 'utf8')).toBe(before);
    expect(fs.existsSync(ledgerPath(root, SLUG))).toBe(true);
  });

  it('readLedger round-trips multiple entries with their fields', () => {
    seed('first', '2026-06-03T00:00:00Z');
    seed('second', '2026-06-03T01:00:00Z');
    const entries = readLedger(root, SLUG);
    expect(entries.map((e) => e.observation)).toEqual(['first', 'second']);
    expect(entries.every((e) => e.status === 'pending')).toBe(true);
  });

  it('pendingReminder returns the count + top observations, most-recent first (AC-33.3)', () => {
    seed('older', '2026-06-03T00:00:00Z');
    seed('newer', '2026-06-03T01:00:00Z');
    const rem = pendingReminder(root, SLUG, 2);
    expect(rem.count).toBe(2);
    expect(rem.observations).toEqual(['newer', 'older']);
  });

  it('applyApproved flips approved→applied with a date, leaves pending (AC-33.4)', () => {
    seed('to-approve', '2026-06-03T00:00:00Z');
    seed('stays-pending', '2026-06-03T01:00:00Z');
    // Human approves the first.
    const file = ledgerPath(root, SLUG);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('- status: pending', '- status: approved'));

    const res = applyApproved(root, SLUG, new Date('2026-06-03T02:00:00Z'));
    expect(res.applied).toHaveLength(1);
    expect(res.applied[0].status).toBe('applied');
    expect(res.applied[0].applied_at).toBe('2026-06-03');
    expect(res.leftPending).toBe(1);
    expect(readLedger(root, SLUG).map((e) => e.status).sort()).toEqual(['applied', 'pending']);
  });

  it('applyApproved never touches a pending-only ledger', () => {
    seed('only-pending', '2026-06-03T00:00:00Z');
    const res = applyApproved(root, SLUG, new Date());
    expect(res.applied).toHaveLength(0);
    expect(res.leftPending).toBe(1);
    expect(readLedger(root, SLUG)[0].status).toBe('pending');
  });
});
