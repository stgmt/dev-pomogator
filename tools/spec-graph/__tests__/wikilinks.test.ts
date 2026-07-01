// Tests for the graph-side wiki-link resolver (FR-3 / AC-3.3).

import { describe, it, expect } from 'vitest';
import { resolveWikiLinks, brokenWikiLinks } from '../wikilinks.ts';
import type { NodeLocation } from '../types.ts';

const defs = new Map<string, NodeLocation>([
  ['FR-1', { file: '.specs/x/FR.md', line: 3 }],
  ['fr-1-login-flow', { file: '.specs/x/FR.md', line: 3 }],
  ['AC-1.1', { file: '.specs/x/ACCEPTANCE_CRITERIA.md', line: 5 }],
]);

describe('resolveWikiLinks', () => {
  it('resolves a compact id link to the registered location (AC-3.3)', () => {
    const occ = resolveWikiLinks('see [[FR-1]] for login', '.specs/x/USE_CASES.md', defs);
    expect(occ).toHaveLength(1);
    expect(occ[0].target).toBe('FR-1');
    expect(occ[0].resolved).toEqual({ file: '.specs/x/FR.md', line: 3 });
  });

  it('resolves the slug alias identically to the compact id', () => {
    const a = resolveWikiLinks('[[FR-1]]', 'a.md', defs)[0].resolved;
    const b = resolveWikiLinks('[[fr-1-login-flow]]', 'a.md', defs)[0].resolved;
    expect(a).toEqual(b);
  });

  it('marks an unknown target as unresolved (broken candidate)', () => {
    const occ = resolveWikiLinks('[[FR-999]] and [[FR-001]]', 'a.md', defs);
    expect(occ.map((o) => o.resolved)).toEqual([null, null]); // FR-001 ≠ FR-1 → unresolved
    expect(brokenWikiLinks(occ).map((o) => o.target)).toEqual(['FR-999', 'FR-001']);
  });

  it('strips a |display alias and a #fragment from the target', () => {
    const occ = resolveWikiLinks('[[FR-1#acceptance|the FR]]', 'a.md', defs);
    expect(occ[0].target).toBe('FR-1');
    expect(occ[0].fragment).toBe('acceptance');
    expect(occ[0].resolved).not.toBeNull();
  });

  it('leaves a same-file fragment link [[#heading]] with an empty target (not broken)', () => {
    const occ = resolveWikiLinks('[[#section]]', 'a.md', defs);
    expect(occ[0].target).toBe('');
    expect(brokenWikiLinks(occ)).toEqual([]);
  });

  it('records line numbers + finds multiple links per line', () => {
    const occ = resolveWikiLinks('x\n[[FR-1]] then [[AC-1.1]]', 'a.md', defs);
    expect(occ.map((o) => [o.target, o.line])).toEqual([
      ['FR-1', 2],
      ['AC-1.1', 2],
    ]);
  });
});
