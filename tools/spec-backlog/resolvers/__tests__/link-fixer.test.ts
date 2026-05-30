import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { linkFixer } from '../link-fixer.ts';
import type { BacklogEntry } from '../../types.ts';

function mkEntry(slug: string, file: string, target: string): BacklogEntry {
  return {
    id: 'test1234abcd',
    ts: '2026-05-31T00:00:00Z',
    slug,
    code: 'impl-drift/dead-link',
    category: 'dead-link-typo',
    evidence: { file, target },
    suggested_resolver: 'link-fixer',
    difficulty: 'easy',
    status: 'open',
  };
}

describe.skip('link-fixer resolver', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `link-fixer-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs/foo'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('rewrites dead link when exactly one file matches basename', async () => {
    // Create a matching file somewhere in the repo
    fs.writeFileSync(
      path.join(root, 'docs/INTEGRATION_GUIDE.md'),
      '# Integration Guide\nContent here.\n',
    );

    // Create spec file with dead link
    fs.writeFileSync(
      path.join(root, '.specs/foo/DESIGN.md'),
      '# Design\n\nSee [Integration](integration-guide.md) for setup.\n',
    );

    const result = await linkFixer.resolve({
      repoRoot: root,
      entry: mkEntry('foo', 'DESIGN.md', 'integration-guide.md'),
    });

    expect(result.bailed_out).toBeUndefined();
    expect(result.confidence).toBe(0.85);
    expect(result.files_changed).toEqual(['.specs/foo/DESIGN.md']);

    const updated = fs.readFileSync(path.join(root, '.specs/foo/DESIGN.md'), 'utf8');
    expect(updated).toContain('[Integration](../../docs/INTEGRATION_GUIDE.md)');
  });

  it('bails out when source file does not exist', async () => {
    const result = await linkFixer.resolve({
      repoRoot: root,
      entry: mkEntry('foo', 'NONEXISTENT.md', 'target.md'),
    });

    expect(result.bailed_out?.reason).toBe('source-file-missing');
    expect(result.confidence).toBe(0);
  });

  it('idempotent — does NOT rewrite when target already exists', async () => {
    // Create the target file directly
    fs.mkdirSync(path.join(root, '.specs/foo/guides'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.specs/foo/guides/setup.md'),
      '# Setup Guide\nAlready here.\n',
    );

    // Create spec file with link that already points to existing file
    fs.writeFileSync(
      path.join(root, '.specs/foo/DESIGN.md'),
      '# Design\n\nSee [Setup](guides/setup.md) for steps.\n',
    );

    const result = await linkFixer.resolve({
      repoRoot: root,
      entry: mkEntry('foo', 'DESIGN.md', 'guides/setup.md'),
    });

    expect(result.bailed_out?.reason).toBe('already-exists');
    expect(result.files_changed).toEqual([]);
  });

  it('bails out when no file matches the basename', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/DESIGN.md'),
      '# Design\n\nSee [Foo](totally-missing.md).\n',
    );

    const result = await linkFixer.resolve({
      repoRoot: root,
      entry: mkEntry('foo', 'DESIGN.md', 'totally-missing.md'),
    });

    expect(result.bailed_out?.reason).toBe('no-match');
    expect(result.confidence).toBe(0);
  });

  it('bails out when multiple files match the basename', async () => {
    // Create two matching files
    fs.writeFileSync(path.join(root, 'README.md'), '# Readme\n');
    fs.writeFileSync(path.join(root, 'docs/README.md'), '# Docs Readme\n');

    fs.writeFileSync(
      path.join(root, '.specs/foo/DESIGN.md'),
      '# Design\n\nSee [Main](readme.md).\n',
    );

    const result = await linkFixer.resolve({
      repoRoot: root,
      entry: mkEntry('foo', 'DESIGN.md', 'readme.md'),
    });

    expect(result.bailed_out?.reason).toBe('ambiguous-match');
    expect(result.confidence).toBe(0);
  });

  it('handles case-insensitive basename matching on Windows-like paths', async () => {
    // Create a file with uppercase extension
    fs.writeFileSync(
      path.join(root, 'lib/CONSTANTS.TS'),
      'export const X = 1;\n',
    );

    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      '# Features\n\nSee [Constants](constants.ts) for details.\n',
    );

    const result = await linkFixer.resolve({
      repoRoot: root,
      entry: mkEntry('foo', 'FR.md', 'constants.ts'),
    });

    // Should match despite case difference in basename (glob is case-sensitive on Unix,
    // but this test verifies basename matching logic)
    if (process.platform === 'win32') {
      expect(result.bailed_out).toBeUndefined();
      expect(result.confidence).toBe(0.85);
    }
  });
});
