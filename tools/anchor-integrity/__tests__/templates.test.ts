// FR-34a / anchor-templates — a freshly-scaffolded spec must resolve every anchor
// in the Marksman LSP out of the box. scaffold-spec.ts copies the `*.md.template`
// files verbatim, so the guarantee reduces to: the template set is internally
// anchor-consistent. We load every template (stripping the `.template` suffix so
// same-dir cross-file resolution works) and assert checkLinks finds 0 broken.
//
// This is the regression that pins the `{название}`→braces fix: before it, a fresh
// scaffold carried 16 broken anchors (the `#fr-1-{название}` composite the heading
// slug `fr-1-название` never matched).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLinks } from '../check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(here, '..', '..', 'specs-generator', 'templates');
const hasTemplates = fs.existsSync(templatesDir);

describe('scaffold templates emit Marksman-resolvable anchors', () => {
  it.skipIf(!hasTemplates)('every `*.md.template` link anchor resolves (0 broken)', () => {
    const files = fs
      .readdirSync(templatesDir)
      .filter((n) => n.endsWith('.md.template'))
      .map((n) => ({
        file: n.replace(/\.template$/, ''),
        content: fs.readFileSync(path.join(templatesDir, n), 'utf-8'),
      }));

    expect(files.length).toBeGreaterThan(0);

    const broken = checkLinks(files);
    // Surface the exact offenders in the failure message — the fix slug is included.
    const detail = broken
      .map((b) => `${b.file}:${b.line} [${b.linkText}] #${b.brokenAnchor}` + (b.currentSlug ? ` → #${b.currentSlug}` : ' (ambiguous)'))
      .join('\n');
    expect(broken, `broken template anchors:\n${detail}`).toEqual([]);
  });
});
