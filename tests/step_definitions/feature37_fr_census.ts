/**
 * @feature37 step definitions — the deterministic per-FR census (FR-37), bound
 * to the REAL handler (`computeFrCensus`) over a graph built by the REAL builder
 * (`buildGraphFromCwd`) from a temp fixture corpus — no hand-injected graph.
 *
 * Closes META-finding #0 (audit-reports/v4-deep-gap-analysis-2026-06-10.md): an
 * LLM "FR census" reported FR-43 IMPLEMENTED while its tasks were todo. The
 * deterministic census derives status from graph evidence, so a single done
 * task among open tasks reads IN_PROGRESS, never IMPLEMENTED.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_154
 * @see .specs/spec-generator-v4/FR.md FR-37
 * @see tools/spec-graph/fr-census.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraphFromCwd } from '../../tools/spec-graph/builder.ts';
import {
  computeFrCensus,
  type FrCensusReport,
  type FrCensusVerdict,
} from '../../tools/spec-graph/fr-census.ts';

interface CensusWorld extends V4World {
  census?: FrCensusReport;
}

const ALL_VERDICTS: ReadonlySet<FrCensusVerdict> = new Set([
  'IMPLEMENTED',
  'DONE_UNTESTED',
  'IN_PROGRESS',
  'PLANNED',
  'UNIMPLEMENTED',
]);

Given(
  'a fixture corpus where one FR has a done task and an open task and another FR is marked done with no passing scenario',
  function (this: CensusWorld) {
    const specDir = path.join(this.tempDir, '.specs', 'census-demo');
    fs.mkdirSync(specDir, { recursive: true });
    // FR-1 → a done task AND a todo task (the META-#0 trap).
    // FR-2 → a single done task whose Done-When cites no scenario (false-green).
    fs.writeFileSync(
      path.join(specDir, 'FR.md'),
      ['## FR-1: Partially built requirement', '', 'Body.', '', '## FR-2: Claimed-done requirement', '', 'Body.', ''].join('\n'),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(specDir, 'TASKS.md'),
      [
        '# Tasks',
        '',
        '## Phase 1',
        '',
        // NB: refs are harvested as `\bFR-\d+\b` — mirror the REAL TASKS.md
        // `[FR-N](FR.md#fr-n)` form; a bare `FR-1_` glues the trailing `_` and
        // breaks the word boundary (the integration test caught exactly this).
        '- [x] Build half — id: t1-done — Status: DONE',
        '  _Requirements: [FR-1](FR.md#fr-1)_',
        '',
        '- [ ] Build the rest — id: t1-open — Status: TODO',
        '  _Requirements: [FR-1](FR.md#fr-1)_',
        '',
        '- [x] Shipped without a test — id: t2-done — Status: DONE',
        '  _Requirements: [FR-2](FR.md#fr-2)_',
        '',
      ].join('\n'),
      'utf-8',
    );
  },
);

When('the deterministic fr-census runs over the built graph', function (this: CensusWorld) {
  const graph = buildGraphFromCwd(this.tempDir);
  this.census = computeFrCensus(graph);
});

Then('the FR with an open task reads IN_PROGRESS not IMPLEMENTED', function (this: CensusWorld) {
  const row = this.census!.rows.find((r) => r.frId === 'census-demo:FR-1');
  assert.ok(row, `FR-1 census row missing: ${this.census!.rows.map((r) => r.frId).join(', ')}`);
  assert.equal(row!.verdict, 'IN_PROGRESS', `a done task among open tasks must read IN_PROGRESS, got ${row!.verdict}`);
  assert.notEqual(row!.verdict, 'IMPLEMENTED', 'a single done task must NOT false-green the FR (META-#0)');
});

Then('the FR marked done with no test reads DONE_UNTESTED in the false-green list', function (this: CensusWorld) {
  const row = this.census!.rows.find((r) => r.frId === 'census-demo:FR-2');
  assert.ok(row, 'FR-2 census row missing');
  assert.equal(row!.verdict, 'DONE_UNTESTED', `an all-done FR with no passing scenario must read DONE_UNTESTED, got ${row!.verdict}`);
  assert.ok(this.census!.falseGreen.includes('census-demo:FR-2'), 'the false-green list must name the unproven DONE claim');
  assert.equal(this.census!.verdict, 'RED', 'a DONE_UNTESTED FR makes the census gate RED');
});

Then('every FR appears exactly once and the per-verdict counts conserve', function (this: CensusWorld) {
  const ids = this.census!.rows.map((r) => r.frId);
  assert.equal(new Set(ids).size, ids.length, 'no FR may appear twice (cardinality)');
  const sum = Object.values(this.census!.byVerdict).reduce((a, b) => a + b, 0);
  assert.equal(sum, this.census!.rows.length, 'per-verdict counts must conserve to the row count');
  for (const r of this.census!.rows) assert.ok(ALL_VERDICTS.has(r.verdict), `unknown verdict ${r.verdict}`);
});

Then(
  'the census classifies every FR of the live spec-generator-v4 corpus by graph evidence',
  function (this: CensusWorld) {
    // LIVE integration over the REAL corpus + REAL builder (mirrors SPECGEN004_98).
    const repoRoot = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
    const report = computeFrCensus(buildGraphFromCwd(repoRoot), { spec: 'spec-generator-v4' });
    assert.ok(report.rows.length >= 40, `expected the v4 spec's ~44 FRs, got ${report.rows.length}`);
    for (const r of report.rows) assert.ok(ALL_VERDICTS.has(r.verdict), `FR ${r.frId} has an unknown verdict ${r.verdict}`);
    // Deterministic on graph EVIDENCE (task Status), not on the volatile in-progress run. This test runs
    // DURING the canonical suite that is mid-WRITING `.last-test-run.ndjson`; the verified IMPLEMENTED
    // count depends on scenario results that may not be flushed yet, so `IMPLEMENTED > 0` self-referentially
    // flaked (a partial ndjson → every FR reads DONE_UNTESTED instead of IMPLEMENTED → false 0). Assert
    // instead on ALL-DONE FRs (IMPLEMENTED ∪ DONE_UNTESTED) — both are derived from task Status in the
    // graph, independent of run timing — so the "classified by graph evidence, not narrated" intent holds
    // deterministically. The verified-vs-unverified split is pinned by the controlled-fixture unit cases above.
    const allDone = report.byVerdict.IMPLEMENTED + report.byVerdict.DONE_UNTESTED;
    assert.ok(allDone > 0, `the live corpus must have ≥1 all-tasks-done FR derived from graph status, got ${allDone}`);
  },
);
