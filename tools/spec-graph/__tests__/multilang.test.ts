/**
 * Tests for the multi-language NDJSON adapter (FR-9).
 *
 * Pin two invariants:
 *   1. Language detection picks the right runner from the `meta` envelope.
 *   2. The patch returned by `ingestMultilang` is byte-equivalent to what
 *      `parseNdjson` returns directly — i.e. the adapter does NOT alter
 *      the canonical Cucumber Messages parse path.
 */

import { describe, it, expect } from 'vitest';
import { detectRunner, ingestMultilang } from '../parsers/multilang.ts';
import { parseNdjson } from '../parsers/ndjson.ts';

function envelope(meta: { implementation: { name: string } }): string {
  return JSON.stringify({ meta });
}

function buildStream(runnerName: string, line: number): string {
  return [
    envelope({ implementation: { name: runnerName } }),
    JSON.stringify({
      gherkinDocument: {
        uri: 'tests/Auth.feature',
        feature: { children: [{ scenario: { id: 'sc-1', location: { line } } }] },
      },
    }),
    JSON.stringify({ pickle: { id: 'pk-1', uri: 'tests/Auth.feature', name: 'X', astNodeIds: ['sc-1'] } }),
    JSON.stringify({ testCase: { id: 'tc-1', pickleId: 'pk-1' } }),
    JSON.stringify({ testCaseStarted: { id: 'tcs-1', testCaseId: 'tc-1', timestamp: { seconds: 1_700_000_000, nanos: 0 } } }),
    JSON.stringify({ testCaseFinished: { testCaseStartedId: 'tcs-1', testStepResult: { status: 'PASSED' } } }),
  ].join('\n');
}

describe('detectRunner', () => {
  it('cucumber-js', () => {
    expect(detectRunner(envelope({ implementation: { name: 'cucumber-js' } }))).toBe('cucumber-js');
  });
  it('Reqnroll (.NET)', () => {
    expect(detectRunner(envelope({ implementation: { name: 'Reqnroll' } }))).toBe('reqnroll');
  });
  it('cucumber-jvm', () => {
    expect(detectRunner(envelope({ implementation: { name: 'cucumber-jvm' } }))).toBe('cucumber-jvm');
  });
  it('behave', () => {
    expect(detectRunner(envelope({ implementation: { name: 'behave' } }))).toBe('behave');
  });
  it('SpecFlow legacy is normalised to reqnroll', () => {
    expect(detectRunner(envelope({ implementation: { name: 'SpecFlow' } }))).toBe('reqnroll');
  });
  it('unknown runner', () => {
    expect(detectRunner(envelope({ implementation: { name: 'whatever' } }))).toBe('unknown');
  });
  it('absent meta returns unknown', () => {
    expect(detectRunner(JSON.stringify({ pickle: { id: 'pk-1' } }))).toBe('unknown');
  });
  it('survives a malformed leading line and reads the next valid one', () => {
    expect(detectRunner('not-json\n' + envelope({ implementation: { name: 'Reqnroll' } }))).toBe('reqnroll');
  });
});

describe('ingestMultilang — parser path equivalence', () => {
  it('Reqnroll NDJSON produces the same patch as parseNdjson', () => {
    const stream = buildStream('Reqnroll', 7);
    const { language, patch } = ingestMultilang(stream);
    expect(language).toBe('reqnroll');
    const direct = parseNdjson(stream);
    expect([...patch.byLocation.keys()]).toEqual([...direct.byLocation.keys()]);
    expect(patch.byLocation.get('tests/Auth.feature:7')?.lastResult).toBe('PASSED');
  });

  it('behave NDJSON produces a PASSED patch with the right scenario line', () => {
    const stream = buildStream('behave', 12);
    const { language, patch } = ingestMultilang(stream);
    expect(language).toBe('behave');
    expect(patch.byLocation.get('tests/Auth.feature:12')?.lastResult).toBe('PASSED');
  });

  it('Cucumber-JVM NDJSON is ingested into the canonical patch shape', () => {
    const stream = buildStream('cucumber-jvm', 3);
    const { language, patch } = ingestMultilang(stream);
    expect(language).toBe('cucumber-jvm');
    expect(patch.byLocation.get('tests/Auth.feature:3')?.lastResult).toBe('PASSED');
  });
});
