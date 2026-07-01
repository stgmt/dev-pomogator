// Step definitions for SPECGEN004_361-370 — corpus-health (FR-36/FR-37/FR-44).
//
// Drives `corpusHealth` and `renderCorpusHealth` from the real production
// module in-process. No mocks — integration tests seed a fresh tmpdir from the
// V4World Before hook; pure-render tests build synthetic CorpusHealthReport
// objects and feed them directly to renderCorpusHealth.
//
// FR mapping (per corpus-health.ts comments + advisor guidance):
//   SPECGEN004_361, 364-366  → @feature37  (FR-37b: untraced atoms / stale / verdict)
//   SPECGEN004_362-363       → @feature36  (FR-36a: composite keys / collision detection)
//   SPECGEN004_367           → @feature37  (verdict icon, primary FR-37)
//   SPECGEN004_368-370       → @feature44  (GT-1/GT-2/GT-4 render sections)
//
// Classification: RUNTIME (in-process for all; no spawn needed).

import fs from 'node:fs';
import path from 'node:path';
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { V4World } from '../hooks/before-after.ts';
import {
  corpusHealth,
  renderCorpusHealth,
  type CorpusHealthReport,
} from '../../tools/spec-graph/corpus-health.ts';
import { buildGraphFromCwd } from '../../tools/spec-graph/builder.ts';

// ── World extension ──────────────────────────────────────────────────────────

interface CorpusHealthWorld extends V4World {
  corpusRoot?: string;
  healthReport?: CorpusHealthReport;
  renderOutput?: string;
  syntheticReport?: CorpusHealthReport;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Write minimal files to make the graph builder pick up a spec. */
function seedSpec(root: string, slug: string, files: Record<string, string>): void {
  const dir = path.join(root, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body);
  }
}

/** Build a minimal CorpusHealthReport with GREEN verdict (all counts zero). */
function greenReport(corpusRoot: string): CorpusHealthReport {
  return {
    corpusRoot,
    nodes: 0,
    edges: 0,
    collisions: { totalRawNodes: 0, uniqueIds: 0, collisions: [] },
    danglingEdges: { count: 0, samples: [] },
    untracedAtoms: { total: 0, byClass: {}, samples: [] },
    staleFileChanges: { count: 0, samples: [] },
    orphanProjectTests: { count: 0, samples: [] },
    frsWithoutResearch: { count: 0, samples: [] },
    unlinkedUpstream: { count: 0, byKind: {}, samples: [] },
    verdict: 'GREEN',
    strictVerdict: 'GREEN',
  };
}

/** Build a synthetic RED report with representative data for every section. */
function redReport(corpusRoot: string): CorpusHealthReport {
  return {
    corpusRoot,
    nodes: 5,
    edges: 8,
    collisions: {
      totalRawNodes: 6,
      uniqueIds: 5,
      collisions: [
        {
          id: 'dup:FR-1',
          firstFile: '.specs/spec-a/FR.md',
          secondFile: '.specs/spec-b/FR.md',
        },
      ],
    },
    danglingEdges: {
      count: 1,
      samples: [{ from: 'spec-a:FR-1', to: 'spec-b:FR-99', type: 'references', missing: 'to' }],
    },
    untracedAtoms: {
      total: 2,
      byClass: { UNCOVERED_FR: 1, TASK_UNTESTED: 1 },
      samples: [
        { class: 'UNCOVERED_FR', nodeId: 'spec-a:FR-2', file: '.specs/spec-a/FR.md', line: 5 },
        { class: 'TASK_UNTESTED', nodeId: 'spec-a:TASK-1', file: '.specs/spec-a/TASKS.md', line: 10 },
      ],
    },
    staleFileChanges: {
      count: 1,
      samples: [{ fr: 'spec-a:FR-1', path: 'gone/away.ts' }],
    },
    orphanProjectTests: {
      count: 1,
      samples: [{ testId: 'ORPHAN001_01', file: 'tests/e2e/orphan.test.ts', line: 7 }],
    },
    frsWithoutResearch: {
      count: 1,
      samples: [{ nodeId: 'spec-a:FR-3', file: '.specs/spec-a/FR.md', line: 12 }],
    },
    unlinkedUpstream: {
      count: 1,
      byKind: { Story: 1 },
      samples: [
        { kind: 'Story', nodeId: 'spec-a:US-1', file: '.specs/spec-a/USER_STORIES.md', line: 3 },
      ],
    },
    verdict: 'RED',
    strictVerdict: 'RED',
  };
}

// ── Given steps ──────────────────────────────────────────────────────────────

Given(
  /^a corpus-health temp corpus root with no specs$/,
  function (this: CorpusHealthWorld) {
    const root = path.join(this.tempDir, 'corpus');
    fs.mkdirSync(path.join(root, '.specs'), { recursive: true });
    this.corpusRoot = root;
  },
);

Given(
  /^a corpus-health temp corpus root where two specs share the same bare FR id$/,
  function (this: CorpusHealthWorld) {
    // A collision is detected when the SAME composite id (slug:FR-1) appears
    // twice — i.e. a single spec's FR.md has TWO ## FR-1 headings. The builder's
    // first-writer-wins dedup hides the second node in nodes Map; the raw
    // collision scan captures it before dedup.
    const root = path.join(this.tempDir, 'corpus');
    seedSpec(root, 'dup', {
      'FR.md': '## FR-1: First\n\nbody\n\n## FR-1: First again\n',
    });
    this.corpusRoot = root;
  },
);

Given(
  /^a corpus-health temp corpus root where two separate specs each have their own FR-1$/,
  function (this: CorpusHealthWorld) {
    // FR-36a: composite graph keys are slug:FR-N, so spec-a:FR-1 and spec-b:FR-1
    // are distinct nodes — no collision expected. Mirror the vitest fixture exactly.
    const root = path.join(this.tempDir, 'corpus');
    seedSpec(root, 'a', {
      'FR.md': '## FR-1: A\n',
      'ACCEPTANCE_CRITERIA.md': '## AC-1 (FR-1)\n',
      'a.feature': '@FR-1\nFeature: A\n  Scenario: a\n    Given x\n',
    });
    seedSpec(root, 'b', {
      'FR.md': '## FR-1: B\n',
      'ACCEPTANCE_CRITERIA.md': '## AC-1 (FR-1)\n',
      'b.feature': '@FR-1\nFeature: B\n  Scenario: b\n    Given x\n',
    });
    this.corpusRoot = root;
  },
);

Given(
  /^a corpus-health temp corpus root with one spec that has an untraced FR$/,
  function (this: CorpusHealthWorld) {
    // A spec with an FR.md whose FR node is not referenced by any scenario
    // (@featureN) in any .feature — the traceability check will emit UNCOVERED_FR.
    const root = path.join(this.tempDir, 'corpus');
    seedSpec(root, 'demo-untraced', {
      'FR.md': '## FR-1: Untraced feature\nNeeds a scenario.\n',
    });
    this.corpusRoot = root;
  },
);

Given(
  /^a corpus-health temp corpus root with a stale implements edge pointing to a missing file$/,
  function (this: CorpusHealthWorld) {
    // The builder reads a separate FILE_CHANGES.md file (not a section in FR.md)
    // with a specific table format: | Path | Action | Reason |. The file node
    // for 'gone/away.ts' is created with an implements+action=edit edge; since
    // gone/away.ts does not exist on disk, corpusHealth flags it as stale.
    const root = path.join(this.tempDir, 'corpus');
    seedSpec(root, 'stale', {
      'FR.md': '## FR-1: Stale\n',
      'ACCEPTANCE_CRITERIA.md': '## AC-1 (FR-1)\n',
      'stale.feature': '@FR-1\nFeature: S\n  Scenario: s\n    Given x\n',
      'FILE_CHANGES.md':
        '# F\n\n| Path | Action | Reason |\n|--|--|--|\n| `gone/away.ts` | edit | [FR-1](FR.md#fr-1-stale) |\n',
    });
    this.corpusRoot = root;
  },
);

Given(
  /^a corpus-health GREEN report$/,
  function (this: CorpusHealthWorld) {
    // Build a real GREEN report from a fully-traced corpus so renderCorpusHealth
    // has real data for every section (VERDICT: 🟢 GREEN requires verdict='GREEN').
    const root = path.join(this.tempDir, 'corpus');
    seedSpec(root, 'clean', {
      'FR.md': '## FR-1: Clean\n',
      'ACCEPTANCE_CRITERIA.md': '## AC-1 (FR-1)\n',
      'c.feature': '@FR-1\nFeature: C\n  Scenario: c\n    Given x\n',
    });
    this.healthReport = corpusHealth(root);
  },
);

Given(
  /^a synthetic corpus-health RED report with collisions and stale paths$/,
  function (this: CorpusHealthWorld) {
    this.syntheticReport = redReport(path.join(this.tempDir, 'corpus'));
  },
);

Given(
  /^a synthetic corpus-health RED report with untraced atoms$/,
  function (this: CorpusHealthWorld) {
    this.syntheticReport = redReport(path.join(this.tempDir, 'corpus'));
  },
);

Given(
  /^a synthetic corpus-health RED report with reverse-traceability debt$/,
  function (this: CorpusHealthWorld) {
    this.syntheticReport = redReport(path.join(this.tempDir, 'corpus'));
  },
);

// ── When steps ────────────────────────────────────────────────────────────────

When(
  /^corpusHealth is called on the temp corpus root$/,
  function (this: CorpusHealthWorld) {
    this.healthReport = corpusHealth(this.corpusRoot!);
  },
);

When(
  /^renderCorpusHealth is called on that report$/,
  function (this: CorpusHealthWorld) {
    this.renderOutput = renderCorpusHealth(this.healthReport!);
  },
);

When(
  /^renderCorpusHealth is called on that synthetic report$/,
  function (this: CorpusHealthWorld) {
    this.renderOutput = renderCorpusHealth(this.syntheticReport!);
  },
);

// ── Then steps — corpusHealth ──────────────────────────────────────────────

Then(
  /^the corpus-health report has verdict=GREEN and strictVerdict=GREEN$/,
  function (this: CorpusHealthWorld) {
    assert.equal(this.healthReport!.verdict, 'GREEN');
    assert.equal(this.healthReport!.strictVerdict, 'GREEN');
  },
);

Then(
  /^all corpus-health disease counts are zero$/,
  function (this: CorpusHealthWorld) {
    const r = this.healthReport!;
    assert.equal(r.collisions.collisions.length, 0);
    assert.equal(r.danglingEdges.count, 0);
    assert.equal(r.untracedAtoms.total, 0);
    assert.equal(r.staleFileChanges.count, 0);
  },
);

Then(
  /^the corpus-health report has a collision entry whose id contains "FR-1"$/,
  function (this: CorpusHealthWorld) {
    const r = this.healthReport!;
    assert.ok(
      r.collisions.collisions.length > 0,
      `Expected at least 1 collision, got 0. collisions object: ${JSON.stringify(r.collisions)}`,
    );
    assert.ok(
      r.collisions.collisions.some((c) => c.id.includes('FR-1')),
      `Expected a collision with id containing "FR-1". Got: ${JSON.stringify(r.collisions.collisions)}`,
    );
  },
);

Then(
  /^the corpus-health report has verdict=RED$/,
  function (this: CorpusHealthWorld) {
    assert.equal(this.healthReport!.verdict, 'RED');
  },
);

Then(
  /^the corpus-health report has collisions\.collisions\.length=0$/,
  function (this: CorpusHealthWorld) {
    const len = this.healthReport!.collisions.collisions.length;
    assert.equal(len, 0, `Expected 0 collisions, got ${len}: ${JSON.stringify(this.healthReport!.collisions.collisions)}`);
  },
);

Then(
  /^the corpus-health report has verdict=GREEN$/,
  function (this: CorpusHealthWorld) {
    assert.equal(this.healthReport!.verdict, 'GREEN');
  },
);

Then(
  /^the corpus-health report has untracedAtoms\.byClass\.UNCOVERED_FR=1$/,
  function (this: CorpusHealthWorld) {
    const byClass = this.healthReport!.untracedAtoms.byClass;
    assert.ok(
      (byClass['UNCOVERED_FR'] ?? 0) >= 1,
      `Expected UNCOVERED_FR>=1 in byClass. Got: ${JSON.stringify(byClass)}`,
    );
  },
);

Then(
  /^the corpus-health report has verdict=GREEN and strictVerdict=RED$/,
  function (this: CorpusHealthWorld) {
    assert.equal(this.healthReport!.verdict, 'GREEN');
    assert.equal(this.healthReport!.strictVerdict, 'RED');
  },
);

Then(
  /^the corpus-health report has staleFileChanges\.count=1$/,
  function (this: CorpusHealthWorld) {
    const cnt = this.healthReport!.staleFileChanges.count;
    assert.equal(cnt, 1, `Expected staleFileChanges.count=1, got ${cnt}`);
  },
);

// ── Then steps — renderCorpusHealth ───────────────────────────────────────

Then(
  /^the render output contains "([^"]+)"$/,
  function (this: CorpusHealthWorld, text: string) {
    const out = this.renderOutput!;
    assert.ok(out.includes(text), `Expected render output to contain "${text}".\nActual:\n${out}`);
  },
);

Then(
  /^the render output contains "dangling edge" or renders a dangling-edge line$/,
  function (this: CorpusHealthWorld) {
    const out = this.renderOutput!;
    // The render shows a dangling-edge line like "   [references] from → to (missing: to)"
    const hasDangling = out.includes('dangling') || out.includes('missing:');
    assert.ok(hasDangling, `Expected dangling-edge content in render output.\nActual:\n${out}`);
  },
);

Then(
  /^the render output contains the stale path sample$/,
  function (this: CorpusHealthWorld) {
    const out = this.renderOutput!;
    assert.ok(
      out.includes('gone/away.ts'),
      `Expected stale path "gone/away.ts" in render output.\nActual:\n${out}`,
    );
  },
);

Then(
  /^the render output matches "([^"]+)"$/,
  function (this: CorpusHealthWorld, pattern: string) {
    const out = this.renderOutput!;
    assert.match(out, new RegExp(pattern, 's'), `Render output did not match /${pattern}/s.\nActual:\n${out}`);
  },
);
