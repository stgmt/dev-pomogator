/**
 * @feature51 step definitions (FR-51 — the universal BDD migrator) — SPECGEN004_199.
 *
 * Dogfoods the migrator's inventory stage: drives the REAL inventoryVitestSource on an inline
 * non-BDD test source covering all four case kinds, and asserts the classification — most
 * importantly that a case calling a SPAWNING HELPER (runHook) is `runtime` even though its own
 * body has no spawn (the helper-detection fix). Pure, deterministic, in-process — no spawn, no token.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_199
 * @see .specs/spec-generator-v4/FR.md FR-51 (FR-51a) · tools/bdd-migrator/inventory.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { inventoryVitestSource, type VitestInventory } from '../../tools/bdd-migrator/inventory.ts';
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
