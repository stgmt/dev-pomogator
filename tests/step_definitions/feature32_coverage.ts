/**
 * @feature32 step definitions (FR-32 — coverage rollup) — SPECGEN004_201+.
 *
 * P3-rollout migration of tools/spec-graph/__tests__/coverage.test.ts (23 pure cases, done by
 * describe-block in passes). This first block migrates `scenarioKey` — drives the REAL normaliser
 * in-process (pure, deterministic). The vitest twin stays until the gate-switch.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_201
 * @see tools/spec-graph/coverage.ts (scenarioKey)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { scenarioKey } from '../../tools/spec-graph/coverage.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface CovWorld extends V4World {
  covKeys?: Record<string, string | null>;
}

Given('the coverage scenarioKey normaliser', function () {
  // pure function — applied in the When
});

When('it normalises a slug node id a raw Done-When mention a legacy-typo id and plain prose', function (this: CovWorld) {
  this.covKeys = {
    slug: scenarioKey('SCEN-specgen004-70-spec-status-derives'),
    mention: scenarioKey('@feature32 SPECGEN004_71 passes'),
    typo: scenarioKey('SCENGEN004_55 implements edges'),
    prose: scenarioKey('just some prose'),
  };
});

Then('it yields the canonical specgen004 id tolerates the legacy SCENGEN typo and returns null for prose', function (this: CovWorld) {
  const k = this.covKeys!;
  assert.equal(k.slug, 'specgen004_70', 'a slug node id normalises to the canonical id');
  assert.equal(k.mention, 'specgen004_71', 'a raw Done-When mention normalises');
  assert.equal(k.typo, 'specgen004_55', 'the legacy SCENGEN004 typo is tolerated');
  assert.equal(k.prose, null, 'plain prose with no id yields null');
});
