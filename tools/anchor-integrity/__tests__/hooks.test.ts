// Tests for the PostToolUse reminder + Stop-gate decision logic (FR-34b / AC-34.3).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { specOfPath, buildReminder } from '../anchor_check_post.ts';
import { modifiedSpecSlugs } from '../anchor_gate_stop.ts';

describe('specOfPath', () => {
  it('derives repoRoot/slug/specDir from a .specs/<slug>/…md path', () => {
    const r = specOfPath('/home/u/proj/.specs/auth/FR.md');
    expect(r).toMatchObject({ repoRoot: '/home/u/proj', slug: 'auth' });
    expect(r?.specDir.replace(/\\/g, '/')).toBe('/home/u/proj/.specs/auth');
  });
  it('handles Windows backslashes', () => {
    expect(specOfPath('D:\\repo\\.specs\\x\\AC.md')?.slug).toBe('x');
  });
  it('returns null for non-spec or non-md paths', () => {
    expect(specOfPath('/p/.specs/x/FR.txt')).toBeNull();
    expect(specOfPath('/p/src/foo.md')).toBeNull();
    expect(specOfPath('')).toBeNull();
  });
});

describe('buildReminder', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-hook-'));
    fs.mkdirSync(path.join(dir, '.specs', 'good'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.specs', 'bad'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.specs', 'good', 'FR.md'), '## FR-7\n[FR-7](#fr-7)\n');
    fs.writeFileSync(path.join(dir, '.specs', 'bad', 'FR.md'), '## FR-7\n[FR-7](#fr-7-old)\n');
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns null when the touched spec is clean', () => {
    expect(buildReminder(path.join(dir, '.specs', 'good', 'FR.md'))).toBeNull();
  });
  it('emits a <system-reminder> naming the broken anchor + the fix', () => {
    const out = buildReminder(path.join(dir, '.specs', 'bad', 'FR.md'));
    expect(out).toContain('<system-reminder>');
    expect(out).toContain('#fr-7-old');
    expect(out).toContain('→ fix to #fr-7');
    expect(out).toContain('fix.mjs --spec .specs/bad --apply');
  });
  it('returns null for a non-spec path', () => {
    expect(buildReminder('/x/README.md')).toBeNull();
  });
});

describe('modifiedSpecSlugs (Stop-gate input)', () => {
  let repo: string;
  const git = (args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-git-'));
    git(['init', '-q']);
    git(['config', 'user.email', 't@t']);
    git(['config', 'user.name', 't']);
    fs.mkdirSync(path.join(repo, '.specs', 'auth'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.specs', 'auth', 'FR.md'), '## FR-1\n');
    git(['add', '-A']);
    git(['commit', '-qm', 'init']);
  });
  afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

  it('reports a slug only after its .md is modified', () => {
    expect(modifiedSpecSlugs(repo)).toEqual([]);
    fs.appendFileSync(path.join(repo, '.specs', 'auth', 'FR.md'), '\n[FR-1](#fr-1-old)\n');
    expect(modifiedSpecSlugs(repo)).toEqual(['auth']);
  });
});
