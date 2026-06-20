/**
 * @FR-11 step-definitions for converter pure-function unit tests
 * (SPECGEN004_262 – SPECGEN004_270).
 *
 * These cover convertSource and renderDiff at a unit level that complements
 * the existing CLI-level SPECGEN004_24/25/176. All steps call the REAL
 * exported functions — no production logic is copied or mocked.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import { convertSource, renderDiff, type ConversionResult } from '../../tools/migrate-v3-to-v4/converter.ts';

// ─── shared world ─────────────────────────────────────────────────────────────

interface ConverterWorld extends V4World {
  _convResult?: ConversionResult;
  _diffOutput?: string;
  _inputSource?: string;
}

// ─── SPECGEN004_262  ## heading converts legacy to v4 format ─────────────────

Given(
  /^a v3 source with `## Requirement: FR-001 Login flow`$/,
  function (this: ConverterWorld) {
    this._inputSource = '## Requirement: FR-001 Login flow\n\nbody\n';
  },
);

When(
  /^convertSource is called on that source$/,
  function (this: ConverterWorld) {
    this._convResult = convertSource(this._inputSource!);
  },
);

Then(
  /^the result has changed=true with before `([^`]+)` and after `([^`]+)`$/,
  function (this: ConverterWorld, expectedBefore: string, expectedAfter: string) {
    const r = this._convResult!;
    assert.equal(r.changed, true, 'changed must be true');
    assert.equal(r.changes.length, 1, 'must have exactly one change');
    assert.equal(r.changes[0].before, expectedBefore, `before must be "${expectedBefore}"`);
    assert.equal(r.changes[0].after, expectedAfter, `after must be "${expectedAfter}"`);
  },
);

Then(
  /^newSource contains `([^`]+)` and does NOT contain `([^`]+)`$/,
  function (this: ConverterWorld, present: string, absent: string) {
    const r = this._convResult!;
    assert.ok(r.newSource.includes(present), `newSource must contain "${present}"`);
    assert.ok(!r.newSource.includes(absent), `newSource must NOT contain "${absent}"`);
  },
);

// ─── SPECGEN004_263  ### heading converts legacy to v4 format ─────────────────

Given(
  /^a v3 source with `### Requirement: FR-001 Login flow`$/,
  function (this: ConverterWorld) {
    this._inputSource = '### Requirement: FR-001 Login flow\n\nbody\n';
  },
);

// SPECGEN004_263 reuses the When/Then steps from SPECGEN004_262

// ─── SPECGEN004_264  #### heading converts legacy to v4 format ───────────────

Given(
  /^a v3 source with `#### Requirement: FR-001 Login flow`$/,
  function (this: ConverterWorld) {
    this._inputSource = '#### Requirement: FR-001 Login flow\n\nbody\n';
  },
);

// SPECGEN004_264 reuses the When/Then steps from SPECGEN004_262

// ─── SPECGEN004_265  idempotent — modern v4 heading is left unchanged ─────────

Given(
  /^a source with modern v4 heading `### FR-001: Login`$/,
  function (this: ConverterWorld) {
    this._inputSource = '### FR-001: Login\nbody\n';
  },
);

Then(
  /^the result has changed=false and newSource equals the input byte-for-byte$/,
  function (this: ConverterWorld) {
    const r = this._convResult!;
    assert.equal(r.changed, false, 'changed must be false for already-v4 heading');
    assert.equal(r.newSource, this._inputSource!, 'newSource must equal input exactly');
  },
);

// ─── SPECGEN004_266  body content and Jira trace lines preserved ─────────────

Given(
  /^a v3 source with a legacy heading and a Jira trace line `_Jira: PROJ-42_`$/,
  function (this: ConverterWorld) {
    this._inputSource = [
      '## Requirement: FR-001 Login',
      '',
      '_Jira: PROJ-42_',
      '',
      'Body paragraph with `inline code`.',
      '',
    ].join('\n');
  },
);

Then(
  /^newSource contains `_Jira: PROJ-42_` and `Body paragraph with` and `## FR-001: Login`$/,
  function (this: ConverterWorld) {
    const ns = this._convResult!.newSource;
    assert.ok(ns.includes('_Jira: PROJ-42_'), 'Jira trace line must be preserved');
    assert.ok(ns.includes('Body paragraph with'), 'body text must be preserved');
    assert.ok(ns.includes('## FR-001: Login'), 'converted heading must be present');
  },
);

// ─── SPECGEN004_267  multiple legacy headings in one file ─────────────────────

Given(
  /^a v3 source with two legacy headings FR-001 and FR-002$/,
  function (this: ConverterWorld) {
    this._inputSource = [
      '### Requirement: FR-001 First',
      'body1',
      '### Requirement: FR-002 Second',
      'body2',
    ].join('\n');
  },
);

Then(
  /^the result has 2 changes with frIds \["FR-001", "FR-002"\]$/,
  function (this: ConverterWorld) {
    const r = this._convResult!;
    assert.equal(r.changes.length, 2, 'must have exactly 2 changes');
    assert.deepEqual(
      r.changes.map((c) => c.frId),
      ['FR-001', 'FR-002'],
      'frIds must be ["FR-001", "FR-002"]',
    );
  },
);

// ─── SPECGEN004_268  no legacy headings returns changed=false ─────────────────

Given(
  /^a source with no legacy headings \(only `# Doc` and `## Section`\)$/,
  function (this: ConverterWorld) {
    this._inputSource = '# Doc\n\n## Section\n';
  },
);

Then(
  /^the result has changed=false and an empty changes array$/,
  function (this: ConverterWorld) {
    const r = this._convResult!;
    assert.equal(r.changed, false, 'changed must be false');
    assert.deepEqual(r.changes, [], 'changes array must be empty');
  },
);

// ─── SPECGEN004_269  body prose containing "Requirement:" is NOT matched ──────

Given(
  /^a source where `Requirement: FR-001` appears only in body prose, not as a heading$/,
  function (this: ConverterWorld) {
    this._inputSource = 'See the Requirement: FR-001 in the design doc.\n';
  },
);

Then(
  /^convertSource returns changed=false \(heading-anchored regex does not match prose\)$/,
  function (this: ConverterWorld) {
    assert.equal(this._convResult!.changed, false, 'prose Requirement: must not be matched');
  },
);

// ─── SPECGEN004_270  renderDiff returns empty string when nothing changed ──────

Given(
  /^a conversion result with changed=false for `# Doc`$/,
  function (this: ConverterWorld) {
    this._convResult = convertSource('# Doc\n');
  },
);

When(
  /^renderDiff is called with filename `test\.md`$/,
  function (this: ConverterWorld) {
    this._diffOutput = renderDiff('test.md', this._convResult!);
  },
);

Then(
  /^the diff output is an empty string$/,
  function (this: ConverterWorld) {
    assert.equal(this._diffOutput, '', 'renderDiff must return empty string when nothing changed');
  },
);

// ─── SPECGEN004_271  renderDiff emits unified-diff-ish block ─────────────────

Given(
  /^a conversion result from `## Requirement: FR-001 Login`$/,
  function (this: ConverterWorld) {
    this._convResult = convertSource('## Requirement: FR-001 Login\n');
  },
);

When(
  /^renderDiff is called with filename `\.specs\/auth\/FR\.md`$/,
  function (this: ConverterWorld) {
    this._diffOutput = renderDiff('.specs/auth/FR.md', this._convResult!);
  },
);

Then(
  /^the diff output contains `--- \.specs\/auth\/FR\.md \(v3\)` and `\+\+\+ \.specs\/auth\/FR\.md \(v4\)`$/,
  function (this: ConverterWorld) {
    const d = this._diffOutput!;
    assert.ok(d.includes('--- .specs/auth/FR.md (v3)'), 'must contain v3 header');
    assert.ok(d.includes('+++ .specs/auth/FR.md (v4)'), 'must contain v4 header');
  },
);

Then(
  /^the diff output contains `- ## Requirement: FR-001 Login` and `\+ ## FR-001: Login`$/,
  function (this: ConverterWorld) {
    const d = this._diffOutput!;
    assert.ok(d.includes('- ## Requirement: FR-001 Login'), 'must contain old line');
    assert.ok(d.includes('+ ## FR-001: Login'), 'must contain new line');
  },
);
