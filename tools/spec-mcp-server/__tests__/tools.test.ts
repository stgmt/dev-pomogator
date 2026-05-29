/**
 * Unit tests for the 11 MCP tool handlers.
 *
 * Build a synthetic SpecGraph in memory, hand it to `buildToolRegistry`, then
 * call each tool's handler directly and assert on the JSON it returns.
 *
 * The handlers all return `{content: [{type: 'text', text: <JSON>}]}` per the
 * MCP SDK shape; helper `parseResult` unwraps the JSON payload for easier
 * assertions.
 */

import { describe, it, expect } from 'vitest';
import { buildToolRegistry } from '../tools.ts';
import type {
  SpecGraph,
  FrNode,
  AcNode,
  ScenarioNode,
  TaskNode,
  Edge,
} from '../../spec-graph/types.ts';

function fr(id: string, title: string, file = '.specs/auth/FR.md', line = 1): FrNode {
  return { id, type: 'FR', file, line, title, anchors: [id] };
}
function ac(id: string, covers: string, file = '.specs/auth/AC.md', line = 1): AcNode {
  return { id, type: 'AC', file, line, covers };
}
function scen(id: string, tags: string[] = [], file = '.specs/auth/auth.feature', line = 1): ScenarioNode {
  return { id, type: 'Scenario', file, line, tags, steps: [] };
}
function task(id: string, refs: string[], file = '.specs/auth/TASKS.md', line = 1): TaskNode {
  return { id, type: 'Task', file, line, refs, status: 'todo', title: id };
}

function makeGraph(): SpecGraph {
  const g: SpecGraph = {
    version: 1,
    builtAt: new Date('2026-05-29T00:00:00Z').toISOString(),
    nodes: new Map(),
    edges: [] as Edge[],
    definitions: new Map(),
    backlinks: new Map(),
  };
  g.nodes.set('FR-1', fr('FR-1', 'Login flow'));
  g.nodes.set('FR-2', fr('FR-2', 'Logout flow', '.specs/auth/FR.md', 20));
  g.nodes.set('AC-1', ac('AC-1', 'FR-1'));
  g.nodes.set('SCEN-login-ok', scen('SCEN-login-ok', ['@FR-1', '@happy-path']));
  g.nodes.set('SCEN-orphan', scen('SCEN-orphan', ['@FR-999']));
  g.nodes.set('TASK-impl-login', task('TASK-impl-login', ['FR-1']));
  g.nodes.set('TASK-impl-ghost', task('TASK-impl-ghost', ['FR-404']));
  g.edges.push({ from: 'FR-1', to: 'AC-1', type: 'covers' });
  g.edges.push({ from: 'FR-1', to: 'SCEN-login-ok', type: 'tested-by' });
  g.definitions.set('FR-1', { file: '.specs/auth/FR.md', line: 1 });
  g.definitions.set('fr-1-login-flow', { file: '.specs/auth/FR.md', line: 1 });
  return g;
}

function parseResult(r: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(r.content[0].text);
}

const registry = buildToolRegistry(() => makeGraph());
const tool = (name: string) => {
  const t = registry.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
};

describe('tool registry — shape', () => {
  it('registers exactly 11 tools with canonical names', () => {
    expect(registry).toHaveLength(11);
    const names = registry.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'conformance_check',
        'find_by_tags',
        'find_orphans',
        'get_coverage_summary',
        'get_node',
        'get_test_result',
        'get_trace',
        'list_phase_tasks',
        'list_specs',
        'search',
        'validate_anchor',
      ].sort(),
    );
  });
});

describe('get_trace', () => {
  it('returns FR + AC + Scenario + Tasks + explanation for a known FR', async () => {
    const r = (await tool('get_trace').handler({ node_id: 'FR-1' })) as ReturnType<
      typeof tool
    >['handler'] extends (...args: never) => Promise<infer R> ? R : never;
    const body = parseResult(r as never) as {
      ok: boolean;
      node: { id: string };
      acceptance_criteria: { id: string }[];
      scenarios: { id: string }[];
      tasks: { id: string }[];
      explanation_for_agent: string;
    };
    expect(body.ok).toBe(true);
    expect(body.node.id).toBe('FR-1');
    expect(body.acceptance_criteria.map((a) => a.id)).toEqual(['AC-1']);
    expect(body.scenarios.map((s) => s.id)).toEqual(['SCEN-login-ok']);
    expect(body.tasks.map((t) => t.id)).toEqual(['TASK-impl-login']);
    expect(body.explanation_for_agent.length).toBeLessThanOrEqual(500);
    expect(body.explanation_for_agent).toContain('FR-1');
  });

  it('returns NODE_NOT_FOUND with a hint for an unknown id', async () => {
    const r = await tool('get_trace').handler({ node_id: 'FR-9999' });
    const body = parseResult(r) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('NODE_NOT_FOUND');
  });
});

describe('find_by_tags', () => {
  it('returns scenarios that carry ALL supplied tags', async () => {
    const r = await tool('find_by_tags').handler({ tags: ['FR-1', 'happy-path'] });
    const body = parseResult(r) as { scenarios: { id: string }[]; count: number };
    expect(body.count).toBe(1);
    expect(body.scenarios[0].id).toBe('SCEN-login-ok');
  });

  it('auto-prefixes @ if missing on input tag', async () => {
    const r = await tool('find_by_tags').handler({ tags: ['@FR-1'] });
    const body = parseResult(r) as { count: number };
    expect(body.count).toBe(1);
  });

  it('returns 0 when tag conjunction has no match', async () => {
    const r = await tool('find_by_tags').handler({ tags: ['FR-1', 'NEVER'] });
    expect((parseResult(r) as { count: number }).count).toBe(0);
  });
});

describe('conformance_check', () => {
  it('returns findings (UNCOVERED_FR, ORPHAN_TASK, SCENARIO_TAG_ORPHAN)', async () => {
    const r = await tool('conformance_check').handler({});
    const body = parseResult(r) as { findings: Array<{ code: string }>; count: number };
    const codes = body.findings.map((f) => f.code).sort();
    expect(codes).toContain('UNCOVERED_FR');     // FR-2 has no AC and no tested-by
    expect(codes).toContain('ORPHAN_TASK');      // TASK-impl-ghost refs FR-404
    expect(codes).toContain('SCENARIO_TAG_ORPHAN'); // SCEN-orphan tags @FR-999
  });

  it('filters by severity', async () => {
    const r = await tool('conformance_check').handler({ severity: 'info' });
    const body = parseResult(r) as { findings: Array<{ severity: string }> };
    expect(body.findings.every((f) => f.severity === 'info')).toBe(true);
  });
});

describe('search', () => {
  it('finds nodes by id substring case-insensitively', async () => {
    const r = await tool('search').handler({ query: 'login' });
    const body = parseResult(r) as { results: Array<{ id: string }>; count: number };
    const ids = body.results.map((x) => x.id).sort();
    expect(ids).toContain('FR-1');
    expect(ids).toContain('SCEN-login-ok');
    expect(ids).toContain('TASK-impl-login');
  });

  it('respects type filter', async () => {
    const r = await tool('search').handler({ query: 'fr', types: ['FR'] });
    const body = parseResult(r) as { results: Array<{ type: string }> };
    expect(body.results.every((x) => x.type === 'FR')).toBe(true);
  });
});

describe('get_node + validate_anchor + list_specs', () => {
  it('get_node returns the raw node', async () => {
    const r = await tool('get_node').handler({ node_id: 'AC-1' });
    const body = parseResult(r) as { ok: boolean; node: { id: string } };
    expect(body.ok).toBe(true);
    expect(body.node.id).toBe('AC-1');
  });

  it('validate_anchor returns registered: true for known compact id', async () => {
    const r = await tool('validate_anchor').handler({ anchor: 'FR-1' });
    const body = parseResult(r) as { registered: boolean };
    expect(body.registered).toBe(true);
  });

  it('validate_anchor returns registered: false for unknown alias', async () => {
    const r = await tool('validate_anchor').handler({ anchor: 'fr-bogus' });
    const body = parseResult(r) as { registered: boolean };
    expect(body.registered).toBe(false);
  });

  it('list_specs deduplicates by directory', async () => {
    const r = await tool('list_specs').handler({});
    const body = parseResult(r) as { specs: string[] };
    expect(body.specs).toContain('auth');
  });
});

describe('find_orphans + get_test_result + get_coverage_summary + list_phase_tasks', () => {
  it('find_orphans returns only orphan-class codes', async () => {
    const r = await tool('find_orphans').handler({});
    const body = parseResult(r) as { findings: Array<{ code: string }> };
    const codes = new Set(body.findings.map((f) => f.code));
    for (const c of codes) {
      expect(['UNCOVERED_FR', 'ORPHAN_TASK', 'SCENARIO_TAG_ORPHAN']).toContain(c);
    }
  });

  it('get_test_result returns UNKNOWN when scenario has no run record', async () => {
    const r = await tool('get_test_result').handler({ scenario_id: 'SCEN-login-ok' });
    const body = parseResult(r) as { ok: boolean; lastResult: string };
    expect(body.ok).toBe(true);
    expect(body.lastResult).toBe('UNKNOWN');
  });

  it('get_coverage_summary returns per-spec counts', async () => {
    const r = await tool('get_coverage_summary').handler({});
    const body = parseResult(r) as { specs: Array<{ spec: string; fr: number; ac: number; scenario: number; task: number }> };
    const auth = body.specs.find((s) => s.spec === 'auth')!;
    expect(auth.fr).toBe(2);
    expect(auth.ac).toBe(1);
    expect(auth.scenario).toBe(2);
    expect(auth.task).toBe(2);
  });

  it('list_phase_tasks returns empty + note (TaskNode has no phase yet)', async () => {
    const r = await tool('list_phase_tasks').handler({ phase: 'Phase 2' });
    const body = parseResult(r) as { tasks: unknown[]; count: number; note?: string };
    expect(body.count).toBe(0);
    expect(body.note).toBeDefined();
  });
});
