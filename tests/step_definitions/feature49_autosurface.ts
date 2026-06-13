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
import { writeTaskCensusCache } from '../../tools/spec-graph/task-census.ts';
import { buildTaskCensusLine } from '../../tools/specs-validator/conformance-summary.ts';

interface AutoSurfaceWorld extends V4World {
  asRoot?: string;
  asBanner?: string | null;
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
