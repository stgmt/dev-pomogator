/**
 * Unit: P21-5 rename/move helpers (findInboundLinks / rewriteInboundLinks).
 *
 * Real tmpdir corpus (no mocks). Pins the anchors-aware contract the
 * rename_spec_doc gate relies on: inbound markdown links to a target are found
 * across the corpus, self-links are excluded, and a rewrite retargets the path
 * while preserving the #fragment — so a rename never silently strands a link.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { findInboundLinks, rewriteInboundLinks } from '../mutations.ts';

let root: string;
beforeEach(() => {
  root = path.join(os.tmpdir(), `rn-unit-${randomUUID()}`);
  const dir = path.join(root, '.specs', 'demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Demo\n\nSelf [me](FR.md#fr-1) — a self-link, must NOT count.\n');
  fs.writeFileSync(path.join(dir, 'ACCEPTANCE_CRITERIA.md'), '# AC\n\n[a](FR.md#fr-1) and [b](FR.md#fr-2) and external [x](https://e/FR.md#z).\n');
  // a sibling spec linking cross-dir at the same target
  const other = path.join(root, '.specs', 'other');
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(other, 'DESIGN.md'), '# D\n\nSee [it](../demo/FR.md#fr-1).\n');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('findInboundLinks', () => {
  it('finds inbound links from OTHER docs (same-spec + cross-spec), excludes self-links and external URLs', () => {
    const inbound = findInboundLinks(root, '.specs/demo/FR.md');
    const files = inbound.map((l) => l.file).sort();
    // AC: [a]#fr-1 + [b]#fr-2 (the https one is excluded); other/DESIGN.md: 1.
    expect(files).toEqual(['.specs/demo/ACCEPTANCE_CRITERIA.md', '.specs/demo/ACCEPTANCE_CRITERIA.md', '.specs/other/DESIGN.md']);
    // the FR.md self-link is NOT counted (it travels with the moved doc)
    expect(inbound.some((l) => l.file.endsWith('/FR.md'))).toBe(false);
    // fragments preserved
    expect(inbound.find((l) => l.file.endsWith('DESIGN.md'))!.fragment).toBe('#fr-1');
  });
});

describe('rewriteInboundLinks', () => {
  it('retargets the path while preserving #fragment, one edit per file', () => {
    const inbound = findInboundLinks(root, '.specs/demo/FR.md');
    const edits = rewriteInboundLinks(root, inbound, '.specs/demo/REQUIREMENTS.md');
    // 2 referencing files (AC has 2 links → ONE edited file), DESIGN cross-spec
    expect(edits.map((e) => e.file).sort()).toEqual(['.specs/demo/ACCEPTANCE_CRITERIA.md', '.specs/other/DESIGN.md']);
    const ac = edits.find((e) => e.file.endsWith('ACCEPTANCE_CRITERIA.md'))!.content;
    expect(ac.includes('](FR.md#')).toBe(false); // old same-dir path gone
    expect(ac.includes('REQUIREMENTS.md#fr-1')).toBe(true);
    expect(ac.includes('REQUIREMENTS.md#fr-2')).toBe(true);
    expect(ac.includes('https://e/FR.md#z')).toBe(true); // external link untouched
    const design = edits.find((e) => e.file.endsWith('DESIGN.md'))!.content;
    // cross-spec link gets the correct relative path to the new name
    expect(design.includes('../demo/REQUIREMENTS.md#fr-1')).toBe(true);
  });
});
