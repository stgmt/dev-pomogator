import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  appendEntry,
  entryId,
  readAll,
  readEntry,
  readOpen,
  updateStatus,
} from '../writer.ts';

describe('spec-backlog writer', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `bl-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('entryId is deterministic for same slug+code+evidence', () => {
    const ev = { file: 'FR.md', line: 12, target: 'ACCEPTANCE_CRITERIA.md' };
    expect(entryId('foo', 'impl-drift/dead-link', ev)).toBe(
      entryId('foo', 'impl-drift/dead-link', ev),
    );
  });

  it('entryId differs across slug or code', () => {
    const ev = { file: 'FR.md' };
    const a = entryId('foo', 'impl-drift/dead-link', ev);
    const b = entryId('bar', 'impl-drift/dead-link', ev);
    const c = entryId('foo', 'impl-drift/missing-file', ev);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('appendEntry creates the daily JSONL file', () => {
    const out = appendEntry(root, {
      slug: 'foo',
      code: 'impl-drift/dead-link',
      category: 'missing-spec-file',
      evidence: { file: '.specs/foo/FR.md', line: 10, target: 'AC.md' },
      suggested_resolver: 'ac-author',
      difficulty: 'medium',
    });
    expect(out.status).toBe('open');
    expect(out.id).toHaveLength(12);
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(root, '.dev-pomogator/.specs-backlog', `${today}.jsonl`);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('readAll deduplicates by id (latest line wins)', () => {
    const e = appendEntry(root, {
      slug: 'sp', code: 'c1', category: 'missing-spec-file',
      evidence: { file: 'a' }, suggested_resolver: 'ac-author', difficulty: 'easy',
    });
    updateStatus(root, e.id, 'resolved', { resolver: 'ac-author', at: 'x' });
    const all = readAll(root);
    expect(all.find((x) => x.id === e.id)?.status).toBe('resolved');
  });

  it('readOpen filters to status=open', () => {
    const a = appendEntry(root, {
      slug: 'sp', code: 'c1', category: 'missing-spec-file',
      evidence: { file: 'a' }, suggested_resolver: 'ac-author', difficulty: 'easy',
    });
    const b = appendEntry(root, {
      slug: 'sp', code: 'c2', category: 'missing-test',
      evidence: { file: 'b' }, suggested_resolver: 'scenario-writer', difficulty: 'easy',
    });
    updateStatus(root, b.id, 'resolved', { resolver: 'scenario-writer', at: 'x' });
    const open = readOpen(root);
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe(a.id);
  });

  it('tolerates malformed JSONL lines', () => {
    appendEntry(root, {
      slug: 's', code: 'c', category: 'unrecognised',
      evidence: {}, suggested_resolver: 'human', difficulty: 'easy',
    });
    const file = path.join(root, '.dev-pomogator/.specs-backlog', `${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(file, 'not-json\n');
    appendEntry(root, {
      slug: 's2', code: 'c2', category: 'unrecognised',
      evidence: {}, suggested_resolver: 'human', difficulty: 'easy',
    });
    expect(readAll(root)).toHaveLength(2);
  });

  it('readEntry returns null for unknown id', () => {
    expect(readEntry(root, 'nope')).toBeNull();
  });
});
