/**
 * @feature35 step definitions — honesty hardening (FR-35), bound to the REAL
 * spec-graph honesty logic (no mocks). Built incrementally per Phase-12 WS-A:
 *   89 → FR-35c  checkConformance flags a DONE task with zero linked scenarios
 *   (85/86 → FR-35a, 87 → FR-35b drift, 88 → FR-35b Stop-gate land in later commits)
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_85..89
 * @see .specs/spec-generator-v4/FR.md FR-35
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { checkConformance, type Finding } from '../../tools/spec-graph/conformance.ts';
import type { SpecGraph } from '../../tools/spec-graph/types.ts';

interface ScenSpec { id: string; tags?: string[]; result?: string }
interface TaskSpec { id: string; status: 'todo' | 'done'; refs?: string[]; doneWhen: string }

/** Minimal SpecGraph from scenario + task specs (mirrors feature32's makeGraph). */
function makeGraph(scens: ScenSpec[], tasks: TaskSpec[]): SpecGraph {
  const nodes = new Map<string, any>();
  for (const s of scens) nodes.set(s.id, { id: s.id, type: 'Scenario', file: 'demo.feature', line: 1, tags: s.tags ?? [], steps: [], lastResult: s.result });
  for (const t of tasks) nodes.set(t.id, { id: t.id, type: 'Task', file: 'TASKS.md', line: 1, status: t.status, refs: t.refs ?? [], doneWhen: t.doneWhen });
  return { version: 1, builtAt: '', nodes, edges: [], definitions: new Map(), backlinks: new Map() };
}

interface F35World {
  graph?: SpecGraph;
  findings?: Finding[];
}

// ── SPECGEN004_89 — FR-35c: DONE with zero linked scenarios is not silent ────
Given('a task marked DONE with no linked scenario at all', function (this: F35World) {
  // doneWhen names no SPECGEN id / @feature tag and refs map to nothing → zero scenarios.
  this.graph = makeGraph([], [{ id: 't-untested', status: 'done', refs: [], doneWhen: 'implements the thing (no test referenced)' }]);
});
When('checkConformance runs', function (this: F35World) {
  this.findings = checkConformance(this.graph!);
});
Then('it emits a finding naming the task', function (this: F35World) {
  const f = this.findings!.find((x) => x.code === 'TASK_UNTESTED');
  assert.ok(f, `expected a TASK_UNTESTED finding, got: ${JSON.stringify(this.findings!.map((x) => x.code))}`);
  assert.match(f.message, /t-untested/);
  assert.equal(f.nodeId, 't-untested');
});
Then('the returned finding set is not empty', function (this: F35World) {
  assert.ok(this.findings!.length > 0, 'a DONE task with no test must not yield an empty finding set');
});
