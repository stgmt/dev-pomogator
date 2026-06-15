/**
 * validateSpecChange subpath gating (P19-6 hardening, 2026-06-15).
 *
 * A subdir doc whose BASENAME is a graph doc (sub/FR.md, sub/TASKS.md, sub/x.feature)
 * IS ingested by the recursive builder walk, so it MUST pass the form/anchor/conformance
 * gates — a too-broad `rel.includes('/')` carve-out previously let such a doc bypass the
 * conformance floor through the door. Genuine non-graph working docs (research prose,
 * attachments) in a subdir stay exempt.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateSpecChange } from '../mutations.ts';

let root: string;
const slug = 'demo';

beforeEach(() => {
  root = path.join(os.tmpdir(), `mut-subpath-${randomUUID()}`);
  fs.mkdirSync(path.join(root, '.specs', slug), { recursive: true });
  fs.writeFileSync(path.join(root, '.specs', slug, 'FR.md'), '## FR-1: Thing @feature1\n\nDoes a thing.\n');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('validateSpecChange — subpath gating', () => {
  it('exempts a genuine NON-graph research subdir doc (gates skipped)', () => {
    const r = validateSpecChange(root, slug, '.architecture-research/1-stage.md', { content: '# Notes\n\nfreeform prose.\n' });
    expect(r.ok).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('GATES a subdir doc whose basename is a graph doc (sub/FR.md) — broken anchor is flagged', () => {
    const broken = '## FR-9: Thing @feature9\n\nSee [the rule](FR.md#this-anchor-does-not-exist).\n';
    const r = validateSpecChange(root, slug, 'sub/FR.md', { content: broken });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => /anchor/i.test(f.message ?? ''))).toBe(true);
  });

  it('GATES a subdir TASKS.md (the recursive builder ingests it by basename)', () => {
    // A subdir TASKS.md is walked + parsed into Task nodes, so it must pass the gates
    // rather than auto-pass via the carve-out. We assert the carve-out no longer
    // short-circuits it: a broken-anchor body is flagged.
    const body = '## Phase 1\n\n- [x] T — id: t1 — Status: DONE\n  See [x](FR.md#nope).\n  **Done When:**\n  - [x] x\n';
    const r = validateSpecChange(root, slug, 'sub/TASKS.md', { content: body });
    expect(r.ok).toBe(false);
  });
});
