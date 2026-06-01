import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { wrapDeprecatedRef } from '../wrap-deprecated-ref.ts';
import type { BacklogEntry } from '../../types.ts';

function mkEntry(
  slug: string,
  referencedIn: string,
  targetPath: string,
  version: string,
): BacklogEntry {
  return {
    id: 'test1234abcd',
    ts: '2026-05-31T00:00:00Z',
    slug,
    code: 'impl-drift/deprecated-ref',
    category: 'deprecated-ref',
    evidence: {
      file: referencedIn,
      referenced_in: referencedIn,
      target_path: targetPath,
      version,
    },
    suggested_resolver: 'wrap-deprecated-ref',
    difficulty: 'easy',
    status: 'open',
  };
}

describe('wrap-deprecated-ref resolver', () => {
  let root: string;

  beforeEach(() => {
    root = path.join(os.tmpdir(), `wrap-deprecated-ref-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs/foo'), { recursive: true });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('wraps first backtick-wrapped mention with strikethrough + removal annotation', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      [
        '# FR — foo',
        '',
        '## FR-1: Legacy entrypoint',
        'The old script lives at `tools/legacy/runner.ts` for v1 installs.',
        '',
        '## FR-2: Migration',
        'Note: `tools/legacy/runner.ts` is gone after migration.',
      ].join('\n'),
    );

    const result = await wrapDeprecatedRef.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/FR.md:4', 'tools/legacy/runner.ts', 'v2'),
    });

    expect(result.bailed_out).toBeUndefined();
    expect(result.confidence).toBe(0.9);
    expect(result.files_changed.map((p) => p.replace(/\\/g, '/'))).toEqual([
      '.specs/foo/FR.md',
    ]);

    const updated = fs.readFileSync(path.join(root, '.specs/foo/FR.md'), 'utf8');
    // First mention wrapped — backticks preserved inside strikethrough.
    expect(updated).toContain(
      '~~`tools/legacy/runner.ts`~~ (removed in v2 — no canonical replacement)',
    );
    // Subsequent mention left untouched (first-mention semantics).
    expect(updated).toContain(
      'Note: `tools/legacy/runner.ts` is gone after migration.',
    );
  });

  it('wraps bare prose mention (no backticks) with backticks + strikethrough', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      [
        '# FR — foo',
        '',
        'The entrypoint tools/old/main.ts was removed.',
        'Refer to historical docs for tools/old/main.ts behavior.',
      ].join('\n'),
    );

    const result = await wrapDeprecatedRef.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/FR.md', 'tools/old/main.ts', 'v3'),
    });

    expect(result.bailed_out).toBeUndefined();
    expect(result.confidence).toBe(0.9);

    const updated = fs.readFileSync(path.join(root, '.specs/foo/FR.md'), 'utf8');
    expect(updated).toContain(
      '~~`tools/old/main.ts`~~ (removed in v3 — no canonical replacement)',
    );
    // Second mention still plain text.
    expect(updated).toContain('historical docs for tools/old/main.ts behavior.');
  });

  it('idempotent — bails with target-already-wrapped when file already contains strikethrough mention', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      [
        '# FR — foo',
        '',
        'Old: ~~`tools/legacy/x.ts`~~ (removed in v2 — no canonical replacement).',
        'Even another mention of tools/legacy/x.ts here.',
      ].join('\n'),
    );

    const result = await wrapDeprecatedRef.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/FR.md', 'tools/legacy/x.ts', 'v2'),
    });

    expect(result.bailed_out?.reason).toBe('target-already-wrapped');
    expect(result.confidence).toBe(1);
    expect(result.files_changed).toEqual([]);

    const after = fs.readFileSync(path.join(root, '.specs/foo/FR.md'), 'utf8');
    expect(after).toContain('Even another mention of tools/legacy/x.ts here.');
  });

  it('bails inside-code-fence when all mentions are inside fenced code blocks', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      [
        '# FR — foo',
        '',
        '```bash',
        'rm tools/legacy/zap.ts',
        'echo tools/legacy/zap.ts',
        '```',
      ].join('\n'),
    );

    const result = await wrapDeprecatedRef.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/FR.md', 'tools/legacy/zap.ts', 'v2'),
    });

    expect(result.bailed_out?.reason).toBe('inside-code-fence');
    expect(result.confidence).toBe(0);
    expect(result.files_changed).toEqual([]);
  });

  it('bails source-file-missing when referenced_in points to a nonexistent file', async () => {
    const result = await wrapDeprecatedRef.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/NOPE.md', 'tools/x.ts', 'v2'),
    });

    expect(result.bailed_out?.reason).toBe('source-file-missing');
    expect(result.confidence).toBe(0);
  });

  it('bails missing-evidence when version is absent', async () => {
    fs.writeFileSync(path.join(root, '.specs/foo/FR.md'), 'Mentions tools/x.ts here.\n');
    const entry: BacklogEntry = {
      ...mkEntry('foo', '.specs/foo/FR.md', 'tools/x.ts', 'v2'),
      evidence: {
        file: '.specs/foo/FR.md',
        referenced_in: '.specs/foo/FR.md',
        target_path: 'tools/x.ts',
        // version intentionally omitted
      },
    };

    const result = await wrapDeprecatedRef.resolve({ repoRoot: root, entry });

    expect(result.bailed_out?.reason).toBe('missing-evidence');
    expect(result.confidence).toBe(0);
  });

  it('bails no-bare-mention when target_path does not appear at all in the file', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      '# FR — foo\n\nNothing relevant here.\n',
    );

    const result = await wrapDeprecatedRef.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/FR.md', 'tools/unseen/path.ts', 'v2'),
    });

    expect(result.bailed_out?.reason).toBe('no-bare-mention');
    expect(result.confidence).toBe(0);
    expect(result.files_changed).toEqual([]);
  });
});
