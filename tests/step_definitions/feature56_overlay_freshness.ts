import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { compactScenarioOverlay } from '../../scripts/bdd-overlay.mjs';
import { applyScenarioOverlayResults, parseScenarioOverlayFile } from '../../tools/spec-graph/parsers/scenario-overlay.ts';
import type { ScenarioNode } from '../../tools/spec-graph/types.ts';

interface F56World extends V4World {
  scenarios?: ScenarioNode[];
  overlayPath?: string;
  canonicalPath?: string;
  canonicalBefore?: string;
  compaction?: { before: number; after: number };
}

function scenario(id: string, file: string): ScenarioNode {
  return { id, type: 'Scenario', title: id, file, line: 1, tags: [], astNodeIds: [] };
}

Given('legacy and commit-bound scenario overlay rows for the same scenarios', function (this: F56World) {
  const feature = path.join(this.tempDir, 'tests', 'features', 'fr56.feature');
  fs.mkdirSync(path.dirname(feature), { recursive: true });
  fs.writeFileSync(feature, 'Feature: FR56\n');
  this.scenarios = [scenario('SCEN-specgen004-575-fresh', feature), scenario('SCEN-specgen004-576-legacy', feature)];
  this.overlayPath = path.join(this.tempDir, 'overlay.ndjson');
  fs.writeFileSync(this.overlayPath, [
    JSON.stringify({ scenario_id: 'SPECGEN004_575', result: 'PASSED', time: '2099-01-01T00:00:00.000Z', run_id: 'fresh', source: 'docker-bdd:full', git_sha: 'head-sha', failing_step: { step: 'Given persisted failure', errorMessage: 'boom' }, trace_id: 'chunk.ndjson#trace-575', trace_file: 'chunk.ndjson' }),
    JSON.stringify({ scenario_id: 'SPECGEN004_576', result: 'PASSED', time: '2099-01-01T00:00:00.000Z', run_id: 'legacy', source: 'docker-bdd:full' }),
  ].join('\n') + '\n');
});

When('the real overlay reader evaluates them against the current commit', function (this: F56World) {
  const rows = parseScenarioOverlayFile(this.overlayPath!);
  applyScenarioOverlayResults(this.scenarios!, rows, { repoRoot: this.tempDir, currentGitSha: 'head-sha' });
});

Then('the matching commit pass is fresh and the legacy or mismatched pass is stale', function (this: F56World) {
  assert.equal(this.scenarios![0].resultStale, false);
  assert.equal(this.scenarios![1].resultStale, true);
});

Then('the trace response exposes commit provenance and the persisted failing step', function (this: F56World) {
  assert.equal(this.scenarios![0].trace?.gitSha, 'head-sha');
  assert.deepEqual(this.scenarios![0].failingStep, { step: 'Given persisted failure', errorMessage: 'boom' });
});

Given('an overlay file with repeated rows for multiple scenarios', function (this: F56World) {
  this.overlayPath = path.join(this.tempDir, 'overlay.ndjson');
  this.canonicalPath = path.join(this.tempDir, 'canonical.ndjson');
  this.canonicalBefore = '{"canonical":true}\n';
  fs.writeFileSync(this.canonicalPath, this.canonicalBefore);
  fs.writeFileSync(this.overlayPath, [
    { scenario_id: 'SPECGEN004_575', result: 'FAILED', time: '2026-01-01T00:00:00.000Z' },
    { scenario_id: 'SPECGEN004_576', result: 'PASSED', time: '2026-01-01T00:00:01.000Z' },
    { scenario_id: 'SPECGEN004_575', result: 'PASSED', time: '2026-01-01T00:00:02.000Z' },
  ].map((row) => JSON.stringify(row)).join('\n') + '\n');
});

When('the real overlay compactor rewrites the file', function (this: F56World) {
  this.compaction = compactScenarioOverlay(this.overlayPath!);
});

Then('one latest row per scenario remains and distinct-scenario cardinality is conserved', function (this: F56World) {
  const rows = fs.readFileSync(this.overlayPath!, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(this.compaction, { before: 3, after: 2 });
  assert.equal(new Set(rows.map((row) => row.scenario_id)).size, 2);
  assert.equal(rows.find((row) => row.scenario_id === 'SPECGEN004_575').result, 'PASSED');
});

Then('the canonical full-run artifact remains byte-identical', function (this: F56World) {
  assert.equal(fs.readFileSync(this.canonicalPath!, 'utf8'), this.canonicalBefore);
});
