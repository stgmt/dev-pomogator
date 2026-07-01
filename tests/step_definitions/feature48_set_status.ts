/**
 * @feature48 step definitions (set_entity_status command) — SPECGEN004_174. FR-48d: the
 * centralized command refuses an illegal transition (todo→done skip-to-finish) and an
 * unassembled-chain start (impl task whose FR lacks legs, naming them), and writes a valid
 * transition THROUGH the door (the TASKS.md Status marker flips on disk). Drives the REAL
 * setEntityStatus on a REAL temp repo (build the graph, write the file) — not a synthetic
 * stub, per verify-against-real-artifact.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_174
 * @see .specs/spec-generator-v4/FR.md FR-48 (FR-48d)
 * @see tools/spec-mcp-server/set-status.ts (setEntityStatus)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { setEntityStatus, type SetStatusResult } from '../../tools/spec-mcp-server/set-status.ts';

interface SetWorld extends V4World {
  ssRoot?: string;
  ssIllegal?: SetStatusResult;
  ssUnassembled?: SetStatusResult;
  ssValid?: SetStatusResult;
  ssDerived?: SetStatusResult;
  ssBareSpec?: SetStatusResult;
  ssBareUnique?: SetStatusResult;
  ssBareBogus?: SetStatusResult;
}

Given('a graph and the set_entity_status tool', function (this: SetWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr48-setstatus-'));
  const spec = path.join(root, '.specs', 'demo');
  fs.mkdirSync(spec, { recursive: true });
  // FR-1 fully legged (AC + scenario + design + story); FR-2 bare (no legs).
  fs.writeFileSync(path.join(spec, 'FR.md'), '## FR-1: Legged\n\n## FR-2: Bare\n');
  fs.writeFileSync(path.join(spec, 'ACCEPTANCE_CRITERIA.md'), '## AC-1 (FR-1)\n');
  fs.writeFileSync(path.join(spec, 'DESIGN.md'), '## Decision: Pick\n\n**Требование:** [FR-1](FR.md#fr-1)\n\nRationale.\n');
  fs.writeFileSync(path.join(spec, 'USER_STORIES.md'), '## User Story 1: As a user\n\n**Требование:** [FR-1](FR.md#fr-1)\n\nWhy.\n');
  fs.mkdirSync(path.join(root, 'tests', 'features'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tests/features/demo.feature'), '@FR-1\nFeature: D\n  Scenario: S\n    Given x\n');
  fs.writeFileSync(
    path.join(spec, 'TASKS.md'),
    '# Tasks\n\n' +
      '- [ ] T1 legged — id: t1 — Status: TODO | Est: 5m\n  _Requirements: [FR-1](FR.md#fr-1)_\n  **Done When:**\n  - [ ] x\n\n' +
      '- [ ] T2 bare — id: t2 — Status: TODO | Est: 5m\n  _Requirements: [FR-2](FR.md#fr-2)_\n  **Done When:**\n  - [ ] y\n',
  );
  this.ssRoot = root;
});

When('a status change is requested for a task', function (this: SetWorld) {
  const graph = buildGraph({ repoRoot: this.ssRoot!, skipNdjson: true });
  // (a) illegal: todo → done (skip-to-finish)
  this.ssIllegal = setEntityStatus(graph, this.ssRoot!, { id: 'demo:t1', to: 'done' });
  // (b) unassembled: t2 refs FR-2 (no legs) → in-progress
  this.ssUnassembled = setEntityStatus(graph, this.ssRoot!, { id: 'demo:t2', to: 'in-progress' });
  // (c) valid: t1 refs FR-1 (fully legged) → ready
  this.ssValid = setEntityStatus(graph, this.ssRoot!, { id: 'demo:t1', to: 'ready' });
});

Then(
  'an illegal transition or an unassembled chain is refused with the reason and a valid transition writes through the door',
  function (this: SetWorld) {
    // (a) illegal move refused
    assert.equal(this.ssIllegal!.ok, false, 'todo→done refused');
    assert.equal(this.ssIllegal!.error, 'ILLEGAL_TRANSITION');
    // (b) unassembled chain refused, naming the missing FR-2 legs
    assert.equal(this.ssUnassembled!.ok, false, 'impl start on a bare FR refused');
    assert.equal(this.ssUnassembled!.error, 'CHAIN_NOT_ASSEMBLED');
    assert.ok(this.ssUnassembled!.missing!.some((m) => m.includes('FR-2')), 'names the unassembled FR-2 legs');
    // (c) valid move allowed AND written through the door
    assert.equal(this.ssValid!.ok, true, `valid transition allowed (reason: ${this.ssValid!.reason})`);
    const tasks = fs.readFileSync(path.join(this.ssRoot!, '.specs', 'demo', 'TASKS.md'), 'utf-8');
    assert.match(tasks, /id: t1 — Status: READY/, 'the door write flipped t1 to READY on disk');
    assert.match(tasks, /id: t2 — Status: TODO/, 't2 untouched');
  },
);

// SPECGEN004_175 (FR-48e): a derived entity (an FR) carries a COMPUTED status —
// set_entity_status refuses the hand-set and returns the live fr-census verdict.
Given('a graph with an FR and the set_entity_status tool', function (this: SetWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr48-derived-'));
  const spec = path.join(root, '.specs', 'demo');
  fs.mkdirSync(spec, { recursive: true });
  fs.writeFileSync(path.join(spec, 'FR.md'), '## FR-1: Some requirement\n');
  this.ssRoot = root;
});

When('a status change is requested for that FR', function (this: SetWorld) {
  const graph = buildGraph({ repoRoot: this.ssRoot!, skipNdjson: true });
  // `to` is irrelevant — a derived entity is refused before any transition check.
  this.ssDerived = setEntityStatus(graph, this.ssRoot!, { id: 'demo:FR-1', to: 'in-progress' });
});

Then(
  'the change is refused as STATUS_DERIVED and the reply carries the FR census verdict',
  function (this: SetWorld) {
    const r = this.ssDerived!;
    assert.equal(r.ok, false, 'a derived entity is not hand-set');
    assert.equal(r.error, 'STATUS_DERIVED');
    assert.equal(r.entityType, 'FR');
    const VERDICTS = ['IMPLEMENTED', 'DONE_UNTESTED', 'IN_PROGRESS', 'PLANNED', 'UNIMPLEMENTED'];
    assert.ok(
      r.verdict !== undefined && VERDICTS.includes(r.verdict),
      `reply carries a live fr-census verdict, got ${r.verdict}`,
    );
  },
);

// SPECGEN004_180 (FR-48): set_entity_status resolves a BARE local task id (+ optional spec),
// not only the composite slug:id. Task nodes are composite-keyed (<spec>:<localId>), so a raw
// bare graph.nodes.get used to 404 every natural `id:` from TASKS.md (incident 2026-06-14);
// now it mirrors the sibling node-ref tools (resolveNodeRef: composite / spec+bare / unique-bare).
When('a status change is requested by bare local task id', function (this: SetWorld) {
  // bare local id + spec → resolves to demo:t1 (FR-1 legged) → ready writes through the door
  this.ssBareSpec = setEntityStatus(buildGraph({ repoRoot: this.ssRoot!, skipNdjson: true }), this.ssRoot!, { id: 't1', spec: 'demo', to: 'ready' });
  // bare-unique id, NO spec → resolves to demo:t2 (FR-2 bare) → refused CHAIN_NOT_ASSEMBLED (resolved, not 404)
  this.ssBareUnique = setEntityStatus(buildGraph({ repoRoot: this.ssRoot!, skipNdjson: true }), this.ssRoot!, { id: 't2', to: 'ready' });
  // bare id that matches no task → NOT_FOUND
  this.ssBareBogus = setEntityStatus(buildGraph({ repoRoot: this.ssRoot!, skipNdjson: true }), this.ssRoot!, { id: 'no-such-task', spec: 'demo', to: 'done' });
});

Then('the bare id resolves to the composite task node and is not 404ed', function (this: SetWorld) {
  // bare + spec resolved AND wrote through the door
  assert.equal(this.ssBareSpec!.ok, true, `bare local id + spec resolves + writes (reason: ${this.ssBareSpec!.reason})`);
  const tasks = fs.readFileSync(path.join(this.ssRoot!, '.specs', 'demo', 'TASKS.md'), 'utf-8');
  assert.match(tasks, /id: t1 — Status: READY/, 'bare-id write flipped t1 to READY on disk');
  // bare-unique (no spec) resolved — refused for the chain, NOT a NOT_FOUND
  assert.equal(this.ssBareUnique!.error, 'CHAIN_NOT_ASSEMBLED', 'bare-unique id resolved (refused on chain, not 404)');
  // truly-missing bare id → NOT_FOUND
  assert.equal(this.ssBareBogus!.error, 'NOT_FOUND', 'an unknown bare id is 404ed');
});
