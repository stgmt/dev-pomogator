/**
 * @FR-45 step definitions — SPECGEN004_157..159. Binds the REAL archival door
 * tools (get_archival_proof / archive_spec) + the mutation-door seal on a
 * synthetic cross-spec graph: a spec a LIVE spec still references is KEPT
 * (KEEP_FALSE_POSITIVE — the "наоборот ошибка"), archive_spec REFUSES it
 * (ARCHIVE_BLOCKED, nothing moved), and any write under archive/ is
 * ARCHIVE_SEALED. Synthetic graph (no temp fs) so the cross-spec EDGE alone
 * proves a live inbound ref — robust in Docker (no .git / reset .specs).
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_157
 * @see .specs/spec-generator-v4/FR.md FR-45
 * @see tools/spec-mcp-server/tools.ts get_archival_proof / archive_spec
 * @see tools/spec-mcp-server/mutations.ts validateTarget (ARCHIVE_SEALED)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { validateTarget } from '../../tools/spec-mcp-server/mutations.ts';

interface ArchiveWorld extends V4World {
  archiveRegistry?: ReturnType<typeof buildToolRegistry>;
  archiveResult?: Record<string, unknown>;
  sealFinding?: ReturnType<typeof validateTarget>;
}

// live-y references retired-x through a cross-spec edge → a LIVE inbound ref.
const SYNTH_GRAPH = {
  version: 1,
  builtAt: '',
  definitions: new Map(),
  backlinks: new Map(),
  nodes: new Map<string, unknown>([
    ['retired-x:FR-1', { id: 'retired-x:FR-1', type: 'FR', file: '.specs/retired-x/FR.md' }],
    ['live-y:FR-2', { id: 'live-y:FR-2', type: 'FR', file: '.specs/live-y/FR.md' }],
  ]),
  edges: [{ from: 'live-y:FR-2', to: 'retired-x:FR-1', type: 'covers' }],
} as never;

async function callTool(
  reg: ReturnType<typeof buildToolRegistry>,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const t = reg.find((x) => x.name === name)!;
  const res = (await t.handler(args as never)) as { content: Array<{ text: string }> };
  return JSON.parse(res.content[0].text);
}

Given('a graph where one spec is referenced by an edge from a live spec', function (this: ArchiveWorld) {
  this.archiveRegistry = buildToolRegistry(() => SYNTH_GRAPH, {});
});

When('get_archival_proof runs for the referenced spec', async function (this: ArchiveWorld) {
  this.archiveResult = await callTool(this.archiveRegistry!, 'get_archival_proof', { slug: 'retired-x' });
});

Then('the verdict is KEEP_FALSE_POSITIVE with a live inbound count of at least one', function (this: ArchiveWorld) {
  assert.equal(this.archiveResult!.ok, true);
  assert.equal(this.archiveResult!.verdict, 'KEEP_FALSE_POSITIVE');
  assert.ok((this.archiveResult!.live_inbound_count as number) >= 1, 'must count the live inbound edge');
});

When('archive_spec is asked to archive the referenced spec', async function (this: ArchiveWorld) {
  this.archiveResult = await callTool(this.archiveRegistry!, 'archive_spec', { slug: 'retired-x', reason: 'bdd' });
});

Then('it refuses with ARCHIVE_BLOCKED and nothing is moved', function (this: ArchiveWorld) {
  assert.equal(this.archiveResult!.ok, false);
  assert.equal(this.archiveResult!.error, 'ARCHIVE_BLOCKED');
  assert.ok((this.archiveResult!.live_inbound_count as number) >= 1);
});

Given('the archive tree holds a spec', function (this: ArchiveWorld) {
  // validateTarget is a pure guard over the slug namespace — no fs setup needed.
});

When('the door validates a write targeting that archived spec', function (this: ArchiveWorld) {
  this.sealFinding = validateTarget('archive/retired-x', 'FR.md');
});

Then('the write is refused as ARCHIVE_SEALED', function (this: ArchiveWorld) {
  assert.ok(this.sealFinding, 'a write under archive/ must be refused');
  assert.match(this.sealFinding!.message, /ARCHIVE_SEALED/);
});
