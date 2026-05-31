import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { crossRefLinker } from '../cross-ref-linker.ts';
import type { BacklogEntry } from '../../types.ts';

function mkEntry(
  slug: string,
  file: string,
  specA: string,
  specB: string,
): BacklogEntry {
  return {
    id: 'test1234abcd',
    ts: '2026-05-31T00:00:00Z',
    slug,
    code: 'cross-spec/missing-cross-ref',
    category: 'missing-cross-ref',
    evidence: { file, spec_a: specA, spec_b: specB },
    suggested_resolver: 'cross-ref-linker',
    difficulty: 'easy',
    status: 'open',
  };
}

describe('cross-ref-linker resolver', () => {
  let root: string;

  beforeEach(() => {
    root = path.join(os.tmpdir(), `cross-ref-linker-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs/foo'), { recursive: true });
    fs.mkdirSync(path.join(root, '.specs/bar'), { recursive: true });
    // Target spec must exist on disk for resolver not to bail on
    // target-spec-missing.
    fs.writeFileSync(
      path.join(root, '.specs/bar/FR.md'),
      '# FR — bar\n## FR-1\nBody.\n',
    );
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('wraps first plain-text mention of spec_b with a relative markdown link', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      [
        '# FR — foo',
        '',
        '## FR-1: Integration with bar',
        'See bar for details on how the bar interface works.',
        '',
        '## FR-2: bar handoff',
        'Pass control to bar after step 3.',
      ].join('\n'),
    );

    const result = await crossRefLinker.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/FR.md:4', 'foo', 'bar'),
    });

    expect(result.bailed_out).toBeUndefined();
    expect(result.confidence).toBe(0.9);
    expect(result.files_changed.map((p) => p.replace(/\\/g, '/'))).toEqual([
      '.specs/foo/FR.md',
    ]);

    const updated = fs.readFileSync(path.join(root, '.specs/foo/FR.md'), 'utf8');
    // First mention (in heading "Integration with bar") wrapped — link target
    // is computed relative to source file dir (.specs/foo/) → ../bar/FR.md.
    expect(updated.replace(/\\/g, '/')).toContain('[bar](../bar/FR.md)');
    // Later mentions stay plain — first-mention-only semantics.
    expect(updated).toContain('Pass control to bar after step 3.');
  });

  it('idempotent — bails with already-linked when file contains existing link to spec_b', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      [
        '# FR — foo',
        '',
        'See [bar](../bar/FR.md) for the upstream spec.',
        'Then bar handles the rest.',
      ].join('\n'),
    );

    const result = await crossRefLinker.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/FR.md:3', 'foo', 'bar'),
    });

    expect(result.bailed_out?.reason).toBe('already-linked');
    expect(result.confidence).toBe(1);
    expect(result.files_changed).toEqual([]);

    // File untouched
    const after = fs.readFileSync(path.join(root, '.specs/foo/FR.md'), 'utf8');
    expect(after).toContain('Then bar handles the rest.');
  });

  it('bails inside-code-fence when all mentions are inside fenced code blocks or backticks', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      [
        '# FR — foo',
        '',
        'Run via this command: `npx tsx .specs/bar/scripts/run.ts`.',
        '',
        '```bash',
        'cd .specs/bar && ls',
        'echo bar bar bar',
        '```',
        '',
        'See also `bar/FR.md`.',
      ].join('\n'),
    );

    const result = await crossRefLinker.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/FR.md:3', 'foo', 'bar'),
    });

    expect(result.bailed_out?.reason).toBe('inside-code-fence');
    expect(result.confidence).toBe(0);
    expect(result.files_changed).toEqual([]);
  });

  it('bails source-file-missing when referenced_in points to a nonexistent file', async () => {
    const result = await crossRefLinker.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/NONEXISTENT.md:1', 'foo', 'bar'),
    });

    expect(result.bailed_out?.reason).toBe('source-file-missing');
    expect(result.confidence).toBe(0);
  });

  it('bails target-spec-missing when .specs/<spec_b>/FR.md does not exist', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      'Mentions baz here.\nbaz appears twice.\n',
    );

    const result = await crossRefLinker.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/FR.md:1', 'foo', 'baz'),
    });

    expect(result.bailed_out?.reason).toBe('target-spec-missing');
    expect(result.confidence).toBe(0);
  });

  it('bails missing-evidence when evidence.spec_b is absent', async () => {
    const entry: BacklogEntry = {
      ...mkEntry('foo', '.specs/foo/FR.md:1', 'foo', 'bar'),
      evidence: { file: '.specs/foo/FR.md:1', spec_a: 'foo' },
    };

    const result = await crossRefLinker.resolve({ repoRoot: root, entry });

    expect(result.bailed_out?.reason).toBe('missing-evidence');
    expect(result.confidence).toBe(0);
  });

  it('skips mentions already inside a markdown link span', async () => {
    // bar is mentioned 3× — once already linked (NOT to .specs/bar, so the
    // file-level idempotency check doesn't bail), once inside another link's
    // label text, once in plain prose. Only the plain-prose mention should
    // be wrapped.
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      [
        '# FR — foo',
        '',
        'See [the bar project page](https://example.com/projects/bar) for context.',
        '',
        'The bar workflow is described below.',
      ].join('\n'),
    );

    const result = await crossRefLinker.resolve({
      repoRoot: root,
      entry: mkEntry('foo', '.specs/foo/FR.md:5', 'foo', 'bar'),
    });

    expect(result.bailed_out).toBeUndefined();
    expect(result.confidence).toBe(0.9);

    const updated = fs.readFileSync(path.join(root, '.specs/foo/FR.md'), 'utf8');
    // The plain-prose mention got wrapped; the in-link mention stayed.
    expect(updated.replace(/\\/g, '/')).toContain('[bar](../bar/FR.md) workflow');
    // The external link's label text untouched.
    expect(updated).toContain('[the bar project page](https://example.com/projects/bar)');
  });
});
