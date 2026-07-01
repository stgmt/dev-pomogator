/**
 * FR-46d — get_trace surfaces each task's OWN scenario (the specgen004_NN it cites in
 * Done-When) + that scenario's last result, so task↔own-scenario traceability is visible,
 * not just task→FR. Synthetic graph (corpus-independent — Docker resets .specs/).
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
    ['demo:s42', { id: 'demo:SCEN-specgen004-42-foo', type: 'Scenario', file: 'x.feature', line: 1, tags: ['@feature1'], steps: [], lastResult: 'PASSED' }],
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

  it('GTOWN_02: a task with no own SPECGEN id → own_scenario is null', async () => {
    const r = await getTrace('demo:FR-1');
    const t2 = r.tasks.find((t: { id: string }) => t.id === 'demo:t2');
    expect(t2.own_scenario).toBeNull();
  });
});
