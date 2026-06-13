/**
 * @feature47 step definitions (Story leg) — SPECGEN004_166..168. The STORY leg of the
 * trace web, sibling of the @feature47 design slice: both legs belong to FR-47, so both
 * scenario groups carry the @feature47 tag (`@feature48` → FR-48 doesn't exist → untagged).
 * md parser builds a Story node + FR→Story `covers` edge
 * ONLY from an explicit `**Требование:**` line, checkConformance raises FR_NO_STORY for an
 * FR no Story covers, and get_trace surfaces user_stories[]. Synthetic inputs.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_166
 * @see .specs/spec-generator-v4/FR.md FR-47
 * @see tools/spec-graph/parsers/md.ts (Story parser) · conformance.ts (FR_NO_STORY)
 * @see tools/spec-mcp-server/tools.ts (get_trace user_stories)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import { parseMarkdown } from '../../tools/spec-graph/parsers/md.ts';
import { checkConformance, type Finding } from '../../tools/spec-graph/conformance.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';

interface StoryWorld extends V4World {
  sParsed?: ReturnType<typeof parseMarkdown>;
  sFindings?: Finding[];
  sGraph?: unknown;
  sTrace?: { user_stories: Array<{ id: string; parentFr: string }> };
}

function frGraph(withStory: boolean): unknown {
  const nodes = new Map<string, unknown>([
    ['demo:FR-1', { id: 'demo:FR-1', type: 'FR', file: 'FR.md', line: 1, title: 'x', anchors: ['FR-1'], body: '' }],
  ]);
  const edges: Array<{ from: string; to: string; type: string }> = [];
  if (withStory) {
    nodes.set('demo:Story-x', { id: 'demo:Story-x', type: 'Story', file: 'USER_STORIES.md', line: 1, title: 'x', parentFr: 'demo:FR-1', body: '' });
    edges.push({ from: 'demo:FR-1', to: 'demo:Story-x', type: 'covers' });
  }
  return { version: 1, builtAt: '', definitions: new Map(), backlinks: new Map(), nodes, edges };
}

// ── SPECGEN004_166 — parser ──
Given('a USER_STORIES doc with one Story citing its requirement on a Требование line and one citing a requirement only in prose', function (this: StoryWorld) {
  const src = [
    '# User Stories', '',
    '### User Story 1: Explicit one (Priority: P1)', '',
    '**Требование:** [FR-1](FR.md#fr-1)', '',
    '**Why:** because.', '',
    '### User Story 2: Prose only (Priority: P2)', '',
    '**Why:** mentions FR-2 only in prose, no requirement line.', '',
  ].join('\n');
  this.sParsed = parseMarkdown(src, 'demo/USER_STORIES.md');
});

When('the user-stories markdown is parsed', function () {
  // parse ran synchronously in the Given
});

Then('a Story node and an FR-to-Story covers edge exist for the explicit one', function (this: StoryWorld) {
  const stories = this.sParsed!.nodes.filter((n) => n.type === 'Story');
  assert.ok(stories.length >= 2, `both stories are nodes (got ${stories.length})`);
  assert.ok(stories.some((s) => (s as { parentFr?: string }).parentFr === 'FR-1'), 'explicit story has parentFr FR-1');
  assert.ok(
    this.sParsed!.edges.some((e) => e.from === 'FR-1' && e.type === 'covers' && String(e.to).startsWith('Story-')),
    'an FR-1 → Story covers edge exists',
  );
});

Then('the prose-only Story is a node with no edge', function (this: StoryWorld) {
  const prose = this.sParsed!.nodes.find((n) => n.type === 'Story' && (n as { parentFr?: string }).parentFr === '');
  assert.ok(prose, 'the prose-only story is a node with empty parentFr');
  const proseId = (prose as { id: string }).id;
  assert.equal(this.sParsed!.edges.filter((e) => e.to === proseId).length, 0, 'no edge points to the prose-only story');
});

// ── SPECGEN004_167 — conformance FR_NO_STORY ──
Given('a graph with an FR that no Story covers', function (this: StoryWorld) {
  this.sGraph = frGraph(false);
});

When('conformance checks the story leg of the graph', function (this: StoryWorld) {
  this.sFindings = checkConformance(this.sGraph as never);
});

Then('an FR_NO_STORY warning is raised for that FR', function (this: StoryWorld) {
  const f = this.sFindings!.filter((x) => x.code === 'FR_NO_STORY');
  assert.ok(f.some((x) => x.nodeId === 'demo:FR-1'), 'FR_NO_STORY raised for FR-1');
  assert.equal(f.find((x) => x.nodeId === 'demo:FR-1')!.severity, 'warning');
});

// ── SPECGEN004_168 — get_trace user_stories ──
Given('a graph where a Story covers an FR via an explicit requirement line', function (this: StoryWorld) {
  this.sGraph = frGraph(true);
});

When('get_trace runs for that requirement', async function (this: StoryWorld) {
  const reg = buildToolRegistry(() => this.sGraph as never, {});
  const res = (await reg.find((t) => t.name === 'get_trace')!.handler({ node_id: 'demo:FR-1' } as never)) as { content: Array<{ text: string }> };
  this.sTrace = JSON.parse(res.content[0].text);
});

Then("the FR's user_stories include that Story", function (this: StoryWorld) {
  assert.ok(
    this.sTrace!.user_stories.some((s) => s.id === 'demo:Story-x'),
    'user_stories includes the covering Story',
  );
});
