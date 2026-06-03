/**
 * Unit tests for the PreToolUse HARD guard.
 *
 * Pin the FR-5 + FR-19 + FR-22 contract:
 *   1. Write of a clean FR.md → ALLOW.
 *   2. Write that creates two `## FR-1:` headings → DENY with line numbers.
 *   3. Write of malformed Gherkin → DENY.
 *   4. Version gate FR-22: missing `.progress.json` → ALLOW_AFTER_MIGRATION.
 *   5. Version gate FR-22: version 3 → ALLOW_AFTER_MIGRATION.
 *   6. Edit on a non-spec path → ALLOW (out of scope).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { runGuard, detectHardFindings } from '../spec-conformance-guard.ts';

function writeProgress(root: string, version: number): void {
  const dir = path.join(root, '.specs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.progress.json'), JSON.stringify({ version }));
}

describe('runGuard — version gate (FR-22)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `guard-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('returns ALLOW_AFTER_MIGRATION when .progress.json is absent', () => {
    const out = runGuard(
      { tool_name: 'Write', tool_input: { file_path: '.specs/auth/FR.md', content: '## FR-1: X\n## FR-1: Y\n' } },
      root,
    );
    expect(out.hookSpecificOutput?.permissionDecision).toBe('allow');
    expect(out.hookSpecificOutput?.permissionDecisionReason).toBe('ALLOW_AFTER_MIGRATION');
  });

  it('returns ALLOW_AFTER_MIGRATION when version < 4', () => {
    writeProgress(root, 3);
    const out = runGuard(
      { tool_name: 'Write', tool_input: { file_path: '.specs/auth/FR.md', content: '## FR-1: X\n## FR-1: Y\n' } },
      root,
    );
    expect(out.hookSpecificOutput?.permissionDecisionReason).toBe('ALLOW_AFTER_MIGRATION');
  });
});

describe('runGuard — HARD findings (v4 active)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `guard-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
    writeProgress(root, 4);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('allows a clean MD Write', () => {
    const out = runGuard(
      { tool_name: 'Write', tool_input: { file_path: '.specs/auth/FR.md', content: '## FR-1: Login\n' } },
      root,
    );
    expect(out.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('DENIES Write with duplicate FR-1 + cites both line numbers', () => {
    const content = '## FR-1: First\n\n## FR-1: Second\n';
    const out = runGuard(
      { tool_name: 'Write', tool_input: { file_path: '.specs/auth/FR.md', content } },
      root,
    );
    expect(out.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput?.permissionDecisionReason).toMatch(/DUPLICATE_DEFINITION FR-1/);
    expect(out.hookSpecificOutput?.permissionDecisionReason).toMatch(/line 1/);
  });

  it('DENIES Write of malformed Gherkin', () => {
    const out = runGuard(
      {
        tool_name: 'Write',
        tool_input: { file_path: 'tests/features/broken.feature', content: 'this is not gherkin at all\n@bogus tag with spaces\n' },
      },
      root,
    );
    expect(out.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput?.permissionDecisionReason).toMatch(/MALFORMED_GHERKIN/);
  });

  it('allows Write on non-spec paths', () => {
    const out = runGuard(
      { tool_name: 'Write', tool_input: { file_path: 'tools/foo.ts', content: 'export const x = 1;' } },
      root,
    );
    expect(out.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('Edit derives post-edit content via old_string/new_string replacement', () => {
    const target = path.join(root, '.specs/auth/FR.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '## FR-1: Original\n');
    const out = runGuard(
      {
        tool_name: 'Edit',
        tool_input: {
          file_path: target,
          old_string: '## FR-1: Original',
          new_string: '## FR-1: Updated\n\n## FR-1: Duplicate',
        },
      },
      root,
    );
    expect(out.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput?.permissionDecisionReason).toMatch(/DUPLICATE_DEFINITION/);
  });
});

describe('detectHardFindings — pure unit', () => {
  it('returns [] for a clean MD', () => {
    expect(detectHardFindings('md', '.specs/auth/FR.md', '## FR-1: X\n## FR-2: Y\n')).toEqual([]);
  });

  it('returns [] for non-spec kind', () => {
    expect(detectHardFindings(null, 'foo.ts', 'export const x = 1;')).toEqual([]);
  });
});

describe('runGuard — failure modes (FR-19 / FR-22, SPECGEN004_49..51)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `guard-fail-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const readLog = (): string => {
    const dir = path.join(root, '.dev-pomogator', '.spec-check-log');
    if (!fs.existsSync(dir)) return '';
    const f = fs.readdirSync(dir).find((n) => n.endsWith('.jsonl'));
    return f ? fs.readFileSync(path.join(dir, f), 'utf8') : '';
  };

  it('SPECGEN004_49: a malformed .progress.json throws (fail-CLOSED → exit 1)', () => {
    fs.writeFileSync(path.join(root, '.specs', '.progress.json'), '{ not valid json :: ');
    expect(() =>
      runGuard({ tool_name: 'Write', tool_input: { file_path: '.specs/auth/FR.md', content: '## FR-1\n' } }, root),
    ).toThrow();
  });

  it('SPECGEN004_50: a parser exception fails OPEN and is logged to JSONL', () => {
    writeProgress(root, 4);
    const out = runGuard(
      { tool_name: 'Write', tool_input: { file_path: '.specs/auth/x.feature', content: 'Feature: X\n  Scenario: Y\n' } },
      root,
      {
        now: new Date('2026-06-03T00:00:00Z'),
        parseGherkinFn: () => {
          throw new Error('Gherkin parser exception: boom');
        },
      },
    );
    expect(out.hookSpecificOutput?.permissionDecision).toBe('allow');
    const entry = JSON.parse(readLog().trim().split('\n').pop()!) as Record<string, unknown>;
    expect(entry.hook_id).toBe('spec-conformance-guard');
    for (const f of ['timestamp', 'file_path', 'error_message', 'error_stack']) expect(f in entry).toBe(true);
  });

  it('SPECGEN004_51: a per-spec legacy version wins over global + logs ALLOW_AFTER_MIGRATION', () => {
    // Global is current (v4); the per-spec override is legacy (v2).
    writeProgress(root, 4);
    const specDir = path.join(root, '.specs', 'legacy-feature');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, '.progress.json'), JSON.stringify({ version: 2 }));

    const out = runGuard(
      {
        tool_name: 'Write',
        tool_input: { file_path: '.specs/legacy-feature/FR.md', content: '## FR-1: A\n## FR-1: A dup\n' },
      },
      root,
      { now: new Date('2026-06-03T00:00:00Z') },
    );
    // Would be DUPLICATE_DEFINITION under v4, but the per-spec v2 gate allows it.
    expect(out.hookSpecificOutput?.permissionDecision).toBe('allow');
    const entry = JSON.parse(readLog().trim().split('\n').pop()!) as Record<string, unknown>;
    expect(entry.kind).toBe('ALLOW_AFTER_MIGRATION');
    expect(entry.reason).toBe('spec_version');
    expect(entry.observed_version).toBe(2);
  });

  it('per-spec gate does NOT fire for a current spec (global v4, no per-spec file)', () => {
    writeProgress(root, 4);
    const out = runGuard(
      { tool_name: 'Write', tool_input: { file_path: '.specs/auth/FR.md', content: '## FR-1: A\n## FR-1: A dup\n' } },
      root,
    );
    expect(out.hookSpecificOutput?.permissionDecision).toBe('deny'); // v4 → guard active
  });
});
