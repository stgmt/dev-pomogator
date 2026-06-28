/**
 * @feature32 step definitions — evidence-derived task status (FR-32).
 * Covers SPECGEN004_70..74 against the REAL implementations (no mocks):
 *   - computeCoverage (per-task verified_status) — spec-status's derivation
 *   - checkConformance (TASK_STATUS_UNVERIFIED honesty gate)
 *   - buildToolRegistry get_spec_status / get_trace (MCP surface)
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_70..74
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { computeCoverage, type CoverageReport } from '../../tools/spec-graph/coverage.ts';
import { checkConformance, type Finding } from '../../tools/spec-graph/conformance.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import type { SpecGraph } from '../../tools/spec-graph/types.ts';

interface ScenSpec { id: string; tags: string[]; result?: string }
interface TaskSpec { id: string; status: 'todo' | 'done'; refs: string[]; doneWhen: string }

interface F32World {
  graph?: SpecGraph;
  report?: CoverageReport;
  findings?: Finding[];
  covPayload?: { ok: boolean; buckets: Record<string, string[]>; totals: Record<string, number>; tasks: Record<string, { verified_status: string }> };
  traceNode?: { verified_status?: string };
}

function makeGraph(scens: ScenSpec[], tasks: TaskSpec[]): SpecGraph {
  const nodes = new Map<string, any>();
  for (const s of scens) nodes.set(s.id, { id: s.id, type: 'Scenario', file: 'demo.feature', line: 1, tags: s.tags, steps: [], lastResult: s.result });
  for (const t of tasks) nodes.set(t.id, { id: t.id, type: 'Task', file: 'TASKS.md', line: 1, status: t.status, refs: t.refs, doneWhen: t.doneWhen });
  return { version: 1, builtAt: '', nodes, edges: [], definitions: new Map(), backlinks: new Map() };
}
const getTool = (g: SpecGraph, name: string) => buildToolRegistry(() => g).find((t) => t.name === name)!;

// ── SPECGEN004_70 — DONE only when all mapped scenarios passed ──────────────
Given(/a task whose Done-When references scenarios that are all .PASSED./, function (this: F32World) {
  this.graph = makeGraph(
    [{ id: 'SCEN-specgen004-90-x', tags: ['@feature90'], result: 'PASSED' }],
    [{ id: 't-green', status: 'done', refs: [], doneWhen: 'SPECGEN004_90 passes' }],
  );
});
When(/.spec-status.* computes the task's status$/, function (this: F32World) {
  this.report = computeCoverage([...graphTasks(this.graph!)], [...graphScens(this.graph!)]);
  this.findings = checkConformance(this.graph!);
});
Then(/the rendered status is .DONE.$/, function (this: F32World) {
  assert.equal(this.report!.tasks['t-green'].verified_status, 'DONE');
});
Then(/no .TASK_STATUS_UNVERIFIED. finding is emitted for that task$/, function (this: F32World) {
  assert.ok(!this.findings!.some((f) => f.code === 'TASK_STATUS_UNVERIFIED' && f.nodeId === 't-green'));
});

// ── SPECGEN004_71 — honesty gate flags hand-set DONE w/ undefined scenario ──
Given(/a task hand-set to .Status: DONE. whose mapped scenario is .UNDEFINED./, function (this: F32World) {
  this.graph = makeGraph(
    [{ id: 'SCEN-specgen004-91-y', tags: ['@feature91'], result: 'UNDEFINED' }],
    [{ id: 't-lie', status: 'done', refs: [], doneWhen: 'SPECGEN004_91' }],
  );
});
When(/.spec-status. computes the verified status$/, function (this: F32World) {
  this.report = computeCoverage([...graphTasks(this.graph!)], [...graphScens(this.graph!)]);
  this.findings = checkConformance(this.graph!);
});
Then(/a finding .TASK_STATUS_UNVERIFIED. is emitted with the offending scenario id and bucket$/, function (this: F32World) {
  const f = this.findings!.find((x) => x.code === 'TASK_STATUS_UNVERIFIED' && x.nodeId === 't-lie');
  assert.ok(f, 'expected TASK_STATUS_UNVERIFIED for t-lie');
  assert.match(f.message, /specgen004-91.*=undefined/i);
});
Then(/the rendered status is capped at .IN_PROGRESS., never .DONE.$/, function (this: F32World) {
  assert.equal(this.report!.tasks['t-lie'].verified_status, 'IN_PROGRESS');
});

// ── SPECGEN004_72 — get_spec_status buckets (one per scenario) ─────────────────
Given(/a .\.last-test-run\.ndjson. with a mix of passed, pending, undefined and ambiguous scenarios/, function (this: F32World) {
  this.graph = makeGraph(
    [
      { id: 's-p', tags: [], result: 'PASSED' },
      { id: 's-pe', tags: [], result: 'PENDING' },
      { id: 's-u', tags: [], result: 'UNDEFINED' },
      { id: 's-a', tags: [], result: 'AMBIGUOUS' },
    ],
    [],
  );
});
When(/the MCP client invokes .get_spec_status\(view: coverage\)/, async function (this: F32World) {
  const res = await getTool(this.graph!, 'get_spec_status').handler({ view: 'coverage' });
  this.covPayload = JSON.parse(res.content[0].text);
});
Then(/groups every scenario into exactly one of .passed., .pending., .undefined., .ambiguous. or .failed.$/, function (this: F32World) {
  const b = this.covPayload!.buckets;
  const sum = Object.values(b).reduce((n, arr) => n + arr.length, 0);
  assert.equal(sum, this.covPayload!.totals.scenarios);
});
Then(/the per-bucket counts equal the cucumber summary for the same run$/, function (this: F32World) {
  const t = this.covPayload!.totals;
  assert.deepEqual({ passed: t.passed, pending: t.pending, undefined: t.undefined, ambiguous: t.ambiguous }, { passed: 1, pending: 1, undefined: 1, ambiguous: 1 });
});

// ── SPECGEN004_73 — get_spec_status per-task verified_status ───────────────────
Given(/a spec whose tasks map to scenarios of mixed result$/, function (this: F32World) {
  this.graph = makeGraph(
    [
      { id: 'SCEN-specgen004-93-a', tags: ['@feature93'], result: 'PASSED' },
      { id: 'SCEN-specgen004-94-b', tags: ['@feature94'], result: 'UNDEFINED' },
    ],
    [
      { id: 't-all-green', status: 'todo', refs: [], doneWhen: 'SPECGEN004_93' },
      { id: 't-has-red', status: 'todo', refs: [], doneWhen: 'SPECGEN004_93 SPECGEN004_94' },
    ],
  );
});
Then(/each task carries a .verified_status. of .DONE. only if all its mapped scenarios are .passed.$/, function (this: F32World) {
  assert.equal(this.covPayload!.tasks['t-all-green'].verified_status, 'DONE');
});
Then(/tasks with any non-passed mapped scenario carry .verified_status. of .in_progress.$/, function (this: F32World) {
  assert.equal(this.covPayload!.tasks['t-has-red'].verified_status, 'IN_PROGRESS');
});

// ── SPECGEN004_74 — get_trace surfaces verified_status ──────────────────────
Given(/a SpecGraph built from a spec with a recorded test run$/, function (this: F32World) {
  this.graph = makeGraph(
    [{ id: 'SCEN-specgen004-95-c', tags: ['@feature95'], result: 'UNDEFINED' }],
    [],
  );
  this.graph.nodes.set('FR-95', { id: 'FR-95', type: 'FR', file: 'FR.md', line: 1, title: 'X', anchors: ['FR-95'], body: '' } as any);
});
When(/the MCP client invokes .get_trace\(\{node_id: <task or FR>\}\)/, async function (this: F32World) {
  const res = await getTool(this.graph!, 'get_trace').handler({ node_id: 'FR-95' });
  this.traceNode = JSON.parse(res.content[0].text).node;
});
Then(/the node includes a .verified_status. field derived from coverage$/, function (this: F32World) {
  assert.ok('verified_status' in this.traceNode!);
});
Then(/it never reports .DONE. while a linked scenario is pending, undefined or ambiguous$/, function (this: F32World) {
  assert.notEqual(this.traceNode!.verified_status, 'DONE');
});

// ── SPECGEN004_134 — not_run (absent) separated from undefined (FR-32 honesty) ─
// Regression for the 2026-06-08 conflation: a scenario absent from the last
// NDJSON (filtered `--tags` run) must bucket as not_run, NOT undefined — else a
// debug run silently reads as "the spec fell apart".
Given(
  'a coverage run where one scenario passed, one is UNDEFINED, and one was not in the last NDJSON',
  function (this: F32World) {
    this.graph = makeGraph(
      [
        { id: 's-ran', tags: [], result: 'PASSED' },
        { id: 's-undef', tags: [], result: 'UNDEFINED' }, // ran, steps undefined
        { id: 's-absent', tags: [] }, // absent from NDJSON → not_run
      ],
      [],
    );
  },
);
When('coverage buckets are computed', function (this: F32World) {
  this.report = computeCoverage([...graphTasks(this.graph!)], [...graphScens(this.graph!)]);
});
Then('the absent scenario is not_run and the UNDEFINED one stays undefined', function (this: F32World) {
  assert.deepEqual(this.report!.buckets.not_run, ['s-absent']);
  assert.deepEqual(this.report!.buckets.undefined, ['s-undef']);
  assert.deepEqual(this.report!.buckets.passed, ['s-ran']);
});

// ── helpers: pull TaskLike / ScenarioLike out of the graph ──────────────────
function* graphScens(g: SpecGraph) {
  for (const n of g.nodes.values()) if (n.type === 'Scenario') yield { id: n.id, tags: (n as any).tags, result: (n as any).lastResult };
}
function* graphTasks(g: SpecGraph) {
  for (const n of g.nodes.values()) if (n.type === 'Task') yield { id: n.id, doneWhen: (n as any).doneWhen ?? '', refs: (n as any).refs };
}

// ── SPECGEN004_143 — FR-32 (P19-3): get_spec_status {spec} scoping vs bare corpus ──
// Binds the REAL registry handler: the spec param filters by specOf(node.file),
// so the two specs' scenarios live in distinct .specs/<slug>/ files here.
interface ScopeWorld extends F32World {
  scoped?: { ok: boolean; scope: string; buckets: Record<string, string[]> };
  bare?: { ok: boolean; scope: string; buckets: Record<string, string[]> };
}
function twoSpecGraph(): SpecGraph {
  const nodes = new Map<string, any>();
  const scen = (id: string, slug: string, result?: string) =>
    nodes.set(id, { id, type: 'Scenario', file: `.specs/${slug}/${slug}.feature`, line: 1, tags: ['@FR-1'], steps: [], lastResult: result });
  scen('spec-a:SCEN-aaa001-01-one', 'spec-a', 'PASSED');
  scen('spec-a:SCEN-aaa001-02-two', 'spec-a', 'FAILED');
  scen('spec-b:SCEN-bbb001-01-other', 'spec-b', 'PASSED');
  return { version: 1, builtAt: '', nodes, edges: [], definitions: new Map(), backlinks: new Map() };
}
Given('a graph holding scenarios from two different specs', function (this: ScopeWorld) {
  this.graph = twoSpecGraph();
});
When(/^get_spec_status \(view coverage\) is called scoped to one spec and then bare$/, async function (this: ScopeWorld) {
  const tool = getTool(this.graph!, 'get_spec_status');
  const call = async (args: object) => JSON.parse(((await tool.handler(args as never)) as { content: Array<{ text: string }> }).content[0].text);
  this.scoped = await call({ spec: 'spec-a', view: 'coverage' });
  this.bare = await call({ view: 'coverage' });
});
Then("the scoped buckets hold only that spec's scenarios and the bare buckets hold the whole corpus", function (this: ScopeWorld) {
  const ids = (r: { buckets: Record<string, string[]> }) => Object.values(r.buckets).flat();
  assert.equal(this.scoped!.scope, 'spec');
  assert.deepEqual(ids(this.scoped!).sort(), ['spec-a:SCEN-aaa001-01-one', 'spec-a:SCEN-aaa001-02-two'], 'scoped call must see ONLY spec-a scenarios');
  assert.equal(this.bare!.scope, 'corpus');
  assert.equal(ids(this.bare!).length, 3, 'bare call must see the whole corpus (both specs)');
  assert.ok(ids(this.bare!).includes('spec-b:SCEN-bbb001-01-other'), 'corpus view includes the other spec');
});
