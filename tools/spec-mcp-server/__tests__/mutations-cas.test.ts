/**
 * Unit: P21-5 optimistic-CAS primitives (tools/spec-mcp-server/mutations.ts).
 * docSha is the concurrency token read_spec_doc hands out; casCheck is what
 * apply_spec_change uses to refuse a write against a stale read.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { docSha, casCheck } from '../mutations.ts';

describe('docSha', () => {
  it('is a deterministic sha256 hex of the content', () => {
    expect(docSha('hello\n')).toBe(docSha('hello\n'));
    expect(docSha('hello\n')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('changes when the content changes (CRLF included)', () => {
    expect(docSha('a')).not.toBe(docSha('b'));
    expect(docSha('x\n')).not.toBe(docSha('x\r\n'));
  });
});

describe('casCheck', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `cas-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs', 'casd'), { recursive: true });
    fs.writeFileSync(path.join(root, '.specs', 'casd', 'FR.md'), 'body\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('ok when the expected sha matches the current content', () => {
    expect(casCheck(root, 'casd', 'FR.md', docSha('body\n'))).toEqual({ ok: true });
  });
  it('mismatch returns the actual current sha (stale read → caller rebases)', () => {
    const r = casCheck(root, 'casd', 'FR.md', 'deadbeef');
    expect(r.ok).toBe(false);
    expect((r as { actualSha: string }).actualSha).toBe(docSha('body\n'));
  });
  it('missing doc → actualSha null (not a crash)', () => {
    expect(casCheck(root, 'casd', 'NOPE.md', 'whatever')).toEqual({ ok: false, actualSha: null });
  });
});
