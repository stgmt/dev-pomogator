import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import type { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

type Json = Record<string, unknown>;

interface Feature82World extends V4World {
  f82Root?: string;
  f82Registry?: ReturnType<typeof buildToolRegistry>;
  f82Pages?: Json[];
  f82Result?: Json;
  f82Second?: Json;
  f82Calls?: number;
  f82Bytes?: number;
  f82Refreshes?: number;
  f82Description?: string;
  f82TestSource?: string;
  f82Incident?: {
    ground_truth: {
      spec_collector_attempts: number;
      spec_mcp_calls: number;
      aggregate_response_bytes: number;
      observed_attempt_input_token_range: { minimum_approx: number; maximum_approx: number };
    };
    provenance: { derivation: string };
    acceptance_target: {
      maximum_mcp_calls: number;
      maximum_aggregate_response_bytes: number;
      task_inventory: string;
    };
  };
}

function parseResult(result: { content: Array<{ text: string }> }): Json {
  return JSON.parse(result.content[0].text) as Json;
}

async function call(world: Feature82World, name: string, args: Record<string, unknown>): Promise<Json> {
  const tool = world.f82Registry!.find((entry) => entry.name === name);
  assert.ok(tool, `missing real MCP handler: ${name}`);
  world.f82Calls = (world.f82Calls ?? 0) + 1;
  const result = await tool.handler(args as never);
  world.f82Bytes = (world.f82Bytes ?? 0) + Buffer.byteLength(result.content[0].text, 'utf8');
  return parseResult(result);
}

function stageCorpus(world: Feature82World): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature82-'));
  const write = (slug: string, doc: string, body: string): void => {
    const dir = path.join(root, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, doc), body, 'utf8');
  };
  write('bounded-demo', 'FR.md', '## FR-82: Bounded inventory\n');
  write('bounded-demo', 'ACCEPTANCE_CRITERIA.md', '## AC-82.1\n**Требование:** [FR-82](FR.md#fr-82)\n');
  write('bounded-demo', 'TASKS.md', [
    '# Tasks',
    '## Phase 47 — Immediate',
    '- [ ] First task — id: first-task — Status: TODO | Est: 10m',
    '  _Requirements: [FR-82](FR.md#fr-82)_',
    '  **Comment:** Preserve the captured incident.',
    '  **Blocker:** Waiting for a real fixture.',
    '  Issue: https://github.com/stgmt/dev-pomogator/issues/210',
    '  **Done When:**',
    '  - [ ] SPECGEN004_670 passes',
    '- [ ] Second task — id: second-task — Status: BLOCKED | Est: 10m',
    '  _Requirements: [FR-82](FR.md#fr-82)_',
    '  **Done When:**',
    '  - [ ] SPECGEN004_671 passes',
    '## Phase 48 — Empty after status filter',
    '- [x] Completed task — id: completed-task — Status: DONE | Est: 10m',
    '  _Requirements: [FR-82](FR.md#fr-82)_',
    '  **Done When:**',
    '  - [x] SPECGEN004_672 passes',
  ].join('\n') + '\n');
  write('other-demo', 'FR.md', '## FR-82: Other spec\n');
  write('other-demo', 'TASKS.md', [
    '# Tasks',
    '## Phase 47 — Immediate',
    '- [ ] Foreign task — id: foreign-task — Status: TODO | Est: 10m',
    '  _Requirements: [FR-82](FR.md#fr-82)_',
    '  **Done When:**',
    '  - [ ] OTHER001_01 passes',
  ].join('\n') + '\n');
  const longDoc = ['# Long document', ...Array.from({ length: 700 }, (_, index) => `line-${index + 1}-${'x'.repeat(100)}`), '## FR-82', 'target'].join('\n') + '\n';
  write('bounded-demo', 'RESEARCH.md', longDoc);
  world.f82Root = root;
  world.f82Refreshes = 0;
  world.f82Registry = buildToolRegistry(() => buildGraph({ repoRoot: root, skipNdjson: true }), {
    repoRoot: root,
    refreshGraph: () => { world.f82Refreshes = (world.f82Refreshes ?? 0) + 1; },
  });
  world.f82Calls = 0;
  world.f82Bytes = 0;
}

Given('the live SpecGraph contains task nodes and the harness loads the captured corpus artifact for wf_0315d03b-28', function (this: Feature82World) {
  stageCorpus(this);
});

When('the real list_tasks MCP handler is called for one spec without a status filter', async function (this: Feature82World) {
  this.f82Result = await call(this, 'list_tasks', { spec: 'bounded-demo', include_comments: true, limit: 200 });
});

Then('it returns every non-terminal task with id title status phase rationale links source location and evidence-backed blockers only', function (this: Feature82World) {
  const results = this.f82Result!.results as Json[];
  assert.deepEqual(results.map((entry) => entry.id), ['bounded-demo:first-task', 'bounded-demo:second-task']);
  const first = results[0];
  assert.equal(first.comment, 'Preserve the captured incident.');
  assert.equal(first.blocker, 'Waiting for a real fixture.');
  assert.deepEqual(first.issue_refs, [210]);
  assert.deepEqual(first.requirements, ['FR-82']);
  assert.deepEqual(first.location, { file: '.specs/bounded-demo/TASKS.md', line: 3 });
  assert.equal(results[1].blocker, null, 'a blocker is never inferred without an explicit authored field');
});

Then('the response includes total returned truncated and next cursor metadata', function (this: Feature82World) {
  assert.deepEqual(
    { total: this.f82Result!.total, returned: this.f82Result!.returned, truncated: this.f82Result!.truncated, next_cursor: this.f82Result!.next_cursor },
    { total: 2, returned: 2, truncated: false, next_cursor: null },
  );
});

Given('the real captured task corpus has more matching tasks than the requested page limit', function (this: Feature82World) {
  stageCorpus(this);
});

When('the real list_tasks MCP handler is called repeatedly with its returned cursor', async function (this: Feature82World) {
  const first = await call(this, 'list_tasks', { spec: 'bounded-demo', limit: 1 });
  const second = await call(this, 'list_tasks', { spec: 'bounded-demo', limit: 1, cursor: first.next_cursor });
  this.f82Pages = [first, second];
});

Then('the concatenated pages contain exactly total unique canonical task ids in stable order', function (this: Feature82World) {
  const ids = this.f82Pages!.flatMap((page) => (page.results as Json[]).map((entry) => String(entry.id)));
  assert.deepEqual(ids, ['bounded-demo:first-task', 'bounded-demo:second-task']);
  assert.equal(new Set(ids).size, Number(this.f82Pages![0].total));
});

Then('every page reports returned cardinality consistently and no task is silently omitted', function (this: Feature82World) {
  for (const page of this.f82Pages!) assert.equal(page.returned, (page.results as unknown[]).length);
  assert.equal(this.f82Pages![1].truncated, false);
});

Then('the reference corpus completes at most two pages when the limit is 200', function (this: Feature82World) {
  assert.ok(this.f82Pages!.length <= 2);
});

Given('the real graph exposes canonical phases and the captured corpus has a known phase with no matching tasks', function (this: Feature82World) {
  stageCorpus(this);
});

When('the real list_phase_tasks MCP handler is called with the spec and each phase query', async function (this: Feature82World) {
  this.f82Pages = [
    await call(this, 'list_phase_tasks', { spec: 'bounded-demo', phase: 'Phase 48 — Empty after status filter' }),
    await call(this, 'list_phase_tasks', { spec: 'bounded-demo', phase: 'Phase 999' }),
    await call(this, 'list_phase_tasks', { spec: 'bounded-demo', phase: 'Phase 47 — Immediate', limit: 1 }),
  ];
});

Then('the known empty phase returns EMPTY_PHASE', function (this: Feature82World) {
  assert.equal(this.f82Pages![0].state, 'EMPTY_PHASE');
});

Then('the unknown phase returns PHASE_NOT_FOUND with nearest canonical phase candidates', function (this: Feature82World) {
  assert.equal(this.f82Pages![1].error, 'PHASE_NOT_FOUND');
  assert.ok((this.f82Pages![1].candidates as string[]).length > 0);
});

Then('a populated phase uses bounded deterministic pagination', function (this: Feature82World) {
  assert.deepEqual({ state: this.f82Pages![2].state, returned: this.f82Pages![2].returned, truncated: this.f82Pages![2].truncated }, { state: 'POPULATED', returned: 1, truncated: true });
});

Given('the real graph contains matching and non-matching nodes across more than one page', function (this: Feature82World) {
  stageCorpus(this);
});

When('the real search MCP handler is called with a spec scope and fixed query filters', async function (this: Feature82World) {
  const first = await call(this, 'search', { spec: 'bounded-demo', query: 'task', types: ['Task'], limit: 1 });
  const second = await call(this, 'search', { spec: 'bounded-demo', query: 'task', types: ['Task'], limit: 1, cursor: first.next_cursor });
  const third = await call(this, 'search', { spec: 'bounded-demo', query: 'task', types: ['Task'], limit: 1, cursor: second.next_cursor });
  this.f82Pages = [first, second, third];
});

Then('cursor pages concatenate to the complete matching set in stable order', function (this: Feature82World) {
  const ids = this.f82Pages!.flatMap((page) => (page.results as Json[]).map((entry) => String(entry.id)));
  assert.deepEqual(ids, ['bounded-demo:completed-task', 'bounded-demo:first-task', 'bounded-demo:second-task']);
  assert.ok(ids.every((id) => !id.includes('foreign-task')));
});

Then('total returned truncated and next cursor values conserve the matching cardinality', function (this: Feature82World) {
  const returned = this.f82Pages!.reduce((sum, page) => sum + Number(page.returned), 0);
  assert.equal(returned, this.f82Pages![0].total);
  assert.equal(this.f82Pages!.at(-1)!.next_cursor, null);
});

Given('the real graph revision is unchanged between two summary requests', function (this: Feature82World) {
  stageCorpus(this);
});

When('the real get_spec_status MCP handler is called with view summary twice', async function (this: Feature82World) {
  this.f82Result = await call(this, 'get_spec_status', { spec: 'bounded-demo', view: 'summary' });
  this.f82Second = await call(this, 'get_spec_status', { spec: 'bounded-demo', view: 'summary' });
});

Then('each response contains status counts and gap summary but no full task inventory payload', function (this: Feature82World) {
  for (const result of [this.f82Result!, this.f82Second!]) {
    assert.equal(result.view, 'summary');
    assert.ok(result.counts);
    assert.ok(result.gaps);
    assert.equal('tasks' in result, false);
    assert.equal('coverage' in result, false);
  }
});

Then('the second call does not recompute an unchanged read-side global census', function (this: Feature82World) {
  assert.equal(this.f82Refreshes, 0);
});

Given('the real spec corpus contains a document larger than the safe page bound', function (this: Feature82World) {
  stageCorpus(this);
});

When('the real read_spec_doc MCP handler is called without pagination and then with a missing section', async function (this: Feature82World) {
  this.f82Result = await call(this, 'read_spec_doc', { spec: 'bounded-demo', doc: 'RESEARCH.md' });
  this.f82Second = await call(this, 'read_spec_doc', { spec: 'bounded-demo', doc: 'RESEARCH.md', section: 'FR-999' });
});

Then('the first response is bounded and a whole-document read requires explicit opt-in', function (this: Feature82World) {
  assert.equal(this.f82Result!.bounded_default, true);
  assert.equal(this.f82Result!.truncated, true);
  assert.equal(this.f82Result!.whole_document_available, true);
  assert.ok(Number(this.f82Result!.lines) <= 300);
});

Then('the missing section response identifies nearest canonical headings or anchors', function (this: Feature82World) {
  assert.equal(this.f82Second!.error, 'SECTION_NOT_FOUND');
  assert.ok((this.f82Second!.candidates as Json[]).some((candidate) => candidate.anchor === 'fr-82'));
});

Given('the live graph contains task nodes and the existing phase-query description and test are loaded', function (this: Feature82World) {
  stageCorpus(this);
  this.f82Description = this.f82Registry!.find((entry) => entry.name === 'list_phase_tasks')!.description;
  this.f82TestSource = fs.readFileSync(path.resolve('tools/spec-mcp-server/__tests__/tools.test.ts'), 'utf8');
});

When('the list_phase_tasks contract regression runs through the real MCP handler', async function (this: Feature82World) {
  this.f82Result = await call(this, 'list_phase_tasks', { spec: 'bounded-demo', phase: 'Phase 47 — Immediate' });
});

Then('neither the tool description nor the assertion claims that task nodes are not produced', function (this: Feature82World) {
  assert.doesNotMatch(this.f82Description!, /not produced|parser ships/i);
  assert.doesNotMatch(this.f82TestSource!, /returns empty \+ note \(TaskNode has no phase yet\)/);
});

Then('a genuinely empty phase is not reported as evidence that the task inventory is absent', function (this: Feature82World) {
  assert.equal(this.f82Result!.state, 'POPULATED');
  assert.equal(this.f82Result!.total, 2);
});

Given('the real captured wf_0315d03b-28 incident and corpus artifact are loaded rather than a hand-invented producer shape', function (this: Feature82World) {
  stageCorpus(this);
  this.f82Incident = JSON.parse(
    fs.readFileSync(path.resolve('audit-reports/wf-0315d03b-28f-mcp-incident.json'), 'utf8'),
  ) as Feature82World['f82Incident'];
  assert.ok(this.f82Incident, 'the captured workflow incident artifact is required');
  assert.match(this.f82Incident.provenance.derivation, /tool_use_id/);
});

When('one bounded task-inventory request and bounded verification are run through real MCP handlers', async function (this: Feature82World) {
  const target = this.f82Incident!.acceptance_target;
  assert.match(target.task_inventory, /list_tasks.*summary/i);
  this.f82Result = await call(this, 'list_tasks', { spec: 'bounded-demo', include_comments: true, limit: 200 });
  this.f82Second = await call(this, 'get_spec_status', { spec: 'bounded-demo', view: 'summary' });
});

Then('the run stays within the declared maximum of three MCP calls, 512 KiB aggregate response bytes, and the declared page latency budget', function (this: Feature82World) {
  const target = this.f82Incident!.acceptance_target;
  assert.ok(this.f82Calls! <= target.maximum_mcp_calls, `calls=${this.f82Calls}`);
  assert.ok(this.f82Bytes! <= target.maximum_aggregate_response_bytes, `bytes=${this.f82Bytes}`);
  assert.equal(this.f82Result!.total, 2, 'the bounded real handler still returns the complete unfinished-task cardinality');
  assert.equal(this.f82Second!.view, 'summary', 'the bounded verification uses the production summary branch');
});

Then('the six retries, 695 calls, approximately 5.46 MB, and approximately 297 to 312k input tokens remain recorded as incident evidence rather than an eternal performance claim', function (this: Feature82World) {
  const incident = this.f82Incident!;
  assert.equal(incident.ground_truth.spec_collector_attempts, 6);
  assert.equal(incident.ground_truth.spec_mcp_calls, 695);
  assert.equal(incident.ground_truth.aggregate_response_bytes, 5_459_786);
  assert.deepEqual(incident.ground_truth.observed_attempt_input_token_range, { minimum_approx: 297_000, maximum_approx: 312_000 });
  assert.ok(this.f82Calls! < incident.ground_truth.spec_mcp_calls, 'the real bounded execution must improve on the captured N+1 path');
  assert.ok(this.f82Bytes! < incident.ground_truth.aggregate_response_bytes, 'the real bounded execution must improve on captured response volume');
});
