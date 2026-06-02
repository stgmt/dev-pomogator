/**
 * Feature 30 — `get_trace` MCP tool surfaces `code_impl[]` + warnings (FR-30).
 *
 * Covers SPECGEN004_60..64 from `spec-generator-v4.feature`. Each scenario
 * synthesises a small graph (either via the real `buildGraph` over a
 * scratch spec dir OR by direct in-memory wiring), invokes the real
 * `get_trace` handler from `buildToolRegistry`, parses the JSON envelope,
 * and asserts on the `code_impl` shape per FR-30 + the new `warnings[]`
 * array surfaced for malformed implements edges.
 *
 * No mocks — the handler executed is the same one served over stdio by
 * `tools/spec-mcp-server/server.ts`. Per
 * `.claude/rules/extension-test-quality.md`.
 *
 * @see .specs/spec-generator-v4/FR.md FR-30
 * @see .specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md AC-30.*
 * @see tools/spec-mcp-server/tools.ts (handler under test)
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import type {
  SpecGraph,
  FrNode,
  AcNode,
  ScenarioNode,
  Edge,
} from '../../tools/spec-graph/types.ts';
import type { V4World } from '../hooks/before-after.ts';

interface CodeImplEntry {
  file_path: string;
  source_section: 'FILE_CHANGES' | 'DESIGN';
  action?: string;
}

interface GetTraceResponse {
  ok: boolean;
  node?: { id: string; type: string; file: string; line: number };
  code_impl?: CodeImplEntry[];
  warnings?: Array<{ code: string; from?: string; to?: string; source?: { file: string; line: number }; message?: string }>;
  error?: string;
}

interface Feature30World extends V4World {
  graph?: SpecGraph;
  traceResponse?: GetTraceResponse;
}

/**
 * Invoke the real `get_trace` MCP handler from `buildToolRegistry` and
 * parse the JSON envelope. Throws if the handler returns a non-text result
 * or unparseable JSON.
 */
async function invokeGetTrace(graph: SpecGraph, nodeId: string): Promise<GetTraceResponse> {
  const registry = buildToolRegistry(() => graph);
  const tool = registry.find((t) => t.name === 'get_trace');
  assert.ok(tool, 'get_trace tool must be registered');
  const result = await tool.handler({ node_id: nodeId });
  assert.ok(result.content[0], 'get_trace result must contain at least one content part');
  return JSON.parse(result.content[0].text) as GetTraceResponse;
}

/**
 * Write a minimal valid FR.md + FILE_CHANGES.md pair for a single spec
 * dir under `tempDir/.specs/<slug>/`. Returns the spec dir abs path.
 */
function writeSpec(
  tempDir: string,
  slug: string,
  opts: { frs: Array<{ id: number; title: string; cites?: string[] }>; fileChanges: Array<{ path: string; frs: number[] }> },
): string {
  const dir = path.join(tempDir, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  const frBody = ['# FR', ''];
  for (const fr of opts.frs) {
    frBody.push(`### FR-${fr.id}: ${fr.title}`);
    frBody.push('');
    const cites = fr.cites?.map((c) => `\`${c}\``).join(', ') ?? '';
    frBody.push(`The system SHALL handle ${fr.title}${cites ? ' via ' + cites : ''}.`);
    frBody.push('');
  }
  fs.writeFileSync(path.join(dir, 'FR.md'), frBody.join('\n'));
  if (opts.fileChanges.length > 0) {
    const fcBody = [
      '# File Changes',
      '',
      '| Path | Action | Reason |',
      '|------|--------|--------|',
    ];
    for (const row of opts.fileChanges) {
      const reason = row.frs.map((n) => `FR-${n}`).join(', ');
      fcBody.push(`| \`${row.path}\` | create | Implements ${reason}. |`);
    }
    fcBody.push('');
    fs.writeFileSync(path.join(dir, 'FILE_CHANGES.md'), fcBody.join('\n'));
  }
  return dir;
}

// ─── SPECGEN004_60 — FR with 3 implements edges → code_impl length 3 ────

Given(
  /^a spec where `FR-5` has 3 `implements` edges to files `src\/a\.ts`, `src\/b\.ts`, `src\/c\.ts`$/,
  function (this: Feature30World) {
    writeSpec(this.tempDir, 'fr5-three-files', {
      frs: [{ id: 5, title: 'multi-impl' }],
      fileChanges: [
        { path: 'src/a.ts', frs: [5] },
        { path: 'src/b.ts', frs: [5] },
        { path: 'src/c.ts', frs: [5] },
      ],
    });
    this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
  },
);

When(
  /^the MCP client invokes `get_trace\(\{node_id: "FR-5"\}\)`$/,
  async function (this: Feature30World) {
    this.traceResponse = await invokeGetTrace(this.graph!, 'FR-5');
  },
);

Then(
  /^the response field `code_impl` is an array of length 3$/,
  function (this: Feature30World) {
    assert.ok(this.traceResponse?.ok, `expected ok response, got ${JSON.stringify(this.traceResponse)}`);
    const ci = this.traceResponse!.code_impl;
    assert.ok(Array.isArray(ci), `code_impl must be an array, got ${typeof ci}`);
    assert.equal(ci!.length, 3, `expected code_impl length 3, got ${ci!.length}: ${JSON.stringify(ci)}`);
  },
);

Then(
  /^each entry contains both `file_path` and `source_section` keys with non-empty string values$/,
  function (this: Feature30World) {
    const ci = this.traceResponse!.code_impl!;
    for (const entry of ci) {
      assert.ok(typeof entry.file_path === 'string' && entry.file_path.length > 0, `bad file_path: ${entry.file_path}`);
      assert.ok(typeof entry.source_section === 'string' && entry.source_section.length > 0, `bad source_section: ${entry.source_section}`);
    }
  },
);

// ─── SPECGEN004_61 — AC inherits code_impl from parent FR ───────────────

Given(
  /^a spec where `FR-5` has 2 `implements` edges to files `src\/a\.ts`, `src\/b\.ts`$/,
  function (this: Feature30World) {
    const dir = writeSpec(this.tempDir, 'fr5-ac-inherit', {
      frs: [{ id: 5, title: 'ac-inherit' }],
      fileChanges: [
        { path: 'src/a.ts', frs: [5] },
        { path: 'src/b.ts', frs: [5] },
      ],
    });
    fs.writeFileSync(
      path.join(dir, 'ACCEPTANCE_CRITERIA.md'),
      [
        '# AC',
        '',
        '## AC-5.1 (FR-5): inherited code_impl',
        '',
        'The agent SHALL see parent FR-5 code_impl on AC-5.1.',
        '',
      ].join('\n'),
    );
    this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
  },
);

Given(
  /^`AC-5\.1` has no direct `implements` edges$/,
  function (this: Feature30World) {
    // Sanity check — no implements edges originate from AC-5.1 in our seeded graph.
    const impls = this.graph!.edges.filter((e) => e.type === 'implements' && e.from === 'AC-5.1');
    assert.equal(impls.length, 0, `AC-5.1 must not own implements edges, got ${impls.length}`);
  },
);

When(
  /^the MCP client invokes `get_trace\(\{node_id: "AC-5\.1"\}\)`$/,
  async function (this: Feature30World) {
    this.traceResponse = await invokeGetTrace(this.graph!, 'AC-5.1');
  },
);

Then(
  /^the response field `code_impl` is an array of length 2$/,
  function (this: Feature30World) {
    assert.ok(this.traceResponse?.ok, `expected ok response, got ${JSON.stringify(this.traceResponse)}`);
    const ci = this.traceResponse!.code_impl!;
    assert.equal(ci.length, 2, `expected length 2, got ${ci.length}: ${JSON.stringify(ci)}`);
  },
);

Then(
  /^the entries equal parent `FR-5`'s `code_impl` entries identically by `file_path`$/,
  async function (this: Feature30World) {
    const acResp = this.traceResponse!;
    const frResp = await invokeGetTrace(this.graph!, 'FR-5');
    const acPaths = acResp.code_impl!.map((e) => e.file_path).sort();
    const frPaths = frResp.code_impl!.map((e) => e.file_path).sort();
    assert.deepEqual(acPaths, frPaths, `AC paths ${JSON.stringify(acPaths)} != FR paths ${JSON.stringify(frPaths)}`);
  },
);

// ─── SPECGEN004_62 — Scenario unions tagged FRs' code_impl ──────────────

Given(
  /^a `\.feature` Scenario tagged with both `@FR-1` and `@FR-2`$/,
  function (this: Feature30World) {
    const dir = writeSpec(this.tempDir, 'scenario-union', {
      frs: [
        { id: 1, title: 'first' },
        { id: 2, title: 'second' },
      ],
      fileChanges: [
        { path: 'src/x.ts', frs: [1] },
        { path: 'src/y.ts', frs: [2] },
      ],
    });
    fs.writeFileSync(
      path.join(dir, 'scenario-union.feature'),
      [
        '@FR-1 @FR-2',
        'Feature: union of tagged FR code_impl',
        '',
        '  Scenario: SCENARIO-id union test',
        '    Given a request',
        '    When the agent calls get_trace',
        '    Then code_impl unions src/x.ts and src/y.ts',
        '',
      ].join('\n'),
    );
    this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
  },
);

Given(
  /^`FR-1` has 1 `implements` edge to `src\/x\.ts`$/,
  function (this: Feature30World) {
    const fr1 = this.graph!.edges.filter(
      (e) => e.type === 'implements' && e.from === 'FR-1' && e.metadata?.file_path === 'src/x.ts',
    );
    assert.equal(fr1.length, 1, `FR-1 -> src/x.ts must exist: got ${fr1.length}`);
  },
);

Given(
  /^`FR-2` has 1 `implements` edge to `src\/y\.ts`$/,
  function (this: Feature30World) {
    const fr2 = this.graph!.edges.filter(
      (e) => e.type === 'implements' && e.from === 'FR-2' && e.metadata?.file_path === 'src/y.ts',
    );
    assert.equal(fr2.length, 1, `FR-2 -> src/y.ts must exist: got ${fr2.length}`);
  },
);

When(
  /^the MCP client invokes `get_trace\(\{node_id: "SCENARIO-id"\}\)`$/,
  async function (this: Feature30World) {
    // Locate the scenario node id created from our feature file. The gherkin
    // parser assigns ids of the form `SCEN-<slug>` based on scenario name.
    let scenId: string | undefined;
    for (const n of this.graph!.nodes.values()) {
      if (n.type === 'Scenario') {
        scenId = n.id;
        break;
      }
    }
    assert.ok(scenId, 'expected at least one Scenario node in the graph');
    this.traceResponse = await invokeGetTrace(this.graph!, scenId!);
  },
);

Then(
  /^the response field `code_impl` is an array of length 2 containing both `src\/x\.ts` and `src\/y\.ts` exactly once each$/,
  function (this: Feature30World) {
    assert.ok(this.traceResponse?.ok, `expected ok, got ${JSON.stringify(this.traceResponse)}`);
    const ci = this.traceResponse!.code_impl!;
    const paths = ci.map((e) => e.file_path).sort();
    assert.deepEqual(paths, ['src/x.ts', 'src/y.ts'], `unexpected paths: ${JSON.stringify(paths)}`);
  },
);

// ─── SPECGEN004_63 — node without implements edges → `[]`, not omitted ──

Given(
  /^a spec where `FR-7` has zero `implements` edges$/,
  function (this: Feature30World) {
    writeSpec(this.tempDir, 'fr7-empty', {
      frs: [{ id: 7, title: 'no impls' }],
      fileChanges: [], // no FILE_CHANGES.md at all
    });
    this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
  },
);

When(
  /^the MCP client invokes `get_trace\(\{node_id: "FR-7"\}\)`$/,
  async function (this: Feature30World) {
    this.traceResponse = await invokeGetTrace(this.graph!, 'FR-7');
  },
);

Then(
  /^the response field `code_impl` is present and equals literally `\[\]`$/,
  function (this: Feature30World) {
    assert.ok(this.traceResponse?.ok, `expected ok, got ${JSON.stringify(this.traceResponse)}`);
    const ci = this.traceResponse!.code_impl;
    assert.deepEqual(ci, [], `expected literal [], got ${JSON.stringify(ci)}`);
  },
);

Then(
  /^the field is NOT omitted from the JSON response$/,
  function (this: Feature30World) {
    assert.ok(this.traceResponse, 'response missing');
    assert.ok('code_impl' in this.traceResponse!, 'code_impl key must be present (not omitted)');
  },
);

// ─── SPECGEN004_64 — malformed implements edge → warnings[] ─────────────

Given(
  /^the SpecGraph contains an `implements` edge with missing `file_path` field$/,
  function (this: Feature30World) {
    // Build a graph with one valid FR, then surgically inject a malformed
    // implements edge (no file_path, target id resolves to non-File node).
    writeSpec(this.tempDir, 'malformed-edge', {
      frs: [{ id: 5, title: 'malformed-edge-host' }],
      fileChanges: [],
    });
    this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
    const malformed: Edge = {
      from: 'FR-5',
      to: 'NOT-A-FILE-NODE',
      type: 'implements',
      // intentionally NO metadata.file_path
    };
    this.graph!.edges.push(malformed);
  },
);

Then(
  /^the response includes a top-level `warnings\[\]` array$/,
  function (this: Feature30World) {
    assert.ok(this.traceResponse?.ok, `expected ok, got ${JSON.stringify(this.traceResponse)}`);
    assert.ok(Array.isArray(this.traceResponse!.warnings), `warnings must be array, got ${typeof this.traceResponse!.warnings}`);
  },
);

Then(
  /^`warnings\[\]` contains an entry with `code = "MALFORMED_IMPLEMENTS_EDGE"` and the offending edge's source location$/,
  function (this: Feature30World) {
    const warnings = this.traceResponse!.warnings ?? [];
    const malformed = warnings.find((w) => w.code === 'MALFORMED_IMPLEMENTS_EDGE');
    assert.ok(malformed, `expected MALFORMED_IMPLEMENTS_EDGE in warnings, got ${JSON.stringify(warnings)}`);
    assert.ok(malformed!.source, 'warning must include source location');
    assert.ok(typeof malformed!.source!.file === 'string', 'warning.source.file must be string');
    assert.ok(typeof malformed!.source!.line === 'number', 'warning.source.line must be number');
  },
);

/* eslint-disable @typescript-eslint/no-unused-vars */
// Suppress unused-import lint on type re-exports kept for readability.
type _FrNode = FrNode;
type _AcNode = AcNode;
type _ScenarioNode = ScenarioNode;
