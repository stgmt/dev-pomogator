/**
 * @feature47 step definitions (toothless guard) — SPECGEN004_170. FR-47d: a
 * `### Decision:` / `### User Story:` block that declares no `**Требование:** [FR-N]`
 * line covers no requirement (its parentFr is empty) → the design/story leg dangles.
 * checkConformance raises TOOTHLESS_DECISION / TOOTHLESS_STORY (WARNING, detect-first)
 * for the unlabelled blocks, and stays silent for a labelled one. Synthetic graph,
 * real checkConformance.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_170
 * @see .specs/spec-generator-v4/FR.md FR-47 (FR-47d format guard)
 * @see tools/spec-graph/conformance.ts (TOOTHLESS_DECISION / TOOTHLESS_STORY)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import { checkConformance, type Finding } from '../../tools/spec-graph/conformance.ts';

interface ToothlessWorld extends V4World {
  tGraph?: unknown;
  tFindings?: Finding[];
}

Given(
  'a graph with a Decision and a Story that declare no requirement line, plus one labelled Decision',
  function (this: ToothlessWorld) {
    const nodes = new Map<string, unknown>([
      ['demo:FR-1', { id: 'demo:FR-1', type: 'FR', file: 'FR.md', line: 1, title: 'x', anchors: ['FR-1'], body: '' }],
      // toothless: parentFr empty → no **Требование:** line was present at parse time
      ['demo:Decision-bad', { id: 'demo:Decision-bad', type: 'Decision', file: 'DESIGN.md', line: 5, title: 'bad', parentFr: '', body: '' }],
      ['demo:Story-bad', { id: 'demo:Story-bad', type: 'Story', file: 'USER_STORIES.md', line: 9, title: 'bad', parentFr: '', body: '' }],
      // labelled: parentFr set → its covers edge exists, not toothless
      ['demo:Decision-good', { id: 'demo:Decision-good', type: 'Decision', file: 'DESIGN.md', line: 13, title: 'good', parentFr: 'demo:FR-1', body: '' }],
    ]);
    const edges = [{ from: 'demo:FR-1', to: 'demo:Decision-good', type: 'covers' }];
    this.tGraph = { version: 1, builtAt: '', definitions: new Map(), backlinks: new Map(), nodes, edges };
  },
);

When('conformance checks the toothless-block guard', function (this: ToothlessWorld) {
  this.tFindings = checkConformance(this.tGraph as never);
});

Then(
  'TOOTHLESS_DECISION and TOOTHLESS_STORY fire for the unlabelled blocks but not the labelled one',
  function (this: ToothlessWorld) {
    const toothlessDec = this.tFindings!.filter((f) => f.code === 'TOOTHLESS_DECISION');
    const toothlessStory = this.tFindings!.filter((f) => f.code === 'TOOTHLESS_STORY');
    assert.ok(toothlessDec.some((f) => f.nodeId === 'demo:Decision-bad'), 'TOOTHLESS_DECISION fires for the unlabelled Decision');
    assert.ok(toothlessStory.some((f) => f.nodeId === 'demo:Story-bad'), 'TOOTHLESS_STORY fires for the unlabelled Story');
    // the labelled Decision (parentFr set) must NOT be flagged — its edge is real.
    assert.ok(!toothlessDec.some((f) => f.nodeId === 'demo:Decision-good'), 'the labelled Decision is NOT toothless');
    assert.equal(toothlessDec[0]?.severity, 'warning', 'detect-first: WARNING, not a hard gate');
  },
);
