/**
 * Unit tests for the Cucumber Messages NDJSON ingester (Phase 1, FR-2).
 *
 * Pin the four Phase-1 invariants: the ingester maps pickleId → uri + line via
 * the `gherkinDocument` + `pickle` envelopes, `testCaseFinished` envelopes are
 * folded into a single status per scenario, durations are computed from
 * start/finish timestamps, and `applyTestResults` mutates only matching
 * scenarios (the rest are untouched).
 */

import { describe, it, expect } from 'vitest';
import { parseNdjson, applyTestResults } from '../parsers/ndjson.ts';
import type { ScenarioNode } from '../types.ts';

/** Build a single NDJSON line from an envelope object. */
const env = (e: unknown): string => JSON.stringify(e);

function buildNdjsonStream(opts: {
  uri: string;
  scenarioId: string;
  scenarioLine: number;
  pickleId: string;
  pickleName: string;
  testCaseId: string;
  testCaseStartedId: string;
  status: 'PASSED' | 'FAILED' | 'PENDING';
  startSeconds?: number;
  finishSeconds?: number;
  failingMessage?: string;
}): string {
  const lines: string[] = [];
  lines.push(env({ meta: { protocolVersion: '32.2.0' } }));
  lines.push(
    env({
      gherkinDocument: {
        uri: opts.uri,
        feature: {
          children: [
            { scenario: { id: opts.scenarioId, location: { line: opts.scenarioLine } } },
          ],
        },
      },
    }),
  );
  lines.push(
    env({
      pickle: {
        id: opts.pickleId,
        uri: opts.uri,
        name: opts.pickleName,
        tags: [],
        astNodeIds: [opts.scenarioId],
      },
    }),
  );
  lines.push(env({ testCase: { id: opts.testCaseId, pickleId: opts.pickleId } }));
  lines.push(
    env({
      testCaseStarted: {
        id: opts.testCaseStartedId,
        testCaseId: opts.testCaseId,
        timestamp: { seconds: opts.startSeconds ?? 1_700_000_000, nanos: 0 },
      },
    }),
  );
  if (opts.status === 'FAILED' && opts.failingMessage) {
    lines.push(
      env({
        testStepFinished: {
          testCaseStartedId: opts.testCaseStartedId,
          testStepResult: { status: 'FAILED', message: opts.failingMessage },
        },
      }),
    );
  }
  lines.push(
    env({
      testCaseFinished: {
        testCaseStartedId: opts.testCaseStartedId,
        testStepResult: { status: opts.status },
        timestamp: { seconds: opts.finishSeconds ?? 1_700_000_002, nanos: 0 },
      },
    }),
  );
  return lines.join('\n');
}

describe('parseNdjson — result extraction from canonical envelopes', () => {
  it('returns PASSED with duration for a clean run', () => {
    const stream = buildNdjsonStream({
      uri: 'tests/Auth.feature',
      scenarioId: 'sc-1',
      scenarioLine: 5,
      pickleId: 'pk-1',
      pickleName: 'Login',
      testCaseId: 'tc-1',
      testCaseStartedId: 'tcs-1',
      status: 'PASSED',
      startSeconds: 1_700_000_000,
      finishSeconds: 1_700_000_003,
    });

    const patch = parseNdjson(stream);
    const fields = patch.byLocation.get('tests/Auth.feature:5');
    expect(fields).toBeDefined();
    expect(fields!.lastResult).toBe('PASSED');
    expect(fields!.durationMs).toBe(3000);
    expect(fields!.failingStep).toBeNull();
    expect(fields!.lastRunAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('captures the failing-step message on FAILED', () => {
    const stream = buildNdjsonStream({
      uri: 't.feature',
      scenarioId: 'sc-1',
      scenarioLine: 10,
      pickleId: 'pk-1',
      pickleName: 'X',
      testCaseId: 'tc-1',
      testCaseStartedId: 'tcs-1',
      status: 'FAILED',
      failingMessage: 'AssertionError: expected 2, got 3',
    });

    const patch = parseNdjson(stream);
    const fields = patch.byLocation.get('t.feature:10');
    expect(fields!.lastResult).toBe('FAILED');
    expect(fields!.failingStep).toEqual({
      step: '',
      errorMessage: 'AssertionError: expected 2, got 3',
    });
  });

  it('survives invalid JSON lines without aborting the run', () => {
    const stream = [
      'not-json',
      '',
      env({ meta: { protocolVersion: '32.2.0' } }),
      'still not json',
      env({
        gherkinDocument: {
          uri: 't.feature',
          feature: { children: [{ scenario: { id: 'sc-1', location: { line: 3 } } }] },
        },
      }),
      env({ pickle: { id: 'pk-1', uri: 't.feature', name: 'X', astNodeIds: ['sc-1'] } }),
      env({ testCase: { id: 'tc-1', pickleId: 'pk-1' } }),
      env({ testCaseStarted: { id: 'tcs-1', testCaseId: 'tc-1', timestamp: { seconds: 1, nanos: 0 } } }),
      env({
        testCaseFinished: {
          testCaseStartedId: 'tcs-1',
          testStepResult: { status: 'PASSED' },
        },
      }),
    ].join('\n');

    const patch = parseNdjson(stream);
    expect(patch.byLocation.get('t.feature:3')!.lastResult).toBe('PASSED');
  });

  it('produces an empty patch for an empty stream', () => {
    const patch = parseNdjson('');
    expect(patch.byLocation.size).toBe(0);
  });
});

describe('applyTestResults — mutates only matching scenarios', () => {
  function scen(id: string, file: string, line: number): ScenarioNode {
    return { id, type: 'Scenario', file, line, tags: [], steps: [] };
  }

  it('mutates the matching scenario, leaves others untouched', () => {
    const s1 = scen('SCEN-a', 'a.feature', 3);
    const s2 = scen('SCEN-b', 'b.feature', 5);
    const stream = buildNdjsonStream({
      uri: 'a.feature',
      scenarioId: 'sc-1',
      scenarioLine: 3,
      pickleId: 'pk-1',
      pickleName: 'A',
      testCaseId: 'tc-1',
      testCaseStartedId: 'tcs-1',
      status: 'PASSED',
    });
    const patch = parseNdjson(stream);

    const applied = applyTestResults([s1, s2], patch);
    expect(applied).toBe(1);
    expect(s1.lastResult).toBe('PASSED');
    expect(s2.lastResult).toBeUndefined();
  });

  it('returns 0 when no scenarios match the patch', () => {
    const stream = buildNdjsonStream({
      uri: 'x.feature',
      scenarioId: 'sc-1',
      scenarioLine: 10,
      pickleId: 'pk-1',
      pickleName: 'X',
      testCaseId: 'tc-1',
      testCaseStartedId: 'tcs-1',
      status: 'PASSED',
    });
    const patch = parseNdjson(stream);
    const applied = applyTestResults([scen('SCEN-a', 'a.feature', 3)], patch);
    expect(applied).toBe(0);
  });
});
