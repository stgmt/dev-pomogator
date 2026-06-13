/**
 * @feature46 step definitions — SPECGEN004_160..162. Drives the REAL FR-46 enforcement
 * on synthetic graphs: checkConformance's TASK_NO_OWN_SCENARIO rule (a DONE task that
 * cites only its FR is flagged; one that cites its own SPECGEN id is NOT) and get_trace's
 * own_scenario surfacing. Synthetic graph (no temp fs) — robust in Docker.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_160
 * @see .specs/spec-generator-v4/FR.md FR-46
 * @see tools/spec-graph/conformance.ts (TASK_NO_OWN_SCENARIO)
 * @see tools/spec-mcp-server/tools.ts (get_trace own_scenario, FR-46d)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import { checkConformance, type Finding } from '../../tools/spec-graph/conformance.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';

interface TraceWorld extends V4World {
  trGraph?: unknown;
  trFindings?: Finding[];
  trTrace?: { tasks: Array<{ id: string; own_scenario: { id: string; lastResult: string } | null }> };
}

// A DONE task on FR-1 + a scenario whose id carries SPECGEN004_160. `doneWhen` controls
// whether the task cites its OWN id; `passed` controls the scenario's recorded result.
function mkGraph(doneWhen: string, passed: boolean): unknown {
  return {
    version: 1, builtAt: '', definitions: new Map(), backlinks: new Map(),
    nodes: new Map<string, unknown>([
      ['demo:FR-1', { id: 'demo:FR-1', type: 'FR', file: 'FR.md', line: 1, title: 'x', anchors: ['FR-1'] }],
      ['demo:t1', { id: 'demo:t1', type: 'Task', file: 'TASKS.md', line: 1, refs: ['demo:FR-1'], status: 'done', doneWhen }],
      ['demo:s', { id: 'demo:SCEN-specgen004-160-x', type: 'Scenario', file: 'x.feature', line: 1, tags: ['@feature1'], steps: [], lastResult: passed ? 'PASSED' : undefined }],
    ]),
    edges: [],
  };
}

Given('a graph with a DONE task whose Done-When cites only its requirement, not its own scenario', function (this: TraceWorld) {
  this.trGraph = mkGraph('done when FR-1 is met', false);
});

Given('a graph with a DONE task whose Done-When cites its own SPECGEN scenario id which passed', function (this: TraceWorld) {
  this.trGraph = mkGraph('done when SPECGEN004_160 passes', true);
});

When('conformance runs over the graph', function (this: TraceWorld) {
  this.trFindings = checkConformance(this.trGraph as never);
});

When("get_trace runs for that task's requirement", async function (this: TraceWorld) {
  const reg = buildToolRegistry(() => this.trGraph as never, {});
  const res = (await reg.find((t) => t.name === 'get_trace')!.handler({ node_id: 'demo:FR-1' } as never)) as { content: Array<{ text: string }> };
  this.trTrace = JSON.parse(res.content[0].text);
});

Then('a TASK_NO_OWN_SCENARIO warning is raised for that task', function (this: TraceWorld) {
  const f = this.trFindings!.filter((x) => x.code === 'TASK_NO_OWN_SCENARIO');
  assert.equal(f.length, 1, `expected one TASK_NO_OWN_SCENARIO, got ${f.length}`);
  assert.equal(f[0].severity, 'warning');
  assert.equal(f[0].nodeId, 'demo:t1');
});

Then('no TASK_NO_OWN_SCENARIO finding is raised for that task', function (this: TraceWorld) {
  assert.equal(this.trFindings!.filter((x) => x.code === 'TASK_NO_OWN_SCENARIO').length, 0);
});

Then("the task's own_scenario is surfaced with its passing result", function (this: TraceWorld) {
  const t = this.trTrace!.tasks.find((x) => x.id === 'demo:t1');
  assert.ok(t?.own_scenario, 'own_scenario must be surfaced');
  assert.match(t!.own_scenario!.id, /specgen004-160/i);
  assert.equal(t!.own_scenario!.lastResult, 'PASSED');
});
