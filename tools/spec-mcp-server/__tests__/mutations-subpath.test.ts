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

  it('does not block an unrelated edit for pre-existing staged FR-47 design/story warnings', () => {
    const siblingDir = path.join(root, '.specs', 'sibling');
    fs.mkdirSync(siblingDir, { recursive: true });
    fs.writeFileSync(path.join(siblingDir, 'FR.md'), '## FR-1: Sibling @feature1\n\nSibling body.\n');
    fs.writeFileSync(path.join(siblingDir, 'TASKS.md'), '## Phase 1\n\n- [x] Sibling task — id: sibling-t1 — Status: DONE | Est: 30m\n  _Requirements: FR-1_\n  **Done When:**\n  - [ ] sibling evidence\n');

    const r = validateSpecChange(root, slug, 'FR.md', { content: '## FR-1: Thing renamed @feature1\n\nDoes a thing.\n' });
    expect(r.ok).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('blocks a graph edit that introduces a new FR without design/story legs', () => {
    const r = validateSpecChange(root, slug, 'FR.md', {
      content: '## FR-1: Thing @feature1\n\nDoes a thing.\n\n## FR-2: New uncovered trace leg @feature2\n\nNeeds declared design and story legs.\n',
    });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.message.startsWith('FR_NO_DESIGN:'))).toBe(true);
    expect(r.findings.some((f) => f.message.startsWith('FR_NO_STORY:'))).toBe(true);
  });

  it('ignores pre-existing task truth debt, permits scenario authoring, but blocks a new DONE bypass', () => {
    const task = (status: 'IN_PROGRESS' | 'DONE', checked: boolean) =>
      `## Phase 1\n\n- [${status === 'DONE' ? 'x' : ' '}] Task — id: t1 — Status: ${status} | Est: 30m\n  _Requirements: FR-1_\n  **Done When:**\n  - [${checked ? 'x' : ' '}] evidence\n`;
    fs.writeFileSync(path.join(root, '.specs', slug, 'TASKS.md'), task('DONE', false));

    const unrelated = validateSpecChange(root, slug, 'FR.md', {
      content: '## FR-1: Thing @feature1\n\nDoes a renamed thing.\n',
    });
    expect(unrelated.ok).toBe(true);
    expect(unrelated.findings).toHaveLength(0);

    const feature = '@feature1\nFeature: Delta gate\n\n  Scenario: DEMO001_01 newly authored scenario\n    Given a real precondition\n    When the behavior executes\n    Then the result is observed\n';
    const scenario = validateSpecChange(root, slug, 'demo.feature', { content: feature });
    expect(scenario.ok).toBe(true);
    expect(scenario.findings).toHaveLength(0);

    fs.writeFileSync(path.join(root, '.specs', slug, 'TASKS.md'), task('IN_PROGRESS', false));
    const bypass = validateSpecChange(root, slug, 'TASKS.md', { content: task('DONE', false) });
    expect(bypass.ok).toBe(false);
    expect(bypass.findings.some((f) => f.message.startsWith('TASK_DONE_CHECKLIST_OPEN:'))).toBe(true);
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
