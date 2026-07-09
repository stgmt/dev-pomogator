/**
 * @feature46 step definitions (FR-46d — get_trace surfaces task→own-scenario) — SPECGEN004_208.
 *
 * P3-rollout migration of tools/spec-mcp-server/__tests__/get-trace-own-scenario.test.ts (2 pure
 * cases). Drives the REAL buildToolRegistry/get_trace over a synthetic graph (corpus-independent —
 * no fs, no spawn). vitest twin kept until the gate-switch.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_208 · FR.md FR-46d
 * @see tools/spec-mcp-server/tools.ts (get_trace)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface GtWorld extends V4World {
  gtGraph?: unknown;
  gtTrace?: { tasks: Array<{ id: string; own_scenario: unknown }> };
}

Given('a graph where one task cites its own SPECGEN scenario in Done-When another cites its own TESTQUAL scenario and a third does not', function (this: GtWorld) {
  this.gtGraph = {
    version: 1,
    builtAt: '',
    definitions: new Map(),
    backlinks: new Map(),
    nodes: new Map<string, unknown>([
      ['demo:FR-1', { id: 'demo:FR-1', type: 'FR', file: 'FR.md', line: 1, title: 'x', anchors: ['FR-1'] }],
      ['demo:t1', { id: 'demo:t1', type: 'Task', file: 'TASKS.md', line: 1, refs: ['demo:FR-1'], status: 'done', doneWhen: 'done when SPECGEN004_42 passes' }],
      ['demo:t2', { id: 'demo:t2', type: 'Task', file: 'TASKS.md', line: 2, refs: ['demo:FR-1'], status: 'todo', doneWhen: 'covered by FR-1' }],
      ['demo:t3', { id: 'demo:t3', type: 'Task', file: 'TASKS.md', line: 3, refs: ['demo:FR-1'], status: 'done', doneWhen: 'done when TESTQUAL001_10 passes' }],
      ['demo:s42', { id: 'demo:SCEN-specgen004-42-foo', type: 'Scenario', file: 'x.feature', line: 1, tags: ['@feature1'], steps: [], lastResult: 'PASSED' }],
      ['demo:s10', { id: 'demo:SCEN-testqual001-10-go-detector', type: 'Scenario', file: 'x.feature', line: 3, tags: ['@feature1'], steps: [], lastResult: 'PASSED' }],
    ]),
    edges: [],
  };
});

When('get_trace is asked for the shared FR', async function (this: GtWorld) {
  const reg = buildToolRegistry(() => this.gtGraph as never, {});
  const res = (await reg.find((t) => t.name === 'get_trace')!.handler({ node_id: 'demo:FR-1' } as never)) as {
    content: Array<{ text: string }>;
  };
  this.gtTrace = JSON.parse(res.content[0].text);
});

Then(
  'the citing tasks own_scenario resolves to each scenario with its last result and the other task own_scenario is null',
  function (this: GtWorld) {
    const tasks = this.gtTrace!.tasks;
    const t1 = tasks.find((t) => t.id === 'demo:t1');
    const t2 = tasks.find((t) => t.id === 'demo:t2');
    const t3 = tasks.find((t) => t.id === 'demo:t3');
    assert.deepEqual(t1!.own_scenario, { id: 'demo:SCEN-specgen004-42-foo', lastResult: 'PASSED' }, 'a task citing its own SPECGEN id resolves its own_scenario + lastResult');
    assert.equal(t2!.own_scenario, null, 'a task with no own scenario id has a null own_scenario');
    assert.deepEqual(t3!.own_scenario, { id: 'demo:SCEN-testqual001-10-go-detector', lastResult: 'PASSED' }, 'a task citing its own TESTQUAL id resolves its own_scenario + lastResult');
  },
);
