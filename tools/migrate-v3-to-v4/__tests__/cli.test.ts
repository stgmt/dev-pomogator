// Tests for the migrate-v3-to-v4 CLI run() entry.
//
// Three contracts pinned:
//   1. --suggest-only prints diff + leaves files byte-stable on disk
//   2. default mode writes the converted body atomically + bumps
//      .specs/.progress.json::version 3 → 4 when at least one heading
//      converts
//   3. an already-v4 repo is a no-op (idempotent re-run)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { run, parseArgs } from '../cli.ts';

function seedV3Repo(root: string): void {
  fs.mkdirSync(path.join(root, '.specs', 'auth'), { recursive: true });
  fs.mkdirSync(path.join(root, '.specs', 'billing'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.specs/auth/FR.md'),
    [
      '### Requirement: FR-001 Login flow',
      '',
      '_Jira: AUTH-1_',
      '',
      'Body.',
      '',
      '### Requirement: FR-002 Logout',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(root, '.specs/billing/FR.md'),
    '### Requirement: FR-010 Invoice\n',
  );
  fs.mkdirSync(path.join(root, '.specs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specs/.progress.json'), JSON.stringify({ version: 3 }));
}

describe('run — --suggest-only mode', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `migrate-suggest-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
    seedV3Repo(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('lists every legacy heading + does NOT modify files', () => {
    const before = fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8');
    const r = run({ repoRoot: root, suggestOnly: true });
    expect(r.totalHeadingsConverted).toBe(3);
    expect(r.files.some((f) => f.applied)).toBe(false);
    // Source unchanged.
    expect(fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8')).toBe(before);
    // Diff visible in output.
    expect(r.text).toContain('## FR-001');
    expect(r.text).toContain('## FR-010');
  });

  it('never bumps .progress.json in suggest-only mode', () => {
    run({ repoRoot: root, suggestOnly: true });
    const p = JSON.parse(fs.readFileSync(path.join(root, '.specs/.progress.json'), 'utf8')) as {
      version: number;
    };
    expect(p.version).toBe(3);
  });
});

describe('run — default mode (apply)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `migrate-apply-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
    seedV3Repo(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('rewrites files to v4 form + bumps version 3 → 4', () => {
    const r = run({ repoRoot: root, suggestOnly: false });
    expect(r.totalHeadingsConverted).toBe(3);
    expect(r.versionBumped).toBe(true);
    const auth = fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8');
    expect(auth).toContain('### FR-001: Login flow');
    expect(auth).toContain('### FR-002: Logout');
    expect(auth).not.toContain('Requirement: FR-001');
    const p = JSON.parse(fs.readFileSync(path.join(root, '.specs/.progress.json'), 'utf8')) as {
      version: number;
    };
    expect(p.version).toBe(4);
  });

  it('preserves Jira trace lines + body content byte-for-byte', () => {
    run({ repoRoot: root, suggestOnly: false });
    const auth = fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8');
    expect(auth).toContain('_Jira: AUTH-1_');
    expect(auth).toContain('Body.');
  });

  it('idempotent — second run is a zero-conversion no-op', () => {
    run({ repoRoot: root, suggestOnly: false });
    const second = run({ repoRoot: root, suggestOnly: false });
    expect(second.totalHeadingsConverted).toBe(0);
    expect(second.versionBumped).toBe(false);
  });

  it('limits scope when --slug is supplied', () => {
    const r = run({ repoRoot: root, suggestOnly: false, slugs: ['billing'] });
    expect(r.totalHeadingsConverted).toBe(1);
    // auth/FR.md untouched.
    expect(fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8')).toContain(
      'Requirement: FR-001',
    );
  });
});

describe('parseArgs', () => {
  it('default is apply mode against cwd', () => {
    const a = parseArgs([]);
    expect(a.suggestOnly).toBe(false);
    expect(a.repoRoot).toBe(process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd());
  });
  it('--suggest-only flips to dry-run', () => {
    expect(parseArgs(['--suggest-only']).suggestOnly).toBe(true);
  });
  it('--root overrides repoRoot', () => {
    expect(parseArgs(['--root', '/x/y']).repoRoot).toBe('/x/y');
  });
  it('--slug accumulates into an array', () => {
    expect(parseArgs(['--slug', 'a', '--slug', 'b']).slugs).toEqual(['a', 'b']);
  });
  it('rejects unknown flags', () => {
    expect(() => parseArgs(['--wat'])).toThrow(/unknown flag/);
  });
});
