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

describe('parseNdjson — real cucumber output (regression: worst-of-steps + Windows uris)', () => {
  // The other fixtures inject `testStepResult.status` into `testCaseFinished` —
  // a field real cucumber-js does NOT emit. These build the REAL shape: the
  // status lives only in per-step `testStepFinished`, and `testCaseFinished`
  // carries no status. Before the fix these scenarios all reported PASSED.
  const realStream = (uri: string, scenarioLine: number, stepStatuses: string[]): string => {
    const L: string[] = [];
    L.push(env({ gherkinDocument: { uri, feature: { children: [{ scenario: { id: 'sc', location: { line: scenarioLine } } }] } } }));
    L.push(env({ pickle: { id: 'pk', uri, name: 'X', tags: [], astNodeIds: ['sc'], steps: stepStatuses.map((_, i) => ({ id: `ps${i}`, text: `step ${i}` })) } }));
    L.push(env({ testCase: { id: 'tc', pickleId: 'pk', testSteps: stepStatuses.map((_, i) => ({ id: `ts${i}`, pickleStepId: `ps${i}` })) } }));
    L.push(env({ testCaseStarted: { id: 'tcs', testCaseId: 'tc', timestamp: { seconds: 1, nanos: 0 } } }));
    for (let i = 0; i < stepStatuses.length; i++) {
      L.push(env({ testStepFinished: { testCaseStartedId: 'tcs', testStepId: `ts${i}`, testStepResult: { status: stepStatuses[i] } } }));
    }
    L.push(env({ testCaseFinished: { testCaseStartedId: 'tcs', timestamp: { seconds: 2, nanos: 0 } } }));
    return L.join('\n');
  };

  it('an UNDEFINED step makes the scenario UNDEFINED, not PASSED', () => {
    const patch = parseNdjson(realStream('t.feature', 7, ['PASSED', 'UNDEFINED', 'SKIPPED']));
    expect(patch.byLocation.get('t.feature:7')!.lastResult).toBe('UNDEFINED');
  });
  it('a PENDING step makes the scenario PENDING, not PASSED', () => {
    const patch = parseNdjson(realStream('t.feature', 9, ['PASSED', 'PENDING', 'SKIPPED']));
    expect(patch.byLocation.get('t.feature:9')!.lastResult).toBe('PENDING');
  });
  it('all-PASSED steps make the scenario PASSED', () => {
    const patch = parseNdjson(realStream('t.feature', 11, ['PASSED', 'PASSED']));
    expect(patch.byLocation.get('t.feature:11')!.lastResult).toBe('PASSED');
  });
  it('normalises Windows backslash uris to a POSIX location key', () => {
    const patch = parseNdjson(realStream('.specs\\foo\\bar.feature', 3, ['UNDEFINED']));
    expect(patch.byLocation.has('.specs/foo/bar.feature:3')).toBe(true);
  });
});

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

  it('worst-of-merge on key collision: a later PASSED must NOT hide an earlier FAILED', () => {
    // Two Scenario-Outline example rows resolve to the SAME scenario line (s1→5).
    // pk1 FAILED, pk2 PASSED, pk2 finishes LAST. A plain last-writer set would let the
    // PASSED overwrite the FAILED (false-green); worst-of-merge keeps FAILED.
    const stream = [
      { gherkinDocument: { uri: 'f.feature', feature: { children: [{ scenario: { id: 's1', location: { line: 5 } } }] } } },
      { pickle: { id: 'pk1', uri: 'f.feature', astNodeIds: ['s1'], steps: [{ id: 'ps1', text: 'a step' }] } },
      { pickle: { id: 'pk2', uri: 'f.feature', astNodeIds: ['s1'], steps: [{ id: 'ps2', text: 'a step' }] } },
      { testCase: { id: 'tc1', pickleId: 'pk1', testSteps: [{ id: 'ts1', pickleStepId: 'ps1' }] } },
      { testCase: { id: 'tc2', pickleId: 'pk2', testSteps: [{ id: 'ts2', pickleStepId: 'ps2' }] } },
      { testCaseStarted: { id: 'tcs1', testCaseId: 'tc1' } },
      { testStepFinished: { testCaseStartedId: 'tcs1', testStepId: 'ts1', testStepResult: { status: 'FAILED', message: 'boom' } } },
      { testCaseFinished: { testCaseStartedId: 'tcs1' } },
      { testCaseStarted: { id: 'tcs2', testCaseId: 'tc2' } },
      { testStepFinished: { testCaseStartedId: 'tcs2', testStepId: 'ts2', testStepResult: { status: 'PASSED' } } },
      { testCaseFinished: { testCaseStartedId: 'tcs2' } },
    ].map((o) => JSON.stringify(o)).join('\n');
    const patch = parseNdjson(stream);
    const fields = patch.byLocation.get('f.feature:5');
    expect(fields?.lastResult).toBe('FAILED');
    expect(fields?.failingStep?.errorMessage).toBe('boom');
  });

  it('a testCaseFinished explicit status may RAISE but must not HIDE a FAILED step', () => {
    // An explicit PASSED on testCaseFinished must not overwrite the worst-of-steps
    // FAILED (false-green). Explicit can only promote severity, never lower it.
    const stream = [
      { gherkinDocument: { uri: 'f.feature', feature: { children: [{ scenario: { id: 's1', location: { line: 7 } } }] } } },
      { pickle: { id: 'pk1', uri: 'f.feature', astNodeIds: ['s1'], steps: [{ id: 'ps1', text: 'a' }] } },
      { testCase: { id: 'tc1', pickleId: 'pk1', testSteps: [{ id: 'ts1', pickleStepId: 'ps1' }] } },
      { testCaseStarted: { id: 'tcs1', testCaseId: 'tc1' } },
      { testStepFinished: { testCaseStartedId: 'tcs1', testStepId: 'ts1', testStepResult: { status: 'FAILED', message: 'x' } } },
      { testCaseFinished: { testCaseStartedId: 'tcs1', testStepResult: { status: 'PASSED' } } },
    ].map((o) => JSON.stringify(o)).join('\n');
    expect(parseNdjson(stream).byLocation.get('f.feature:7')?.lastResult).toBe('FAILED');
  });

  // Property-style (manual generator, no fast-check dep): a scenario's result is the
  // WORST-severity step status — never a lower one (the false-green class). Severity:
  // FAILED>AMBIGUOUS>UNDEFINED>PENDING>SKIPPED>PASSED.
  const SEV = ['PASSED', 'SKIPPED', 'PENDING', 'UNDEFINED', 'AMBIGUOUS', 'FAILED'];
  function streamForSteps(statuses: string[]): string {
    return [
      { gherkinDocument: { uri: 'f.feature', feature: { children: [{ scenario: { id: 's1', location: { line: 3 } } }] } } },
      { pickle: { id: 'pk1', uri: 'f.feature', astNodeIds: ['s1'], steps: statuses.map((_, i) => ({ id: 'ps' + i, text: 's' + i })) } },
      { testCase: { id: 'tc1', pickleId: 'pk1', testSteps: statuses.map((_, i) => ({ id: 'ts' + i, pickleStepId: 'ps' + i })) } },
      { testCaseStarted: { id: 'tcs1', testCaseId: 'tc1' } },
      ...statuses.map((s, i) => ({ testStepFinished: { testCaseStartedId: 'tcs1', testStepId: 'ts' + i, testStepResult: { status: s } } })),
      { testCaseFinished: { testCaseStartedId: 'tcs1' } },
    ].map((o) => JSON.stringify(o)).join('\n');
  }

  it('INVARIANT worst-of-steps: scenario result = max-severity step, over many step combos + orders', () => {
    // Cover every ordered pair + a few triples; the order must NOT matter.
    const combos: string[][] = [];
    for (const a of SEV) for (const b of SEV) combos.push([a, b]);
    combos.push(['PASSED', 'FAILED', 'PASSED'], ['SKIPPED', 'PASSED', 'PENDING'], ['PASSED', 'UNDEFINED', 'PASSED', 'PASSED']);
    for (const steps of combos) {
      const want = steps.reduce((w, s) => (SEV.indexOf(s) > SEV.indexOf(w) ? s : w), 'PASSED');
      const got = parseNdjson(streamForSteps(steps)).byLocation.get('f.feature:3')?.lastResult;
      expect(got, `steps=[${steps.join(',')}] → worst should be ${want}, got ${got}`).toBe(want);
    }
  });

  it('clamps a negative duration (clock skew: finish timestamp before start) to 0', () => {
    const stream = [
      { gherkinDocument: { uri: 'f.feature', feature: { children: [{ scenario: { id: 's1', location: { line: 9 } } }] } } },
      { pickle: { id: 'pk1', uri: 'f.feature', astNodeIds: ['s1'], steps: [{ id: 'ps1', text: 'a' }] } },
      { testCase: { id: 'tc1', pickleId: 'pk1', testSteps: [{ id: 'ts1', pickleStepId: 'ps1' }] } },
      { testCaseStarted: { id: 'tcs1', testCaseId: 'tc1', timestamp: { seconds: 10, nanos: 0 } } },
      { testStepFinished: { testCaseStartedId: 'tcs1', testStepId: 'ts1', testStepResult: { status: 'PASSED' } } },
      { testCaseFinished: { testCaseStartedId: 'tcs1', timestamp: { seconds: 9, nanos: 0 } } },
    ].map((o) => JSON.stringify(o)).join('\n');
    expect(parseNdjson(stream).byLocation.get('f.feature:9')?.durationMs).toBe(0);
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

  it('matches a relative-keyed scenario against an ABSOLUTE file:// uri (suffix fallback)', () => {
    // Some cucumber invocations emit absolute uris; the graph keys scenarios relative.
    // Without the suffix fallback the exact lookup misses → every result is dropped →
    // scenarios falsely read not_run (the windows-path incident class).
    const s = scen('SCEN-a', 'dir/a.feature', 3);
    const stream = buildNdjsonStream({
      uri: 'file:///D:/repo/dir/a.feature',
      scenarioId: 'sc-1',
      scenarioLine: 3,
      pickleId: 'pk-1',
      pickleName: 'A',
      testCaseId: 'tc-1',
      testCaseStartedId: 'tcs-1',
      status: 'PASSED',
    });
    const applied = applyTestResults([s], parseNdjson(stream));
    expect(applied).toBe(1);
    expect(s.lastResult).toBe('PASSED');
  });

  it('does NOT suffix-match a different file with a colliding tail', () => {
    // `/notdir/a.feature` must not satisfy a scenario keyed `dir/a.feature` (the
    // `/`-anchored suffix prevents `…notdir/a.feature` false matches).
    const s = scen('SCEN-a', 'dir/a.feature', 3);
    const stream = buildNdjsonStream({
      uri: 'file:///D:/repo/xdir/a.feature',
      scenarioId: 'sc-1',
      scenarioLine: 3,
      pickleId: 'pk-1',
      pickleName: 'A',
      testCaseId: 'tc-1',
      testCaseStartedId: 'tcs-1',
      status: 'PASSED',
    });
    expect(applyTestResults([s], parseNdjson(stream))).toBe(0);
  });
});
