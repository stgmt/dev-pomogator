// Triple-anchor backward-compat tests for the MD parser (FR-3 / FR-11).
//
// A v3 spec heading like `### Requirement: FR-001 Login flow` MUST register
// THREE aliases all resolving to the same canonical id:
//   • compact id            FR-001
//   • modern slug           fr-001-login-flow
//   • legacy "requirement-" slug   requirement-fr-001-login-flow
//
// Modern v4 headings (`### FR-001: Login`) still register only the
// compact + modern slug pair — no regression.

import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../parsers/md.ts';

describe('parseMarkdown — triple anchor for legacy `Requirement:` headings', () => {
  it('registers three aliases all pointing at the same FR node', () => {
    const out = parseMarkdown('### Requirement: FR-001 Login flow\n', 'specs/auth/FR.md');
    expect(out.nodes).toHaveLength(1);
    const fr = out.nodes[0];
    expect(fr.type).toBe('FR');
    expect(fr.id).toBe('FR-001');
    expect('anchors' in fr ? fr.anchors : []).toEqual([
      'FR-001',
      'fr-001-login-flow',
      'requirement-fr-001-login-flow',
    ]);
    // Anchor stream: 3 entries with the same canonicalId.
    expect(out.anchors).toHaveLength(3);
    for (const a of out.anchors) expect(a.canonicalId).toBe('FR-001');
    const aliases = out.anchors.map((a) => a.alias);
    expect(aliases).toContain('FR-001');
    expect(aliases).toContain('fr-001-login-flow');
    expect(aliases).toContain('requirement-fr-001-login-flow');
  });

  it('all three aliases resolve to the same file:line tuple', () => {
    const out = parseMarkdown('## Requirement: FR-001 Login flow\n', 'specs/auth/FR.md');
    const locs = out.anchors.map((a) => `${a.location.file}:${a.location.line}`);
    expect(new Set(locs).size).toBe(1);
  });

  it('modern v4 heading still registers the two-anchor pair (no regression)', () => {
    const out = parseMarkdown('### FR-001: Login flow\n', 'specs/auth/FR.md');
    expect(out.anchors).toHaveLength(2);
    expect(out.anchors.map((a) => a.alias)).toEqual(['FR-001', 'fr-001-login-flow']);
  });

  it('mixed v3 + v4 headings in one file each register their own anchors', () => {
    const src = [
      '## Requirement: FR-001 Legacy',
      '',
      '## FR-002: Modern',
      '',
    ].join('\n');
    const out = parseMarkdown(src, 'mixed.md');
    expect(out.nodes).toHaveLength(2);
    expect(out.anchors.filter((a) => a.canonicalId === 'FR-001')).toHaveLength(3);
    expect(out.anchors.filter((a) => a.canonicalId === 'FR-002')).toHaveLength(2);
  });

  it('legacy heading title is what slugifies into the legacy alias', () => {
    const out = parseMarkdown('### Requirement: FR-007 Edge case handling\n', 'x.md');
    const aliases = out.anchors.map((a) => a.alias);
    expect(aliases).toContain('requirement-fr-007-edge-case-handling');
    expect(aliases).toContain('fr-007-edge-case-handling');
  });
});
