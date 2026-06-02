/**
 * Cucumber Messages NDJSON ingester for the SpecGraph builder.
 *
 * Reads `.dev-pomogator/.last-test-run.ndjson` (or any file in the canonical
 * `@cucumber/messages` envelope shape — Phase 0 wired cucumber-js to emit
 * exactly this) and produces a parser slice of one `TestResult` view per
 * scenario, plus `last-result` edges from each scenario id to its outcome.
 *
 * The ingester does NOT create new ScenarioNodes — the Gherkin parser is the
 * single producer of those. Instead it returns a *patch* the builder applies
 * to existing scenarios:  `lastResult / lastRunAt / durationMs / failingStep`
 * fields are filled in by `applyTestResults` during the merge step.
 *
 * Phase 1 starter scope:
 *   - `testCaseStarted` + `testCaseFinished` envelopes → pass/fail per pickle
 *   - `pickle` envelope → map pickle id → scenario name + tags
 *   - `gherkinDocument` envelope → URI to resolve scenario file
 *   - Step bindings (`stepDefinition` envelopes) are deferred to a follow-up
 *     pass on the same branch.
 *
 * @see .specs/spec-generator-v4/FR.md FR-2 (graph builder)
 * @see .specs/spec-generator-v4/spec-generator-v4_SCHEMA.md Entity 2
 * @see ../types.ts (ScenarioNode lastResult fields)
 */

import fs from 'node:fs';
import type { ScenarioNode } from '../types.ts';

type TestStatus =
  | 'PASSED'
  | 'FAILED'
  | 'SKIPPED'
  | 'PENDING'
  | 'UNDEFINED'
  | 'AMBIGUOUS'
  | 'UNKNOWN';

interface PickleInfo {
  name: string;
  uri: string;
  /** Original Gherkin scenario line — used by the builder to match nodes. */
  astLine?: number;
  tags: string[];
}

export interface TestResultPatch {
  /** Indexed by `${uri}:${line}` so the builder can match without a graph build first. */
  byLocation: Map<string, ScenarioResultFields>;
}

export interface ScenarioResultFields {
  lastResult: TestStatus;
  lastRunAt?: string;
  durationMs?: number;
  failingStep?: { step: string; errorMessage: string } | null;
}

/** Normalise Cucumber Messages status (`PASSED` / `Passed`) into our enum. */
function normalizeStatus(raw: unknown): TestStatus {
  if (typeof raw !== 'string') return 'UNKNOWN';
  const upper = raw.toUpperCase();
  if (
    upper === 'PASSED' ||
    upper === 'FAILED' ||
    upper === 'SKIPPED' ||
    upper === 'PENDING' ||
    upper === 'UNDEFINED' ||
    upper === 'AMBIGUOUS'
  ) {
    return upper;
  }
  return 'UNKNOWN';
}

/** Convert a duration envelope `{seconds, nanos}` to milliseconds. */
function durationToMs(d: unknown): number | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const dd = d as { seconds?: number; nanos?: number };
  if (typeof dd.seconds !== 'number' && typeof dd.nanos !== 'number') return undefined;
  return (dd.seconds ?? 0) * 1000 + Math.round((dd.nanos ?? 0) / 1_000_000);
}

/**
 * Parse a Cucumber Messages NDJSON string and produce a TestResultPatch.
 *
 * Robust to truncated / mixed-quality lines (each line is parsed in its own
 * try-catch); invalid lines are skipped without aborting the whole run.
 */
export function parseNdjson(source: string): TestResultPatch {
  const lines = source.split(/\r?\n/);

  /** pickleId → { uri, astLine, name, tags } */
  const pickles = new Map<string, PickleInfo>();
  /** testCaseId → pickleId (from `testCase` envelope) */
  const testCaseToPickle = new Map<string, string>();
  /** testCaseStartedId → testCaseId */
  const startedToTestCase = new Map<string, string>();
  /** uri (from `source` envelope) → already-set; not strictly needed here */

  /** uri → astLineRangeRecord — pickle.astNodeIds resolves through gherkinDocument */
  /** gherkinDocument.uri → map astNodeId → line. */
  const astLineByNodeId = new Map<string, number>();

  /**
   * pickleStepId → step text. Populated from `pickle.steps[]`. Cucumber Messages
   * embed the human-readable Gherkin step text inside the pickle envelope, so
   * we capture it once and never need to walk the Gherkin AST.
   */
  const pickleStepText = new Map<string, string>();

  /**
   * testStepId → pickleStepId. Populated from `testCase.testSteps[]`. The
   * `testStepFinished` envelope only carries `testStepId`, so this two-hop
   * lookup (`testStepId` → `pickleStepId` → step text) is the canonical way to
   * recover the failing step's text from a Cucumber Messages stream.
   */
  const testStepToPickleStep = new Map<string, string>();

  const byLocation = new Map<string, ScenarioResultFields>();
  /** testCaseId → tentative result accumulated during the run. */
  const testCaseResult = new Map<string, ScenarioResultFields & { startTs?: string }>();

  for (const line of lines) {
    if (!line.trim()) continue;
    let env: Record<string, unknown>;
    try {
      env = JSON.parse(line);
    } catch {
      continue;
    }

    // gherkinDocument — index ast node ids to their line numbers
    const doc = env.gherkinDocument as
      | { feature?: { children?: Array<{ scenario?: { id?: string; location?: { line?: number } } }> } }
      | undefined;
    if (doc?.feature?.children) {
      for (const ch of doc.feature.children) {
        if (ch.scenario?.id && typeof ch.scenario.location?.line === 'number') {
          astLineByNodeId.set(ch.scenario.id, ch.scenario.location.line);
        }
      }
      continue;
    }

    // pickle — links pickleId to scenario name + tags + AST nodes,
    // and indexes each pickleStep's text for failingStep recovery.
    const pickle = env.pickle as
      | {
          id?: string;
          uri?: string;
          name?: string;
          tags?: Array<{ name: string }>;
          astNodeIds?: string[];
          steps?: Array<{ id?: string; text?: string }>;
        }
      | undefined;
    if (pickle?.id) {
      const astLine = (pickle.astNodeIds ?? [])
        .map((nid) => astLineByNodeId.get(nid))
        .find((l): l is number => typeof l === 'number');
      pickles.set(pickle.id, {
        name: pickle.name ?? '',
        uri: pickle.uri ?? '',
        astLine,
        tags: (pickle.tags ?? []).map((t) => t.name),
      });
      for (const step of pickle.steps ?? []) {
        if (step.id && typeof step.text === 'string') {
          pickleStepText.set(step.id, step.text);
        }
      }
      continue;
    }

    // testCase — links testCaseId to pickleId, and indexes each testStepId →
    // pickleStepId so that `testStepFinished.testStepId` can be resolved back
    // to the human-readable Gherkin step text via `pickleStepText`.
    const testCase = env.testCase as
      | {
          id?: string;
          pickleId?: string;
          testSteps?: Array<{ id?: string; pickleStepId?: string }>;
        }
      | undefined;
    if (testCase?.id && testCase.pickleId) {
      testCaseToPickle.set(testCase.id, testCase.pickleId);
      for (const ts of testCase.testSteps ?? []) {
        if (ts.id && ts.pickleStepId) {
          testStepToPickleStep.set(ts.id, ts.pickleStepId);
        }
      }
      continue;
    }

    // testCaseStarted — captures timestamp for lastRunAt
    const tcStarted = env.testCaseStarted as
      | { id?: string; testCaseId?: string; timestamp?: { seconds?: number; nanos?: number } }
      | undefined;
    if (tcStarted?.id && tcStarted.testCaseId) {
      startedToTestCase.set(tcStarted.id, tcStarted.testCaseId);
      const ts = tcStarted.timestamp;
      const iso = ts
        ? new Date((ts.seconds ?? 0) * 1000 + Math.round((ts.nanos ?? 0) / 1_000_000)).toISOString()
        : undefined;
      const acc = testCaseResult.get(tcStarted.testCaseId) ?? { lastResult: 'UNKNOWN' as TestStatus };
      acc.startTs = iso;
      testCaseResult.set(tcStarted.testCaseId, acc);
      continue;
    }

    // testStepFinished — captures the FIRST failing step's message and resolves
    // its Gherkin step text via `testStepId → pickleStepId → pickleStepText`.
    // The two-hop lookup is the canonical Cucumber Messages way: testStepFinished
    // only ships `testStepId`, which is local to the testCase envelope; we cross-
    // reference it back through `testCase.testSteps[]` → `pickle.steps[].text`.
    const stepFinished = env.testStepFinished as
      | {
          testCaseStartedId?: string;
          testStepId?: string;
          testStepResult?: { status?: string; message?: string };
        }
      | undefined;
    if (stepFinished?.testCaseStartedId && stepFinished.testStepResult) {
      const tcId = startedToTestCase.get(stepFinished.testCaseStartedId);
      if (tcId) {
        const acc = testCaseResult.get(tcId) ?? { lastResult: 'UNKNOWN' as TestStatus };
        const status = normalizeStatus(stepFinished.testStepResult.status);
        if (status === 'FAILED' && !acc.failingStep) {
          let stepText = '';
          if (stepFinished.testStepId) {
            const pickleStepId = testStepToPickleStep.get(stepFinished.testStepId);
            if (pickleStepId) {
              stepText = pickleStepText.get(pickleStepId) ?? '';
            }
          }
          acc.failingStep = {
            step: stepText,
            errorMessage: stepFinished.testStepResult.message ?? '',
          };
        }
        testCaseResult.set(tcId, acc);
      }
      continue;
    }

    // testCaseFinished — finalises the outcome for this test case
    const tcFinished = env.testCaseFinished as
      | { testCaseStartedId?: string; willBeRetried?: boolean; timestamp?: { seconds?: number; nanos?: number } }
      | undefined;
    if (tcFinished?.testCaseStartedId) {
      const tcId = startedToTestCase.get(tcFinished.testCaseStartedId);
      if (tcId) {
        const acc = testCaseResult.get(tcId) ?? { lastResult: 'UNKNOWN' as TestStatus };
        // The full pass/fail of a testCase is the worst-of testStepFinished —
        // but cucumber-js v12 also re-emits status in this envelope when present.
        const explicit = (env.testCaseFinished as { testStepResult?: { status?: string } }).testStepResult?.status;
        if (explicit) acc.lastResult = normalizeStatus(explicit);
        else if (acc.failingStep) acc.lastResult = 'FAILED';
        else acc.lastResult = acc.lastResult === 'UNKNOWN' ? 'PASSED' : acc.lastResult;

        if (tcFinished.timestamp && acc.startTs) {
          const endMs =
            (tcFinished.timestamp.seconds ?? 0) * 1000 +
            Math.round((tcFinished.timestamp.nanos ?? 0) / 1_000_000);
          const startMs = new Date(acc.startTs).getTime();
          if (Number.isFinite(startMs)) acc.durationMs = endMs - startMs;
        }
        testCaseResult.set(tcId, acc);
      }
      continue;
    }
  }

  // Flatten testCaseResult → byLocation keyed `${uri}:${line}` for the builder
  // to merge into the existing scenario nodes the Gherkin parser produced.
  for (const [tcId, acc] of testCaseResult) {
    const pickleId = testCaseToPickle.get(tcId);
    if (!pickleId) continue;
    const info = pickles.get(pickleId);
    if (!info || typeof info.astLine !== 'number' || !info.uri) continue;
    const key = `${info.uri}:${info.astLine}`;
    const fields: ScenarioResultFields = {
      lastResult: acc.lastResult,
      lastRunAt: acc.startTs,
      durationMs: acc.durationMs,
      failingStep: acc.failingStep ?? null,
    };
    byLocation.set(key, fields);
  }

  return { byLocation };
}

/** Read NDJSON from disk and parse. Returns empty patch when the file is absent. */
export function parseNdjsonFile(absPath: string): TestResultPatch {
  if (!fs.existsSync(absPath)) return { byLocation: new Map() };
  return parseNdjson(fs.readFileSync(absPath, 'utf-8'));
}

/**
 * Merge a TestResultPatch into the in-memory ScenarioNode set. Mutates in
 * place: every matched scenario gains lastResult / lastRunAt / durationMs /
 * failingStep. Scenarios with no NDJSON entry are untouched.
 *
 * The match key is `${file}:${line}` — both sides come from the same Gherkin
 * AST line so they line up exactly for un-modified .feature files.
 */
export function applyTestResults(
  scenarios: Iterable<ScenarioNode>,
  patch: TestResultPatch,
): number {
  let applied = 0;
  for (const s of scenarios) {
    const key = `${s.file}:${s.line}`;
    const fields = patch.byLocation.get(key);
    if (!fields) continue;
    s.lastResult = fields.lastResult;
    s.lastRunAt = fields.lastRunAt;
    s.durationMs = fields.durationMs;
    s.failingStep = fields.failingStep;
    applied++;
  }
  return applied;
}
