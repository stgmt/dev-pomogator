/**
 * @feature50 step definitions (FR-50 — the deliberate-waiver close-gate) —
 * SPECGEN004_182 / _183 / _184. A task carrying a `_waived: <reason>_` marker is kept
 * OPEN on purpose; it must not be closed. Three real-engine checks, no synthetic stubs
 * where the real path is reachable:
 *   _182 — the mutation door refuses an `apply_spec_change` that flips a waived task to
 *          DONE (real validateSpecChange on a temp repo → TASK_WAIVED_CLOSED error floor);
 *   _183 — set_entity_status refuses the close of an INVISIBLE waived task (non-enum
 *          WONT-VERIFY status) with `error: WAIVED` + the reason, not a bare NOT_FOUND
 *          (real buildGraph + setEntityStatus → the findWaivedBlock fallback scan);
 *   _184 — the REAL parser lifts `_waived:` onto the node, an orphan WONT-VERIFY block
 *          does NOT bleed into the prior DONE task, and the floor flags ONLY waived+done.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_182/183/184
 * @see .specs/spec-generator-v4/FR.md FR-50 (FR-50a/b/c)
 * @see tools/spec-graph/parsers/tasks.ts · tools/spec-graph/conformance.ts (TASK_WAIVED_CLOSED) · tools/spec-mcp-server/set-status.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { V4World } from '../hooks/before-after.ts';
import type { SpecGraph, TaskNode } from '../../tools/spec-graph/types.ts';
import { parseTasks } from '../../tools/spec-graph/parsers/tasks.ts';
import { checkConformance, type Finding } from '../../tools/spec-graph/conformance.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { validateSpecChange, type ValidateResult } from '../../tools/spec-mcp-server/mutations.ts';
import { setEntityStatus, type SetStatusResult } from '../../tools/spec-mcp-server/set-status.ts';

interface WaivedWorld extends V4World {
  wcDoorRoot?: string;
  wcDoorResult?: ValidateResult;
  wcCmdRoot?: string;
  wcCmdGraph?: SpecGraph;
  wcCmdResult?: SetStatusResult;
  wcParsed?: TaskNode[];
  wcFloorGraph?: SpecGraph;
  wcFloorFindings?: Finding[];
}

// A waived task in the exact verify-phase0-red shape: a non-enum WONT-VERIFY status
// (invisible to the graph) + a `_waived:` body marker.
const WAIVED_TASK = `# Tasks

## Phase 0

- [ ] Verify foo — id: foo — Status: WONT-VERIFY | Est: 10m
  _waived: red precondition unverifiable post-hoc, kept open on purpose_
  **Done When:**
  - [ ] historic phase-entry condition, moot post-implementation
`;

// ── SPECGEN004_182 — the door refuses flipping a waived task to DONE ──────────────────
Given('a spec whose TASKS.md carries a task with a _waived: marker', function (this: WaivedWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr50door-'));
  const dir = path.join(root, '.specs', 'wf');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'TASKS.md'), WAIVED_TASK);
  this.wcDoorRoot = root;
});

When('a spec-change flips that waived task to DONE through the mutation door', function (this: WaivedWorld) {
  const abs = path.join(this.wcDoorRoot!, '.specs', 'wf', 'TASKS.md');
  const content = fs.readFileSync(abs, 'utf-8');
  const oldLine = content.split('\n').find((l) => /\bid:\s*foo\b/.test(l) && /^\s*-\s*\[/.test(l))!;
  const newLine = oldLine.replace(/^(\s*-\s*)\[[ xX~]\]/, '$1[x]').replace(/Status:\s*WONT-VERIFY/, 'Status: DONE');
  this.wcDoorResult = validateSpecChange(this.wcDoorRoot!, 'wf', 'TASKS.md', { old_string: oldLine, new_string: newLine });
});

Then('the door refuses the write with a TASK_WAIVED_CLOSED error finding', function (this: WaivedWorld) {
  fs.rmSync(this.wcDoorRoot!, { recursive: true, force: true });
  assert.equal(this.wcDoorResult!.ok, false, 'the door refuses the waived → DONE write');
  assert.ok(
    this.wcDoorResult!.findings.some((f) => f.layer === 'conformance' && /TASK_WAIVED_CLOSED/.test(f.message)),
    'a TASK_WAIVED_CLOSED conformance finding is raised',
  );
});

// ── SPECGEN004_183 — set_entity_status refuses closing an invisible waived task ───────
Given('the set_entity_status tool and a waived task that is invisible to the graph by a non-enum status', function (this: WaivedWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr50cmd-'));
  const dir = path.join(root, '.specs', 'wf');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'TASKS.md'), WAIVED_TASK);
  this.wcCmdRoot = root;
  this.wcCmdGraph = buildGraph({ repoRoot: root, skipNdjson: true });
});

When('a close to done is requested for that task', function (this: WaivedWorld) {
  this.wcCmdResult = setEntityStatus(this.wcCmdGraph!, this.wcCmdRoot!, { id: 'foo', to: 'done', spec: 'wf' });
});

Then('the change is refused as WAIVED carrying the waiver reason rather than a NOT_FOUND', function (this: WaivedWorld) {
  fs.rmSync(this.wcCmdRoot!, { recursive: true, force: true });
  assert.equal(this.wcCmdResult!.ok, false, 'the close is refused');
  assert.equal(this.wcCmdResult!.error, 'WAIVED', 'error is WAIVED, not NOT_FOUND');
  assert.match(this.wcCmdResult!.reason!, /unverifiable post-hoc/, 'the reason carries the waiver text');
});

// ── SPECGEN004_184 — parser lift + anti-bleed + floor precision (real parseTasks) ─────
Given('a graph with a waived DONE task a waived open task and a plain DONE task', function (this: WaivedWorld) {
  const fixture = `# Tasks

## Phase 0

- [x] Waived done — id: wd — Status: DONE | Est: 10m
  _waived: kept open on purpose_
  **Done When:**
  - [x] x

- [ ] Waived open — id: wo — Status: TODO | Est: 10m
  _waived: waived but still open_
  **Done When:**
  - [ ] y

- [x] Plain done — id: pd — Status: DONE | Est: 10m
  **Done When:**
  - [x] z

- [ ] Orphan waiver — id: orph — Status: WONT-VERIFY | Est: 10m
  _waived: invisible orphan, must not bleed into pd_
  **Done When:**
  - [ ] w
`;
  this.wcParsed = parseTasks(fixture, 'TASKS.md');
  const nodes = new Map<string, unknown>();
  for (const t of this.wcParsed) nodes.set(t.id, t);
  this.wcFloorGraph = { version: 1, builtAt: '', nodes, edges: [], definitions: new Map(), backlinks: new Map() } as unknown as SpecGraph;
});

When('conformance checks the waived-close floor', function (this: WaivedWorld) {
  this.wcFloorFindings = checkConformance(this.wcFloorGraph!);
});

Then('only the waived and DONE task raises TASK_WAIVED_CLOSED and the other two do not', function (this: WaivedWorld) {
  // parser lift + anti-bleed: the WONT-VERIFY orphan is invisible (no headerOf relaxation),
  // and the plain DONE task did NOT absorb the orphan's _waived: marker.
  assert.deepEqual(this.wcParsed!.map((t) => t.id), ['wd', 'wo', 'pd'], 'the WONT-VERIFY orphan stays invisible');
  assert.equal(this.wcParsed!.find((t) => t.id === 'pd')!.waived, undefined, 'anti-bleed: plain DONE task did not absorb the orphan _waived:');
  assert.ok(this.wcParsed!.find((t) => t.id === 'wd')!.waived, 'parser lifted the waiver onto the waived DONE task');
  // floor precision: only waived+done is flagged.
  const flagged = this.wcFloorFindings!.filter((f) => f.code === 'TASK_WAIVED_CLOSED').map((f) => f.nodeId);
  assert.deepEqual(flagged, ['wd'], 'only the waived+done task is flagged, not waived-open or plain-done');
});
