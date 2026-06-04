// Golden test (FR-34a / AC-34.2): marksmanSlug() must equal the slug the REAL
// Marksman binary produces for every captured heading shape. The fixture is
// ground-truth (captured via textDocument/completion, NOT hand-written), so this
// is a real parity check — a Marksman version bump that changes slugging, or a
// regression in marksmanSlug(), fails loudly. Pure test: needs no binary.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marksmanSlug } from '../marksman-slug.mjs';

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../tests/fixtures/marksman/slug-rule.json',
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as {
  slugs: Record<string, string>;
};
const entries = Object.entries(fixture.slugs);

describe('marksmanSlug — golden parity with the real Marksman binary', () => {
  it('has a non-trivial fixture (guards against an empty/looted fixture)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(15);
  });

  it.each(entries)('slug(%j) === %j (Marksman ground-truth)', (text, expected) => {
    expect(marksmanSlug(text)).toBe(expected);
  });

  it('is idempotent (slug(slug(x)) === slug(x))', () => {
    for (const [text] of entries) {
      const once = marksmanSlug(text);
      expect(marksmanSlug(once)).toBe(once);
    }
  });

  it('keeps Cyrillic (Unicode-aware), drops the dot in dotted ids', () => {
    expect(marksmanSlug('AC-1.1')).toBe('ac-11');
    expect(marksmanSlug('Фаза 2 — нативный LSP')).toBe('фаза-2-нативный-lsp');
  });
});
