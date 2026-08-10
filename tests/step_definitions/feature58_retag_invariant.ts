/**
 * @feature58 step definitions — SPECGEN004_693 retag invariant (AC-58.1/AC-58.3).
 *
 * Pins the P21-3 scenario-rot cleanup outcome on the REAL repository graph:
 *   • FR-19 (two-tier hard/soft hook policy) is covered ONLY by the true
 *     two-tier policy scenarios SPECGEN004_49/50 — never by the inherited
 *     v3 form-contract scenarios;
 *   • no scenario carries both @feature58 and @feature19;
 *   • FR-58 owns the migrated SPECGEN003 form-contract scenario set.
 *
 * No mocks — drives the production `buildGraph` orchestrator over the
 * repository checkout, exactly as production does.
 *
 * @see .specs/spec-generator-v4/FR.md FR-58
 * @see .specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md AC-58.1, AC-58.3
 * @see tools/spec-graph/builder.ts
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { scenarioKey } from '../../tools/spec-graph/coverage.ts';
import type { SpecGraph, ScenarioNode } from '../../tools/spec-graph/types.ts';
import type { V4World } from '../hooks/before-after.ts';

interface Feature58World extends V4World {
  graph?: SpecGraph;
  fr19Keys?: Set<string>;
  fr58Keys?: Set<string>;
}

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

Given('the spec-generator-v4 spec graph built from the real repository', function (this: Feature58World) {
  this.graph = buildGraph({ repoRoot: REPO_ROOT });
});

When('FR-{int} and FR-{int} tested-by coverage is read', function (this: Feature58World, first: number, second: number) {
  assert.equal(first, 19, 'this invariant scenario reads FR-19 first');
  assert.equal(second, 58, 'this invariant scenario reads FR-58 second');
  const fr19 = new Set<string>();
  const fr58 = new Set<string>();
  for (const e of this.graph!.edges) {
    if (e.type !== 'tested-by') continue;
    const key = scenarioKey(e.to) ?? e.to.toLowerCase();
    if (e.from === 'spec-generator-v4:FR-19') fr19.add(key);
    if (e.from === 'spec-generator-v4:FR-58') fr58.add(key);
  }
  this.fr19Keys = fr19;
  this.fr58Keys = fr58;
});

Then('FR-{int} is tested only by the two-tier policy scenarios SPECGEN004_{int} and SPECGEN004_{int}', function (this: Feature58World, fr: number, s1: number, s2: number) {
  assert.equal(fr, 19, 'the exact-coverage assertion targets FR-19');
  assert.deepEqual(
    [...this.fr19Keys!].sort(),
    [`specgen004_${s1}`, `specgen004_${s2}`].sort(),
    'FR-19 tested-by must be exactly the two-tier policy scenarios — inherited form-contract scenarios belong to FR-58',
  );
});

Then('no scenario tagged feature{int} is also tagged feature{int}', function (this: Feature58World, ownedTag: number, bannedTag: number) {
  assert.equal(ownedTag, 58, 'the ownership tag is feature58');
  assert.equal(bannedTag, 19, 'the banned tag is feature19');
  for (const n of this.graph!.nodes.values()) {
    if (n.type !== 'Scenario' || n.spec !== 'spec-generator-v4') continue;
    const tags: readonly string[] = (n as ScenarioNode).tags ?? [];
    if (tags.includes(`@feature${ownedTag}`)) {
      assert.ok(
        !tags.includes(`@feature${bannedTag}`),
        `scenario ${scenarioKey(n.id)} carries both @feature${ownedTag} and @feature${bannedTag}`,
      );
    }
  }
});

Then('FR-{int} owns at least {int} migrated SPECGEN{int} form-contract scenarios', function (this: Feature58World, fr: number, minimum: number, legacySpec: number) {
  assert.equal(fr, 58, 'the migrated form-contract owner is FR-58');
  assert.equal(legacySpec, 3, 'the migrated scenarios originate from SPECGEN003');
  const migratedOwned = [...this.fr58Keys!].filter((key) => key.startsWith(`specgen00${legacySpec}_`));
  assert.ok(
    migratedOwned.length >= minimum,
    `expected at least ${minimum} migrated SPECGEN00${legacySpec} scenarios owned by FR-${fr}, found ${migratedOwned.length}`,
  );
});
