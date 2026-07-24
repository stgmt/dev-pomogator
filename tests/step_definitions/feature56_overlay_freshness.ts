import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { compactScenarioOverlay, writeScenarioOverlayFromNdjson } from '../../scripts/bdd-overlay.mjs';
import { applyScenarioOverlayResults, parseScenarioOverlayFile } from '../../tools/spec-graph/parsers/scenario-overlay.ts';
import type { ScenarioNode } from '../../tools/spec-graph/types.ts';

interface F56World extends V4World {
  scenarios?: ScenarioNode[];
  overlayPath?: string;
  canonicalPath?: string;
  canonicalBefore?: string;
  compaction?: { before: number; after: number };
  writerArchive?: string;
}

// Build a minimal-but-valid cucumber-messages NDJSON so the writer path runs the
// real parser (parseScenarioResults) instead of hand-shaped overlay rows. Each name
// must embed a SLUG_ID (e.g. SPECGEN004_800) — that is what the parser extracts as
// scenario_id. Re-emitting the same names on every run yields duplicate append rows,
// which is exactly what the runtime compaction must collapse.
function cucumberMessagesNdjson(names: string[]): string {
  const feature = {
    gherkinDocument: {
      uri: 'features/fr56-writer.feature',
      feature: {
        location: { line: 1, column: 1 },
        keyword: 'Feature',
        name: 'FR56 writer',
        children: names.map((name, i) => ({
          scenario: { id: `scn-${i}`, location: { line: 2 + i, column: 3 }, keyword: 'Scenario', name, steps: [] },
        })),
      },
    },
  };
  const lines: unknown[] = [feature];
  names.forEach((name, i) => {
    const pickleId = `pk-${i}`;
    const pickleStepId = `ps-${i}`;
    const testCaseId = `tc-${i}`;
    const testStepId = `ts-${i}`;
    const testCaseStartedId = `tcs-${i}`;
    lines.push({ pickle: { id: pickleId, uri: 'features/fr56-writer.feature', name, tags: [], astNodeIds: [`scn-${i}`], steps: [{ id: pickleStepId, text: 'a passing step', astNodeIds: [] }] } });
    lines.push({ testCase: { id: testCaseId, pickleId, testSteps: [{ id: testStepId, pickleStepId }] } });
    lines.push({ testCaseStarted: { id: testCaseStartedId, testCaseId, timestamp: { seconds: 100, nanos: 0 } } });
    lines.push({ testStepFinished: { testCaseStartedId, testStepId, testStepResult: { status: 'PASSED' } } });
    lines.push({ testCaseFinished: { testCaseStartedId, timestamp: { seconds: 101, nanos: 0 } } });
  });
  return lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
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

Given('a cucumber-messages archive that reports the same scenarios on every run', function (this: F56World) {
  this.overlayPath = path.join(this.tempDir, 'writer-overlay.ndjson');
  this.writerArchive = path.join(this.tempDir, 'messages.ndjson');
  fs.writeFileSync(this.writerArchive, cucumberMessagesNdjson(['SPECGEN004_800 alpha bounded', 'SPECGEN004_801 beta bounded']));
});

When('the real overlay writer archives three runs with compaction enabled', function (this: F56World) {
  for (let run = 0; run < 3; run += 1) {
    const appended = writeScenarioOverlayFromNdjson(this.writerArchive!, {
      overlayPath: this.overlayPath,
      runId: `run-${run}`,
      source: 'run-bdd:full',
      compact: true,
    });
    // Each run must genuinely archive both scenarios — otherwise a bounded file would
    // be a false-green from the writer silently no-op'ing rather than compacting.
    assert.equal(appended, 2, `run ${run} archived ${appended} row(s)`);
  }
});

Then('the overlay holds exactly one row per scenario regardless of run count', function (this: F56World) {
  const rows = fs.readFileSync(this.overlayPath!, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  // 3 runs × 2 scenarios = 6 appends; runtime compaction must collapse to 2 rows.
  assert.equal(rows.length, 2);
  assert.deepEqual(
    new Set(rows.map((row) => row.scenario_id)),
    new Set(['SPECGEN004_800', 'SPECGEN004_801']),
  );
});
