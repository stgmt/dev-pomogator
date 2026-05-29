/**
 * Unit tests for the SpecGraph markdown parser.
 *
 * The parser is the foundation of the in-memory graph (Phase 1, FR-2). These
 * tests pin its three Phase-1 invariants: every FR/NFR heading produces both
 * a compact and a slug anchor, every AC heading emits a `covers` edge back
 * to its parent FR, and 1-indexed line numbers survive parse round-trips.
 *
 * @see ../parsers/md.ts
 * @see ../types.ts
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../parsers/md.ts';
import type { FrNode, NfrNode, AcNode } from '../types.ts';

describe('parseMarkdown — FR / NFR / AC extraction', () => {
  it('emits a FrNode with compact + slug anchors for `## FR-N: Title`', () => {
    const md = '# Functional Requirements\n\n## FR-1: Login flow\n\nbody\n';
    const out = parseMarkdown(md, '.specs/auth/FR.md');

    expect(out.nodes).toHaveLength(1);
    const fr = out.nodes[0] as FrNode;
    expect(fr.type).toBe('FR');
    expect(fr.id).toBe('FR-1');
    expect(fr.title).toBe('Login flow');
    expect(fr.line).toBe(3); // 1-indexed: line 1 is `# Functional Requirements`
    expect(fr.anchors).toEqual(['FR-1', 'fr-1-login-flow']);

    expect(out.anchors).toEqual([
      { alias: 'FR-1', canonicalId: 'FR-1', location: { file: '.specs/auth/FR.md', line: 3 } },
      { alias: 'fr-1-login-flow', canonicalId: 'FR-1', location: { file: '.specs/auth/FR.md', line: 3 } },
    ]);
  });

  it('emits an NfrNode WITH category for `## NFR-Performance-N: Title`', () => {
    const md = '## NFR-Performance-1: SpecGraph cold start\n';
    const out = parseMarkdown(md, '.specs/v4/NFR.md');

    expect(out.nodes).toHaveLength(1);
    const nfr = out.nodes[0] as NfrNode;
    expect(nfr.type).toBe('NFR');
    expect(nfr.id).toBe('NFR-Performance-1');
    expect(nfr.category).toBe('Performance');
    expect(nfr.title).toBe('SpecGraph cold start');
    expect(nfr.anchors).toContain('NFR-Performance-1');
    expect(nfr.anchors).toContain('nfr-performance-1-specgraph-cold-start');
  });

  it('emits an NfrNode WITHOUT category for plain `## NFR-N: Title`', () => {
    const md = '## NFR-7: Backward compatibility\n';
    const out = parseMarkdown(md, '.specs/v4/NFR.md');

    expect(out.nodes).toHaveLength(1);
    const nfr = out.nodes[0] as NfrNode;
    expect(nfr.id).toBe('NFR-7');
    expect(nfr.category).toBeUndefined();
    expect(nfr.anchors).toContain('NFR-7');
  });

  it('emits an AcNode + `covers` edge for `## AC-N (FR-M)`', () => {
    const md = '## AC-3 (FR-1): User logs in\n\nWHEN user submits valid creds THEN SHALL be redirected.\n';
    const out = parseMarkdown(md, '.specs/auth/ACCEPTANCE_CRITERIA.md');

    expect(out.nodes).toHaveLength(1);
    const ac = out.nodes[0] as AcNode;
    expect(ac.type).toBe('AC');
    expect(ac.id).toBe('AC-3');
    expect(ac.parentFr).toBe('FR-1');

    expect(out.edges).toEqual([{ from: 'FR-1', to: 'AC-3', type: 'covers' }]);
  });

  it('handles dotted AC ids (`AC-N.M`) for sub-criteria', () => {
    const md = '## AC-2.1 (FR-5): Edge case\n';
    const out = parseMarkdown(md, '.specs/v4/ACCEPTANCE_CRITERIA.md');

    expect(out.nodes).toHaveLength(1);
    const ac = out.nodes[0] as AcNode;
    expect(ac.id).toBe('AC-2.1');
    expect(ac.parentFr).toBe('FR-5');
  });

  it('parses multiple headings in one file and preserves source order + lines', () => {
    const md = [
      '# Spec',
      '',
      '## FR-1: Alpha',
      '',
      'body',
      '',
      '## FR-2: Beta',
      '',
      'body',
      '',
      '## NFR-Performance-1: Cold start',
      '',
      '## AC-1 (FR-1)',
      '',
      'WHEN x THEN y SHALL z',
    ].join('\n');
    const out = parseMarkdown(md, 'spec.md');

    expect(out.nodes.map((n) => n.id)).toEqual([
      'FR-1',
      'FR-2',
      'NFR-Performance-1',
      'AC-1',
    ]);
    expect((out.nodes[0] as FrNode).line).toBe(3);
    expect((out.nodes[1] as FrNode).line).toBe(7);
    expect(out.edges).toEqual([{ from: 'FR-1', to: 'AC-1', type: 'covers' }]);
  });

  it('ignores headings that do not match any recognised pattern', () => {
    const md = '## Overview\n\n## Implementation Notes\n\n## FR-1: Real one\n';
    const out = parseMarkdown(md, 'spec.md');

    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0].id).toBe('FR-1');
  });

  it('slugifies cyrillic + special characters predictably', () => {
    const md = '## FR-9: Логин (с двух-факторкой!)\n';
    const out = parseMarkdown(md, 'spec.md');

    const fr = out.nodes[0] as FrNode;
    expect(fr.id).toBe('FR-9');
    // Cyrillic strips after NFKD + ASCII-class filter; suffix is the
    // sanitised ASCII slug. Predictable, even if visually thin.
    expect(fr.anchors[1].startsWith('fr-9-')).toBe(true);
    expect(/[a-z0-9-]+/.test(fr.anchors[1])).toBe(true);
  });

  it('emits no nodes for a markdown file with no spec headings', () => {
    const md = '# README\n\nThis project does X.\n\n## Setup\n\nrun `npm install`.\n';
    const out = parseMarkdown(md, 'README.md');

    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
    expect(out.anchors).toEqual([]);
  });
});
