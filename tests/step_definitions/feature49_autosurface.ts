/**
 * @feature49 step definitions (FR-49a — banner names the next step) — SPECGEN004_178.
 *
 * The per-prompt task-census banner must not just COUNT unfinished work — it must name
 * ONE concrete next open task so «what's next» rides the standing signal. Drives the REAL
 * writeTaskCensusCache + buildTaskCensusLine on a temp repo (no synthetic stub): write a
 * cache whose busiest spec carries a titled open task, render the banner, assert the title
 * shows as the next step.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_178
 * @see .specs/spec-generator-v4/FR.md FR-49 (FR-49a)
 * @see tools/spec-graph/task-census.ts (nextOpen) · tools/specs-validator/conformance-summary.ts (banner)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { V4World } from '../hooks/before-after.ts';
import type { SpecGraph } from '../../tools/spec-graph/types.ts';
import { writeTaskCensusCache, findStaleInProgress, type StaleMarker } from '../../tools/spec-graph/task-census.ts';
import { renderStaleReport } from '../../tools/spec-graph/stale-marker-scan.ts';
import { buildTaskCensusLine } from '../../tools/specs-validator/conformance-summary.ts';

interface AutoSurfaceWorld extends V4World {
  asRoot?: string;
  asBanner?: string | null;
  staleGraph?: SpecGraph;
  staleResult?: StaleMarker[];
  staleReport?: string;
}

Given('a cached task census whose busiest spec has an open task with a title', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49a-'));
  writeTaskCensusCache(
    root,
    {
      total: { open: 1, doneRed: 0, doneUnrun: 0 },
      specs: [
        { slug: 'demo', open: 1, doneRed: 0, doneUnrun: 0, nextOpen: { id: 'demo:wire-gate', title: 'Wire the gate' } },
      ],
    },
    '2026-06-13T00:00:00Z',
  );
  this.asRoot = root;
});

When('the per-prompt task-census banner renders', function (this: AutoSurfaceWorld) {
  this.asBanner = buildTaskCensusLine(this.asRoot!);
});

Then('the banner names that task title as the next step', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.asRoot!, { recursive: true, force: true });
  assert.ok(this.asBanner, 'banner rendered (census non-empty)');
  assert.match(this.asBanner!, /следующее:/, 'banner carries a next-step line');
  assert.match(this.asBanner!, /Wire the gate/, 'banner names the concrete next open task title');
});

// SPECGEN004_179 (FR-49d): the stale-marker reconciler flags an all-green in-progress
// task but never auto-closes — it points at set_entity_status. Drives the REAL
// findStaleInProgress + renderStaleReport.
Given(
  'an in-progress task whose mapped scenarios all passed plus a sibling in-progress task still red',
  function (this: AutoSurfaceWorld) {
    const scen = (id: string, result: string) => ({ id, type: 'Scenario', tags: [], lastResult: result, file: '.specs/demo/x.feature' });
    const task = (id: string, doneWhen: string, title: string) =>
      ({ id, type: 'Task', status: 'in-progress', refs: [], doneWhen, title, file: '.specs/demo/TASKS.md' });
    const nodes = new Map<string, unknown>([
      ['SCEN-specgen004-01-pass', scen('SCEN-specgen004-01-pass', 'PASSED')],
      ['SCEN-specgen004-02-fail', scen('SCEN-specgen004-02-fail', 'FAILED')],
      ['demo:T-stale', task('demo:T-stale', 'closed by SPECGEN004_01', 'Stale one')], // all green → flag
      ['demo:T-real', task('demo:T-real', 'closed by SPECGEN004_02', 'Real WIP')], // a red → not stale
    ]);
    this.staleGraph = { nodes } as unknown as SpecGraph;
  },
);

When('the stale-marker reconciler scans the graph', function (this: AutoSurfaceWorld) {
  this.staleResult = findStaleInProgress(this.staleGraph!);
  this.staleReport = renderStaleReport(this.staleResult);
});

Then(
  'only the all-green in-progress task is flagged and the report points at set_entity_status to close it',
  function (this: AutoSurfaceWorld) {
    assert.deepEqual(this.staleResult!.map((s) => s.id), ['demo:T-stale'], 'only the all-green in-progress task flagged');
    assert.match(this.staleReport!, /set_entity_status/, 'report points at the close command');
    assert.match(this.staleReport!, /NOT auto-closed/i, 'flag-only — never auto-closes');
  },
);
