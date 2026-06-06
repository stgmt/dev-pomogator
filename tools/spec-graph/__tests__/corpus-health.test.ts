/**
 * Integration tests for the GENERAL corpus-health auditor (P14-5).
 *
 * Each test materialises a tiny corpus under os.tmpdir() and drives the REAL
 * `corpusHealth()` — no mocks: collisions come from the real parsers'
 * composite keys, gaps from the real conformance pass.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { corpusHealth, renderCorpusHealth } from '../corpus-health.ts';

describe('corpus-health — the organism view over ANY corpus root', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `corpus-health-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function writeSpec(slug: string, files: Record<string, string>): void {
    const dir = path.join(root, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
  }

  it('GREEN on a fully-traced corpus (cardinality: 0 in every disease class)', () => {
    writeSpec('clean', {
      'FR.md': '## FR-1: Clean requirement\n',
      'ACCEPTANCE_CRITERIA.md': '## AC-1 (FR-1)\n\nWHEN x THEN y SHALL z.\n',
      'clean.feature': '@FR-1\nFeature: Clean\n  Scenario: traced\n    Given x\n',
    });
    const r = corpusHealth(root);
    expect(r.collisions.collisions).toHaveLength(0);
    expect(r.danglingEdges.count).toBe(0);
    expect(r.untracedAtoms.total).toBe(0);
    expect(r.staleFileChanges.count).toBe(0);
    expect(r.verdict).toBe('GREEN');
    expect(r.strictVerdict).toBe('GREEN');
  });

  it('🔴 a planted duplicate id is caught by the raw PRE-MAP scan (the map dedup would hide it)', () => {
    writeSpec('dup', { 'FR.md': '## FR-1: First\n\nbody\n\n## FR-1: First again\n' });
    const r = corpusHealth(root);
    expect(r.collisions.collisions.length).toBeGreaterThanOrEqual(1);
    expect(r.collisions.collisions[0].id).toBe('dup:FR-1');
    expect(r.verdict).toBe('RED');
  });

  it('two specs sharing a bare local id do NOT collide (composite keys, FR-36a)', () => {
    writeSpec('a', {
      'FR.md': '## FR-1: A\n',
      'ACCEPTANCE_CRITERIA.md': '## AC-1 (FR-1)\n',
      'a.feature': '@FR-1\nFeature: A\n  Scenario: a\n    Given x\n',
    });
    writeSpec('b', {
      'FR.md': '## FR-1: B\n',
      'ACCEPTANCE_CRITERIA.md': '## AC-1 (FR-1)\n',
      'b.feature': '@FR-1\nFeature: B\n  Scenario: b\n    Given x\n',
    });
    const r = corpusHealth(root);
    expect(r.collisions.collisions).toHaveLength(0);
    expect(r.verdict).toBe('GREEN');
  });

  it('🔴 untraced atoms are reported per class (UNCOVERED_FR) and gate only --strict', () => {
    writeSpec('untraced', { 'FR.md': '## FR-7: Orphan\n' });
    const r = corpusHealth(root);
    expect(r.untracedAtoms.byClass.UNCOVERED_FR).toBe(1);
    expect(r.untracedAtoms.samples[0].nodeId).toContain('untraced:FR-7');
    expect(r.verdict).toBe('GREEN'); // debt class — reported, hard gate stays green
    expect(r.strictVerdict).toBe('RED');
  });

  it('🔴 a stale FILE_CHANGES edit-path (graph-side) is a HARD red', () => {
    writeSpec('stale', {
      'FR.md': '## FR-1: Stale\n',
      'ACCEPTANCE_CRITERIA.md': '## AC-1 (FR-1)\n',
      'stale.feature': '@FR-1\nFeature: S\n  Scenario: s\n    Given x\n',
      'FILE_CHANGES.md':
        '# F\n\n| Path | Action | Reason |\n|--|--|--|\n| `gone/away.ts` | edit | [FR-1](FR.md#fr-1-stale) |\n',
    });
    const r = corpusHealth(root);
    expect(r.staleFileChanges.count).toBe(1);
    expect(r.staleFileChanges.samples[0].path).toBe('gone/away.ts');
    expect(r.verdict).toBe('RED');
  });

  it('render carries every section + the dual verdict line', () => {
    writeSpec('clean', {
      'FR.md': '## FR-1: Clean\n',
      'ACCEPTANCE_CRITERIA.md': '## AC-1 (FR-1)\n',
      'c.feature': '@FR-1\nFeature: C\n  Scenario: c\n    Given x\n',
    });
    const text = renderCorpusHealth(corpusHealth(root));
    for (const marker of ['collisions (raw pre-map)', 'dangling edges', 'untraced atoms', 'stale FILE_CHANGES', 'VERDICT: 🟢 GREEN']) {
      expect(text).toContain(marker);
    }
  });
});
