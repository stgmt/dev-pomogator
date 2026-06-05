/**
 * Feature 29 — SpecGraph builder emits `implements` edges (FR-29).
 *
 * Covers SPECGEN004_55..59 from `spec-generator-v4.feature`. Each scenario
 * drives the real `buildGraph()` orchestrator over a synthesized or
 * fixture-backed spec directory inside the per-scenario `tempDir` and
 * asserts on the resulting `File` nodes and `implements` edges (with their
 * `metadata.source_section`).
 *
 * Fixtures
 *   • F-21 `tests/fixtures/specs/minimal-spec/`         — empty FILE_CHANGES
 *   • F-25 `tests/fixtures/specs/deep-multi-fr-refs-spec/` — 5 paths × FRs
 *
 * No mocks — the same `parseFileChangesFile` / `parseDesignFile` /
 * `buildGraph` pipeline that production runs in (per
 * `.claude/rules/extension-test-quality.md` + `integration-tests-first.md`).
 *
 * @see .specs/spec-generator-v4/FR.md FR-29
 * @see .specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md AC-29.*
 * @see tools/spec-graph/parsers/file-changes.ts
 * @see tools/spec-graph/parsers/design.ts
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import type { SpecGraph, FileNode, Edge } from '../../tools/spec-graph/types.ts';
import type { V4World } from '../hooks/before-after.ts';

interface Feature29World extends V4World {
  graph?: SpecGraph;
  capturedWarnings?: string[];
  originalWarn?: typeof console.warn;
}

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const DEEP_FIXTURE = path.join(REPO_ROOT, 'tests/fixtures/specs/deep-multi-fr-refs-spec');
const MINIMAL_FIXTURE = path.join(REPO_ROOT, 'tests/fixtures/specs/minimal-spec');

/** Recursively copy a fixture spec directory into `tempDir/.specs/<basename>/`. */
function copyFixtureIntoTemp(world: Feature29World, fixtureAbs: string): string {
  const slug = path.basename(fixtureAbs);
  const target = path.join(world.tempDir, '.specs', slug);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(fixtureAbs, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.copyFileSync(path.join(fixtureAbs, entry.name), path.join(target, entry.name));
  }
  return target;
}

/** Capture console.warn output for warn-once verification. Restored in After hook below. */
function startCapturingWarn(world: Feature29World): void {
  if (world.originalWarn) return;
  world.originalWarn = console.warn;
  world.capturedWarnings = [];
  console.warn = (...args: unknown[]) => {
    world.capturedWarnings!.push(args.map((a) => String(a)).join(' '));
  };
}

function stopCapturingWarn(world: Feature29World): void {
  if (world.originalWarn) {
    console.warn = world.originalWarn;
    world.originalWarn = undefined;
  }
}

// ─── SPECGEN004_55 — 5 unique paths → 5 File nodes + implements edges ───

Given(
  /^a spec at `tests\/fixtures\/specs\/deep-multi-fr-refs-spec\/` whose `FILE_CHANGES\.md` contains 5 unique `Path` cells each citing at least one `FR-N` in the `Reason` column$/,
  function (this: Feature29World) {
    copyFixtureIntoTemp(this, DEEP_FIXTURE);
  },
);

When('the SpecGraph builder runs on that spec', function (this: Feature29World) {
  this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
});

Then(
  /^the resulting graph contains exactly 5 nodes of type `File` \(one per unique path\)$/,
  function (this: Feature29World) {
    assert.ok(this.graph, 'graph must be built');
    const files = Array.from(this.graph!.nodes.values()).filter((n) => n.type === 'File') as FileNode[];
    assert.equal(files.length, 5, `expected 5 File nodes, got ${files.length}: ${files.map((f) => f.path).join(', ')}`);
    const paths = new Set(files.map((f) => f.path));
    assert.equal(paths.size, 5, 'File node paths must be unique');
  },
);

Then(
  /^one `implements` edge is emitted per `\(FR, path\)` pair derived from the `Reason` citations$/,
  function (this: Feature29World) {
    assert.ok(this.graph, 'graph must be built');
    const impls = this.graph!.edges.filter((e) => e.type === 'implements');
    // deep-multi-fr-refs-spec/FILE_CHANGES.md table:
    //   src/orders/submit.ts       → FR-1, FR-2
    //   src/inventory/reserve.ts   → FR-3
    //   src/payments/capture.ts    → FR-4, FR-9
    //   src/shipping/dispatch.ts   → FR-6, FR-7
    //   src/refunds/handler.ts     → FR-8, FR-10
    // ⇒ 2 + 1 + 2 + 2 + 2 = 9 pair edges
    const expected = 9;
    assert.equal(impls.length, expected, `expected ${expected} implements edges, got ${impls.length}`);
    // Each edge from must be a spec-qualified FR-N id (FR-36a: composite key
    // `<slug>:FR-N`, slug = the staged fixture dir); each to must resolve to
    // a File node.
    for (const edge of impls) {
      assert.match(edge.from, /^deep-multi-fr-refs-spec:FR-\d+$/, `edge.from must be deep-multi-fr-refs-spec:FR-N, got ${edge.from}`);
      const target = this.graph!.nodes.get(edge.to);
      assert.equal(target?.type, 'File', `edge.to must resolve to File node (got ${target?.type})`);
    }
  },
);

Then(
  /^every emitted `implements` edge has `source_section = 'FILE_CHANGES'`$/,
  function (this: Feature29World) {
    const impls = this.graph!.edges.filter((e) => e.type === 'implements');
    for (const edge of impls) {
      assert.equal(
        edge.metadata?.source_section,
        'FILE_CHANGES',
        `edge ${edge.from} -> ${edge.to} has source_section=${edge.metadata?.source_section}`,
      );
    }
  },
);

// ─── SPECGEN004_56 — glob path skipped + warn-once log ───────────────────

Given(
  /^a spec whose `FILE_CHANGES\.md` contains a `Path` cell with glob pattern `tools\/spec-graph\/\*\.ts`$/,
  function (this: Feature29World) {
    const slug = 'glob-path-spec';
    const dir = path.join(this.tempDir, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'FR.md'),
      '# FR\n\n### FR-1: Glob host\n\nA placeholder FR so the spec dir has at least one node.\n',
    );
    // Two rows: one glob (should be skipped + warn), one literal (should
    // still produce an implements edge — proves builder did not crash and
    // produces a non-empty graph as the AC requires).
    fs.writeFileSync(
      path.join(dir, 'FILE_CHANGES.md'),
      [
        '# File Changes',
        '',
        '| Path | Action | Reason |',
        '|------|--------|--------|',
        '| `tools/spec-graph/*.ts` | edit | Glob path that must be skipped (FR-1). |',
        '| `tools/spec-graph/builder.ts` | edit | Literal path that must be kept (FR-1). |',
        '',
      ].join('\n'),
    );
    startCapturingWarn(this);
  },
);

Then(
  /^no `implements` edge is emitted for that row$/,
  function (this: Feature29World) {
    const impls = this.graph!.edges.filter((e) => e.type === 'implements');
    const offending = impls.filter((e) => e.metadata?.file_path?.includes('*'));
    assert.equal(offending.length, 0, `glob path leaked into implements edges: ${JSON.stringify(offending)}`);
  },
);

Then(
  /^the build emits exactly one warn-once log line literally containing «glob path skipped: tools\/spec-graph\/\*\.ts»$/,
  function (this: Feature29World) {
    const warns = this.capturedWarnings ?? [];
    stopCapturingWarn(this);
    // Parser emits a single warn-once message that includes the literal
    // offending glob in the first-seen sentinel. Match on the path token.
    const matched = warns.filter((w) => w.includes('tools/spec-graph/*.ts'));
    assert.equal(matched.length, 1, `expected exactly one warn-once line for the glob, got ${matched.length}: ${warns.join(' | ')}`);
    assert.match(matched[0], /glob/i, `warn line must mention "glob": ${matched[0]}`);
    assert.match(matched[0], /skip/i, `warn line must mention "skip(ped)": ${matched[0]}`);
  },
);

Then(
  /^the builder exits without crash with non-empty graph$/,
  function (this: Feature29World) {
    assert.ok(this.graph, 'builder produced no graph');
    assert.ok(this.graph!.nodes.size > 0, 'graph must contain at least one node (FR-1 placeholder)');
  },
);

// ─── SPECGEN004_57 — DESIGN.md App-код section → DESIGN source_section ──

Given(
  /^`DESIGN\.md` "App-код" section lists `src\/foo\.ts`$/,
  function (this: Feature29World) {
    const slug = 'design-only-spec';
    const dir = path.join(this.tempDir, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'DESIGN.md'),
      [
        '# Design',
        '',
        '## Где лежит реализация',
        '',
        '- **App-код:** `src/foo.ts` для FR-3.',
        '',
      ].join('\n'),
    );
  },
);

Given(
  /^FR-3 body in `FR\.md` cites `src\/foo\.ts`$/,
  function (this: Feature29World) {
    // FR.md is what registers the canonical FR-3 node so the implements
    // edge has a real `from` to resolve against.
    const slug = 'design-only-spec';
    const dir = path.join(this.tempDir, '.specs', slug);
    fs.writeFileSync(
      path.join(dir, 'FR.md'),
      [
        '# FR',
        '',
        '### FR-3: Use src/foo.ts',
        '',
        'The system SHALL use `src/foo.ts` for the foo flow.',
        '',
      ].join('\n'),
    );
  },
);

Then(
  /^the graph contains an `implements` edge from `FR-3` to `File\("src\/foo\.ts"\)`$/,
  function (this: Feature29World) {
    const impls = this.graph!.edges.filter((e) => e.type === 'implements');
    // FR-36a: edge.from is the spec-qualified FR key for the staged slug.
    const fromFr3 = impls.filter((e) => e.from === 'design-only-spec:FR-3' && e.metadata?.file_path === 'src/foo.ts');
    assert.equal(fromFr3.length, 1, `expected exactly one design-only-spec:FR-3 -> src/foo.ts edge, got ${fromFr3.length}: ${JSON.stringify(impls)}`);
    const target = this.graph!.nodes.get(fromFr3[0].to) as FileNode | undefined;
    assert.equal(target?.type, 'File');
    assert.equal(target?.path, 'src/foo.ts');
  },
);

Then(
  /^the edge's `source_section` equals literally `'DESIGN'`$/,
  function (this: Feature29World) {
    const impls = this.graph!.edges.filter((e) => e.type === 'implements');
    const target = impls.find((e) => e.from === 'design-only-spec:FR-3' && e.metadata?.file_path === 'src/foo.ts');
    assert.ok(target, 'design-only-spec:FR-3 -> src/foo.ts edge must exist');
    assert.equal(target!.metadata?.source_section, 'DESIGN', `expected DESIGN, got ${target!.metadata?.source_section}`);
  },
);

// ─── SPECGEN004_58 — empty FILE_CHANGES → 0 File nodes + 0 edges ────────

Given(
  /^a spec at `tests\/fixtures\/specs\/minimal-spec\/` whose `FILE_CHANGES\.md` contains only the table header with no data rows$/,
  function (this: Feature29World) {
    copyFixtureIntoTemp(this, MINIMAL_FIXTURE);
  },
);

Then(
  /^the resulting graph contains zero nodes of type `File`$/,
  function (this: Feature29World) {
    const files = Array.from(this.graph!.nodes.values()).filter((n) => n.type === 'File');
    assert.equal(files.length, 0, `expected 0 File nodes, got ${files.length}`);
  },
);

Then(
  /^the resulting graph contains zero edges of type `implements`$/,
  function (this: Feature29World) {
    const impls = this.graph!.edges.filter((e) => e.type === 'implements');
    assert.equal(impls.length, 0, `expected 0 implements edges, got ${impls.length}`);
  },
);

Then('the build exits without crash', function (this: Feature29World) {
  assert.ok(this.graph, 'builder produced no graph');
});

// ─── SPECGEN004_59 — dedup FILE_CHANGES + DESIGN to one File node, FC wins

Given(
  /^`FILE_CHANGES\.md` cites `src\/foo\.ts` in FR-1's row$/,
  function (this: Feature29World) {
    const slug = 'dedup-spec';
    const dir = path.join(this.tempDir, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'FR.md'),
      '# FR\n\n### FR-1: foo\n\nThe system SHALL use foo via `src/foo.ts`.\n',
    );
    fs.writeFileSync(
      path.join(dir, 'FILE_CHANGES.md'),
      [
        '# File Changes',
        '',
        '| Path | Action | Reason |',
        '|------|--------|--------|',
        '| `src/foo.ts` | create | foo handler (FR-1). |',
        '',
      ].join('\n'),
    );
  },
);

Given(
  /^`DESIGN\.md` "App-код" section also lists `src\/foo\.ts` for FR-1$/,
  function (this: Feature29World) {
    const slug = 'dedup-spec';
    const dir = path.join(this.tempDir, '.specs', slug);
    fs.writeFileSync(
      path.join(dir, 'DESIGN.md'),
      [
        '# Design',
        '',
        '## Где лежит реализация',
        '',
        '- **App-код:** `src/foo.ts` для FR-1.',
        '',
      ].join('\n'),
    );
  },
);

Then(
  /^the graph contains exactly one `File` node with path `src\/foo\.ts`$/,
  function (this: Feature29World) {
    const files = (Array.from(this.graph!.nodes.values()).filter((n) => n.type === 'File') as FileNode[])
      .filter((f) => f.path === 'src/foo.ts');
    assert.equal(files.length, 1, `expected 1 File node for src/foo.ts, got ${files.length}`);
  },
);

Then(
  /^the graph contains exactly one `implements` edge from `FR-1` to `File\("src\/foo\.ts"\)`$/,
  function (this: Feature29World) {
    // FR-36a: edge.from is spec-qualified with the staged `dedup-spec` slug.
    const impls = this.graph!.edges.filter(
      (e) => e.type === 'implements' && e.from === 'dedup-spec:FR-1' && e.metadata?.file_path === 'src/foo.ts',
    );
    assert.equal(impls.length, 1, `expected exactly one dedup-spec:FR-1 -> src/foo.ts edge, got ${impls.length}`);
  },
);

Then(
  /^the edge's `source_section` equals literally `'FILE_CHANGES'` \(precedence over DESIGN\)$/,
  function (this: Feature29World) {
    const edges = this.graph!.edges.filter(
      (e: Edge) =>
        e.type === 'implements' && e.from === 'dedup-spec:FR-1' && e.metadata?.file_path === 'src/foo.ts',
    );
    assert.equal(edges.length, 1);
    assert.equal(
      edges[0].metadata?.source_section,
      'FILE_CHANGES',
      `FILE_CHANGES must win precedence; got ${edges[0].metadata?.source_section}`,
    );
  },
);
