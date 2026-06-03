/**
 * Phase 1 / FR-13 BDD step definitions — orphan scenario-tag policy.
 * Covers SPECGEN004_29 (default warn) and SPECGEN004_30 (config escalation to
 * block) against the REAL conformance checker — no mocks. The hook block/no-block
 * outcome is asserted via the finding severity, which is exactly what the
 * spec-conformance-guard keys its deny decision on.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_29..30
 * @see ../../tools/spec-graph/conformance.ts (checkConformance opts.orphanPolicy)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { checkConformance, type Finding } from '../../tools/spec-graph/conformance.ts';
import type { SpecGraph, FrNode, ScenarioNode } from '../../tools/spec-graph/types.ts';

interface OrphanWorld {
  graph?: SpecGraph;
  orphanPolicy?: { scenario_tag_orphan?: 'warn' | 'block' };
  findings?: Finding[];
}

/** A real graph: one existing FR-1 + a Scenario carrying the orphan tag @FR-999. */
function graphWithOrphanTag(): SpecGraph {
  const nodes = new Map<string, FrNode | ScenarioNode>();
  nodes.set('FR-1', { id: 'FR-1', type: 'FR', file: 'FR.md', line: 1, title: 'Login', anchors: ['FR-1'], body: '' });
  nodes.set('s1', { id: 's1', type: 'Scenario', file: 'demo.feature', line: 3, tags: ['@FR-999'], steps: [] });
  return { version: 1, builtAt: '', nodes: nodes as SpecGraph['nodes'], edges: [], definitions: new Map(), backlinks: new Map() };
}

const orphanFinding = (w: OrphanWorld): Finding => {
  const f = w.findings!.find((x) => x.code === 'SCENARIO_TAG_ORPHAN');
  assert.ok(f, 'expected a SCENARIO_TAG_ORPHAN finding');
  return f;
};

Given(/contains .@FR-999.* FR-999 doesn.t exist$/, function (this: OrphanWorld) {
  this.graph = graphWithOrphanTag();
});

Given(/orphan_policy\.scenario_tag_orphan = "block"/, function (this: OrphanWorld) {
  this.orphanPolicy = { scenario_tag_orphan: 'block' };
});

Given(/contains .@FR-999. Scenario for non-existent FR$/, function (this: OrphanWorld) {
  this.graph = graphWithOrphanTag();
});

When(/.conformance_check. runs$/, function (this: OrphanWorld) {
  this.findings = checkConformance(this.graph!, { orphanPolicy: this.orphanPolicy });
});

Then(/result includes finding code .SCENARIO_TAG_ORPHAN.$/, function (this: OrphanWorld) {
  assert.ok(this.findings!.some((f) => f.code === 'SCENARIO_TAG_ORPHAN'));
});

Then(/severity is .warning. \(default policy\)$/, function (this: OrphanWorld) {
  assert.equal(orphanFinding(this).severity, 'warning');
});

Then(/lists existing similar IDs \(top-3 by Levenshtein distance\)$/, function (this: OrphanWorld) {
  const rename = orphanFinding(this).suggestions!.find((s) => s.action === 'rename_tag');
  assert.ok(rename, 'expected a rename_tag suggestion');
  assert.match(rename.reason, /@FR-1\b/); // FR-1 is the closest existing id
});

Then(/the Write of the \.feature file is NOT blocked$/, function (this: OrphanWorld) {
  assert.notEqual(orphanFinding(this).severity, 'error'); // warn never blocks a Write
});

Then(/severity is .error. \(escalated from default warn\)$/, function (this: OrphanWorld) {
  assert.equal(orphanFinding(this).severity, 'error');
});

Then(/blocks the operation$/, function (this: OrphanWorld) {
  assert.equal(orphanFinding(this).severity, 'error'); // error severity drives the guard deny
});

Then(/the user is prompted to resolve before commit$/, function (this: OrphanWorld) {
  assert.ok(orphanFinding(this).suggestions!.length > 0); // actionable resolution is offered
});
