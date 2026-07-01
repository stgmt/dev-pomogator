/**
 * @feature48 step definitions (chain-assembled gate) — SPECGEN004_172. FR-48b: the
 * start decision is phase-aware. An impl task may enter a working status only when its
 * requirement's chain is assembled (AC + scenario + design + story); a spec-authoring
 * task (marked [spec-phase]) is always allowed — it CREATES the legs (anti-deadlock).
 * Drives the real canEnterWorkingStatus on a synthetic graph.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_172
 * @see .specs/spec-generator-v4/FR.md FR-48 (FR-48b)
 * @see tools/spec-graph/task-lifecycle.ts (canEnterWorkingStatus / chainAssembledFor)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import { canEnterWorkingStatus } from '../../tools/spec-graph/task-lifecycle.ts';

interface ChainWorld extends V4World {
  gGraph?: unknown;
  implResult?: { allowed: boolean; missing: string[]; specPhase: boolean };
  specResult?: { allowed: boolean; missing: string[]; specPhase: boolean };
}

Given('an FR whose chain is missing its design and story legs', function (this: ChainWorld) {
  // FR-1 has an AC and a tested-by scenario, but NO Decision and NO Story edge.
  const nodes = new Map<string, unknown>([
    ['demo:FR-1', { id: 'demo:FR-1', type: 'FR', file: 'FR.md', line: 1, title: 'x', anchors: ['FR-1'], body: '' }],
    ['demo:AC-1', { id: 'demo:AC-1', type: 'AC', file: 'AC.md', line: 1, parentFr: 'demo:FR-1', ears: '' }],
    ['demo:SCEN-1', { id: 'demo:SCEN-1', type: 'Scenario', file: 'x.feature', line: 1, tags: ['@FR-1'], steps: [], lastResult: 'PASSED' }],
  ]);
  const edges = [
    { from: 'demo:FR-1', to: 'demo:AC-1', type: 'covers' },
    { from: 'demo:FR-1', to: 'demo:SCEN-1', type: 'tested-by' },
  ];
  this.gGraph = { version: 1, builtAt: '', definitions: new Map(), backlinks: new Map(), nodes, edges };
});

When('the start gate evaluates an impl task and a spec-authoring task for that FR', function (this: ChainWorld) {
  const implTask = { refs: ['demo:FR-1'], doneWhen: 'write the code', phase: 'Phase 9' };
  const specTask = { refs: ['demo:FR-1'], doneWhen: 'author the DESIGN decision [spec-phase]', phase: 'Phase 9' };
  this.implResult = canEnterWorkingStatus(this.gGraph as never, implTask);
  this.specResult = canEnterWorkingStatus(this.gGraph as never, specTask);
});

Then(
  'the impl task is blocked with the missing legs listed and the spec-authoring task is allowed',
  function (this: ChainWorld) {
    assert.equal(this.implResult!.allowed, false, 'impl task blocked — chain not assembled');
    assert.ok(this.implResult!.missing.some((m) => m.endsWith(':design')), 'design leg listed as missing');
    assert.ok(this.implResult!.missing.some((m) => m.endsWith(':story')), 'story leg listed as missing');
    // AC + scenario are present, so they must NOT be listed.
    assert.ok(!this.implResult!.missing.some((m) => m.endsWith(':AC')), 'AC present, not listed');
    // spec-authoring task is exempt (anti-deadlock) regardless of missing legs.
    assert.equal(this.specResult!.allowed, true, 'spec-authoring task allowed');
    assert.equal(this.specResult!.specPhase, true, 'spec-authoring detected via [spec-phase] marker');
  },
);
