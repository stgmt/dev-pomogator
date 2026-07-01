// Tests for the deterministic anchor fixer (FR-34c / AC-34.4): id-bearing links are
// rewritten to the current slug; ambiguous links are left for the claude -p fallback;
// idempotent; round-trip (broken → fix → 0 broken).

import { describe, it, expect } from 'vitest';
import { applyFixes } from '../fix.mjs';
import { checkLinks } from '../check.mjs';

const broken = (files: { file: string; content: string }[]) => checkLinks(files);

describe('applyFixes — deterministic id-bearing repair', () => {
  it('rewrites a broken same-file anchor to the current slug', () => {
    const files = [{ file: '.specs/x/FR.md', content: '## FR-7\n\nsee [FR-7](#fr-7-old)\n' }];
    const { changed, fixable, skipped } = applyFixes(files, broken(files));
    expect(fixable).toBe(1);
    expect(skipped).toBe(0);
    expect(changed['.specs/x/FR.md']).toContain('[FR-7](#fr-7)');
    expect(changed['.specs/x/FR.md']).not.toContain('#fr-7-old');
  });

  it('round-trips: broken → fix → zero broken', () => {
    const files = [
      { file: '.specs/x/AC.md', content: '## AC-1.1\n' },
      { file: '.specs/x/FR.md', content: 'a [FR-7](#fr-7-old) and [AC-1.1](AC.md#ac-1-1)\n## FR-7\n' },
    ];
    const { changed } = applyFixes(files, broken(files));
    const fixed = files.map((f) => ({ file: f.file, content: changed[f.file] ?? f.content }));
    expect(broken(fixed)).toEqual([]);
  });

  it('is idempotent (fixing already-correct content is a no-op)', () => {
    const files = [{ file: '.specs/x/FR.md', content: '## FR-7\n[FR-7](#fr-7)\n' }];
    const first = applyFixes(files, broken(files));
    expect(first.fixable).toBe(0);
    expect(Object.keys(first.changed)).toEqual([]);
  });

  it('leaves an ambiguous link (no inferable id) UNTOUCHED for the claude -p fallback', () => {
    const files = [{ file: '.specs/x/FR.md', content: '## FR-7: Auth flow\n\n[see the flow](#auth-flow-old)\n' }];
    const b = broken(files);
    expect(b).toHaveLength(1);
    expect(b[0].currentSlug).toBeNull(); // no id in "see the flow"
    const { changed, fixable, skipped } = applyFixes(files, b);
    expect(fixable).toBe(0);
    expect(skipped).toBe(1);
    expect(Object.keys(changed)).toEqual([]); // never guess-rewrite
  });

  it('fixes a broken cross-file anchor (dot-dropped)', () => {
    const files = [
      { file: '.specs/x/AC.md', content: '## AC-1.1\n' },
      { file: '.specs/x/FR.md', content: '[AC-1.1](AC.md#ac-1-1)\n' },
    ];
    const { changed } = applyFixes(files, broken(files));
    expect(changed['.specs/x/FR.md']).toContain('[AC-1.1](AC.md#ac-11)');
  });
});
