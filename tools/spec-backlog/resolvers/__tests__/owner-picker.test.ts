import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { ownerPicker } from '../owner-picker.ts';
import type { BacklogEntry } from '../../types.ts';

function mkEntry(
  spec_a: string,
  spec_b: string,
): BacklogEntry {
  return {
    id: 'test1234abcd',
    ts: '2026-05-31T00:00:00Z',
    slug: spec_a.split(/[\s(]/)[0], // First part of spec_a as the slug
    code: 'cross-spec/module-ownership-conflict',
    category: 'ownership-conflict',
    evidence: { spec_a, spec_b },
    suggested_resolver: 'owner-picker',
    difficulty: 'hard',
    status: 'open',
  };
}

describe.skip('owner-picker resolver', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `owner-${randomUUID()}`);
    // Initialize a git repo
    fs.mkdirSync(root);
    execSync('git init', { cwd: root });
    execSync('git config user.email "test@example.com"', { cwd: root });
    execSync('git config user.name "Test User"', { cwd: root });

    // Create spec directories
    fs.mkdirSync(path.join(root, '.specs/foo'), { recursive: true });
    fs.mkdirSync(path.join(root, '.specs/bar'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('recommends owner by spec creation proximity to first commit', async () => {
    // Create a file, commit it
    fs.writeFileSync(path.join(root, 'shared-module.ts'), 'export const foo = 1;\n');
    execSync('git add shared-module.ts', { cwd: root });
    execSync('git commit -m "initial"', { cwd: root });

    // Create specs directory with .progress.json files to control creation dates
    const progressA = path.join(root, '.specs/foo/.progress.json');
    const progressB = path.join(root, '.specs/bar/.progress.json');

    // Spec A was created 1 day after the commit
    fs.writeFileSync(progressA, JSON.stringify({ created_at: '2026-05-25T12:00:00Z' }));
    // Spec B was created 5 days after the commit (further away)
    fs.writeFileSync(progressB, JSON.stringify({ created_at: '2026-05-29T12:00:00Z' }));

    const result = await ownerPicker.resolve({
      repoRoot: root,
      entry: mkEntry('foo (shared-module.ts)', 'bar (shared-module.ts)'),
    });

    expect(result.bailed_out).toBeUndefined();
    expect(result.files_changed).toEqual(['.specs/foo/OWNERSHIP_RECOMMENDATION.md']);
    expect(result.confidence).toBeGreaterThan(0.5);

    const recommendation = fs.readFileSync(
      path.join(root, '.specs/foo/OWNERSHIP_RECOMMENDATION.md'),
      'utf8',
    );
    expect(recommendation).toContain('shared-module.ts');
    expect(recommendation).toContain('foo');
    expect(recommendation).toContain('bar');
    expect(recommendation).toContain('Canonical owner');
  });

  it('bails when spec_a or spec_b is missing', async () => {
    const result = await ownerPicker.resolve({
      repoRoot: root,
      entry: {
        id: 'test',
        ts: '2026-05-31T00:00:00Z',
        slug: 'foo',
        code: 'cross-spec/module-ownership-conflict',
        category: 'ownership-conflict',
        evidence: { spec_a: 'foo (file.ts)' }, // spec_b missing
        suggested_resolver: 'owner-picker',
        difficulty: 'hard',
        status: 'open',
      },
    });
    expect(result.bailed_out?.reason).toBe('missing-specs');
    expect(result.confidence).toBe(0);
  });

  it('bails when spec directories do not exist', async () => {
    const result = await ownerPicker.resolve({
      repoRoot: root,
      entry: mkEntry('nonexistent_a (file.ts)', 'bar (file.ts)'),
    });
    expect(result.bailed_out?.reason).toBe('spec-dir-missing');
  });

  it('bails when paths do not match in spec_a and spec_b', async () => {
    fs.writeFileSync(path.join(root, '.specs/foo/.progress.json'), '{}');
    fs.writeFileSync(path.join(root, '.specs/bar/.progress.json'), '{}');

    const result = await ownerPicker.resolve({
      repoRoot: root,
      entry: mkEntry('foo (file-a.ts)', 'bar (file-b.ts)'),
    });
    expect(result.bailed_out?.reason).toBe('path-mismatch');
  });

  it('idempotent — does NOT overwrite existing OWNERSHIP_RECOMMENDATION.md', async () => {
    fs.writeFileSync(path.join(root, 'shared.ts'), 'export const x = 1;\n');
    execSync('git add shared.ts', { cwd: root });
    execSync('git commit -m "init"', { cwd: root });

    fs.writeFileSync(path.join(root, '.specs/foo/.progress.json'), JSON.stringify({ created_at: '2026-05-25T00:00:00Z' }));
    fs.writeFileSync(path.join(root, '.specs/bar/.progress.json'), JSON.stringify({ created_at: '2026-05-29T00:00:00Z' }));

    const recFile = path.join(root, '.specs/foo/OWNERSHIP_RECOMMENDATION.md');
    fs.writeFileSync(recFile, '# Manually edited\n');

    const result = await ownerPicker.resolve({
      repoRoot: root,
      entry: mkEntry('foo (shared.ts)', 'bar (shared.ts)'),
    });

    expect(result.bailed_out?.reason).toBe('already-exists');
    expect(result.files_changed).toEqual([]);
    const content = fs.readFileSync(recFile, 'utf8');
    expect(content).toContain('Manually edited');
  });

  it('bails when contested path has no commit history', async () => {
    fs.writeFileSync(path.join(root, '.specs/foo/.progress.json'), '{}');
    fs.writeFileSync(path.join(root, '.specs/bar/.progress.json'), '{}');

    const result = await ownerPicker.resolve({
      repoRoot: root,
      entry: mkEntry('foo (nonexistent.ts)', 'bar (nonexistent.ts)'),
    });

    expect(result.bailed_out?.reason).toBe('no-commit-date');
    expect(result.confidence).toBe(0);
  });

  it('handles spec string with slug/path format (fallback parsing)', async () => {
    fs.writeFileSync(path.join(root, 'module.ts'), 'export const y = 2;\n');
    execSync('git add module.ts', { cwd: root });
    execSync('git commit -m "init"', { cwd: root });

    fs.writeFileSync(path.join(root, '.specs/foo/.progress.json'), JSON.stringify({ created_at: '2026-05-25T00:00:00Z' }));
    fs.writeFileSync(path.join(root, '.specs/bar/.progress.json'), JSON.stringify({ created_at: '2026-05-29T00:00:00Z' }));

    const result = await ownerPicker.resolve({
      repoRoot: root,
      entry: mkEntry('foo/module.ts', 'bar/module.ts'),
    });

    expect(result.bailed_out).toBeUndefined();
    expect(result.files_changed).toEqual(['.specs/foo/OWNERSHIP_RECOMMENDATION.md']);
  });
});
