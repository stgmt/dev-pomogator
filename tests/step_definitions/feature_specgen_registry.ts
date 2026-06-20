/**
 * @feature17 step definitions for spec-backlog resolver registry smoke tests
 * (SPECGEN004_290-293).
 *
 * These cover the listResolvers() / findResolver() public API of the resolver registry —
 * the lookup workers used by the cross-spec reconcile skill (FR-17).
 * All steps call the REAL exported functions — no mocks, no file inspection.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_290-293
 * @see .specs/spec-generator-v4/FR.md FR-17 · tools/spec-backlog/resolvers/registry.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { findResolver, listResolvers } from '../../tools/spec-backlog/resolvers/registry.ts';
import type { Resolver } from '../../tools/spec-backlog/resolvers/types.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

// ─── shared world ─────────────────────────────────────────────────────────────

interface RegistryWorld extends V4World {
  _resolvers?: Resolver[];
  _lookupName?: string;
  _lookupResult?: Resolver | undefined;
}

// The 8 canonical resolver names (same as the vitest twin).
const EXPECTED_NAMES = [
  'ac-author',
  'link-fixer',
  'scenario-writer',
  'fr-author',
  'decision-arbiter',
  'owner-picker',
  'cross-ref-linker',
  'wrap-deprecated-ref',
];

// ─── SPECGEN004_290 — listResolvers() returns all 8 ───────────────────────────

Given(
  /^the spec-backlog resolver registry is loaded$/,
  function (this: RegistryWorld) {
    // no setup needed — registry is a static singleton
  },
);

When(
  /^listResolvers\(\) is called$/,
  function (this: RegistryWorld) {
    this._resolvers = listResolvers();
  },
);

Then(
  /^it returns exactly 8 resolvers with names matching the canonical set$/,
  function (this: RegistryWorld) {
    const names = this._resolvers!.map((r) => r.name).sort();
    assert.deepEqual(names, [...EXPECTED_NAMES].sort(), 'all 8 canonical resolver names present');
    assert.equal(this._resolvers!.length, 8, 'exactly 8 resolvers, no extras');
  },
);

// ─── SPECGEN004_291 — findResolver(<name>) returns the matching instance ──────

When(
  /^findResolver is called with each of the 8 canonical resolver names$/,
  function (this: RegistryWorld) {
    // store the full list for the Then step to iterate
    this._resolvers = EXPECTED_NAMES.map((name) => findResolver(name)!);
  },
);

Then(
  /^each call returns a Resolver whose name matches the lookup key$/,
  function (this: RegistryWorld) {
    for (let i = 0; i < EXPECTED_NAMES.length; i++) {
      const name = EXPECTED_NAMES[i];
      const r = this._resolvers![i];
      assert.ok(r !== undefined, `findResolver("${name}") returned undefined`);
      assert.equal(r.name, name, `returned resolver name matches lookup key "${name}"`);
    }
  },
);

// ─── SPECGEN004_292 — findResolver(unknown) returns undefined ─────────────────

When(
  /^findResolver is called with an unknown resolver name "([^"]+)"$/,
  function (this: RegistryWorld, unknownName: string) {
    this._lookupName = unknownName;
    this._lookupResult = findResolver(unknownName);
  },
);

Then(
  /^findResolver returns undefined$/,
  function (this: RegistryWorld) {
    assert.equal(this._lookupResult, undefined, `findResolver("${this._lookupName}") must return undefined`);
  },
);

// ─── SPECGEN004_293 — every resolver exposes the Resolver interface ───────────

Then(
  /^every resolver exposes name description and resolve\(\) with correct types$/,
  function (this: RegistryWorld) {
    const resolvers = listResolvers();
    for (const r of resolvers) {
      assert.equal(typeof r.name, 'string', `${r.name}: name must be a string`);
      assert.ok(r.name.length > 0, `${r.name}: name must be non-empty`);
      assert.equal(typeof r.description, 'string', `${r.name}: description must be a string`);
      assert.ok(r.description.length > 10, `${r.name}: description must be more than 10 chars`);
      assert.equal(typeof r.resolve, 'function', `${r.name}: resolve must be a function`);
    }
  },
);
