/**
 * @FR-43 step definitions — SPECGEN004_156. Binds the REAL legacy-triage
 * classifier (Phase 18) on an isolated temp corpus: it SUSPECTS a superseded
 * feature (old-version ids + lineage header inside a newer spec) WITHOUT
 * auto-retiring it, and does NOT flag a plain not_run feature (not_run alone is
 * not abandonment — most features just run under a different test config).
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_156
 * @see .specs/spec-generator-v4/FR.md FR-43
 * @see tools/specs-generator/legacy-triage.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraphFromCwd } from '../../tools/spec-graph/builder.ts';
import { computeLegacyTriage, type TriageReport } from '../../tools/specs-generator/legacy-triage.ts';

interface TriageWorld extends V4World {
  report?: TriageReport;
}

Given('a v4 spec holding an old-version feature file and a plain not-run feature', function (this: TriageWorld) {
  const dir = path.join(this.tempDir, '.specs', 'demo-v4');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Demo\n\nBody.\n');
  // legacy.feature — v3 ids inside the v4 spec + a self-documented lineage header.
  fs.writeFileSync(
    path.join(dir, 'legacy.feature'),
    '# Legacy v3 scenarios preserved as part of the v3 → v4 consolidation\n@FR-1\nFeature: Legacy\n  Scenario: SPECGEN003_01 old behaviour\n    Given a step\n',
  );
  // normal.feature — also not_run (no result), but NO abandonment signal.
  fs.writeFileSync(
    path.join(dir, 'normal.feature'),
    '@FR-1\nFeature: Normal\n  Scenario: SPECGEN999_01 current behaviour\n    Given a step\n',
  );
});

When('the legacy-triage classifier runs over the graph', function (this: TriageWorld) {
  this.report = computeLegacyTriage(buildGraphFromCwd(this.tempDir), this.tempDir);
});

Then('the old-version feature is suspected SUPERSEDED with its lineage evidence', function (this: TriageWorld) {
  const c = this.report!.candidates.find((x) => x.file.endsWith('demo-v4/legacy.feature'));
  assert.ok(c, `legacy.feature not flagged: ${JSON.stringify(this.report!.candidates.map((x) => x.file))}`);
  assert.equal(c!.suspected, 'SUPERSEDED');
  assert.ok(c!.signals.some((s) => /SPECGEN003/.test(s)), 'must cite the older-version id signal');
  assert.ok(c!.signals.some((s) => /lineage|consolidat/i.test(s)), 'must cite the lineage-header signal');
});

// NB: `\(` escapes the literal paren — Cucumber Expressions read `(...)` as an OPTIONAL
// group, so an unescaped paren makes the step text not match (the 2026-06-11 undefined-step).
Then('the plain not-run feature is not flagged \\(not_run alone is not abandonment)', function (this: TriageWorld) {
  const flagged = this.report!.candidates.some((x) => x.file.endsWith('demo-v4/normal.feature'));
  assert.equal(flagged, false, 'a plain not_run feature (no positive signal) must NOT be a candidate');
});

Then('nothing is retired automatically', function (this: TriageWorld) {
  // FR-43c: the classifier only REPORTS — both files are untouched on disk.
  const dir = path.join(this.tempDir, '.specs', 'demo-v4');
  assert.ok(fs.existsSync(path.join(dir, 'legacy.feature')), 'the suspected file must NOT be auto-moved/deleted');
  assert.ok(fs.existsSync(path.join(dir, 'normal.feature')));
});
