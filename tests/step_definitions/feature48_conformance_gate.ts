/**
 * @feature48 step definitions (conformance start gate) — SPECGEN004_173. FR-48b: a
 * task already in a working status (in-progress) whose requirement chain is not
 * assembled raises TASK_STARTED_WITHOUT_CHAIN (WARNING, detect-first), naming the
 * missing legs. Drives the real checkConformance — the same finding the door (which
 * filters error-severity) will gate on once promoted. Synthetic graph.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_173
 * @see .specs/spec-generator-v4/FR.md FR-48 (FR-48b / FR-48c)
 * @see tools/spec-graph/conformance.ts (TASK_STARTED_WITHOUT_CHAIN)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import { checkConformance, type Finding } from '../../tools/spec-graph/conformance.ts';

interface GateWorld extends V4World {
  cgGraph?: unknown;
  cgFindings?: Finding[];
}

Given('a graph with an impl task in-progress whose FR lacks design and story', function (this: GateWorld) {
  // FR-1 has an AC and a tested-by scenario, but NO Decision and NO Story; an impl
  // task (no [spec-phase] marker) refs FR-1 and is already in-progress.
  const nodes = new Map<string, unknown>([
    ['demo:FR-1', { id: 'demo:FR-1', type: 'FR', file: 'FR.md', line: 1, title: 'x', anchors: ['FR-1'], body: '' }],
    ['demo:AC-1', { id: 'demo:AC-1', type: 'AC', file: 'AC.md', line: 1, parentFr: 'demo:FR-1', ears: '' }],
    ['demo:SCEN-1', { id: 'demo:SCEN-1', type: 'Scenario', file: 'x.feature', line: 1, tags: ['@FR-1'], steps: [], lastResult: 'PASSED' }],
    ['demo:T1', { id: 'demo:T1', type: 'Task', status: 'in-progress', refs: ['demo:FR-1'], doneWhen: 'write the code', phase: 'Phase 9', file: 'TASKS.md', line: 3 }],
  ]);
  const edges = [
    { from: 'demo:FR-1', to: 'demo:AC-1', type: 'covers' },
    { from: 'demo:FR-1', to: 'demo:SCEN-1', type: 'tested-by' },
  ];
  this.cgGraph = { version: 1, builtAt: '', definitions: new Map(), backlinks: new Map(), nodes, edges };
});

When('conformance checks the start gate', function (this: GateWorld) {
  this.cgFindings = checkConformance(this.cgGraph as never);
});

Then('a TASK_STARTED_WITHOUT_CHAIN warning is raised naming the missing legs', function (this: GateWorld) {
  const f = this.cgFindings!.filter((x) => x.code === 'TASK_STARTED_WITHOUT_CHAIN');
  assert.ok(f.some((x) => x.nodeId === 'demo:T1'), 'TASK_STARTED_WITHOUT_CHAIN raised for the in-progress impl task');
  const found = f.find((x) => x.nodeId === 'demo:T1')!;
  assert.equal(found.severity, 'warning', 'detect-first: WARNING, not a hard gate yet');
  assert.match(found.message, /design/, 'names the missing design leg');
  assert.match(found.message, /story/, 'names the missing story leg');
});
