/**
 * @FR-11 step-definitions for tag-predictor pure-function unit tests
 * (SPECGEN004_253 – SPECGEN004_261).
 *
 * These cover the internal functions of the tag predictor:
 *   predictTags, tokenize, extractFrs, renderTagSuggestions
 * at a unit level that complements the existing CLI-level SPECGEN004_176.
 *
 * All steps call the REAL exported functions — no production logic is copied.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import {
  predictTags,
  extractFrs,
  tokenize,
  renderTagSuggestions,
  type FrEntry,
  type TagSuggestion,
} from '../../tools/migrate-v3-to-v4/tag-predictor.ts';

// ─── shared world ────────────────────────────────────────────────────────────

interface TagWorld extends V4World {
  _featureSource?: string;
  _frs?: FrEntry[];
  _suggestions?: TagSuggestion[];
  _tokenizeResult?: string[];
  _extractFrsResult?: FrEntry[];
  _renderResult?: string;
}

// Standard FR catalog used across most scenarios
const STANDARD_FRS: FrEntry[] = [
  {
    frId: 'FR-001',
    title: 'User login and authentication',
    body: 'The system SHALL allow a user to login with email and password.',
  },
  {
    frId: 'FR-002',
    title: 'Export report to PDF',
    body: 'Generate a PDF export of the dashboard.',
  },
];

// ─── SPECGEN004_253  FR-11 worked example (untagged scenario gets suggestion) ──

Given(
  /^a feature file with an untagged scenario "([^"]+)"$/,
  function (this: TagWorld, scenarioName: string) {
    this._featureSource = `Feature: demo\n\n  Scenario: ${scenarioName}\n    Given the login page\n`;
    this._frs = STANDARD_FRS;
  },
);

When(
  /^predictTags is called with the standard FR catalog$/,
  function (this: TagWorld) {
    this._suggestions = predictTags(this._featureSource!, this._frs!);
  },
);

Then(
  /^the suggestion for "([^"]+)" is "([^"]+)" with a positive score$/,
  function (this: TagWorld, _scenarioName: string, expectedTag: string) {
    const s = this._suggestions![0];
    assert.equal(s.alreadyTagged, false, 'scenario must not be already tagged');
    assert.equal(s.suggestedTag, expectedTag, `suggestedTag must be ${expectedTag}`);
    assert.ok((s.score ?? 0) > 0, 'score must be positive');
  },
);

// ─── SPECGEN004_254  already-tagged scenario gets no suggestion ───────────────

Given(
  /^a feature file with an already-tagged scenario "@([^"]+)" "([^"]+)"$/,
  function (this: TagWorld, tag: string, scenarioName: string) {
    this._featureSource = `Feature: demo\n\n  @${tag}\n  Scenario: ${scenarioName}\n    Given a dashboard\n`;
    this._frs = STANDARD_FRS;
  },
);

Then(
  /^the suggestion has alreadyTagged=true and suggestedTag=null$/,
  function (this: TagWorld) {
    const s = this._suggestions![0];
    assert.equal(s.alreadyTagged, true, 'alreadyTagged must be true');
    assert.equal(s.suggestedTag, null, 'suggestedTag must be null for an already-tagged scenario');
  },
);

// ─── SPECGEN004_255  no suggestion when no FR is relevant ────────────────────

Given(
  /^a feature file with an untagged scenario about an unrelated topic$/,
  function (this: TagWorld) {
    this._featureSource =
      'Feature: demo\n\n  Scenario: Quantum teleportation of widgets\n    Given nothing\n';
    this._frs = STANDARD_FRS;
  },
);

Then(
  /^the suggestion has suggestedTag=null and frId=null$/,
  function (this: TagWorld) {
    const s = this._suggestions![0];
    assert.equal(s.alreadyTagged, false, 'alreadyTagged must be false');
    assert.equal(s.suggestedTag, null, 'suggestedTag must be null — no confident FR match');
    assert.equal(s.frId, null, 'frId must be null');
  },
);

// ─── SPECGEN004_256  Scenario Outline returns one suggestion per scenario ─────

Given(
  /^a feature file with a regular Scenario and a Scenario Outline$/,
  function (this: TagWorld) {
    this._featureSource =
      'Feature: demo\n\n' +
      '  Scenario: User logs in\n    Given x\n\n' +
      '  Scenario Outline: Export <fmt> report\n    Given y\n';
    this._frs = STANDARD_FRS;
  },
);

Then(
  /^predictTags returns two suggestions$/,
  function (this: TagWorld) {
    assert.equal(this._suggestions!.length, 2, 'must return one suggestion per scenario');
  },
);

Then(
  /^the first suggestion is "@FR-001" and the second is "@FR-002"$/,
  function (this: TagWorld) {
    assert.equal(this._suggestions![0].suggestedTag, '@FR-001', 'first scenario → @FR-001');
    assert.equal(this._suggestions![1].suggestedTag, '@FR-002', 'second scenario → @FR-002');
  },
);

// ─── SPECGEN004_257  high threshold suppresses weak matches ──────────────────

Given(
  /^a feature file with a weakly-matching untagged scenario "([^"]+)"$/,
  function (this: TagWorld, scenarioName: string) {
    this._featureSource = `Feature: demo\n\n  Scenario: ${scenarioName}\n    Given x\n`;
    this._frs = STANDARD_FRS;
  },
);

When(
  /^predictTags is called with threshold 0\.9$/,
  function (this: TagWorld) {
    this._suggestions = predictTags(this._featureSource!, this._frs!, { threshold: 0.9 });
  },
);

Then(
  /^the suggestion has suggestedTag=null because the score is below the threshold$/,
  function (this: TagWorld) {
    assert.equal(
      this._suggestions![0].suggestedTag,
      null,
      'weak match must be suppressed at threshold 0.9',
    );
  },
);

// ─── SPECGEN004_258  tokenize drops stopwords and short tokens ────────────────

When(
  /^tokenize is called with "([^"]+)"$/,
  function (this: TagWorld, input: string) {
    this._tokenizeResult = tokenize(input);
  },
);

Then(
  /^the result is \["([^"]+)"\]$/,
  function (this: TagWorld, expectedToken: string) {
    assert.deepEqual(
      this._tokenizeResult,
      [expectedToken],
      `tokenize must return exactly ["${expectedToken}"]`,
    );
  },
);

// ─── SPECGEN004_259  extractFrs handles both v3 and v4 heading formats ────────

Given(
  /^an FR\.md string with v3 heading "([^"]+)" and v4 heading "([^"]+)"$/,
  function (this: TagWorld, v3Heading: string, v4Heading: string) {
    // e.g. v3: "### Requirement: FR-7 Marksman LSP", v4: "## FR-8: Semantic judge"
    (this as TagWorld & { _frMarkdown?: string })._frMarkdown =
      `${v3Heading}\nbody one\n${v4Heading}\nbody two\n`;
  },
);

When(
  /^extractFrs is called on that markdown$/,
  function (this: TagWorld) {
    const w = this as TagWorld & { _frMarkdown?: string };
    this._extractFrsResult = extractFrs(w._frMarkdown!);
  },
);

Then(
  /^the result has frIds \["([^"]+)", "([^"]+)"\] and the first title is "([^"]+)"$/,
  function (this: TagWorld, id1: string, id2: string, title: string) {
    assert.deepEqual(
      this._extractFrsResult!.map((f) => f.frId),
      [id1, id2],
      `frIds must be [${id1}, ${id2}]`,
    );
    assert.equal(this._extractFrsResult![0].title, title, `first title must be "${title}"`);
  },
);

// ─── SPECGEN004_260  renderTagSuggestions lists only untagged scenarios ────────

Given(
  /^a feature file with one already-tagged and one untagged scenario$/,
  function (this: TagWorld) {
    this._featureSource =
      'Feature: demo\n\n' +
      '  @FR-002\n  Scenario: Export report\n    Given a\n\n' +
      '  Scenario: User logs in\n    Given b\n';
    this._frs = STANDARD_FRS;
  },
);

When(
  /^renderTagSuggestions is called with predictions from that feature file$/,
  function (this: TagWorld) {
    const suggestions = predictTags(this._featureSource!, this._frs!);
    this._renderResult = renderTagSuggestions('auth.feature', suggestions);
  },
);

Then(
  /^the rendered output contains "([^"]+)" and "@FR-001" but NOT "([^"]+)"$/,
  function (this: TagWorld, presentText: string, absentText: string) {
    assert.ok(
      this._renderResult!.includes(presentText),
      `rendered output must contain "${presentText}"`,
    );
    assert.ok(
      this._renderResult!.includes('@FR-001'),
      'rendered output must contain "@FR-001"',
    );
    assert.ok(
      !this._renderResult!.includes(absentText),
      `rendered output must NOT contain "${absentText}" (already tagged)`,
    );
  },
);

// ─── SPECGEN004_261  renderTagSuggestions returns empty string when all tagged ──

Given(
  /^a feature file where every scenario is already tagged$/,
  function (this: TagWorld) {
    this._featureSource =
      'Feature: demo\n\n  @FR-001\n  Scenario: User logs in\n    Given a\n';
    this._frs = STANDARD_FRS;
  },
);

When(
  /^renderTagSuggestions is called on that file$/,
  function (this: TagWorld) {
    const suggestions = predictTags(this._featureSource!, this._frs!);
    this._renderResult = renderTagSuggestions('auth.feature', suggestions);
  },
);

Then(
  /^the rendered output is an empty string$/,
  function (this: TagWorld) {
    assert.equal(this._renderResult, '', 'renderTagSuggestions must return empty string when all tagged');
  },
);
