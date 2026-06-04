// Tests for the anchor-integrity check (FR-34a / AC-34.1): same-file + cross-file
// detection, code-span/fence skipping, and id→current-slug inference for the fixer.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLinks, indexHeadings, idFromHeading, checkSpecDir } from '../check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('indexHeadings / idFromHeading', () => {
  it('indexes slugs + id→slug, dot-dropped for AC', () => {
    const { slugs, idToSlug } = indexHeadings('# Doc\n\n## FR-7: Title\n\n## AC-1.1 (FR-1)\n');
    expect(slugs.has('fr-7-title')).toBe(true);
    expect(slugs.has('ac-11-fr-1')).toBe(true);
    expect(idToSlug.get('FR-7')).toBe('fr-7-title');
    expect(idToSlug.get('AC-1.1')).toBe('ac-11-fr-1');
  });
  it('extracts the canonical id from a heading', () => {
    expect(idFromHeading('FR-7: Title')).toBe('FR-7');
    expect(idFromHeading('NFR-Performance-1')).toBe('NFR-Performance-1');
    expect(idFromHeading('AC-1.1 (FR-1)')).toBe('AC-1.1');
    expect(idFromHeading('Overview')).toBe('');
  });
});

describe('checkLinks — same-file', () => {
  it('passes when the anchor matches the heading slug', () => {
    const files = [{ file: '.specs/x/FR.md', content: '## FR-7\n\nsee [FR-7](#fr-7)\n' }];
    expect(checkLinks(files)).toEqual([]);
  });
  it('flags a broken same-file anchor + infers the current slug for the fix', () => {
    const files = [{ file: '.specs/x/FR.md', content: '## FR-7\n\nsee [FR-7](#fr-7-old)\n' }];
    const broken = checkLinks(files);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ brokenAnchor: 'fr-7-old', targetFile: '', inferredId: 'FR-7', currentSlug: 'fr-7' });
  });
  it('resolves a dotted AC by the dot-dropped slug', () => {
    const files = [{ file: '.specs/x/AC.md', content: '## AC-1.1\n\n[AC-1.1](#ac-11)\n' }];
    expect(checkLinks(files)).toEqual([]);
  });
});

describe('checkLinks — cross-file', () => {
  it('flags a broken cross-file anchor + infers the fix from the other file', () => {
    const files = [
      { file: '.specs/x/AC.md', content: '## AC-1.1\n' },
      { file: '.specs/x/FR.md', content: 'see [AC-1.1](ACCEPTANCE.md#ac-1-1)\n'.replace('ACCEPTANCE.md', 'AC.md') },
    ];
    const broken = checkLinks(files);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ targetFile: '.specs/x/AC.md', brokenAnchor: 'ac-1-1', inferredId: 'AC-1.1', currentSlug: 'ac-11' });
  });
  it('passes a correct cross-file link', () => {
    const files = [
      { file: '.specs/x/AC.md', content: '## AC-1.1\n' },
      { file: '.specs/x/FR.md', content: '[AC-1.1](AC.md#ac-11)\n' },
    ];
    expect(checkLinks(files)).toEqual([]);
  });
});

describe('checkLinks — skips illustrative links', () => {
  it('ignores a broken link inside an inline code span', () => {
    const files = [{ file: '.specs/x/FR.md', content: '## FR-7\n\nexample `[FR-7](#fr-7-old)` here\n' }];
    expect(checkLinks(files)).toEqual([]);
  });
  it('ignores links inside a fenced code block', () => {
    const files = [{ file: '.specs/x/FR.md', content: '## FR-7\n\n```\n[FR-7](#fr-7-old)\n```\n' }];
    expect(checkLinks(files)).toEqual([]);
  });
});

describe('checkSpecDir — real corpus (the migrated spec resolves)', () => {
  const repoRoot = path.resolve(here, '../../..');
  // `.specs/` is `.dockerignore`d, so these skip in the Docker suite and run on a
  // host/CI that has the specs. The check LOGIC is covered by the synthetic tests
  // above; the standalone CLI (`check.mjs --all`) is the host/CI corpus gate.
  const hasSpecs = fs.existsSync(path.join(repoRoot, '.specs', 'spec-generator-v4'));

  it.skipIf(!hasSpecs)('spec-generator-v4 has zero broken anchors (post-migration)', () => {
    const broken = checkSpecDir(path.join(repoRoot, '.specs', 'spec-generator-v4'), repoRoot);
    if (broken.length) console.error('UNEXPECTED broken in v4:', JSON.stringify(broken.slice(0, 5), null, 1));
    expect(broken).toEqual([]);
  });

  // RATCHET. The corpus currently has ~1744 broken anchors — VERIFIED against the
  // real Marksman binary (links like `#fr-3-devpomogator-…` don't match the real
  // heading slug `fr-3-dev-pomogator-…`; a buggy historical slugifier dropped
  // compound-word dashes Marksman keeps). The deterministic fixer (FR-34c) + the
  // template fix (H1) drive this toward 0; until then this forbids NEW breaks.
  const BASELINE = 1744;
  it.skipIf(!hasSpecs)(`corpus broken anchors stay ≤ baseline ${BASELINE} (no NEW breaks)`, () => {
    let total = 0;
    for (const d of fs.readdirSync(path.join(repoRoot, '.specs'))) {
      const dir = path.join(repoRoot, '.specs', d);
      try {
        if (!fs.statSync(dir).isDirectory()) continue;
        if (!fs.existsSync(path.join(dir, 'FR.md'))) continue;
        total += checkSpecDir(dir, repoRoot).length;
      } catch {
        /* unreadable spec dir — skip */
      }
    }
    console.error(`[anchor-integrity] corpus broken anchors: ${total} (baseline ${BASELINE})`);
    expect(total).toBeLessThanOrEqual(BASELINE);
  });
});
