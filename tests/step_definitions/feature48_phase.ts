/**
 * @feature48 step definitions (FR-48e phase authored-path) — SPECGEN004_176, 177.
 *
 * 176: set_entity_status confirms a PHASE STOP only past the typed gate — confirming
 * Requirements before Discovery is refused (prior-STOP ordering, which the CLI does NOT
 * enforce), a task-vocab status on a phase is illegal-for-type, and a clean Discovery
 * confirm WRITES stopConfirmed through the canonical writer (spawned `node
 * specs-generator-core.mjs spec-status -ConfirmStop`, the single .progress.json writer).
 * 177: get_spec_status publishes the settable `<slug>:phase:<Phase>` ids (phases are not
 * graph nodes — this is the only place the agent discovers the handle, FR-48c).
 *
 * Drives the REAL setEntityStatus + REAL get_spec_status handler on REAL temp repos —
 * no synthetic stub (verify-against-real-artifact).
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_176, SPECGEN004_177
 * @see .specs/spec-generator-v4/FR.md FR-48 (FR-48e)
 * @see tools/spec-graph/phase-lifecycle.ts · tools/spec-mcp-server/set-status.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { setEntityStatus, type SetStatusResult } from '../../tools/spec-mcp-server/set-status.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';

interface PhaseWorld extends V4World {
  phRoot?: string;
  phReqEarly?: SetStatusResult;
  phIllegal?: SetStatusResult;
  phConfirm?: SetStatusResult;
  phStatusRoot?: string;
  phStatusResult?: {
    phases?: Array<{ id: string; name: string; stop_confirmed: boolean }>;
  };
}

function unconfirmedProgress(): string {
  const mk = () => ({ completedAt: null, stopConfirmed: false, stopConfirmedAt: null });
  return JSON.stringify({
    version: 4,
    featureSlug: 'demo',
    createdAt: '2026-01-01T00:00:00.000Z',
    currentPhase: 'Discovery',
    phases: { Discovery: mk(), Context: mk(), Requirements: mk(), Finalization: mk() },
  });
}

Given('a temp spec whose Discovery STOP is not yet confirmed', function (this: PhaseWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr48-phase-'));
  const spec = path.join(root, '.specs', 'demo');
  fs.mkdirSync(spec, { recursive: true });
  fs.writeFileSync(path.join(spec, 'FR.md'), '## FR-1: Something\n');
  fs.writeFileSync(path.join(spec, 'USER_STORIES.md'), '## User Story 1: As a user\n'); // Discovery input present
  fs.writeFileSync(path.join(spec, '.progress.json'), unconfirmedProgress());
  this.phRoot = root;
});

When('phase status changes are requested through set_entity_status', function (this: PhaseWorld) {
  const graph = buildGraph({ repoRoot: this.phRoot!, skipNdjson: true });
  // (a) confirm Requirements before Discovery → blocked by the prior-STOP ordering gate.
  this.phReqEarly = setEntityStatus(graph, this.phRoot!, { id: 'demo:phase:Requirements', to: 'done' });
  // (b) a task-vocab status on a phase → illegal-for-type.
  this.phIllegal = setEntityStatus(graph, this.phRoot!, { id: 'demo:phase:Discovery', to: 'in-progress' });
  // (c) confirm Discovery (first phase, inputs present) → writes through the canonical writer.
  this.phConfirm = setEntityStatus(graph, this.phRoot!, { id: 'demo:phase:Discovery', to: 'done' });
});

Then(
  'confirming the Requirements STOP first is refused for the unconfirmed prior STOP, a task-vocab status on a phase is illegal-for-type, and confirming the Discovery STOP writes stopConfirmed through the canonical writer',
  function (this: PhaseWorld) {
    // (a) ordering gate (the CLI does not enforce this — the typed layer does)
    assert.equal(this.phReqEarly!.ok, false, 'Requirements-before-Discovery refused');
    assert.equal(this.phReqEarly!.error, 'CHAIN_NOT_ASSEMBLED');
    assert.ok(
      this.phReqEarly!.missing!.some((m) => /Discovery/.test(m)),
      `names the unconfirmed prior STOP, got ${JSON.stringify(this.phReqEarly!.missing)}`,
    );
    // (b) illegal-for-type
    assert.equal(this.phIllegal!.ok, false, 'task status on a phase refused');
    assert.equal(this.phIllegal!.error, 'ILLEGAL_TRANSITION');
    assert.equal(this.phIllegal!.entityType, 'Phase');
    // (c) clean confirm writes through the canonical writer
    assert.equal(this.phConfirm!.ok, true, `Discovery confirm allowed (reason: ${this.phConfirm!.reason})`);
    const progress = JSON.parse(fs.readFileSync(path.join(this.phRoot!, '.specs', 'demo', '.progress.json'), 'utf-8'));
    assert.equal(progress.phases.Discovery.stopConfirmed, true, 'canonical writer flipped Discovery stopConfirmed');
  },
);

Given('a temp spec with a known phase STOP state', function (this: PhaseWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr48-getstatus-'));
  const spec = path.join(root, '.specs', 'demo');
  fs.mkdirSync(spec, { recursive: true });
  fs.writeFileSync(path.join(spec, 'FR.md'), '## FR-1: Something\n');
  const mk = (confirmed: boolean) => ({ completedAt: null, stopConfirmed: confirmed, stopConfirmedAt: null });
  fs.writeFileSync(
    path.join(spec, '.progress.json'),
    JSON.stringify({
      version: 4,
      featureSlug: 'demo',
      createdAt: '2026-01-01T00:00:00.000Z',
      currentPhase: 'Requirements',
      phases: { Discovery: mk(true), Context: mk(false), Requirements: mk(true), Finalization: mk(false) },
    }),
  );
  this.phStatusRoot = root;
});

When('get_spec_status reports the phase list for that spec', async function (this: PhaseWorld) {
  const root = this.phStatusRoot!;
  const registry = buildToolRegistry(() => buildGraph({ repoRoot: root, skipNdjson: true }));
  const tool = registry.find((t) => t.name === 'get_spec_status')!;
  const prevCwd = process.cwd();
  process.chdir(root); // get_spec_status reads .progress.json from process.cwd()
  try {
    const r = (await tool.handler({ spec: 'demo' } as never)) as { content: Array<{ text: string }> };
    this.phStatusResult = JSON.parse(r.content[0].text);
  } finally {
    process.chdir(prevCwd);
  }
});

Then(
  'its phases list carries the slug-qualified phase id and the stop-confirmed flag matching the progress file',
  function (this: PhaseWorld) {
    const phases = this.phStatusResult!.phases ?? [];
    const req = phases.find((p) => p.id === 'demo:phase:Requirements');
    const disc = phases.find((p) => p.id === 'demo:phase:Discovery');
    const ctx = phases.find((p) => p.id === 'demo:phase:Context');
    assert.ok(req, `phases carry the slug-qualified Requirements id, got ${JSON.stringify(phases.map((p) => p.id))}`);
    assert.equal(req!.stop_confirmed, true, 'Requirements stop_confirmed matches the progress file');
    assert.equal(disc!.stop_confirmed, true, 'Discovery stop_confirmed matches the progress file');
    assert.equal(ctx!.stop_confirmed, false, 'Context stop_confirmed matches the progress file');
  },
);
