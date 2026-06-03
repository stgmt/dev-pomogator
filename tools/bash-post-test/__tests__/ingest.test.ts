/**
 * Tests for the Phase-0 bash-post-test NDJSON splitter (FR-1 / SPECGEN004_02).
 *
 * Driven by a committed REAL cucumber-js run over a 2-spec (auth + billing)
 * project (verify-against-real-artifact) — not hand-authored envelopes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { splitNdjsonBySpec, slugOfUri, isBddTestCommand } from '../ingest.ts';

const FIXTURE = path.resolve('tests/fixtures/ndjson/two-spec-master.ndjson');

function pickleUris(file: string): string[] {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { pickle?: { uri?: string } })
    .filter((o) => o.pickle?.uri)
    .map((o) => o.pickle!.uri!.replace(/\\/g, '/'));
}

describe('slugOfUri', () => {
  it('derives the slug from a .specs/<slug>/ uri (POSIX and Windows separators)', () => {
    expect(slugOfUri('.specs/auth/auth.feature')).toBe('auth');
    expect(slugOfUri('.specs\\billing\\billing.feature')).toBe('billing');
  });
  it('returns null for a uri outside .specs/', () => {
    expect(slugOfUri('tests/features/x.feature')).toBeNull();
  });
});

describe('isBddTestCommand', () => {
  it('matches the bdd runner invocations', () => {
    expect(isBddTestCommand('npm run test:bdd')).toBe(true);
    expect(isBddTestCommand('node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js')).toBe(true);
  });
  it('ignores unrelated commands', () => {
    expect(isBddTestCommand('ls -la')).toBe(false);
    expect(isBddTestCommand(undefined)).toBe(false);
  });
});

describe('splitNdjsonBySpec', () => {
  let root: string;
  let master: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `split-${randomUUID()}`);
    master = path.join(root, '.dev-pomogator', '.last-test-run.ndjson');
    fs.mkdirSync(path.dirname(master), { recursive: true });
    fs.copyFileSync(FIXTURE, master);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('writes one shard per spec slug', () => {
    const res = splitNdjsonBySpec({ masterPath: master, repoRoot: root });
    expect(res.slugs).toEqual(['auth', 'billing']);
    expect(fs.existsSync(path.join(root, '.specs/auth/.test-results.ndjson'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.specs/billing/.test-results.ndjson'))).toBe(true);
  });

  it('each shard contains ONLY that spec’s pickles (no cross-spec leakage)', () => {
    splitNdjsonBySpec({ masterPath: master, repoRoot: root });
    const auth = pickleUris(path.join(root, '.specs/auth/.test-results.ndjson'));
    const billing = pickleUris(path.join(root, '.specs/billing/.test-results.ndjson'));
    expect(auth.length).toBeGreaterThan(0);
    expect(billing.length).toBeGreaterThan(0);
    expect(auth.every((u) => u.includes('.specs/auth/'))).toBe(true);
    expect(billing.every((u) => u.includes('.specs/billing/'))).toBe(true);
  });

  it('conserves pickles: every master pickle lands in exactly one shard', () => {
    const before = pickleUris(master).sort();
    const res = splitNdjsonBySpec({ masterPath: master, repoRoot: root });
    const sharded = Object.values(res.files)
      .flatMap((f) => pickleUris(f))
      .sort();
    expect(sharded).toEqual(before);
    // ...and no pickle is duplicated across shards.
    expect(new Set(sharded).size).toBe(sharded.length);
  });

  it('preserves the master file byte-for-byte', () => {
    const before = fs.readFileSync(master);
    splitNdjsonBySpec({ masterPath: master, repoRoot: root });
    expect(fs.readFileSync(master).equals(before)).toBe(true);
  });

  it('is idempotent — re-splitting yields identical shards', () => {
    const first = splitNdjsonBySpec({ masterPath: master, repoRoot: root });
    const snap = Object.fromEntries(
      Object.entries(first.files).map(([slug, f]) => [slug, fs.readFileSync(f, 'utf8')]),
    );
    const second = splitNdjsonBySpec({ masterPath: master, repoRoot: root });
    expect(second.counts).toEqual(first.counts);
    for (const [slug, f] of Object.entries(second.files)) {
      expect(fs.readFileSync(f, 'utf8')).toBe(snap[slug]);
    }
  });
});
