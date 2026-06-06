/**
 * Unit tests for the 12 MCP tool handlers.
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
  FileNode,
  Edge,
} from '../../spec-graph/types.ts';

function fr(id: string, title: string, file = '.specs/auth/FR.md', line = 1): FrNode {
  return { id, type: 'FR', file, line, title, anchors: [id], body: '' };
}
function ac(id: string, parentFr: string, file = '.specs/auth/AC.md', line = 1): AcNode {
  return { id, type: 'AC', file, line, parentFr, ears: '' };
}
function scen(id: string, tags: string[] = [], file = '.specs/auth/auth.feature', line = 1): ScenarioNode {
  return { id, type: 'Scenario', file, line, tags, steps: [] };
}
function task(id: string, refs: string[], file = '.specs/auth/TASKS.md', line = 1): TaskNode {
  return { id, type: 'Task', file, line, refs, status: 'todo', title: id };
}
function fileNode(id: string, p: string, file = '.specs/auth/FILE_CHANGES.md', line = 1): FileNode {
  return { id, type: 'File', file, line, path: p };
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
  it('registers exactly 14 tools with canonical names', () => {
    expect(registry).toHaveLength(14);
    const names = registry.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'conformance_check',
        'find_by_tags',
        'find_orphans',
        'find_refs', // FR-7b spec-domain graph reference-finder (NOT markdown nav)
        'get_coverage', // FR-32 honesty rollup
        'get_coverage_summary',
        'get_node',
        'get_spec_status', // FR-38 full lifecycle + linked last-run summary
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

describe('find_refs — spec-domain graph reference-finder (FR-7b)', () => {
  // After the bridge retirement (Marksman is a native LSP plugin, not an in-MCP
  // bridge), find_refs serves SEMANTIC graph references only — markdown wiki-link
  // navigation is the native `LSP` tool's job.
  it('finds incoming spec-domain references (tested-by Scenario + refs Task)', async () => {
    const reg = buildToolRegistry(() => makeGraph());
    const t = reg.find((x) => x.name === 'find_refs')!;
    const body = parseResult(await t.handler({ node_id: 'FR-1' })) as {
      ok: boolean;
      references: Array<{ id: string; relation: string }>;
      count: number;
    };
    expect(body.ok).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(1); // FR-1 has AC-1 + SCEN + TASK refs
    expect(body.references.some((r) => r.relation === 'tested-by')).toBe(true);
    expect(body.references.some((r) => r.id === 'TASK-impl-login' && r.relation === 'refs')).toBe(true);
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

describe('get_trace — code_impl[] (FR-30)', () => {
  /**
   * Independent fixture: FR-5 has 3 implements edges (covers AC-30.1),
   * AC-5.1 inherits parent FR-5's entries (covers AC-30.2),
   * FR-2 has 0 implements edges (verifies empty-array-not-omitted invariant).
   */
  function makeImplGraph(): SpecGraph {
    const g: SpecGraph = {
      version: 1,
      builtAt: new Date('2026-06-02T00:00:00Z').toISOString(),
      nodes: new Map(),
      edges: [] as Edge[],
      definitions: new Map(),
      backlinks: new Map(),
    };
    g.nodes.set('FR-5', fr('FR-5', 'Auth'));
    g.nodes.set('FR-2', fr('FR-2', 'Logout', '.specs/auth/FR.md', 20));
    g.nodes.set('AC-5.1', ac('AC-5.1', 'FR-5'));
    g.nodes.set('FILE-a', fileNode('FILE-a', 'src/auth/login.ts'));
    g.nodes.set('FILE-b', fileNode('FILE-b', 'src/auth/session.ts'));
    g.nodes.set('FILE-c', fileNode('FILE-c', 'src/auth/cookies.ts'));
    g.edges.push({
      from: 'FR-5', to: 'FILE-a', type: 'implements',
      metadata: { file_path: 'src/auth/login.ts', source_section: 'FILE_CHANGES', action: 'create' },
    });
    g.edges.push({
      from: 'FR-5', to: 'FILE-b', type: 'implements',
      metadata: { file_path: 'src/auth/session.ts', source_section: 'FILE_CHANGES', action: 'edit' },
    });
    g.edges.push({
      from: 'FR-5', to: 'FILE-c', type: 'implements',
      metadata: { file_path: 'src/auth/cookies.ts', source_section: 'DESIGN' },
    });
    return g;
  }

  function implTool(name: string) {
    const reg = buildToolRegistry(() => makeImplGraph());
    const t = reg.find((x) => x.name === name);
    if (!t) throw new Error(`tool ${name} not registered`);
    return t;
  }

  it('AC-30.1: FR with 3 implements edges → code_impl length 3 with file_path + source_section', async () => {
    const r = await implTool('get_trace').handler({ node_id: 'FR-5' });
    const body = parseResult(r) as {
      ok: boolean;
      code_impl: Array<{ file_path: string; action?: string; source_section: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.code_impl).toHaveLength(3);
    expect(body.code_impl.map((e) => e.file_path).sort()).toEqual(
      ['src/auth/cookies.ts', 'src/auth/login.ts', 'src/auth/session.ts'],
    );
    for (const entry of body.code_impl) {
      expect(typeof entry.file_path).toBe('string');
      expect(['FILE_CHANGES', 'DESIGN']).toContain(entry.source_section);
    }
    const login = body.code_impl.find((e) => e.file_path === 'src/auth/login.ts')!;
    expect(login.source_section).toBe('FILE_CHANGES');
    expect(login.action).toBe('create');
    const cookies = body.code_impl.find((e) => e.file_path === 'src/auth/cookies.ts')!;
    expect(cookies.source_section).toBe('DESIGN');
    expect(cookies.action).toBeUndefined();
  });

  it('AC-30.2: AC inherits parent FR code_impl transitively (identical entries)', async () => {
    const rFr = await implTool('get_trace').handler({ node_id: 'FR-5' });
    const rAc = await implTool('get_trace').handler({ node_id: 'AC-5.1' });
    const fromFr = (parseResult(rFr) as { code_impl: Array<{ file_path: string }> }).code_impl;
    const fromAc = (parseResult(rAc) as { code_impl: Array<{ file_path: string }> }).code_impl;
    expect(fromAc).toHaveLength(fromFr.length);
    expect(fromAc.map((e) => e.file_path).sort()).toEqual(fromFr.map((e) => e.file_path).sort());
  });

  it('No implements edges → code_impl present as empty array, NOT omitted (stable shape)', async () => {
    const r = await implTool('get_trace').handler({ node_id: 'FR-2' });
    const body = parseResult(r) as { ok: boolean; code_impl?: unknown };
    expect(body.ok).toBe(true);
    // Field MUST be present (not undefined / omitted) per FR-30.
    expect(Object.prototype.hasOwnProperty.call(body, 'code_impl')).toBe(true);
    expect(Array.isArray(body.code_impl)).toBe(true);
    expect(body.code_impl as unknown[]).toHaveLength(0);
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

describe('find_refs (FR-7 JS-LSP fallback navigation)', () => {
  type Ref = { id: string; type: string; relation: string; direction: string };
  const refsOf = async (id: string): Promise<Ref[]> =>
    (parseResult(await tool('find_refs').handler({ node_id: id })) as { references: Ref[] }).references;

  it('surfaces every cross-link to a node — covers/tested-by edges + task refs', async () => {
    const refs = await refsOf('FR-1');
    const byId = new Map(refs.map((r) => [r.id, r]));
    // covers→AC-1 (outgoing), tested-by→SCEN-login-ok (outgoing), TASK refs (incoming)
    expect(byId.get('AC-1')).toMatchObject({ relation: 'covers', direction: 'outgoing' });
    expect(byId.get('SCEN-login-ok')).toMatchObject({ relation: 'tested-by', direction: 'outgoing' });
    expect(byId.get('TASK-impl-login')).toMatchObject({ relation: 'refs', direction: 'incoming' });
    expect(refs).toHaveLength(3);
  });

  it('never lists a (id, relation, direction) reference twice — output is deduped', async () => {
    const refs = await refsOf('FR-1');
    const keys = refs.map((r) => `${r.id}|${r.relation}|${r.direction}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never returns the queried node itself as a reference', async () => {
    const refs = await refsOf('FR-1');
    expect(refs.some((r) => r.id === 'FR-1')).toBe(false);
  });

  it('returns an empty set for a node nothing points at', async () => {
    expect(await refsOf('FR-2')).toEqual([]);
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
