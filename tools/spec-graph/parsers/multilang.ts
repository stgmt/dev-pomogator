/**
 * Multi-language NDJSON adapter (FR-9).
 *
 * Reqnroll v3+ (.NET), behave with the `message` formatter (Python), and
 * Cucumber-JVM with `--plugin message:…` (Java) all emit the canonical
 * `@cucumber/messages` envelope schema that `./ndjson.ts` already parses.
 * Phase 3 does NOT need a per-language parser — only:
 *
 *   1. Detection of the source runner from the `meta` envelope (so the
 *      MCP server can surface «which language produced this run») and
 *   2. A thin passthrough wrapper to the canonical ingester so any code
 *      that wants to be explicit about «I'm ingesting Reqnroll output»
 *      can spell that intent without re-importing the generic helper.
 *
 * The result is the same `TestResultPatch` regardless of source language —
 * downstream graph builders + conformance checks are language-agnostic.
 *
 * @see ./ndjson.ts   (canonical Cucumber Messages ingester)
 * @see .specs/spec-generator-v4/FR.md FR-9 (multi-language BDD support)
 */

import fs from 'node:fs';
import { parseNdjson, parseNdjsonFile, type TestResultPatch } from './ndjson.ts';

export type RunnerLanguage =
  | 'cucumber-js'
  | 'reqnroll'
  | 'cucumber-jvm'
  | 'behave'
  | 'unknown';

/**
 * Heuristic detection from the first `meta` envelope. Cucumber Messages
 * `meta.implementation.name` carries the runner identifier exactly:
 *   `cucumber-js`, `Reqnroll`, `cucumber-jvm`, `behave`.
 * Returns `'unknown'` if no `meta.implementation.name` is present.
 */
export function detectRunner(source: string): RunnerLanguage {
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const env = JSON.parse(line) as {
        meta?: { implementation?: { name?: string } };
      };
      const name = env.meta?.implementation?.name?.toLowerCase();
      if (!name) continue;
      if (name.includes('cucumber-jvm') || name.includes('cucumber/jvm')) return 'cucumber-jvm';
      if (name.includes('cucumber-js') || name === 'cucumber') return 'cucumber-js';
      if (name.includes('reqnroll') || name.includes('specflow')) return 'reqnroll';
      if (name.includes('behave')) return 'behave';
      return 'unknown';
    } catch {
      // Skip malformed line — `parseNdjson` itself is resilient to these,
      // we only need a best-effort name lookup.
      continue;
    }
  }
  return 'unknown';
}

/**
 * Ingest NDJSON output from any of the four supported runners. Returns the
 * canonical `TestResultPatch` shape AND the detected language tag for
 * downstream surfacing in MCP responses.
 */
export function ingestMultilang(source: string): {
  language: RunnerLanguage;
  patch: TestResultPatch;
} {
  return {
    language: detectRunner(source),
    patch: parseNdjson(source),
  };
}

/** Convenience file wrapper that mirrors `parseNdjsonFile` shape. */
export function ingestMultilangFile(absPath: string): {
  language: RunnerLanguage;
  patch: TestResultPatch;
} {
  return {
    language: detectRunner(readFileBest(absPath)),
    patch: parseNdjsonFile(absPath),
  };
}

function readFileBest(absPath: string): string {
  try {
    // We re-read here only to extract the meta envelope for language
    // detection; the byte cost is negligible against the broader parse
    // already happening in `parseNdjsonFile`.
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * A step→code binding recovered from a runner's output (SPECGEN004_19 / FR-9).
 *
 * The canonical `@cucumber/messages` envelope a Reqnroll run emits does NOT
 * carry `stepDefinition` messages with a `sourceReference` — the ONLY
 * `<file>.cs:line` signal in real output is the stack frame inside a FAILED
 * step's `testStepResult.message`. We extract exactly that — no fabricated
 * bindings for passed steps (which carry no location) — so a binding only
 * exists where the producer actually emitted one. See
 * `tests/fixtures/reqnroll-sample/README.md`.
 */
export interface RunnerStepBinding {
  /** Pickle (scenario) name the failing step belonged to. */
  scenario: string;
  /** First AST node id of the pickle (scenario id in the gherkin doc). */
  scenarioAstNodeId?: string;
  /** Code file from the stack frame, normalised to POSIX separators. */
  codeFile: string;
  /** 1-indexed line from the stack frame. */
  line: number;
  /** Fully-qualified method from the stack frame (e.g. `AuthSteps.TheResponseIsRejected`). */
  symbol?: string;
}

// `at <symbol> in <path>.cs:line <N>` — the .NET/Reqnroll stack-frame shape.
const STACK_FRAME_RE = /\bat\s+(\S+?)\s+in\s+(.+?\.cs):line\s+(\d+)/i;

/**
 * Extract step→code bindings from a multi-language NDJSON run by mining the
 * stack frames of FAILED steps. Single pass: pickles / test-cases /
 * test-case-started are indexed as they stream by (NDJSON is emitted in
 * dependency order), so a `testStepFinished` can be mapped back to its
 * scenario by the time it appears. Returns `[]` when no failed step carries a
 * `.cs:line` frame (the honest empty case — e.g. an all-green run).
 */
export function extractStepBindings(source: string): RunnerStepBinding[] {
  const pickles = new Map<string, { name: string; astNodeIds?: string[] }>();
  const caseToPickle = new Map<string, string>(); // testCaseId → pickleId
  const startedToCase = new Map<string, string>(); // testCaseStartedId → testCaseId
  const bindings: RunnerStepBinding[] = [];

  for (const raw of source.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let env: Record<string, unknown>;
    try {
      env = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    const pickle = env.pickle as { id?: string; name?: string; astNodeIds?: string[] } | undefined;
    const testCase = env.testCase as { id?: string; pickleId?: string } | undefined;
    const started = env.testCaseStarted as { id?: string; testCaseId?: string } | undefined;
    const finished = env.testStepFinished as
      | { testCaseStartedId?: string; testStepResult?: { status?: string; message?: string } }
      | undefined;

    if (pickle?.id) pickles.set(pickle.id, { name: pickle.name ?? '(unknown)', astNodeIds: pickle.astNodeIds });
    else if (testCase?.id && testCase.pickleId) caseToPickle.set(testCase.id, testCase.pickleId);
    else if (started?.id && started.testCaseId) startedToCase.set(started.id, started.testCaseId);
    else if (finished?.testStepResult?.status === 'FAILED') {
      const message = finished.testStepResult.message;
      if (typeof message !== 'string') continue;
      const m = message.match(STACK_FRAME_RE);
      if (!m) continue;
      const [, symbol, file, lineStr] = m;
      const caseId = finished.testCaseStartedId ? startedToCase.get(finished.testCaseStartedId) : undefined;
      const pickleId = caseId ? caseToPickle.get(caseId) : undefined;
      const pk = pickleId ? pickles.get(pickleId) : undefined;
      bindings.push({
        scenario: pk?.name ?? '(unknown)',
        scenarioAstNodeId: pk?.astNodeIds?.[0],
        codeFile: file.replace(/\\/g, '/'),
        line: parseInt(lineStr, 10),
        symbol: symbol.replace(/\(\)$/, ''),
      });
    }
  }
  return bindings;
}
