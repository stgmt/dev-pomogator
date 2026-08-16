// Tests for the architecture-research-workflow scaffold + merge scripts (FR-12).
//
// init.ts and merge.ts are pure-ish file-IO entries — drive them against
// a fresh tmpdir and pin the contract the skill body promises:
//   • init creates exactly 7 stage files in `.specs/<slug>/.architecture-
//     research/` with template content
//   • init is idempotent without --force; --force overwrites
//   • merge writes `.specs/<slug>/RESEARCH.md` with a table of contents
//     + one Appendix per stage, in stage order
//   • merge writes a `.done` sentinel marker for the create-spec recursion
//     guard

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { initStageFiles, STAGES } from '../init.ts';
import { mergeStages } from '../merge.ts';

describe('initStageFiles', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `arch-init-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('creates exactly 7 stage files in the correct order', () => {
    const r = initStageFiles({ repoRoot: root, slug: 'foo' });
    expect(r.created).toHaveLength(7);
    expect(r.created).toEqual(STAGES.map((s) => `${s.num}-${s.slug}.md`));
    for (const name of r.created) {
      expect(fs.existsSync(path.join(r.dir, name))).toBe(true);
    }
  });

  it('idempotent without --force — second run creates 0 + skips 7', () => {
    initStageFiles({ repoRoot: root, slug: 'foo' });
    const second = initStageFiles({ repoRoot: root, slug: 'foo' });
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toHaveLength(7);
  });

  it('--force overwrites + re-creates all 7', () => {
    initStageFiles({ repoRoot: root, slug: 'foo' });
    const third = initStageFiles({ repoRoot: root, slug: 'foo', force: true });
    expect(third.created).toHaveLength(7);
    expect(third.skipped).toHaveLength(0);
  });

  it('stage 1 file references the right title in its template body', () => {
    const r = initStageFiles({ repoRoot: root, slug: 'foo' });
    const body = fs.readFileSync(path.join(r.dir, '1-problem-framing.md'), 'utf8');
    expect(body).toContain('Stage 1 — Problem framing');
  });
});

describe('mergeStages', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `arch-merge-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
    initStageFiles({ repoRoot: root, slug: 'auth' });
    // Replace stage bodies with distinct markers so the merge order is
    // observable in the produced RESEARCH.md.
    for (const stage of STAGES) {
      const file = path.join(
        root,
        '.specs',
        'auth',
        '.architecture-research',
        `${stage.num}-${stage.slug}.md`,
      );
      fs.writeFileSync(file, `STAGE-MARKER-${stage.num}\n`);
    }
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('writes RESEARCH.md with TOC + 7 appendices in stage order', () => {
    const r = mergeStages({ repoRoot: root, slug: 'auth' });
    expect(r.stagesIncluded).toBe(7);
    expect(r.stagesMissing).toEqual([]);
    const body = fs.readFileSync(r.researchMdPath, 'utf8');
    // TOC contains all 7 stage names.
    for (const s of STAGES) expect(body).toContain(`Stage ${s.num} — ${s.title}`);
    // Stage markers appear in stage-1 → stage-7 order.
    let cursor = 0;
    for (let i = 1; i <= 7; i++) {
      const next = body.indexOf(`STAGE-MARKER-${i}`, cursor);
      expect(next).toBeGreaterThanOrEqual(0);
      cursor = next;
    }
  });

  it('writes a .done sentinel with the stage count', () => {
    const r = mergeStages({ repoRoot: root, slug: 'auth' });
    const sentinel = JSON.parse(fs.readFileSync(r.doneMarkerPath, 'utf8')) as {
      stages_included: number;
      stages_missing: string[];
    };
    expect(sentinel.stages_included).toBe(7);
    expect(sentinel.stages_missing).toEqual([]);
  });

  it('reports missing stages in the result + sentinel without throwing', () => {
    fs.rmSync(
      path.join(root, '.specs/auth/.architecture-research/4-variants.md'),
      { force: true },
    );
    const r = mergeStages({ repoRoot: root, slug: 'auth' });
    expect(r.stagesIncluded).toBe(6);
    expect(r.stagesMissing).toEqual(['4-variants.md']);
  });

  it('throws a clear error when the stage dir does not exist (init not run)', () => {
    expect(() => mergeStages({ repoRoot: root, slug: 'never-init' })).toThrow(
      /stage dir does not exist/,
    );
  });

  it('regenerating after stage edits picks up the new body', () => {
    mergeStages({ repoRoot: root, slug: 'auth' });
    const stage3 = path.join(root, '.specs/auth/.architecture-research/3-broad-research.md');
    fs.writeFileSync(stage3, 'STAGE-MARKER-3\nNEW-CONTENT-IN-STAGE-3\n');
    const r2 = mergeStages({ repoRoot: root, slug: 'auth' });
    expect(fs.readFileSync(r2.researchMdPath, 'utf8')).toContain(
      'NEW-CONTENT-IN-STAGE-3',
    );
  });
});
