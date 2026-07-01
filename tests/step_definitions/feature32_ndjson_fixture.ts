/**
 * @feature32 step definitions (FR-32 — parseNdjson ground truth) — SPECGEN004_220.
 *
 * P3-rollout migration of tools/spec-graph/__tests__/ndjson-real-fixture.test.ts. Parses a REAL
 * captured cucumber-js NDJSON subset (not a hand-built one) and asserts the outcomes the tool
 * actually produced — pinning the two real-output behaviours synthetic fixtures faked: Windows
 * backslash uris normalise to POSIX keys, and a scenario with UNDEFINED/PENDING steps is NOT
 * reported PASSED. Drives the REAL parseNdjsonFile over the committed fixture. vitest twin kept.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_220
 * @see tools/spec-graph/parsers/ndjson.ts · tests/fixtures/ndjson/real-cucumber-sample.ndjson
 * @see .claude/rules/testing/verify-against-real-artifact.md
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { parseNdjsonFile } from '../../tools/spec-graph/parsers/ndjson.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

const FIXTURE = 'tests/fixtures/ndjson/real-cucumber-sample.ndjson';
const FEATURE = '.specs/spec-generator-v4/spec-generator-v4.feature';

interface NdWorld extends V4World {
  ndPatch?: ReturnType<typeof parseNdjsonFile>;
}

Given('the real captured cucumber NDJSON fixture', function () {
  // committed fixture; parsed in the When
});

When('parseNdjsonFile parses it', function (this: NdWorld) {
  this.ndPatch = parseNdjsonFile(FIXTURE);
});

Then('it yields exactly three scenarios keyed by POSIX paths with the passing one PASSED and the pending and undefined ones not collapsed to PASSED', function (this: NdWorld) {
  const p = this.ndPatch!;
  assert.equal(p.byLocation.size, 3, 'exactly the 3 captured scenarios');
  assert.ok([...p.byLocation.keys()].every((k) => !k.includes('\\')), 'keyed by POSIX path though the capture is from Windows');
  assert.equal(p.byLocation.get(`${FEATURE}:31`)?.lastResult, 'PASSED', 'the passing scenario (line 31)');
  assert.equal(p.byLocation.get(`${FEATURE}:86`)?.lastResult, 'PENDING', 'a PENDING scenario is not collapsed to PASSED (line 86)');
  assert.equal(p.byLocation.get(`${FEATURE}:242`)?.lastResult, 'UNDEFINED', 'an UNDEFINED scenario is not collapsed to PASSED (line 242)');
});
