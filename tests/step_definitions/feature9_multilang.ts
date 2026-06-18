/**
 * @feature9 step definitions (FR-9 — multi-language NDJSON adapter) — SPECGEN004_218/219.
 *
 * P3-rollout migration of tools/spec-graph/__tests__/multilang.test.ts (11 pure cases). Drives the
 * REAL detectRunner / ingestMultilang and cross-checks against parseNdjson. 218 pins language
 * detection from the `meta` envelope (incl. SpecFlow→reqnroll normalisation + resilience); 219 pins
 * that the adapter's patch is byte-equivalent to the canonical parseNdjson path. vitest twin kept
 * until the gate-switch.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_218/219 · FR.md FR-9
 * @see tools/spec-graph/parsers/multilang.ts · tools/spec-graph/parsers/ndjson.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { detectRunner, ingestMultilang } from '../../tools/spec-graph/parsers/multilang.ts';
import { parseNdjson } from '../../tools/spec-graph/parsers/ndjson.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

const envelope = (name: string) => JSON.stringify({ meta: { implementation: { name } } });
function buildStream(runnerName: string, line: number): string {
  return [
    envelope(runnerName),
    JSON.stringify({ gherkinDocument: { uri: 'tests/Auth.feature', feature: { children: [{ scenario: { id: 'sc-1', location: { line } } }] } } }),
    JSON.stringify({ pickle: { id: 'pk-1', uri: 'tests/Auth.feature', name: 'X', astNodeIds: ['sc-1'] } }),
    JSON.stringify({ testCase: { id: 'tc-1', pickleId: 'pk-1' } }),
    JSON.stringify({ testCaseStarted: { id: 'tcs-1', testCaseId: 'tc-1', timestamp: { seconds: 1_700_000_000, nanos: 0 } } }),
    JSON.stringify({ testCaseFinished: { testCaseStartedId: 'tcs-1', testStepResult: { status: 'PASSED' } } }),
  ].join('\n');
}

interface MlWorld extends V4World {
  mlDetect?: Record<string, string>;
  mlIngest?: {
    reqLang: string;
    reqKeys: string[];
    reqDirect: string[];
    reqResult?: string;
    behave: ReturnType<typeof ingestMultilang>;
    jvm: ReturnType<typeof ingestMultilang>;
  };
}

// --- 218: detectRunner ---
Given('NDJSON meta envelopes naming various runners plus an absent-meta and a malformed-leading-line input', function () {
  // inputs inline in the When
});

When('detectRunner reads each', function (this: MlWorld) {
  this.mlDetect = {
    js: detectRunner(envelope('cucumber-js')),
    reqnroll: detectRunner(envelope('Reqnroll')),
    jvm: detectRunner(envelope('cucumber-jvm')),
    behave: detectRunner(envelope('behave')),
    specflow: detectRunner(envelope('SpecFlow')),
    unknown: detectRunner(envelope('whatever')),
    absent: detectRunner(JSON.stringify({ pickle: { id: 'pk-1' } })),
    malformed: detectRunner('not-json\n' + envelope('Reqnroll')),
  };
});

Then('it names cucumber-js reqnroll cucumber-jvm and behave normalises SpecFlow to reqnroll returns unknown for an unknown name or absent meta and recovers past a malformed leading line', function (this: MlWorld) {
  const d = this.mlDetect!;
  assert.equal(d.js, 'cucumber-js');
  assert.equal(d.reqnroll, 'reqnroll');
  assert.equal(d.jvm, 'cucumber-jvm');
  assert.equal(d.behave, 'behave');
  assert.equal(d.specflow, 'reqnroll', 'SpecFlow legacy normalises to reqnroll');
  assert.equal(d.unknown, 'unknown');
  assert.equal(d.absent, 'unknown', 'absent meta → unknown');
  assert.equal(d.malformed, 'reqnroll', 'recovers past a malformed leading line');
});

// --- 219: ingestMultilang parser-path equivalence ---
Given('multi-language NDJSON streams from Reqnroll behave and cucumber-jvm', function () {
  // streams built in the When
});

When('ingestMultilang ingests each', function (this: MlWorld) {
  const req = ingestMultilang(buildStream('Reqnroll', 7));
  this.mlIngest = {
    reqLang: req.language,
    reqKeys: [...req.patch.byLocation.keys()],
    reqDirect: [...parseNdjson(buildStream('Reqnroll', 7)).byLocation.keys()],
    reqResult: req.patch.byLocation.get('tests/Auth.feature:7')?.lastResult,
    behave: ingestMultilang(buildStream('behave', 12)),
    jvm: ingestMultilang(buildStream('cucumber-jvm', 3)),
  };
});

Then('it reports the detected language and a patch keyed by the scenario location with PASSED matching parseNdjson directly', function (this: MlWorld) {
  const m = this.mlIngest!;
  assert.equal(m.reqLang, 'reqnroll');
  assert.deepEqual(m.reqKeys, m.reqDirect, 'the adapter patch keys are byte-equivalent to parseNdjson');
  assert.equal(m.reqResult, 'PASSED', 'Reqnroll scenario at line 7 is PASSED');
  assert.equal(m.behave.language, 'behave');
  assert.equal(m.behave.patch.byLocation.get('tests/Auth.feature:12')?.lastResult, 'PASSED');
  assert.equal(m.jvm.language, 'cucumber-jvm');
  assert.equal(m.jvm.patch.byLocation.get('tests/Auth.feature:3')?.lastResult, 'PASSED');
});
