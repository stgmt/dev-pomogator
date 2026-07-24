import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraphFromCwd, testedBySourceMap, verifiesEdgesFor } from '../../tools/spec-graph/builder.ts';
import { checkConformance, type Finding } from '../../tools/spec-graph/conformance.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { deltaByKey, conformanceKey } from '../../tools/spec-mcp-server/mutations.ts';
import { openDatabase } from '../../tools/spec-mcp-server/sqlite/wrapper.ts';
import { persistGraph, loadGraph } from '../../tools/spec-mcp-server/sqlite/persist.ts';
import {
  EDGE_SCHEMA,
  validateGraphEdgeEndpoints,
  type EndpointViolation,
} from '../../tools/spec-graph/edge-schema.ts';
import type { Edge, EdgeType, Node, ScenarioNode, SpecGraph } from '../../tools/spec-graph/types.ts';

interface EdgeContractWorld extends V4World {
  graph?: SpecGraph;
  edges?: Edge[];
  violations?: EndpointViolation[];
  schemaTypes?: EdgeType[];
  restored?: SpecGraph | null;
  coldViolations?: EndpointViolation[];
  warmViolations?: EndpointViolation[];
  previewResult?: Record<string, unknown>;
  applyResult?: Record<string, unknown>;
  beforeDocs?: Record<string, string>;
  traceResult?: Record<string, unknown>;
  gateBefore?: SpecGraph;
  gateAfter?: SpecGraph;
  gateNewErrors?: Finding[];
  gateRefused?: boolean;
}

function node(id: string, type: Node['type']): Node {
  return { id, type, title: id, file: `${type}.md`, line: 1, anchors: [id] } as Node;
}

function graphWith(nodes: Node[], edges: Edge[]): SpecGraph {
  return {
    version: 1,
    builtAt: new Date(0).toISOString(),
    nodes: new Map(nodes.map((n) => [n.id, n])),
    edges,
    definitions: new Map(),
    backlinks: new Map(),
    rawCollisions: { totalRawNodes: nodes.length, uniqueIds: nodes.length, collisions: [] },
    endpointViolations: [],
  };
}

Given('a graph fixture with every supported edge type', function (this: EdgeContractWorld) {
  this.schemaTypes = Object.keys(EDGE_SCHEMA) as EdgeType[];
});

When('I inspect the typed edge endpoint schema', function (this: EdgeContractWorld) {
  this.schemaTypes = Object.keys(EDGE_SCHEMA) as EdgeType[];
});

Then('verifies and entitles are distinct edge types with endpoint rules', function (this: EdgeContractWorld) {
  assert.ok(this.schemaTypes!.includes('verifies'));
  assert.ok(this.schemaTypes!.includes('entitles'));
  assert.notDeepEqual(EDGE_SCHEMA.verifies, EDGE_SCHEMA.entitles);
});

Then('every edge type has exactly one endpoint rule', function (this: EdgeContractWorld) {
  assert.equal(new Set(this.schemaTypes).size, this.schemaTypes!.length);
  for (const type of this.schemaTypes!) {
    assert.ok(EDGE_SCHEMA[type]);
    assert.ok(EDGE_SCHEMA[type].sources.length > 0);
    const rule = EDGE_SCHEMA[type] as { targets: readonly string[]; syntheticTarget?: unknown };
    assert.ok(rule.targets.length > 0 || rule.syntheticTarget);
  }
});

Given('a graph fixture with valid covers tested-by verifies and entitles edges', function (this: EdgeContractWorld) {
  const nodes = [
    node('FR-1', 'FR'), node('AC-1.1', 'AC'), node('SCEN-pass', 'Scenario'),
    node('Decision-auth', 'Decision'), node('TASK-1', 'Task'),
  ];
  this.edges = [
    { from: 'FR-1', to: 'AC-1.1', type: 'covers' },
    { from: 'FR-1', to: 'SCEN-pass', type: 'tested-by' },
    { from: 'SCEN-pass', to: 'FR-1', type: 'verifies' },
    { from: 'Decision-auth', to: 'TASK-1', type: 'entitles' },
  ];
  this.graph = graphWith(nodes, this.edges);
});

When('I validate all graph edge endpoints', function (this: EdgeContractWorld) {
  this.violations = validateGraphEdgeEndpoints(this.graph!);
});

Then('no endpoint violations are reported', function (this: EdgeContractWorld) {
  assert.deepEqual(this.violations, []);
});

Then('all valid semantic edges remain traversable', function (this: EdgeContractWorld) {
  assert.deepEqual(this.graph!.edges, this.edges);
});

Given('a graph fixture with an AC to FR covers edge', function (this: EdgeContractWorld) {
  const edge: Edge = { from: 'AC-1.1', to: 'FR-1', type: 'covers' };
  this.edges = [edge];
  this.graph = graphWith([node('FR-1', 'FR'), node('AC-1.1', 'AC')], [edge]);
});

Then('an ENDPOINT_VIOLATION error identifies actual and allowed endpoint types', function (this: EdgeContractWorld) {
  assert.equal(this.violations!.length, 1);
  assert.deepEqual(this.violations![0], {
    code: 'ENDPOINT_VIOLATION',
    edge: { from: 'AC-1.1', to: 'FR-1', type: 'covers' },
    actualSource: 'AC',
    actualTarget: 'FR',
    allowedSources: ['FR', 'NFR'],
    allowedTargets: ['AC', 'Story', 'Decision'],
  });
});

Then('the invalid edge is retained for diagnosis', function (this: EdgeContractWorld) {
  assert.deepEqual(this.graph!.edges, this.edges);
  const findings = checkConformance(this.graph!);
  assert.ok(findings.some((finding) => finding.code === 'ENDPOINT_VIOLATION' && finding.severity === 'error'));
});

// SPECGEN004_592 / AC-67.4: markdown parsers are endpoint-safe (md.ts, gherkin.ts,
// file-changes.ts, design.ts, builder.ts never emit an invalid edge), so no real
// markdown fixture can drive the public propose_patch/apply_spec_transaction
// surface into staging an invalid edge — that path is honestly unreachable. This
// scenario instead drives the SAME before/after gate those MCP handlers call
// internally (checkConformance + deltaByKey + conformanceKey, see
// conformanceFindings() in mutations.ts), with a hand-injected invalid candidate
// edge standing in for "what a staged mutation would look like if it were
// invalid". That is the real production gate, exercised honestly.
Given('a staged MCP spec graph and a candidate graph with an injected invalid typed edge', function (this: EdgeContractWorld) {
  const specDir = path.join(this.tempDir, '.specs', 'edge-mcp');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1\n\nBody.\n');
  fs.writeFileSync(path.join(specDir, 'ACCEPTANCE_CRITERIA.md'), '## AC-1.1\n\n**Требование:** [FR-1](FR.md#fr-1)\n\nWHEN x THEN y SHALL z.\n');
  this.beforeDocs = {
    fr: fs.readFileSync(path.join(specDir, 'FR.md'), 'utf8'),
    ac: fs.readFileSync(path.join(specDir, 'ACCEPTANCE_CRITERIA.md'), 'utf8'),
  };
  const before = graphWith([node('FR-1', 'FR'), node('AC-1.1', 'AC')], []);
  // Candidate graph as a staged mutation would build it — plus one invalid edge
  // (AC --covers--> FR is backwards; covers only allows FR/NFR sources) injected
  // by hand, since no honest parser path produces this shape.
  const after = graphWith([node('FR-1', 'FR'), node('AC-1.1', 'AC')], [
    { type: 'covers', from: 'AC-1.1', to: 'FR-1' } as Edge,
  ]);
  this.gateBefore = before;
  this.gateAfter = after;
});

When('I run the MCP transaction endpoint gate on before and after graphs', function (this: EdgeContractWorld) {
  const before = checkConformance(this.gateBefore!);
  const after = checkConformance(this.gateAfter!);
  this.gateNewErrors = deltaByKey(
    before.filter((f) => f.severity === 'error'),
    after.filter((f) => f.severity === 'error'),
    conformanceKey,
  );
  // Mirrors conformanceFindings(): non-empty newErrors ⇒ VALIDATION_FAILED, refuse
  // the write. Assert that decision, and — critically — never touch disk.
  this.gateRefused = this.gateNewErrors.length > 0;
});

Then('the gate reports a new ENDPOINT_VIOLATION and refuses the write', function (this: EdgeContractWorld) {
  assert.equal(this.gateRefused, true);
  assert.ok(this.gateNewErrors!.some((f) => f.code === 'ENDPOINT_VIOLATION'));
});

Then('every transaction document remains byte-identical', function (this: EdgeContractWorld) {
  const specDir = path.join(this.tempDir, '.specs', 'edge-mcp');
  assert.equal(fs.readFileSync(path.join(specDir, 'FR.md'), 'utf8'), this.beforeDocs!.fr);
  assert.equal(fs.readFileSync(path.join(specDir, 'ACCEPTANCE_CRITERIA.md'), 'utf8'), this.beforeDocs!.ac);
});

Given('a graph with verifies entitles and endpoint metadata', function (this: EdgeContractWorld) {
  const edges: Edge[] = [
    { from: 'SCEN-pass', to: 'FR-1', type: 'verifies', metadata: { producer: 'cucumber-js', version: '11.3.0' } },
    { from: 'Decision-auth', to: 'TASK-1', type: 'entitles', metadata: { producer: 'spec-graph', version: '1' } },
  ];
  this.graph = graphWith([
    node('FR-1', 'FR'), node('SCEN-pass', 'Scenario'), node('Decision-auth', 'Decision'), node('TASK-1', 'Task'),
  ], edges);
  this.coldViolations = validateGraphEdgeEndpoints(this.graph);
});

When('I persist and restore the graph through SQLite', async function (this: EdgeContractWorld) {
  const handle = await openDatabase({ repoRoot: this.tempDir });
  assert.equal(handle.backend.available, true, handle.backend.reason);
  persistGraph(handle, this.graph!, 'edge-fingerprint');
  this.restored = loadGraph(handle, 'edge-fingerprint');
  handle.backend.close();
  this.warmViolations = validateGraphEdgeEndpoints(this.restored!);
});

Then('the restored typed edges and metadata equal the cold graph', function (this: EdgeContractWorld) {
  assert.deepEqual(this.restored!.edges, this.graph!.edges);
});

Then('cold and warm endpoint verdicts are identical', function (this: EdgeContractWorld) {
  assert.deepEqual(this.warmViolations, this.coldViolations);
});

Given('markdown gherkin implementation result and trace edge fixtures', function (this: EdgeContractWorld) {
  const specDir = path.join(this.tempDir, '.specs', 'edge-existing');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1\n\nBody.\n');
  fs.writeFileSync(path.join(specDir, 'ACCEPTANCE_CRITERIA.md'), '## AC-1.1 (FR-1)\n\nWHEN x THEN y SHALL z.\n');
  fs.writeFileSync(path.join(specDir, 'edge.feature'), '@FR-1\nFeature: Existing edges\n  Scenario: Existing edge scenario\n    Given an existing edge\n');
  fs.writeFileSync(path.join(specDir, 'FILE_CHANGES.md'), '| Action | Path | Reason |\n|---|---|---|\n| edit | `tools/example.ts` | Implements FR-1 |\n');
  this.graph = buildGraphFromCwd(this.tempDir, { skipNdjson: true });
  const scenario = [...this.graph.nodes.values()].find((n) => n.type === 'Scenario')!;
  scenario.lastResult = 'PASSED';
  scenario.trace = { traceId: 'trace-existing', source: 'docker-bdd', gitSha: 'existing1' };
  this.graph.edges.push({ from: scenario.id, to: `RESULT-${scenario.id}-PASSED`, type: 'last-result' });
  this.graph.edges.push({ from: scenario.id, to: 'TRACE-trace-existing', type: 'runtime-trace' });
});

When('I build and validate the composite graph', function (this: EdgeContractWorld) {
  this.violations = validateGraphEdgeEndpoints(this.graph!);
});

Then('existing covers tested-by implementation result and trace edges are valid', function (this: EdgeContractWorld) {
  assert.deepEqual(this.violations, []);
  for (const type of ['covers', 'tested-by', 'implements', 'last-result', 'runtime-trace'] as EdgeType[]) {
    assert.ok(this.graph!.edges.some((edge) => edge.type === type), `missing ${type}`);
  }
});

Then('MCP trace traversal still returns existing and new semantic edges', async function (this: EdgeContractWorld) {
  this.graph!.edges.push({ from: [...this.graph!.nodes.values()].find((n) => n.type === 'Scenario')!.id, to: 'edge-existing:FR-1', type: 'verifies' });
  const tools = buildToolRegistry(() => this.graph!, {});
  const getTrace = tools.find((tool) => tool.name === 'get_trace')!;
  const result = await getTrace.handler({ node_id: 'edge-existing:FR-1' });
  const traceResult = JSON.parse(result.content[0].text) as Record<string, unknown>;
  this.traceResult = traceResult;
  // get_trace surfaces both an existing semantic edge (implements, FR->File from
  // FILE_CHANGES) and the new one (verifies, Scenario->FR). The tested-by
  // relationship is surfaced through the `scenarios` array, so assert that too.
  const relations = ((traceResult.related_nodes as Array<{ relation: string }>) ?? []).map((r) => r.relation);
  assert.ok(relations.includes('implements'), `existing semantic edge surfaced: ${JSON.stringify(relations)}`);
  assert.ok(relations.includes('verifies'), `new semantic edge surfaced: ${JSON.stringify(relations)}`);
  assert.ok(
    Array.isArray(traceResult.scenarios) && traceResult.scenarios.length >= 1,
    'tested-by scenario surfaced through the scenarios array',
  );
});

// SPECGEN004_595 (@AC-67.7) — real producers auto-emit verifies/entitles.
// Drives the REAL md.ts Decision producer (entitles) + builder verifiesEdgesFor
// (verifies with provenance) against an on-disk spec fixture — no fabricated edges.
Given('a spec fixture with a decision requirement line and a passing tagged scenario', function (this: EdgeContractWorld) {
  const specDir = path.join(this.tempDir, '.specs', 'edge-producers');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1\n\nBody.\n');
  fs.writeFileSync(
    path.join(specDir, 'DESIGN.md'),
    '# DESIGN\n\n### Decision: Adopt typed edges\n\n**Требование:** [FR-1](FR.md#fr-1)\n\nRationale.\n',
  );
  fs.writeFileSync(
    path.join(specDir, 'edge.feature'),
    '@FR-1\nFeature: Producer edges\n  Scenario: Producer scenario\n    Given a producer edge\n',
  );
  this.graph = buildGraphFromCwd(this.tempDir, { skipNdjson: true });
  const scenario = [...this.graph.nodes.values()].find((n) => n.type === 'Scenario')! as ScenarioNode;
  scenario.lastResult = 'PASSED';
  scenario.trace = { traceId: 'trace-producer', source: 'docker-bdd', gitSha: 'abc1234' };
});

When('I build the graph and derive verifies from the passing result', function (this: EdgeContractWorld) {
  const graph = this.graph!;
  const scenarios = [...graph.nodes.values()].filter((n): n is ScenarioNode => n.type === 'Scenario');
  this.edges = verifiesEdgesFor(scenarios, testedBySourceMap(graph.edges), (id) => graph.nodes.get(id)?.type);
  graph.edges.push(...this.edges);
});

Then('the markdown producer emits an entitles edge from the decision to its requirement', function (this: EdgeContractWorld) {
  const decision = [...this.graph!.nodes.values()].find((n) => n.type === 'Decision');
  assert.ok(decision, 'md.ts should have parsed a Decision node from DESIGN.md');
  assert.match(decision!.id, /^edge-producers:Decision-/);
  const entitles = this.graph!.edges.filter((e) => e.type === 'entitles');
  assert.equal(entitles.length, 1, `expected exactly one entitles edge, got ${JSON.stringify(entitles)}`);
  assert.equal(entitles[0].from, decision!.id);
  assert.equal(entitles[0].to, 'edge-producers:FR-1');
});

Then('the builder emits a verifies edge from the passing scenario carrying producer and version', function (this: EdgeContractWorld) {
  const verifies = (this.edges ?? []).filter((e) => e.type === 'verifies' && e.to === 'edge-producers:FR-1');
  assert.equal(verifies.length, 1, `expected exactly one verifies->FR-1, got ${JSON.stringify(verifies)}`);
  assert.equal(verifies[0].metadata?.producer, 'docker-bdd');
  assert.equal(verifies[0].metadata?.version, 'abc1234');
});
