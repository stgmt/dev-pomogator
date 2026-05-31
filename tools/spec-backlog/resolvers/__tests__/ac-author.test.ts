import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { acAuthor } from '../ac-author.ts';
import type { BacklogEntry } from '../../types.ts';

function mkEntry(slug: string): BacklogEntry {
  return {
    id: 'test1234abcd',
    ts: '2026-05-30T00:00:00Z',
    slug,
    code: 'impl-drift/dead-link',
    category: 'missing-spec-file',
    evidence: { target: 'ACCEPTANCE_CRITERIA.md' },
    suggested_resolver: 'ac-author',
    difficulty: 'medium',
    status: 'open',
  };
}

describe('ac-author resolver', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `ac-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs/foo'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('generates skeleton with one AC section per FR-N', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      [
        '## FR-1: Login',
        'description',
        '',
        '## FR-2: Logout',
        'description',
        '',
        '## FR-3: Reset password',
        'description',
        '',
      ].join('\n'),
    );
    const result = await acAuthor.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out).toBeUndefined();
    expect(result.files_changed.map((p) => p.replace(/\\/g, '/'))).toEqual([
      '.specs/foo/ACCEPTANCE_CRITERIA.md',
    ]);
    expect(result.confidence).toBeGreaterThan(0.5);
    const ac = fs.readFileSync(path.join(root, '.specs/foo/ACCEPTANCE_CRITERIA.md'), 'utf8');
    expect(ac).toContain('## AC-1 (FR-1)');
    expect(ac).toContain('## AC-2 (FR-2)');
    expect(ac).toContain('## AC-3 (FR-3)');
    expect(ac).toContain('WHEN `<precondition');
    expect(ac).toContain('THEN system SHALL');
    expect(ac).toContain('[TBD]');
  });

  it('bails out when FR.md is missing', async () => {
    const result = await acAuthor.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out?.reason).toBe('fr-md-missing');
    expect(result.confidence).toBe(0);
  });

  it('idempotent — does NOT overwrite existing ACCEPTANCE_CRITERIA.md', async () => {
    fs.writeFileSync(path.join(root, '.specs/foo/FR.md'), '## FR-1: Login\n');
    fs.writeFileSync(
      path.join(root, '.specs/foo/ACCEPTANCE_CRITERIA.md'),
      '## AC-1\nManually authored.\n',
    );
    const result = await acAuthor.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out?.reason).toBe('already-exists');
    expect(result.files_changed).toEqual([]);
    const ac = fs.readFileSync(path.join(root, '.specs/foo/ACCEPTANCE_CRITERIA.md'), 'utf8');
    expect(ac).toContain('Manually authored');
  });

  it('bails out when FR.md has no FR-N headings', async () => {
    fs.writeFileSync(path.join(root, '.specs/foo/FR.md'), '# Plain title only\nNo FR sections.\n');
    const result = await acAuthor.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out?.reason).toBe('no-fr-headings');
  });

  it('handles legacy `### Requirement: FR-N` heading form', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      '### Requirement: FR-1 Login flow\nBody\n\n### Requirement: FR-2 Logout flow\nBody\n',
    );
    const result = await acAuthor.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out).toBeUndefined();
    const ac = fs.readFileSync(path.join(root, '.specs/foo/ACCEPTANCE_CRITERIA.md'), 'utf8');
    expect(ac).toContain('AC-1 (FR-1)');
    expect(ac).toContain('AC-2 (FR-2)');
  });
});
