/**
 * Step definitions — the 5-shape SpecGraph fixture corpus (migrated from
 * tests/e2e/fixture-shapes.test.ts, F-21..F-25). Each scenario stages a REAL
 * on-disk fixture (tests/fixtures/specs/<shape>/) into the V4World tempDir and
 * drives the REAL builder / conformance / guard / get_trace — no mocks.
 *
 *   @feature2  SpecGraph builder node/edge production (FR-2)
 *   @feature3  custom MD parser dual/triple anchors (FR-3)
 *   @feature4  get_trace over a dense graph (FR-4)
 *   @feature5  spec-conformance-guard DENY DUPLICATE_DEFINITION (FR-5)
 *   @feature32 coverage rollup shows scenarios=0 for an FR-only spec (FR-32)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { checkConformance } from '../../tools/spec-graph/conformance.ts';
import { runGuard } from '../../tools/spec-conformance-guard/spec-conformance-guard.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'tests', 'fixtures', 'specs');

interface ShapeWorld extends V4World {
  shape?: string;
  graph?: any;
  guardOut?: any;
  traceOks?: boolean[];
}

function stageFixture(w: ShapeWorld, shape: string) {
  const dst = path.join(w.tempDir, '.specs', shape);
  fs.mkdirSync(dst, { recursive: true });
  const src = path.join(FIXTURES_ROOT, shape);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isFile()) fs.copyFileSync(path.join(src, e.name), path.join(dst, e.name));
  }
  w.shape = shape;
}

function countByType(graph: any): Record<string, number> {
  const by: Record<string, number> = {};
  for (const n of graph.nodes.values()) by[n.type] = (by[n.type] ?? 0) + 1;
  return by;
}

Given(/^a staged "([^"]+)" spec fixture$/, function (this: ShapeWorld, shape: string) {
  stageFixture(this, shape);
});
Given(/^the fixture is in v4 conformance mode$/, function (this: ShapeWorld) {
  fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, '.specs', '.progress.json'), JSON.stringify({ version: 4 }));
});

When(/^the SpecGraph builder builds the fixture$/, function (this: ShapeWorld) {
  this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
});

When(/^the hard guard receives a Write of the fixture's `([^`]+)`$/, function (this: ShapeWorld, rel: string) {
  const content = fs.readFileSync(path.join(this.tempDir, rel), 'utf-8');
  this.guardOut = runGuard({ tool_name: 'Write', tool_input: { file_path: rel, content } }, this.tempDir);
});
When(/^the hard guard receives an Edit that duplicates an FR heading$/, function (this: ShapeWorld) {
  const dir = path.join(this.tempDir, '.specs', this.shape!);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'FR-edit-target.md');
  fs.writeFileSync(target, '# FR\n\n### FR-1: Login\n');
  this.guardOut = runGuard({
    tool_name: 'Edit',
    tool_input: { file_path: target, old_string: '### FR-1: Login', new_string: '### FR-1: Login\n\n### FR-1: Login alt' },
  }, this.tempDir);
});

When(/^get_trace runs over every FR in the built graph$/, async function (this: ShapeWorld) {
  const tools = buildToolRegistry(() => this.graph);
  const getTrace = tools.find((t: any) => t.name === 'get_trace')!;
  const frIds = [...this.graph.nodes.values()].filter((n: any) => n.type === 'FR').map((n: any) => n.id);
  this.traceOks = [];
  for (const id of frIds) {
    const r = await getTrace.handler({ node_id: id });
    this.traceOks.push(JSON.parse(r.content[0].text).ok === true && JSON.parse(r.content[0].text).node?.id === id);
  }
});

// ── builder (FR-2) ──────────────────────────────────────────────────────────
Then(/^the graph has an FR node `([^`]+)` and stamps version 1$/, function (this: ShapeWorld, id: string) {
  assert.ok(this.graph.nodes.size >= 1);
  assert.equal(this.graph.nodes.get(id)?.type, 'FR');
  assert.equal(this.graph.version, 1);
  assert.equal(typeof this.graph.builtAt, 'string');
});
Then(/^the graph has zero File nodes and zero implements edges$/, function (this: ShapeWorld) {
  const files = [...this.graph.nodes.values()].filter((n: any) => n.type === 'File');
  assert.deepEqual(files, []);
  assert.deepEqual(this.graph.edges.filter((e: any) => e.type === 'implements'), []);
});
Then(/^the graph has (\d+) FR, (\d+) AC and (\d+) Scenario nodes$/, function (this: ShapeWorld, fr: string, ac: string, sc: string) {
  const by = countByType(this.graph);
  assert.equal(by.FR ?? 0, Number(fr));
  assert.equal(by.AC ?? 0, Number(ac));
  assert.equal(by.Scenario ?? 0, Number(sc));
});
Then(/^every FR in the graph lacks a tested-by edge, (\d+) in total$/, function (this: ShapeWorld, n: string) {
  let without = 0;
  for (const fr of this.graph.nodes.values()) {
    if (fr.type !== 'FR') continue;
    if (!this.graph.edges.some((e: any) => e.from === fr.id && e.type === 'tested-by')) without++;
  }
  assert.equal(without, Number(n));
});
Then(/^the graph has FR nodes for both `([^`]+)` and `([^`]+)`$/, function (this: ShapeWorld, a: string, b: string) {
  assert.equal(this.graph.nodes.get(a)?.type, 'FR');
  assert.equal(this.graph.nodes.get(b)?.type, 'FR');
});
Then(/^the node-type cardinality is FR=(\d+) AC=(\d+) Scenario=(\d+) File=(\d+)$/, function (this: ShapeWorld, fr: string, ac: string, sc: string, file: string) {
  const by = countByType(this.graph);
  assert.equal(by.FR ?? 0, Number(fr));
  assert.equal(by.AC ?? 0, Number(ac));
  assert.equal(by.Scenario ?? 0, Number(sc));
  assert.equal(by.File ?? 0, Number(file));
});
Then(/^the graph has at least (\d+) covers, (\d+) tested-by, (\d+) implements edges and (\d+) edges total$/, function (this: ShapeWorld, c: string, t: string, i: string, total: string) {
  const by: Record<string, number> = {};
  for (const e of this.graph.edges) by[e.type] = (by[e.type] ?? 0) + 1;
  assert.ok((by.covers ?? 0) >= Number(c), `covers ${by.covers}`);
  assert.ok((by['tested-by'] ?? 0) >= Number(t), `tested-by ${by['tested-by']}`);
  assert.ok((by.implements ?? 0) >= Number(i), `implements ${by.implements}`);
  assert.ok(this.graph.edges.length >= Number(total), `total ${this.graph.edges.length}`);
});

// ── anchors (FR-3) ──────────────────────────────────────────────────────────
Then(/^the parser registers the compact, slug and legacy-requirement anchors for FR-1$/, function (this: ShapeWorld) {
  assert.ok(this.graph.definitions.get('FR-1'), 'compact FR-1');
  assert.ok(this.graph.definitions.get('fr-1-login'), 'slug fr-1-login');
  assert.ok(this.graph.definitions.get('requirement-fr-1-login'), 'legacy requirement anchor');
});

// ── coverage (FR-32) ────────────────────────────────────────────────────────
Then(/^the per-spec coverage of `([^`]+)` shows fr=(\d+) ac=(\d+) scenario=(\d+)$/, function (this: ShapeWorld, spec: string, fr: string, ac: string, sc: string) {
  const specOf = (fp: string) => (fp.match(/\.specs[\/\\]([^\/\\]+)[\/\\]/) || [])[1] ?? '(other)';
  const row = { fr: 0, ac: 0, scenario: 0 };
  for (const n of this.graph.nodes.values()) {
    if (specOf(n.file) !== spec) continue;
    if (n.type === 'FR') row.fr++; else if (n.type === 'AC') row.ac++; else if (n.type === 'Scenario') row.scenario++;
  }
  assert.equal(row.fr, Number(fr));
  assert.equal(row.ac, Number(ac));
  assert.equal(row.scenario, Number(sc));
});

// ── guard (FR-5) ────────────────────────────────────────────────────────────
Then(/^the guard denies it citing DUPLICATE_DEFINITION with a line number$/, function (this: ShapeWorld) {
  assert.equal(this.guardOut.hookSpecificOutput?.permissionDecision, 'deny', JSON.stringify(this.guardOut));
  assert.match(String(this.guardOut.hookSpecificOutput?.permissionDecisionReason), /DUPLICATE_DEFINITION/);
  assert.match(String(this.guardOut.hookSpecificOutput?.permissionDecisionReason), /line \d+/);
});
Then(/^the guard denies it citing DUPLICATE_DEFINITION$/, function (this: ShapeWorld) {
  assert.equal(this.guardOut.hookSpecificOutput?.permissionDecision, 'deny', JSON.stringify(this.guardOut));
  assert.match(String(this.guardOut.hookSpecificOutput?.permissionDecisionReason), /DUPLICATE_DEFINITION/);
});
Then(/^the guard allows it and does not flag MALFORMED$/, function (this: ShapeWorld) {
  assert.equal(this.guardOut.hookSpecificOutput?.permissionDecision, 'allow', JSON.stringify(this.guardOut));
  assert.doesNotMatch(String(this.guardOut.hookSpecificOutput?.permissionDecisionReason ?? ''), /MALFORMED/);
});

// ── get_trace (FR-4) ────────────────────────────────────────────────────────
Then(/^get_trace returns ok for all (\d+) of them$/, function (this: ShapeWorld, n: string) {
  assert.equal(this.traceOks!.length, Number(n), `expected ${n} FRs, traced ${this.traceOks!.length}`);
  assert.ok(this.traceOks!.every(Boolean), 'every get_trace must return ok with the matching node id');
});
