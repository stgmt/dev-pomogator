/**
 * @feature47 step definitions — SPECGEN004_163..165. Drives the REAL design-leg of the
 * trace web: the md parser builds a Decision node + FR→Decision `covers` edge ONLY from
 * an explicit `**Требование:**` line (not a prose FR mention), checkConformance raises
 * FR_NO_DESIGN for an FR no Decision covers, and get_trace surfaces an FR's
 * design_decisions[]. Synthetic inputs — robust in Docker.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_163
 * @see .specs/spec-generator-v4/FR.md FR-47
 * @see tools/spec-graph/parsers/md.ts (Decision parser) · conformance.ts (FR_NO_DESIGN)
 * @see tools/spec-mcp-server/tools.ts (get_trace design_decisions)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import { parseMarkdown } from '../../tools/spec-graph/parsers/md.ts';
import { checkConformance, type Finding } from '../../tools/spec-graph/conformance.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';

interface DesignWorld extends V4World {
  dParsed?: ReturnType<typeof parseMarkdown>;
  dFindings?: Finding[];
  dGraph?: unknown;
  dTrace?: { design_decisions: Array<{ id: string; parentFr: string }> };
}

/** A minimal graph with FR-1; optionally a Decision that covers it (real `covers` edge). */
function frGraph(withDecision: boolean): unknown {
  const nodes = new Map<string, unknown>([
    ['demo:FR-1', { id: 'demo:FR-1', type: 'FR', file: 'FR.md', line: 1, title: 'x', anchors: ['FR-1'], body: '' }],
  ]);
  const edges: Array<{ from: string; to: string; type: string }> = [];
  if (withDecision) {
    nodes.set('demo:Decision-x', { id: 'demo:Decision-x', type: 'Decision', file: 'DESIGN.md', line: 1, title: 'x', parentFr: 'demo:FR-1', body: '' });
    edges.push({ from: 'demo:FR-1', to: 'demo:Decision-x', type: 'covers' });
  }
  return { version: 1, builtAt: '', definitions: new Map(), backlinks: new Map(), nodes, edges };
}

// ── SPECGEN004_163 — parser: explicit requirement line → edge; prose mention → none ──
Given('a DESIGN doc with one Decision citing its requirement on a Требование line and one citing a requirement only in prose', function (this: DesignWorld) {
  const src = [
    '## Key Decisions', '',
    '### Decision: Explicit one', '',
    '**Требование:** [FR-1](FR.md#fr-1)', '',
    '**Rationale:** because.', '',
    '### Decision: Prose only', '',
    '**Rationale:** mentions FR-2 only in prose, no requirement line.', '',
  ].join('\n');
  this.dParsed = parseMarkdown(src, 'demo/DESIGN.md');
});

When('the design markdown is parsed', function () {
  // parse already ran in the Given (parseMarkdown is synchronous)
});

Then('a Decision node and an FR-to-Decision covers edge exist for the explicit one', function (this: DesignWorld) {
  const decs = this.dParsed!.nodes.filter((n) => n.type === 'Decision');
  assert.ok(decs.length >= 2, `both decisions are nodes (got ${decs.length})`);
  assert.ok(decs.some((d) => (d as { parentFr?: string }).parentFr === 'FR-1'), 'explicit decision has parentFr FR-1');
  assert.ok(
    this.dParsed!.edges.some((e) => e.from === 'FR-1' && e.type === 'covers' && String(e.to).startsWith('Decision-')),
    'an FR-1 → Decision covers edge exists',
  );
});

Then('the prose-only Decision is a node with no edge', function (this: DesignWorld) {
  const prose = this.dParsed!.nodes.find((n) => n.type === 'Decision' && (n as { parentFr?: string }).parentFr === '');
  assert.ok(prose, 'the prose-only decision is a node with empty parentFr');
  const proseId = (prose as { id: string }).id;
  assert.equal(this.dParsed!.edges.filter((e) => e.to === proseId).length, 0, 'no edge points to the prose-only decision');
});

// ── SPECGEN004_164 — conformance FR_NO_DESIGN ──
Given('a graph with an FR that no Decision covers', function (this: DesignWorld) {
  this.dGraph = frGraph(false);
});

When('conformance checks the design leg of the graph', function (this: DesignWorld) {
  this.dFindings = checkConformance(this.dGraph as never);
});

Then('an FR_NO_DESIGN warning is raised for that FR', function (this: DesignWorld) {
  const f = this.dFindings!.filter((x) => x.code === 'FR_NO_DESIGN');
  assert.ok(f.some((x) => x.nodeId === 'demo:FR-1'), 'FR_NO_DESIGN raised for FR-1');
  assert.equal(f.find((x) => x.nodeId === 'demo:FR-1')!.severity, 'warning');
});

// ── SPECGEN004_165 — get_trace design_decisions ──
Given('a graph where a Decision covers an FR via an explicit requirement line', function (this: DesignWorld) {
  this.dGraph = frGraph(true);
});

When('get_trace runs for that FR', async function (this: DesignWorld) {
  const reg = buildToolRegistry(() => this.dGraph as never, {});
  const res = (await reg.find((t) => t.name === 'get_trace')!.handler({ node_id: 'demo:FR-1' } as never)) as { content: Array<{ text: string }> };
  this.dTrace = JSON.parse(res.content[0].text);
});

Then("the FR's design_decisions include that Decision", function (this: DesignWorld) {
  assert.ok(
    this.dTrace!.design_decisions.some((d) => d.id === 'demo:Decision-x'),
    'design_decisions includes the covering Decision',
  );
});
