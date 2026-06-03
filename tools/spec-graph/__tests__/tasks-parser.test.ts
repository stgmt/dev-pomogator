import { describe, it, expect } from 'vitest';
import { parseTasks } from '../parsers/tasks.ts';

// Mirrors both real TASKS.md block dialects: `_Requirements:_ FR-N, FR-M` and
// the markdown-link form `_Requirements: [FR-N](FR.md#fr-n)_`.
const SAMPLE = `## Phase X

- [ ] T-Cov.7 Task↔scenario map — id: task-scenario-map — Status: TODO | Est: 120m
  _Requirements:_ FR-32, FR-2
  **Done When:**
  - maps each task to its scenarios via SPECGEN004_70

- [x] Define types -- @feature2 — id: graph-types — Status: DONE | Est: 60m
  _Requirements: [FR-2](FR.md#fr-2)_
  **Done When:**
  - @feature2 SPECGEN004_03 passes

## Refactor

- [ ] Final — id: final-verification — Status: TODO | Est: 240m
  **Done When:**
  - all green
`;

describe('parseTasks', () => {
  const tasks = parseTasks(SAMPLE, 'TASKS.md');

  it('parses one node per task block, ignoring headings and tables', () => {
    expect(tasks.map((t) => t.id)).toEqual(['task-scenario-map', 'graph-types', 'final-verification']);
  });
  it('maps the hand-set status to the node enum', () => {
    expect(tasks.find((t) => t.id === 'graph-types')!.status).toBe('done');
    expect(tasks.find((t) => t.id === 'task-scenario-map')!.status).toBe('todo');
  });
  it('collects FR/NFR refs from the block body (both dialects)', () => {
    expect(tasks.find((t) => t.id === 'task-scenario-map')!.refs.sort()).toEqual(['FR-2', 'FR-32']);
    expect(tasks.find((t) => t.id === 'graph-types')!.refs).toEqual(['FR-2']);
  });
  it('captures Done-When text so coverage can find SPECGEN/@feature mentions', () => {
    expect(tasks.find((t) => t.id === 'task-scenario-map')!.doneWhen).toContain('SPECGEN004_70');
    expect(tasks.find((t) => t.id === 'graph-types')!.doneWhen).toContain('@feature2');
  });
  it('stops a block at the next heading (no body bleed across `##`)', () => {
    const final = tasks.find((t) => t.id === 'final-verification')!;
    expect(final.doneWhen).toContain('all green');
    expect(final.refs).toEqual([]);
  });
});
