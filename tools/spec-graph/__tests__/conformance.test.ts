/**
 * Unit tests for the SpecGraph conformance checker (Phase 1, FR-2).
 *
 * Pin the four Phase-1 finding codes that are derivable purely from a
 * built graph (the fifth, DUPLICATE_DEFINITION, surfaces a build-time
 * discard and is exercised via the builder integration test instead).
 *
 *   UNCOVERED_FR        FR with no AC + no tested-by Scenario → warning
 *   ORPHAN_TASK         Task refs an FR that does not exist  → warning
 *   SCENARIO_TAG_ORPHAN Scenario tag points at missing id    → warning
 *   UNTAGGED_SCENARIO   Scenario has no @FR/@NFR/@AC tag     → info
 *
 * Every test constructs the smallest possible synthetic SpecGraph in
 * memory and asserts the exact subset of findings produced, so a
 * regression in any single rule lights up only its own test.
 */

import { describe, it, expect } from 'vitest';
import { checkConformance, formatFindings } from '../conformance.ts';
import type { SpecGraph, FrNode, AcNode, ScenarioNode, TaskNode, Edge } from '../types.ts';

function emptyGraph(): SpecGraph {
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    nodes: new Map(),
    edges: [],
    definitions: new Map(),
  };
}

function fr(id: string, file = 'FR.md', line = 1): FrNode {
  return { id, type: 'FR', file, line, title: id, anchors: [id] };
}

function ac(id: string, covers: string, file = 'AC.md', line = 1): AcNode {
  return { id, type: 'AC', file, line, covers };
}

function scen(
  id: string,
  tags: string[] = [],
  file = 't.feature',
  line = 1,
): ScenarioNode {
  return { id, type: 'Scenario', file, line, tags, steps: [] };
}

function task(id: string, refs: string[], file = 'TASKS.md', line = 1): TaskNode {
  return { id, type: 'Task', file, line, refs, status: 'TODO', title: id };
}

describe('checkConformance — TASK_STATUS_UNVERIFIED (FR-32 honesty gate)', () => {
  const doneTask = (id: string, refs: string[]): TaskNode => ({
    id, type: 'Task', file: 'TASKS.md', line: 1, refs, status: 'done', title: id, doneWhen: refs.join(' '),
  });
  const scenR = (id: string, tags: string[], result?: ScenarioNode['lastResult']): ScenarioNode => ({
    id, type: 'Scenario', file: 't.feature', line: 1, tags, steps: [], lastResult: result,
  });
  const onlyGate = (g: SpecGraph) => checkConformance(g).filter((f) => f.code === 'TASK_STATUS_UNVERIFIED');

  it('flags a DONE task whose mapped scenario is not green', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('t1', doneTask('t1', ['FR-1']));
    g.nodes.set('s1', scenR('SCEN-specgen004-01-x', ['@feature1'], 'UNDEFINED'));
    const findings = onlyGate(g);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'TASK_STATUS_UNVERIFIED', severity: 'warning', nodeId: 't1' });
  });

  it('does NOT flag a DONE task whose mapped scenarios are all green', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('t1', doneTask('t1', ['FR-1']));
    g.nodes.set('s1', scenR('SCEN-specgen004-01-x', ['@feature1'], 'PASSED'));
    expect(onlyGate(g)).toHaveLength(0);
  });

  it('does NOT flag a TODO task — only DONE is gated', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('t1', task('t1', ['FR-1'])); // status TODO
    g.nodes.set('s1', scenR('SCEN-specgen004-01-x', ['@feature1'], 'UNDEFINED'));
    expect(onlyGate(g)).toHaveLength(0);
  });

  it('does NOT flag a DONE task with no mapped scenarios (unverified ≠ contradicted)', () => {
    const g = emptyGraph();
    g.nodes.set('t1', doneTask('t1', []));
    expect(onlyGate(g)).toHaveLength(0);
  });
});

describe('checkConformance — UNCOVERED_FR', () => {
  it('flags an FR with no AC and no tested-by edge', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));

    const findings = checkConformance(g);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: 'UNCOVERED_FR',
      severity: 'warning',
      nodeId: 'FR-1',
    });
    expect(findings[0].suggestions).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'create_ac' })]),
    );
  });

  it('does NOT flag an FR with a covers AC', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('AC-1', ac('AC-1', 'FR-1'));
    g.edges.push({ from: 'FR-1', to: 'AC-1', type: 'covers' } satisfies Edge);

    const findings = checkConformance(g).filter((f) => f.code === 'UNCOVERED_FR');
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag an FR with a tested-by Scenario', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('SCEN-x', scen('SCEN-x', ['@FR-1']));
    g.edges.push({ from: 'FR-1', to: 'SCEN-x', type: 'tested-by' });

    const findings = checkConformance(g).filter((f) => f.code === 'UNCOVERED_FR');
    expect(findings).toHaveLength(0);
  });
});

describe('checkConformance — ORPHAN_TASK', () => {
  it('flags a task that refs a non-existent FR', () => {
    const g = emptyGraph();
    g.nodes.set('TASK-1', task('TASK-1', ['FR-99']));

    const findings = checkConformance(g).filter((f) => f.code === 'ORPHAN_TASK');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: 'ORPHAN_TASK',
      severity: 'warning',
      nodeId: 'TASK-1',
      relatedId: 'FR-99',
    });
  });

  it('does NOT flag a task whose refs all exist', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('FR-2', fr('FR-2'));
    g.nodes.set('TASK-1', task('TASK-1', ['FR-1', 'FR-2']));

    const findings = checkConformance(g).filter((f) => f.code === 'ORPHAN_TASK');
    expect(findings).toHaveLength(0);
  });

  it('emits one finding per orphan ref on a multi-ref task', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('TASK-1', task('TASK-1', ['FR-1', 'FR-77', 'FR-88']));

    const findings = checkConformance(g).filter((f) => f.code === 'ORPHAN_TASK');
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.relatedId).sort()).toEqual(['FR-77', 'FR-88']);
  });
});

describe('checkConformance — SCENARIO_TAG_ORPHAN', () => {
  it('flags a scenario whose @FR-N tag points at a missing FR', () => {
    const g = emptyGraph();
    g.nodes.set('SCEN-x', scen('SCEN-x', ['@FR-42']));

    const findings = checkConformance(g).filter(
      (f) => f.code === 'SCENARIO_TAG_ORPHAN',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: 'SCENARIO_TAG_ORPHAN',
      severity: 'warning',
      nodeId: 'SCEN-x',
      relatedId: 'FR-42',
    });
  });

  it('does NOT flag a scenario whose tags all resolve', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('SCEN-x', scen('SCEN-x', ['@FR-1']));

    const findings = checkConformance(g).filter(
      (f) => f.code === 'SCENARIO_TAG_ORPHAN',
    );
    expect(findings).toHaveLength(0);
  });

  it('ignores @custom-tag (only @FR/@NFR/@AC are spec ids)', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('SCEN-x', scen('SCEN-x', ['@FR-1', '@wip', '@smoke']));

    const findings = checkConformance(g).filter(
      (f) => f.code === 'SCENARIO_TAG_ORPHAN',
    );
    expect(findings).toHaveLength(0);
  });
});

describe('checkConformance — UNTAGGED_SCENARIO', () => {
  it('flags a scenario with no spec tag at all', () => {
    const g = emptyGraph();
    g.nodes.set('SCEN-x', scen('SCEN-x', ['@wip']));

    const findings = checkConformance(g).filter(
      (f) => f.code === 'UNTAGGED_SCENARIO',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: 'UNTAGGED_SCENARIO',
      severity: 'info',
      nodeId: 'SCEN-x',
    });
  });

  it('does NOT flag a scenario with at least one @FR tag', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('SCEN-x', scen('SCEN-x', ['@FR-1']));

    const findings = checkConformance(g).filter(
      (f) => f.code === 'UNTAGGED_SCENARIO',
    );
    expect(findings).toHaveLength(0);
  });
});

describe('formatFindings — pretty printer', () => {
  it('returns clean message for an empty list', () => {
    expect(formatFindings([])).toBe('no findings — clean graph.');
  });

  it('summarises counts + emits one line per finding', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('SCEN-x', scen('SCEN-x', ['@FR-99']));
    const out = formatFindings(checkConformance(g));
    expect(out).toContain('finding(s)');
    expect(out).toContain('UNCOVERED_FR');
    expect(out).toContain('SCENARIO_TAG_ORPHAN');
  });
});
