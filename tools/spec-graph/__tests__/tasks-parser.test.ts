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

  it('tags each task with its enclosing ## Phase heading (TaskNode.phase)', () => {
    const m = tasks.find((t) => t.id === 'task-scenario-map')!;
    expect(m.phase, 'task under "## Phase X" carries that phase').toBe('Phase X');
  });

  it('extracts the task title between the checkbox and the — id: marker', () => {
    expect(tasks.find((t) => t.id === 'task-scenario-map')!.title).toBe('T-Cov.7 Task↔scenario map');
    expect(tasks.find((t) => t.id === 'graph-types')!.title).toBe('Define types -- @feature2');
  });
});

describe('parseTasks — block boundaries + edge cases (formerly uncovered)', () => {
  it('ends a task block at a horizontal rule (---) — body does not bleed into it', () => {
    const src = '- [ ] A — id: a — Status: TODO\n  **Done When:** alpha\n---\n- [ ] B — id: b — Status: TODO\n  **Done When:** beta\n';
    const t = parseTasks(src, 'T.md');
    expect(t.map((x) => x.id)).toEqual(['a', 'b']);
    expect(t.find((x) => x.id === 'a')!.doneWhen).toContain('alpha');
    expect(t.find((x) => x.id === 'a')!.doneWhen, 'beta must not bleed past the ---').not.toContain('beta');
  });

  it('ends a task block at an HTML comment (<!--)', () => {
    const src = '- [ ] A — id: a — Status: TODO\n  alpha line\n<!-- a note -->\n  beta line\n';
    const a = parseTasks(src, 'T.md').find((x) => x.id === 'a')!;
    expect(a.doneWhen).toContain('alpha line');
    expect(a.doneWhen, 'comment ends the block; beta is outside').not.toContain('beta line');
  });

  it('a task before any ## Phase heading has no phase', () => {
    const src = '- [ ] Pre — id: pre — Status: TODO\n## Phase 2: Build\n- [ ] In — id: inph — Status: TODO\n';
    const t = parseTasks(src, 'T.md');
    expect(t.find((x) => x.id === 'pre')!.phase).toBeUndefined();
    expect(t.find((x) => x.id === 'inph')!.phase).toBe('Phase 2: Build');
  });

  it('maps READY status to the ready enum', () => {
    expect(parseTasks('- [ ] X — id: x — Status: READY\n', 'T.md')[0].status).toBe('ready');
  });

  it('does NOT harvest an FR ref inside a `code span` — it is an example, not a requirement (FR-36)', () => {
    const src = '- [ ] A — id: a — Status: TODO\n  see `FR-001` for the old shape, but the real ref is FR-2\n';
    const a = parseTasks(src, 'T.md')[0];
    expect(a.refs, 'code-span FR-001 is an example; only FR-2 is harvested').toEqual(['FR-2']);
  });

  it('a `- [ ]` line missing id: or Status: is NOT a task header', () => {
    expect(parseTasks('- [ ] just a checklist item with no id or status\n', 'T.md')).toEqual([]);
    expect(parseTasks('- [ ] has id only — id: x\n', 'T.md'), 'id without Status is not a header').toEqual([]);
  });
});
