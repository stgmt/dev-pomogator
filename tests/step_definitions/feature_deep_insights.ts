/**
 * PLUGIN008 step definitions — deep-insights aggregate-facets.sh.
 *
 * Migrated from tests/e2e/deep-insights.test.ts. Drives the REAL bash script
 * `.claude/skills/deep-insights/scripts/aggregate-facets.sh` (spawned with a per-scenario HOME
 * pointing at a temp `.claude/usage-data/facets/` tree of real JSON facet fixtures) and asserts its
 * REAL JSON output keys (verify-against-real-artifact: the JSON shape was captured from the live
 * script — status/facets_count/observer_count/outcomes/friction_summary/satisfaction/date_range —
 * the old orphan feature asserted `helpfulness`/`success_rate` keys the script never emits).
 *
 * The two original file-inspection cases (LF line endings / executable bit) are intentionally NOT
 * migrated — they are anti-patterns (integration-tests-first / tui-pilot-tests) carrying no behaviour.
 *
 * @see tests/features/plugins/suggest-rules/PLUGIN008_deep-insights.feature
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, '.claude', 'skills', 'deep-insights', 'scripts', 'aggregate-facets.sh');

interface DiWorld extends V4World {
  diHome?: string;
  diFacets?: string;
  diExit?: number;
  diJson?: Record<string, unknown>;
}

function facetsDir(this: DiWorld): string {
  if (!this.diHome) this.diHome = fs.mkdtempSync(path.join(this.tempDir, 'di-home-'));
  const d = path.join(this.diHome, '.claude', 'usage-data', 'facets');
  this.diFacets = d;
  return d;
}
function writeFacet(this: DiWorld, name: string, data: Record<string, unknown>): void {
  const d = facetsDir.call(this);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, name), JSON.stringify(data, null, 2));
}
function sampleFacet(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    session_id: 'aaa-work-1', outcome: 'fully_achieved', session_type: 'single_task',
    friction_counts: { wrong_approach: 1 }, friction_detail: 'a plain string not an array',
    goal_categories: { feature_implementation: 1 }, claude_helpfulness: 'very_helpful',
    primary_success: 'multi_file_changes', user_satisfaction_counts: { happy: 1, satisfied: 0, frustrated: 0 },
    brief_summary: 'User implemented a feature and ran tests.', underlying_goal: 'Implement feature X', ...over,
  };
}
function observerFacet(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    session_id: 'zzz-observer-1', outcome: 'partially_achieved', session_type: 'exploration',
    friction_counts: {}, friction_detail: '', goal_categories: { warmup_minimal: 1 },
    claude_helpfulness: 'slightly_helpful', primary_success: 'none', user_satisfaction_counts: { likely_satisfied: 1 },
    brief_summary: 'Memory observer agent watched the primary session reading files.',
    underlying_goal: 'Observe and record the primary Claude session', ...over,
  };
}
function runFacets(this: DiWorld): void {
  // If no facet was written, the facets dir must not exist (the "missing dir" path).
  const home = this.diHome ?? (this.diHome = fs.mkdtempSync(path.join(this.tempDir, 'di-home-')));
  try {
    const out = execSync(`bash "${SCRIPT}"`, { encoding: 'utf-8', env: { ...process.env, HOME: home } });
    this.diExit = 0; this.diJson = JSON.parse(out);
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer };
    this.diExit = err.status ?? 1;
    this.diJson = JSON.parse(err.stdout?.toString() || '{}');
  }
}

Given('a deep-insights facets directory that does not exist', function (this: DiWorld) {
  this.diHome = fs.mkdtempSync(path.join(this.tempDir, 'di-home-')); // home exists, facets subdir does NOT
});
Given('a deep-insights facets directory that exists but is empty', function (this: DiWorld) {
  const d = facetsDir.call(this);
  fs.mkdirSync(d, { recursive: true });
});
Given('a deep-insights facets directory with valid work sessions', function (this: DiWorld) {
  writeFacet.call(this, 's1.json', sampleFacet({ session_id: 'aaa-1', outcome: 'fully_achieved' }));
  writeFacet.call(this, 's2.json', sampleFacet({ session_id: 'bbb-2', outcome: 'partially_achieved', friction_counts: { buggy_code: 2 } }));
});
Given('a deep-insights facet with a string friction_detail', function (this: DiWorld) {
  writeFacet.call(this, 's1.json', sampleFacet({ friction_detail: 'totally a string, not an array' }));
});
Given('a deep-insights facet with an object goal_categories', function (this: DiWorld) {
  writeFacet.call(this, 's1.json', sampleFacet({ goal_categories: { feature_implementation: 2, bugfix: 1 } }));
});
Given('a deep-insights facet with a string claude_helpfulness', function (this: DiWorld) {
  writeFacet.call(this, 's1.json', sampleFacet({ claude_helpfulness: 'very_helpful' }));
});
Given('a deep-insights facets directory with work and observer sessions', function (this: DiWorld) {
  writeFacet.call(this, 'work.json', sampleFacet({ session_id: 'aaa-work', outcome: 'fully_achieved' }));
  writeFacet.call(this, 'obs.json', observerFacet({ session_id: 'zzz-obs' }));
});
Given('a deep-insights facet flagged observer by its goal_categories', function (this: DiWorld) {
  writeFacet.call(this, 'work.json', sampleFacet({ session_id: 'aaa-work', outcome: 'fully_achieved' }));
  // observer detected ONLY by the goal marker — brief_summary deliberately carries no observer text.
  writeFacet.call(this, 'obs.json', observerFacet({ session_id: 'zzz-obs', goal_categories: { memory_observation_creation: 1 }, brief_summary: 'A normal summary, no marker word here.' }));
});
Given('a deep-insights warmup_minimal facet with no observer markers', function (this: DiWorld) {
  writeFacet.call(this, 'warm.json', sampleFacet({ session_id: 'aaa-warm', goal_categories: { warmup_minimal: 1 }, brief_summary: 'A quick warmup task, nothing about watching.' }));
});

When('aggregate-facets.sh runs over that deep-insights home', function (this: DiWorld) {
  runFacets.call(this);
});

Then('the deep-insights output is valid JSON with status {string}', function (this: DiWorld, status: string) {
  assert.ok(this.diJson && typeof this.diJson === 'object', 'output must be valid JSON');
  assert.equal(this.diExit, 0, 'aggregate-facets.sh must exit 0');
  assert.equal(this.diJson!.status, status, `status must be ${status}`);
});
Then('the deep-insights facets_count is {int}', function (this: DiWorld, n: number) {
  assert.equal(this.diJson!.facets_count, n);
});
Then('the deep-insights output carries the aggregate arrays', function (this: DiWorld) {
  assert.ok((this.diJson!.facets_count as number) > 0, 'facets_count > 0');
  assert.ok(Array.isArray(this.diJson!.outcomes), 'outcomes array present');
  assert.ok(Array.isArray(this.diJson!.friction_summary), 'friction_summary array present');
  assert.ok(this.diJson!.satisfaction && typeof this.diJson!.satisfaction === 'object', 'satisfaction object present');
  assert.ok(this.diJson!.date_range && typeof this.diJson!.date_range === 'object', 'date_range present');
});
Then('the deep-insights work count is {int} and observer count is {int}', function (this: DiWorld, work: number, obs: number) {
  assert.equal(this.diJson!.facets_count, work, 'facets_count counts ONLY work sessions');
  assert.equal(this.diJson!.observer_count, obs, 'observer_count counts observer sessions');
});
