/**
 * @FR-40 rename/move step definitions — SPECGEN004_155. Binds the REAL
 * rename_spec_doc handler (P21-5) on an isolated temp corpus: the anchors-aware
 * gate refuses to strand inbound markdown links by default, then retargets them
 * atomically on rewrite_inbound. No mocks — buildToolRegistry over the real graph.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_155
 * @see .specs/spec-generator-v4/FR.md FR-40
 * @see tools/spec-mcp-server/tools.ts (rename_spec_doc) + mutations.ts (findInboundLinks)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';

interface RenameWorld extends V4World {
  slug?: string;
  refuse?: { ok: boolean; error?: string; decision?: string; inbound_count?: number };
  moved?: { ok: boolean; to?: string; rewrote_inbound_files?: number };
}

async function rename(w: RenameWorld, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const prev = process.cwd();
  process.chdir(w.tempDir); // the handler resolves .specs/ against cwd
  try {
    const tool = buildToolRegistry(() => buildGraph({ repoRoot: w.tempDir, skipNdjson: true })).find(
      (t) => t.name === 'rename_spec_doc',
    )!;
    const r = (await tool.handler(args as never)) as { content: Array<{ text: string }> };
    return JSON.parse(r.content[0].text);
  } finally {
    process.chdir(prev);
  }
}

Given('a spec doc with inbound markdown links from another doc', function (this: RenameWorld) {
  this.slug = 'rename-demo';
  const dir = path.join(this.tempDir, '.specs', this.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Demo requirement\n\nBody.\n');
  // ACCEPTANCE_CRITERIA.md links at FR.md twice — the inbound markdown anchors.
  fs.writeFileSync(
    path.join(dir, 'ACCEPTANCE_CRITERIA.md'),
    '# AC\n\nSee [FR-1](FR.md#fr-1) — and again [the requirement](FR.md#fr-1).\n',
  );
});

When('the agent renames it through the door without rewrite_inbound', async function (this: RenameWorld) {
  this.refuse = await rename(this, { spec: this.slug, doc: 'FR.md', to_doc: 'REQUIREMENTS.md', reason: 'rename demo' });
});

Then(
  'the door refuses with a Decision block naming the inbound links and nothing is moved',
  function (this: RenameWorld) {
    assert.equal(this.refuse!.error, 'INBOUND_LINKS_PRESENT', `expected refusal, got ${JSON.stringify(this.refuse)}`);
    assert.ok(this.refuse!.decision, 'a Decision block must be returned for the human/agent to decide');
    assert.ok((this.refuse!.inbound_count ?? 0) >= 2, 'both inbound links must be counted');
    const dir = path.join(this.tempDir, '.specs', this.slug!);
    assert.ok(fs.existsSync(path.join(dir, 'FR.md')), 'the source must be untouched on a refusal');
    assert.ok(!fs.existsSync(path.join(dir, 'REQUIREMENTS.md')), 'nothing may be written on a refusal');
  },
);

When('the agent renames it again with rewrite_inbound', async function (this: RenameWorld) {
  this.moved = await rename(this, {
    spec: this.slug,
    doc: 'FR.md',
    to_doc: 'REQUIREMENTS.md',
    reason: 'rename demo',
    rewrite_inbound: true,
  });
});

Then(
  'the doc is moved, the old name is gone, and the inbound links are retargeted to the new name',
  function (this: RenameWorld) {
    assert.equal(this.moved!.ok, true, `rename must succeed, got ${JSON.stringify(this.moved)}`);
    assert.equal(this.moved!.to, 'REQUIREMENTS.md');
    assert.ok((this.moved!.rewrote_inbound_files ?? 0) >= 1, 'the referencing file must be retargeted');
    const dir = path.join(this.tempDir, '.specs', this.slug!);
    assert.ok(!fs.existsSync(path.join(dir, 'FR.md')), 'the old name must be gone after the move');
    assert.ok(fs.existsSync(path.join(dir, 'REQUIREMENTS.md')), 'the new name must exist');
    const ac = fs.readFileSync(path.join(dir, 'ACCEPTANCE_CRITERIA.md'), 'utf-8');
    assert.ok(!ac.includes('](FR.md#'), 'no inbound link may still point at the old name');
    assert.ok(ac.includes('REQUIREMENTS.md#fr-1'), 'inbound links must be retargeted to the new name');
  },
);
