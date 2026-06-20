/**
 * @feature51 step definitions (FR-51 — the universal BDD migrator) — SPECGEN004_199, 287-289.
 *
 * SPECGEN004_199: Dogfoods the migrator's inventory stage: drives the REAL inventoryVitestSource on
 * an inline non-BDD test source covering all four case kinds, and asserts the classification — most
 * importantly that a case calling a SPAWNING HELPER (runHook) is `runtime` even though its own
 * body has no spawn (the helper-detection fix). Pure, deterministic, in-process — no spawn, no token.
 *
 * SPECGEN004_287-289: Drive the REAL parseScenarios() from migrate.ts against an inline fixture that
 * covers all three tag-state variants and the letter-suffix distinctness regression.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_199, SPECGEN004_287-289
 * @see .specs/spec-generator-v4/FR.md FR-51 (FR-51a) · tools/bdd-migrator/migrate.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { inventoryVitestSource, type VitestInventory } from '../../tools/bdd-migrator/inventory.ts';
import { parseScenarios, type ScenarioInfo } from '../../tools/bdd-migrator/migrate.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface MigratorWorld extends V4World {
  migSource?: string;
  migInv?: VitestInventory;
}

// A fixture that mirrors a real file's shapes: a relative prod import, a spawning helper, and one
// case per kind (runtime-via-helper / pure / artifact / manual).
const FIXTURE = [
  "import { foo } from '../foo.ts';",
  'function runHook(rows) { const res = spawnSync("node", ["x"]); return res.status; }',
  'let corpus;',
  "beforeEach(() => { corpus = '/tmp/x'; fs.writeFileSync(corpus + '/a', 'data'); });",
  "describe('DEMO: migrator fixture', () => {",
  "  it('DEMO_01: runtime via a spawning helper', () => { const s = runHook([1]); expect(s).toBe(0); });",
  "  it('DEMO_02: pure direct call', () => { expect(foo(1)).toBe(2); });",
  "  it('DEMO_03: artifact fs read', () => { const c = fs.readFileSync('/x', 'utf-8'); expect(c).toContain('y'); });",
  "  it.skip('DEMO_04: manual skipped', () => { expect(true).toBe(true); });",
  "  it('DEMO_05: artifact via a beforeEach fs-setup var', () => { expect(corpus).toBeTruthy(); });",
  '});',
].join('\n');

Given('a non-BDD test source with a spawning helper a pure call an fs read and a skipped case', function (this: MigratorWorld) {
  this.migSource = FIXTURE;
});

When('the migrator inventories that source', function (this: MigratorWorld) {
  this.migInv = inventoryVitestSource(this.migSource!, 'demo.test.ts');
});

Then(
  'the helper-calling case is runtime the direct call is pure the fs case is artifact and the skipped case is manual',
  function (this: MigratorWorld) {
    const byId = (id: string) => this.migInv!.cases.find((c) => c.id === id);
    assert.equal(this.migInv!.total, 5, 'all five cases inventoried');
    assert.equal(byId('DEMO_01')?.kind, 'runtime', 'a case calling a spawning helper is runtime (helper-detection)');
    assert.equal(byId('DEMO_02')?.kind, 'pure', 'a direct in-process call is pure');
    assert.equal(byId('DEMO_03')?.kind, 'artifact', 'an fs read in the body is artifact');
    assert.equal(byId('DEMO_04')?.kind, 'manual', 'an it.skip case is manual');
    assert.equal(byId('DEMO_05')?.kind, 'artifact', 'a case using a beforeEach fs-setup var is artifact (not falsely pure)');
    assert.ok(this.migInv!.prodImports.includes('../foo.ts'), 'the production import is captured for step-def reuse');
  },
);

// ─── SPECGEN004_287-289 — parseScenarios (migrate.ts) ─────────────────────────
//
// Three cases from the vitest twin tools/bdd-migrator/__tests__/migrate.test.ts:
//   287 — cardinality: N Scenario lines → N ScenarioInfo entries (no drop, no dup)
//   288 — tag-state: real @tag line / # comment / none
//   289 — id letter-suffix regression: SRC001_05b must stay distinct from SRC001_05

interface ParseScenariosWorld extends V4World {
  _parsedScenarios?: ScenarioInfo[];
}

// Inline feature fixture matching the original vitest test:
// - one real-tagged scenario   (@feature2 on its own line)
// - one comment-tagged scenario (# @feature2)
// - one untagged with letter-suffix id (SRC001_05b)
const PARSE_FIXTURE = `Feature: X

  @feature2
  Scenario: SRC001_02 real-tagged
    Given a

  # @feature2
  Scenario: SRC001_05 comment-tagged
    Given b

  Scenario: SRC001_05b untagged suffix
    Given c
`;

Given(
  /^a feature text with a real-tagged scenario a comment-tagged scenario and an untagged letter-suffix scenario$/,
  function (this: ParseScenariosWorld) {
    // fixture is baked in — world just signals readiness
    this._parsedScenarios = undefined;
  },
);

When(
  /^parseScenarios is called on that feature text$/,
  function (this: ParseScenariosWorld) {
    this._parsedScenarios = parseScenarios(PARSE_FIXTURE);
  },
);

Then(
  /^it returns exactly 3 ScenarioInfo entries with no duplicates$/,
  function (this: ParseScenariosWorld) {
    const parsed = this._parsedScenarios!;
    assert.equal(parsed.length, 3, 'cardinality: 3 Scenario lines → 3 entries');
    const ids = parsed.map((s) => s.id);
    assert.equal(new Set(ids).size, 3, 'no duplicate ids');
  },
);

Then(
  /^the tag states are "real" "comment" and "none" in order$/,
  function (this: ParseScenariosWorld) {
    const states = this._parsedScenarios!.map((s) => s.tagState);
    assert.deepEqual(states, ['real', 'comment', 'none'], 'tag-state sequence');
  },
);

Then(
  /^the ids are "SRC001_02" "SRC001_05" and "SRC001_05b" keeping the letter suffix distinct$/,
  function (this: ParseScenariosWorld) {
    const ids = this._parsedScenarios!.map((s) => s.id);
    assert.deepEqual(ids, ['SRC001_02', 'SRC001_05', 'SRC001_05b'], 'id extraction including letter suffix');
    assert.notEqual(ids[1], ids[2], 'SRC001_05b must not collapse into SRC001_05 (regression)');
  },
);
