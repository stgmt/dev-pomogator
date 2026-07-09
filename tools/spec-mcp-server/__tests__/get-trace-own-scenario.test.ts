/**
 * FR-46d — get_trace surfaces each task's OWN scenario (the explicit scenario id it cites in
 * Done-When, including non-v4 prefixes like TESTQUAL001_NN) + that scenario's last result,
 * so task↔own-scenario traceability is visible, not just task→FR. Synthetic graph
 * (corpus-independent — Docker resets .specs/).
 *
 * @see tools/spec-mcp-server/tools.ts get_trace
 * @see .specs/spec-generator-v4/FR.md FR-46d
 */
import { describe, it, expect } from 'vitest';
import { buildToolRegistry } from '../tools.ts';

const graph = {
  version: 1,
  builtAt: '',
  definitions: new Map(),
  backlinks: new Map(),
  nodes: new Map<string, unknown>([
    ['demo:FR-1', { id: 'demo:FR-1', type: 'FR', file: 'FR.md', line: 1, title: 'x', anchors: ['FR-1'] }],
    // t1 cites its OWN scenario (SPECGEN004_42) in Done-When
    ['demo:t1', { id: 'demo:t1', type: 'Task', file: 'TASKS.md', line: 1, refs: ['demo:FR-1'], status: 'done', doneWhen: 'done when SPECGEN004_42 passes' }],
    // t2 has NO own scenario — only rides on the FR
    ['demo:t2', { id: 'demo:t2', type: 'Task', file: 'TASKS.md', line: 2, refs: ['demo:FR-1'], status: 'todo', doneWhen: 'covered by FR-1' }],
    // t3 uses a non-v4 explicit scenario id; this is the strong-tests TESTQUAL001_10 class.
    ['demo:t3', { id: 'demo:t3', type: 'Task', file: 'TASKS.md', line: 3, refs: ['demo:FR-1'], status: 'done', doneWhen: 'done when TESTQUAL001_10 passes' }],
    ['demo:s42', { id: 'demo:SCEN-specgen004-42-foo', type: 'Scenario', file: 'x.feature', line: 1, tags: ['@feature1'], steps: [], lastResult: 'PASSED' }],
    ['demo:s10', { id: 'demo:SCEN-testqual001-10-go-detector', type: 'Scenario', file: 'x.feature', line: 3, tags: ['@feature1'], steps: [], lastResult: 'PASSED' }],
    // Same feature, not this task's proof; must not drag t1/t3 down when an own scenario is explicit.
    ['demo:s43', { id: 'demo:SCEN-specgen004-43-manual-sibling', type: 'Scenario', file: 'x.feature', line: 2, tags: ['@feature1', '@manual'], steps: [] }],
  ]),
  edges: [],
} as never;

const reg = buildToolRegistry(() => graph, {});
const getTrace = async (node_id: string) =>
  JSON.parse((await reg.find((t) => t.name === 'get_trace')!.handler({ node_id } as never) as { content: Array<{ text: string }> }).content[0].text);

describe('GTOWN: get_trace surfaces task→own-scenario (FR-46d)', () => {
  it('GTOWN_01: a task citing its own SPECGEN id → own_scenario resolves to the scenario + lastResult', async () => {
    const r = await getTrace('demo:FR-1');
    const t1 = r.tasks.find((t: { id: string }) => t.id === 'demo:t1');
    expect(t1.own_scenario).toEqual({ id: 'demo:SCEN-specgen004-42-foo', lastResult: 'PASSED' });
  });

  it('GTOWN_01b: task node verified_status uses its explicit own scenario, not same-feature siblings', async () => {
    const r = await getTrace('demo:t1');
    expect(r.node.verified_status).toBe('DONE');
  });

  it('GTOWN_02: a task with no own SPECGEN id → own_scenario is null', async () => {
    const r = await getTrace('demo:FR-1');
    const t2 = r.tasks.find((t: { id: string }) => t.id === 'demo:t2');
    expect(t2.own_scenario).toBeNull();
  });

  it('GTOWN_03: a task citing its own TESTQUAL id → own_scenario resolves to that prefixed scenario', async () => {
    const r = await getTrace('demo:FR-1');
    const t3 = r.tasks.find((t: { id: string }) => t.id === 'demo:t3');
    expect(t3.own_scenario).toEqual({ id: 'demo:SCEN-testqual001-10-go-detector', lastResult: 'PASSED' });
  });

  it('GTOWN_03b: non-v4 task node verified_status uses its explicit own scenario, not same-feature siblings', async () => {
    const r = await getTrace('demo:t3');
    expect(r.node.verified_status).toBe('DONE');
  });
});
