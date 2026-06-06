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
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
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
