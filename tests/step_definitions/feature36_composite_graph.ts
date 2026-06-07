/**
 * @feature36 step definitions — unified spec-graph via composite keys (FR-36),
 * bound to the REAL builder + MCP tool registry (no mocks). Built per Phase-13:
 *   92 → FR-36c  get_trace returns scenarios via REAL tested-by edges
 *   (90/91 → FR-36a/b, 93/94 → FR-36d land with P13-3; 95 → P13-4.)
 *
 * The "no tag-scan" assertion is BEHAVIOURAL: scenario tags are stripped from
 * the built graph before calling get_trace — the edges persist, so a result
 * proves edge-traversal; the removed workaround scanned tags and would
 * return nothing.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_90..95
 * @see .specs/spec-generator-v4/FR.md FR-36
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph, buildGraphFromCwd } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import type { SpecGraph, ScenarioNode } from '../../tools/spec-graph/types.ts';

interface F36World extends V4World {
  graph?: SpecGraph;
  traceFrId?: string;
  tracePayload?: {
    ok: boolean;
    scenarios: Array<{ id: string }>;
  };
}

// ── SPECGEN004_92 — FR-36c: get_trace via real edges ──────────────────────

Given(
  'a covers and tested-by edge built with composite keys on both ends',
  function (this: F36World) {
    // Real fixture spec: FR + AC + a spec-owned .feature tagged @FR-1.
    const specDir = path.join(this.tempDir, '.specs', 'edges-demo');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1: Composite edges\n\nBody.\n');
    fs.writeFileSync(path.join(specDir, 'ACCEPTANCE_CRITERIA.md'), '## AC-1 (FR-1)\n\nWHEN x THEN y SHALL z.\n');
    fs.writeFileSync(
      path.join(specDir, 'tagged.feature'),
      '@FR-1\nFeature: Tagged\n  Scenario: via spec tag\n    Given x\n',
    );
    this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
    this.traceFrId = 'edges-demo:FR-1';

    assert.ok(
      this.graph.edges.some((e) => e.type === 'covers' && e.from === 'edges-demo:FR-1' && e.to === 'edges-demo:AC-1'),
      'covers edge must reference composite keys on both ends',
    );
    assert.ok(
      this.graph.edges.some((e) => e.type === 'tested-by' && e.from === 'edges-demo:FR-1'),
      'tested-by edge must reference the composite FR key',
    );
  },
);

Given('a same-spec featureN to FR-N tested-by edge', function (this: F36World) {
  // Second scenario linked ONLY by the @featureN convention (FR-36c).
  const specDir = path.join(this.tempDir, '.specs', 'edges-demo');
  fs.writeFileSync(
    path.join(specDir, 'featureN.feature'),
    '@feature1\nFeature: ByConvention\n  Scenario: via featureN tag\n    Given x\n',
  );
  this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
  assert.ok(
    this.graph.edges.some(
      (e) =>
        e.type === 'tested-by' &&
        e.from === 'edges-demo:FR-1' &&
        String(e.to).includes('via-featuren-tag'),
    ),
    'the @feature1 tag must produce a REAL same-spec tested-by edge to FR-1',
  );
});

When('get_trace runs on an FR that has BDD scenarios', async function (this: F36World) {
  assert.ok(this.graph && this.traceFrId, 'graph not built (Given steps missing?)');
  // BEHAVIOURAL no-tag-scan proof: strip every scenario's tags AFTER build.
  // Edges persist; the removed workaround scanned tags and would find nothing.
  for (const n of this.graph.nodes.values()) {
    if (n.type === 'Scenario') (n as ScenarioNode).tags = [];
  }
  const tools = buildToolRegistry(() => this.graph!);
  const getTrace = tools.find((t) => t.name === 'get_trace')!;
  const r = (await getTrace.handler({ node_id: this.traceFrId })) as {
    content: Array<{ text: string }>;
  };
  this.tracePayload = JSON.parse(r.content[0].text);
});

Then('it returns those scenarios via real graph edges', function (this: F36World) {
  assert.ok(this.tracePayload?.ok, 'get_trace must resolve the composite FR id');
  const ids = (this.tracePayload!.scenarios ?? []).map((s) => s.id);
  assert.ok(
    ids.some((id) => id.includes('via-spec-tag')),
    `@FR-1-tagged scenario must arrive via its edge, got: ${ids.join(', ') || '(none)'}`,
  );
  assert.ok(
    ids.some((id) => id.includes('via-featuren-tag')),
    `@feature1-tagged scenario must arrive via its edge, got: ${ids.join(', ') || '(none)'}`,
  );
});

Then('it no longer relies on the tag-scan workaround', function (this: F36World) {
  // Tags were stripped BEFORE the call — a tag-scan would have returned [].
  // The scenarios arrived anyway ⇒ edge traversal, not tag matching.
  assert.ok(
    (this.tracePayload!.scenarios ?? []).length >= 2,
    'scenarios resolved with EMPTY tags prove edge-traversal (tag-scan would yield none)',
  );
});

// ── SPECGEN004_91 — FR-36b: anchors stay bare + file-local ────────────────

Given('a markdown link FR.md#fr-2 inside one spec', function (this: F36World) {
  const specDir = path.join(this.tempDir, '.specs', 'anchors-demo');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-2: Anchor case\n\nBody.\n');
  fs.writeFileSync(
    path.join(specDir, 'DESIGN.md'),
    'See [the requirement](FR.md#fr-2) for details.\n',
  );
});

When('the anchor index resolves it', function (this: F36World) {
  this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
});

Then('the anchor alias is the bare form fr-2 not the composite key', function (this: F36World) {
  const aliases = [...this.graph!.definitions.keys()];
  assert.ok(aliases.includes('FR-2'), `bare compact alias FR-2 must be registered, got: ${aliases.join(', ')}`);
  assert.ok(
    aliases.includes('fr-2-anchor-case'),
    `bare slug alias fr-2-anchor-case must be registered, got: ${aliases.join(', ')}`,
  );
  assert.ok(
    !aliases.some((a) => a.includes('anchors-demo:')),
    `no anchor alias may carry the composite key, got: ${aliases.filter((a) => a.includes(':')).join(', ')}`,
  );
});

Then('Marksman and anchor-fix are unaffected', function (this: F36World) {
  // The NODE is composite-keyed; the ANCHOR layer Marksman/anchor-fix consume
  // is bare — both views over the same heading.
  assert.ok(this.graph!.nodes.has('anchors-demo:FR-2'), 'node key must be composite');
  assert.ok(!this.graph!.definitions.has('anchors-demo:FR-2'), 'definitions must NOT key by composite');
});

// ── SPECGEN004_90 — FR-36a: same bare id ⇒ two distinct composite nodes ───

Given('two specs that each define the bare id FR-2', function (this: F36World) {
  for (const slug of ['slug-a', 'slug-b']) {
    const dir = path.join(this.tempDir, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'FR.md'), `## FR-2: ${slug} requirement\n\nBody.\n`);
  }
});

When('the builder assembles the graph with composite keys', function (this: F36World) {
  this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
});

Then('the graph holds a node keyed slug-A:FR-2 and a node keyed slug-B:FR-2', function (this: F36World) {
  assert.ok(this.graph!.nodes.has('slug-a:FR-2'), 'slug-a:FR-2 node must exist');
  assert.ok(this.graph!.nodes.has('slug-b:FR-2'), 'slug-b:FR-2 node must exist');
});

Then('neither node is collision-dropped', function (this: F36World) {
  // Last-writer map dedup would have kept exactly ONE FR node — assert both
  // survive AND each carries its own spec field (no shared object).
  const a = this.graph!.nodes.get('slug-a:FR-2')!;
  const b = this.graph!.nodes.get('slug-b:FR-2')!;
  assert.equal(a.spec, 'slug-a');
  assert.equal(b.spec, 'slug-b');
  const frCount = [...this.graph!.nodes.values()].filter((n) => n.type === 'FR').length;
  assert.equal(frCount, 2, `both FR-2 nodes must survive the build, got ${frCount}`);
});

// ── SPECGEN004_93 / _94 — FR-36d: bare→candidates, qualified→exact ────────

interface F36ResolveWorld extends F36World {
  toolResult?: { ok: boolean; error?: string; candidates?: string[]; node?: { id: string } };
  toolResultBySpecParam?: { ok: boolean; node?: { id: string } };
}

function buildCollidingCorpus(w: F36ResolveWorld): void {
  for (const slug of ['slug-a', 'slug-b']) {
    const dir = path.join(w.tempDir, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'FR.md'), `## FR-2: ${slug} requirement\n\nBody.\n`);
  }
  w.graph = buildGraph({ repoRoot: w.tempDir, skipNdjson: true });
}

Given('a bare id FR-2 that collides across specs', function (this: F36ResolveWorld) {
  buildCollidingCorpus(this);
});

When('a tool is called with that bare id', async function (this: F36ResolveWorld) {
  const tools = buildToolRegistry(() => this.graph!);
  const getNode = tools.find((t) => t.name === 'get_node')!;
  const r = (await getNode.handler({ node_id: 'FR-2' })) as { content: Array<{ text: string }> };
  this.toolResult = JSON.parse(r.content[0].text);
});

Then('it returns the candidate list of slug:id entries', function (this: F36ResolveWorld) {
  assert.equal(this.toolResult!.error, 'AMBIGUOUS_BARE_ID');
  assert.deepEqual(this.toolResult!.candidates, ['slug-a:FR-2', 'slug-b:FR-2']);
});

Then('it does not return one arbitrary node', function (this: F36ResolveWorld) {
  assert.equal(this.toolResult!.ok, false, 'a colliding bare id must NOT resolve to any single node');
  assert.equal(this.toolResult!.node, undefined);
});

Given('a graph keyed by composite ids', function (this: F36ResolveWorld) {
  buildCollidingCorpus(this);
});

When('a tool is called with slug:FR-2 or with spec and node_id', async function (this: F36ResolveWorld) {
  const tools = buildToolRegistry(() => this.graph!);
  const getNode = tools.find((t) => t.name === 'get_node')!;
  const r1 = (await getNode.handler({ node_id: 'slug-a:FR-2' })) as { content: Array<{ text: string }> };
  this.toolResult = JSON.parse(r1.content[0].text);
  const r2 = (await getNode.handler({ node_id: 'FR-2', spec: 'slug-b' })) as { content: Array<{ text: string }> };
  this.toolResultBySpecParam = JSON.parse(r2.content[0].text);
});

Then('it resolves the exact node for that spec', function (this: F36ResolveWorld) {
  assert.ok(this.toolResult!.ok, 'slug:FR-2 form must resolve');
  assert.equal(this.toolResult!.node!.id, 'slug-a:FR-2');
  assert.ok(this.toolResultBySpecParam!.ok, '{spec, node_id} form must resolve');
  assert.equal(this.toolResultBySpecParam!.node!.id, 'slug-b:FR-2');
});

// ── SPECGEN004_95 — the dogfood harness: zero collisions on the REAL corpus ─

interface F36ProbeWorld extends F36World {
  probeStdout?: string;
  probeStatus?: number | null;
}

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');

Given('the migration phase has completed', function (this: F36ProbeWorld) {
  // P13-1..3 shipped: builder/parsers emit composite keys. The mechanical
  // marker is the probe script itself existing in the tree.
  assert.ok(
    fs.existsSync(path.join(REPO_ROOT, 'tools/spec-graph/collision-probe.ts')),
    'collision-probe.ts must exist (P13-1 deliverable)',
  );
});

When('the dogfood harness dumps the raw pre-map nodes', function (this: F36ProbeWorld) {
  // Run the REAL probe on the REAL corpus — the same command a human runs.
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'tools/spec-graph/collision-probe.ts'],
    { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 120_000 },
  );
  this.probeStdout = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  this.probeStatus = r.status;
});

Then('there are zero id collisions', function (this: F36ProbeWorld) {
  assert.equal(this.probeStatus, 0, `probe must exit 0 (⇔ 0 collisions); output: ${this.probeStdout?.slice(-300)}`);
  assert.match(this.probeStdout!, /collisions: 0/, 'probe output must report exactly 0 collisions');
});

Then('the FR-node count is about 470 not 47', function (this: F36ProbeWorld) {
  const g = buildGraphFromCwd(REPO_ROOT);
  let frCount = 0;
  for (const n of g.nodes.values()) if (n.type === 'FR') frCount++;
  assert.ok(
    frCount > 400,
    `composite keys must surface the full FR population (~470+), got ${frCount}`,
  );
  assert.notEqual(frCount, 47, 'the collision-dropped count must be history');
});
