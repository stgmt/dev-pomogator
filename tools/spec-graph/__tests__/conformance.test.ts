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

describe('checkConformance — TASK_NO_OWN_SCENARIO (FR-46a/b: DONE needs its OWN scenario id)', () => {
  const onlyRule = (g: SpecGraph) => checkConformance(g).filter((f) => f.code === 'TASK_NO_OWN_SCENARIO');
  const doneTask = (id: string, doneWhen: string, refs: string[] = ['FR-1']): TaskNode => ({
    id, type: 'Task', file: 'TASKS.md', line: 1, refs, status: 'done', title: id, doneWhen,
  });

  it('flags a DONE task whose Done-When cites no SPECGEN id of its own (rides on FR-wide refs)', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('t1', doneTask('t1', 'verified by FR-1', ['FR-1']));
    const f = onlyRule(g);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: 'TASK_NO_OWN_SCENARIO', severity: 'warning', nodeId: 't1' });
  });

  it('does NOT flag a DONE task that cites its own SPECGEN004_NN in Done-When', () => {
    const g = emptyGraph();
    g.nodes.set('t1', doneTask('t1', 'done when SPECGEN004_42 passes'));
    expect(onlyRule(g)).toHaveLength(0);
  });

  it('does NOT flag a TODO task without an own scenario (link required at DONE, not creation)', () => {
    const g = emptyGraph();
    g.nodes.set('t1', task('t1', ['FR-1'])); // status TODO
    expect(onlyRule(g)).toHaveLength(0);
  });
});

describe('checkConformance — UNCOVERED_FR', () => {
  it('flags an FR with no AC and no tested-by edge', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));

    // Filter to the code under test: a bare FR now also raises FR_NO_DESIGN +
    // FR_NO_STORY (FR-47 trace-web legs), so the unfiltered array is no longer
    // length-1. Sibling tests (below) already filter; match them.
    const findings = checkConformance(g).filter((f) => f.code === 'UNCOVERED_FR');
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

  it('counts each severity bucket and prefixes every line with its level', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1')); // → UNCOVERED_FR + FR_NO_DESIGN + FR_NO_STORY (warning)
    g.nodes.set('s1', scen('s1', ['@wip'])); // → UNTAGGED_SCENARIO (info)
    const out = formatFindings(checkConformance(g));
    expect(out, 'summary names all three severity buckets').toMatch(/\d+ error, \d+ warning, \d+ info/);
    expect(out, 'at least one warning counted').not.toMatch(/: 0 warning,/);
    expect(out).toContain('[WARNING] UNCOVERED_FR');
    expect(out).toContain('[INFO] UNTAGGED_SCENARIO');
  });
});

// ── coverage for the FR-47 / FR-44 / FR-35 finding codes the original suite never
// exercised (the bulk of conformance.ts survivors live in these check functions). ──

// Decision/Story nodes aren't in the imported type set; build them loosely (the runtime
// `type` field is all checkConformance reads). esbuild transpile-only, so the cast is inert.
function decisionNode(id: string, parentFr?: string): FrNode {
  return { id, type: 'Decision', file: 'DESIGN.md', line: 1, title: id, ...(parentFr ? { parentFr } : {}) } as unknown as FrNode;
}
function storyNode(id: string, parentFr?: string): FrNode {
  return { id, type: 'Story', file: 'USER_STORIES.md', line: 1, title: id, ...(parentFr ? { parentFr } : {}) } as unknown as FrNode;
}

describe('checkConformance — FR-47 trace-web legs (FR_NO_DESIGN / FR_NO_STORY)', () => {
  it('FR_NO_DESIGN fires for an FR with no covering Decision', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    const f = checkConformance(g).filter((x) => x.code === 'FR_NO_DESIGN');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: 'FR_NO_DESIGN', severity: 'warning', nodeId: 'FR-1' });
  });

  it('FR_NO_DESIGN clears once a covers→Decision edge exists', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('D-1', decisionNode('D-1', 'FR-1'));
    g.edges.push({ from: 'FR-1', to: 'D-1', type: 'covers' });
    expect(checkConformance(g).filter((x) => x.code === 'FR_NO_DESIGN')).toHaveLength(0);
  });

  it('FR_NO_STORY fires without a Story and clears with a covers→Story edge', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    expect(checkConformance(g).filter((x) => x.code === 'FR_NO_STORY')).toHaveLength(1);
    g.nodes.set('S-1', storyNode('S-1', 'FR-1'));
    g.edges.push({ from: 'FR-1', to: 'S-1', type: 'covers' });
    expect(checkConformance(g).filter((x) => x.code === 'FR_NO_STORY')).toHaveLength(0);
  });

  it('a covers→Decision edge is NOT counted as AC coverage (UNCOVERED_FR still fires)', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('D-1', decisionNode('D-1', 'FR-1'));
    g.edges.push({ from: 'FR-1', to: 'D-1', type: 'covers' });
    const codes = checkConformance(g).map((x) => x.code);
    expect(codes, 'Decision edge must not forge AC coverage').toContain('UNCOVERED_FR');
    expect(codes).not.toContain('FR_NO_DESIGN');
  });
});

describe('checkConformance — TOOTHLESS_DECISION / TOOTHLESS_STORY (FR-47d)', () => {
  it('TOOTHLESS_DECISION fires for a Decision with no **Требование:** (empty parentFr)', () => {
    const g = emptyGraph();
    g.nodes.set('D-1', decisionNode('D-1')); // no parentFr
    const f = checkConformance(g).filter((x) => x.code === 'TOOTHLESS_DECISION');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', nodeId: 'D-1' });
  });

  it('TOOTHLESS_STORY fires for an unlinked Story; neither fires once parentFr is set', () => {
    const g = emptyGraph();
    g.nodes.set('S-1', storyNode('S-1')); // no parentFr
    expect(checkConformance(g).filter((x) => x.code === 'TOOTHLESS_STORY')).toHaveLength(1);

    const g2 = emptyGraph();
    g2.nodes.set('D-2', decisionNode('D-2', 'FR-1'));
    g2.nodes.set('S-2', storyNode('S-2', 'FR-1'));
    const codes = checkConformance(g2).map((x) => x.code);
    expect(codes).not.toContain('TOOTHLESS_DECISION');
    expect(codes).not.toContain('TOOTHLESS_STORY');
  });
});

describe('checkConformance — TASK_NO_REQUIREMENT (FR-44 reverse-traceability gap)', () => {
  const bareTask = (id: string, doneWhen = ''): TaskNode => ({ id, type: 'Task', file: 'TASKS.md', line: 1, refs: [], status: 'TODO', title: id, doneWhen });

  it('fires (info) for a task with empty refs whose Done-When names no requirement', () => {
    const g = emptyGraph();
    g.nodes.set('t1', bareTask('t1', 'just do the thing'));
    const f = checkConformance(g).filter((x) => x.code === 'TASK_NO_REQUIREMENT');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('info');
  });

  it('does NOT fire when Done-When names an FR / SPECGEN id / @feature tag', () => {
    for (const dw of ['closes FR-3', 'done when SPECGEN004_12 passes', 'covered by @feature5']) {
      const g = emptyGraph();
      g.nodes.set('t1', bareTask('t1', dw));
      expect(checkConformance(g).filter((x) => x.code === 'TASK_NO_REQUIREMENT'), `dw=${dw}`).toHaveLength(0);
    }
  });

  it('does NOT fire when the task has refs', () => {
    const g = emptyGraph();
    g.nodes.set('t1', task('t1', ['FR-1']));
    expect(checkConformance(g).filter((x) => x.code === 'TASK_NO_REQUIREMENT')).toHaveLength(0);
  });
});

describe('checkConformance — TASK_UNTESTED (FR-35c: DONE with zero linked scenarios)', () => {
  it('fires for a DONE task with no linked scenario at all', () => {
    const g = emptyGraph();
    g.nodes.set('t1', { id: 't1', type: 'Task', file: 'TASKS.md', line: 1, refs: [], status: 'done', title: 't1', doneWhen: 'done somehow' });
    const f = checkConformance(g).filter((x) => x.code === 'TASK_UNTESTED');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: 'TASK_UNTESTED', severity: 'warning', nodeId: 't1' });
  });
});

describe('checkConformance — TAG_BULK_SUSPECT (one tag blanketing 10+ scenarios)', () => {
  const countBulk = (n: number) => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    for (let i = 0; i < n; i++) g.nodes.set(`s${i}`, scen(`s${i}`, ['@FR-1'], 'blanket.feature'));
    return checkConformance(g).filter((x) => x.code === 'TAG_BULK_SUSPECT');
  };

  it('fires (info) at the 10-scenario threshold, not at 9', () => {
    expect(countBulk(9), '9 is under threshold').toHaveLength(0);
    const f = countBulk(10);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: 'TAG_BULK_SUSPECT', severity: 'info', nodeId: '@FR-1' });
  });
});

describe('checkConformance — SCENARIO_TAG_ORPHAN did-you-mean (topSimilarIds/levenshtein)', () => {
  it('suggests the closest existing id for a near-miss orphan tag', () => {
    const g = emptyGraph();
    g.nodes.set('FR-1', fr('FR-1'));
    g.nodes.set('s1', scen('s1', ['@FR-2'])); // orphan, but FR-1 is edit-distance 1
    const f = checkConformance(g).find((x) => x.code === 'SCENARIO_TAG_ORPHAN');
    expect(f).toBeDefined();
    const rename = f!.suggestions!.find((s) => s.action === 'rename_tag')!;
    expect(rename.reason, 'names the closest existing id').toContain('Did you mean');
    expect(rename.reason).toContain('@FR-1');
  });
});
