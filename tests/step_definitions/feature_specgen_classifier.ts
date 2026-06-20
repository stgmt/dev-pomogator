/**
 * @FR-17 step-definitions for spec-backlog classifier pure-function unit tests
 * (SPECGEN004_272 – SPECGEN004_283).
 *
 * These cover the classify() routing function at a unit level.
 * The basename-glob PATH C cases (SPECGEN004_281–282) call globSync
 * against the REAL repo — repoRoot is derived from the step-def file
 * location, NOT from tempDir (which has no real files).
 *
 * All steps call the REAL exported classify() function — no mocks.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V4World } from '../hooks/before-after.ts';
import { classify, type InputFinding } from '../../tools/spec-backlog/classifier.ts';
import type { ClassificationResult } from '../../tools/spec-backlog/types.ts';

// ─── shared world ─────────────────────────────────────────────────────────────

interface ClassifierWorld extends V4World {
  _classResult?: ClassificationResult;
  _finding?: InputFinding;
}

// Derive repo root from this file's location:
// tests/step_definitions/feature_specgen_classifier.ts → up 3 levels
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ─── SPECGEN004_272  concept-overlap → NOISE ──────────────────────────────────

Given(
  /^a finding with code `cross-spec\/concept-overlap` and severity INFO$/,
  function (this: ClassifierWorld) {
    this._finding = { code: 'cross-spec/concept-overlap', severity: 'INFO' };
  },
);

When(
  /^classify is called on that finding for slug `foo`$/,
  function (this: ClassifierWorld) {
    this._classResult = classify('foo', this._finding!);
  },
);

Then(
  /^the classification verdict is NOISE$/,
  function (this: ClassifierWorld) {
    assert.equal(this._classResult!.verdict, 'NOISE', 'verdict must be NOISE');
  },
);

// ─── SPECGEN004_273  missing-cross-ref → BACKLOG/cross-ref-linker ────────────

Given(
  /^a finding with code `cross-spec\/missing-cross-ref`, spec_a `\.specs\/foo`, spec_b `\.specs\/bar`$/,
  function (this: ClassifierWorld) {
    this._finding = {
      code: 'cross-spec/missing-cross-ref',
      severity: 'INFO',
      referenced_in: '.specs/foo/FR.md:10',
      spec_a: '.specs/foo',
      spec_b: '.specs/bar',
    };
  },
);

Then(
  /^the classification verdict is BACKLOG with category `missing-cross-ref` and resolver `cross-ref-linker`$/,
  function (this: ClassifierWorld) {
    const r = this._classResult!;
    assert.equal(r.verdict, 'BACKLOG', 'verdict must be BACKLOG');
    assert.equal(r.entry!.category, 'missing-cross-ref', 'category must be missing-cross-ref');
    assert.equal(r.entry!.suggested_resolver, 'cross-ref-linker', 'resolver must be cross-ref-linker');
    // Classifier strips `.specs/` prefix from spec_a/spec_b
    assert.equal(r.entry!.evidence.spec_a, 'foo', 'spec_a must be bare slug without .specs/ prefix');
    assert.equal(r.entry!.evidence.spec_b, 'bar', 'spec_b must be bare slug without .specs/ prefix');
  },
);

// ─── SPECGEN004_274  dead-link/sibling-spec → BACKLOG missing-spec-file ──────

Given(
  /^a finding with code `impl-drift\/dead-link` and expected_path `ACCEPTANCE_CRITERIA\.md`$/,
  function (this: ClassifierWorld) {
    this._finding = {
      code: 'impl-drift/dead-link',
      severity: 'WARNING',
      referenced_in: '.specs/foo/FR.md:10',
      expected_path: 'ACCEPTANCE_CRITERIA.md',
    };
  },
);

Then(
  /^the classification verdict is BACKLOG with category `missing-spec-file` and resolver `ac-author`$/,
  function (this: ClassifierWorld) {
    const r = this._classResult!;
    assert.equal(r.verdict, 'BACKLOG', 'verdict must be BACKLOG');
    assert.equal(r.entry!.category, 'missing-spec-file', 'category must be missing-spec-file');
    assert.equal(r.entry!.suggested_resolver, 'ac-author', 'resolver must be ac-author');
  },
);

// ─── SPECGEN004_275  dead-link/case-typo → AUTO_FIX ─────────────────────────

Given(
  /^a finding with code `impl-drift\/dead-link` and expected_path `guide\.MD` \(uppercase extension\)$/,
  function (this: ClassifierWorld) {
    this._finding = {
      code: 'impl-drift/dead-link',
      severity: 'WARNING',
      expected_path: 'guide.MD',
    };
  },
);

Then(
  /^the classification verdict is AUTO_FIX$/,
  function (this: ClassifierWorld) {
    assert.equal(this._classResult!.verdict, 'AUTO_FIX', 'verdict must be AUTO_FIX');
  },
);

// ─── SPECGEN004_276  dead-link/multi-segment → BACKLOG dead-link-typo ────────

Given(
  /^a finding with code `impl-drift\/dead-link` and expected_path `tools\/spec-graph\/missing\.ts`$/,
  function (this: ClassifierWorld) {
    this._finding = {
      code: 'impl-drift/dead-link',
      severity: 'WARNING',
      expected_path: 'tools/spec-graph/missing.ts',
    };
  },
);

Then(
  /^the classification verdict is BACKLOG with category `dead-link-typo` and resolver `link-fixer`$/,
  function (this: ClassifierWorld) {
    const r = this._classResult!;
    assert.equal(r.verdict, 'BACKLOG', 'verdict must be BACKLOG');
    assert.equal(r.entry!.category, 'dead-link-typo', 'category must be dead-link-typo');
    assert.equal(r.entry!.suggested_resolver, 'link-fixer', 'resolver must be link-fixer');
  },
);

// ─── SPECGEN004_277  missing-test → BACKLOG scenario-writer ─────────────────

Given(
  /^a finding with code `impl-drift\/missing-test` and severity INFO$/,
  function (this: ClassifierWorld) {
    this._finding = { code: 'impl-drift/missing-test', severity: 'INFO' };
  },
);

Then(
  /^the classification verdict is BACKLOG with resolver `scenario-writer`$/,
  function (this: ClassifierWorld) {
    const r = this._classResult!;
    assert.equal(r.verdict, 'BACKLOG', 'verdict must be BACKLOG');
    assert.equal(r.entry!.suggested_resolver, 'scenario-writer', 'resolver must be scenario-writer');
  },
);

// ─── SPECGEN004_278  ownership-conflict → BACKLOG owner-picker (hard) ────────

Given(
  /^a finding with code `cross-spec\/module-ownership-conflict` and severity CRITICAL$/,
  function (this: ClassifierWorld) {
    this._finding = {
      code: 'cross-spec/module-ownership-conflict',
      severity: 'CRITICAL',
      spec_a: '.specs/foo (claims tools/x)',
      spec_b: '.specs/bar (claims tools/x)',
    };
  },
);

Then(
  /^the classification verdict is BACKLOG with resolver `owner-picker` and difficulty `hard`$/,
  function (this: ClassifierWorld) {
    const r = this._classResult!;
    assert.equal(r.verdict, 'BACKLOG', 'verdict must be BACKLOG');
    assert.equal(r.entry!.suggested_resolver, 'owner-picker', 'resolver must be owner-picker');
    assert.equal(r.entry!.difficulty, 'hard', 'difficulty must be hard');
  },
);

// ─── SPECGEN004_279  contradictory-nfr → BACKLOG decision-arbiter ────────────

Given(
  /^a finding with code `cross-spec\/contradictory-nfr` and severity CRITICAL$/,
  function (this: ClassifierWorld) {
    this._finding = {
      code: 'cross-spec/contradictory-nfr',
      severity: 'CRITICAL',
      spec_a: 'A',
      spec_b: 'B',
    };
  },
);

Then(
  /^the classification verdict is BACKLOG with resolver `decision-arbiter`$/,
  function (this: ClassifierWorld) {
    const r = this._classResult!;
    assert.equal(r.verdict, 'BACKLOG', 'verdict must be BACKLOG');
    assert.equal(r.entry!.suggested_resolver, 'decision-arbiter', 'resolver must be decision-arbiter');
  },
);

// ─── SPECGEN004_280  unrecognised code → BACKLOG/human (no silent loss) ──────

Given(
  /^a finding with an unrecognised code `made-up\/code`$/,
  function (this: ClassifierWorld) {
    this._finding = { code: 'made-up/code', severity: 'WARNING' };
  },
);

Then(
  /^the classification verdict is BACKLOG with category `unrecognised` and resolver `human`$/,
  function (this: ClassifierWorld) {
    const r = this._classResult!;
    assert.equal(r.verdict, 'BACKLOG', 'verdict must be BACKLOG');
    assert.equal(r.entry!.category, 'unrecognised', 'category must be unrecognised');
    assert.equal(r.entry!.suggested_resolver, 'human', 'resolver must be human');
  },
);

// ─── SPECGEN004_281  PATH C: no basename match → NOISE ───────────────────────
// These steps pass REPO_ROOT so globSync runs against the REAL repo.

Given(
  /^a finding with code `impl-drift\/dead-link` and expected_path `tools\/no-such-dir\/no-such-file-xyz-zzz-12345\.ts`$/,
  function (this: ClassifierWorld) {
    this._finding = {
      code: 'impl-drift/dead-link',
      severity: 'WARNING',
      referenced_in: '.specs/foo/FR.md:10',
      expected_path: 'tools/no-such-dir/no-such-file-xyz-zzz-12345.ts',
    };
  },
);

When(
  /^classify is called with repo context for slug `foo`$/,
  function (this: ClassifierWorld) {
    this._classResult = classify('foo', this._finding!, REPO_ROOT);
  },
);

Then(
  /^the classification verdict is NOISE because the file does not exist anywhere in the repo$/,
  function (this: ClassifierWorld) {
    const r = this._classResult!;
    assert.equal(r.verdict, 'NOISE', 'verdict must be NOISE');
    assert.ok(
      r.noiseReason?.match(/does not exist anywhere in repo/),
      `noiseReason must mention "does not exist anywhere in repo", got: ${r.noiseReason}`,
    );
  },
);

// ─── SPECGEN004_282  PATH C: exactly one basename match → BACKLOG dead-link-typo ─

Given(
  /^a finding with code `impl-drift\/dead-link` and expected_path `tools\/spec-backlog\/classifier\.ts`$/,
  function (this: ClassifierWorld) {
    this._finding = {
      code: 'impl-drift/dead-link',
      severity: 'WARNING',
      referenced_in: '.specs/foo/FR.md:10',
      expected_path: 'tools/spec-backlog/classifier.ts',
    };
  },
);

Then(
  /^the classification verdict is BACKLOG with category `dead-link-typo` \(exactly one basename match\)$/,
  function (this: ClassifierWorld) {
    const r = this._classResult!;
    assert.equal(r.verdict, 'BACKLOG', 'verdict must be BACKLOG');
    assert.equal(r.entry!.category, 'dead-link-typo', 'category must be dead-link-typo');
    assert.equal(r.entry!.suggested_resolver, 'link-fixer', 'resolver must be link-fixer');
  },
);

// ─── SPECGEN004_283  no repoRoot → falls back to dead-link-typo (backward compat) ─

Given(
  /^a finding with code `impl-drift\/dead-link` and expected_path `tools\/something\/that-may-or-may-not-exist\.ts`$/,
  function (this: ClassifierWorld) {
    this._finding = {
      code: 'impl-drift/dead-link',
      severity: 'WARNING',
      expected_path: 'tools/something/that-may-or-may-not-exist.ts',
    };
  },
);

When(
  /^classify is called WITHOUT repo context for slug `foo`$/,
  function (this: ClassifierWorld) {
    // No repoRoot supplied — basename pre-flight is skipped; pre-PATH-C routing applies.
    this._classResult = classify('foo', this._finding!);
  },
);

Then(
  /^the classification verdict is BACKLOG with category `dead-link-typo` \(backward compat, no repoRoot\)$/,
  function (this: ClassifierWorld) {
    const r = this._classResult!;
    assert.equal(r.verdict, 'BACKLOG', 'verdict must be BACKLOG');
    assert.equal(r.entry!.category, 'dead-link-typo', 'category must be dead-link-typo');
  },
);
