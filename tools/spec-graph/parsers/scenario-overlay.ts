/**
 * Append-only scenario-result overlay reader (FR-56 / P29-2).
 *
 * The canonical `.last-test-run.ndjson` remains the coherent full-suite snapshot.
 * Filtered / explicit-config runs append compact rows to
 * `.dev-pomogator/.scenario-results.ndjson`; this module merges the newest
 * overlay row back onto ScenarioNodes without clobbering the canonical file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScenarioNode } from '../types.ts';
import { scenarioKey } from '../coverage.ts';

type TestStatus = NonNullable<ScenarioNode['lastResult']>;

const STATUSES = new Set<TestStatus>([
  'PASSED',
  'FAILED',
  'SKIPPED',
  'PENDING',
  'UNDEFINED',
  'AMBIGUOUS',
  'UNKNOWN',
]);

export interface ScenarioOverlayPatch {
  byScenarioKey: Map<string, ScenarioOverlayResult>;
  byLocation: Map<string, ScenarioOverlayResult>;
}

export interface ScenarioOverlayResult {
  scenarioId: string;
  result: TestStatus;
  time: string;
  timeMs: number;
  uri?: string;
  line?: number;
  runId?: string;
  source?: string;
  gitSha?: string;
  failingStep?: ScenarioNode['failingStep'];
  traceId?: string;
  traceFile?: string;
  testCaseStartedId?: string;
}

interface TraceIndex {
  stepDefinitionUrisByStartedId: Map<string, string[]>;
}

function normalizeStatus(raw: unknown): TestStatus {
  if (typeof raw !== 'string') return 'UNKNOWN';
  const upper = raw.toUpperCase() as TestStatus;
  return STATUSES.has(upper) ? upper : 'UNKNOWN';
}

function parseTimeMs(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

function normalizeUri(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  return raw.replace(/\\/g, '/');
}

function locationKey(uri: string | undefined, line: unknown): string | undefined {
  if (!uri || typeof line !== 'number') return undefined;
  return `${uri}:${line}`;
}

function keepNewest(map: Map<string, ScenarioOverlayResult>, key: string | undefined, row: ScenarioOverlayResult): void {
  if (!key) return;
  const prev = map.get(key);
  // Equal timestamps are possible when several rows are produced from the same run;
  // append order wins because the overlay is an append-only freshness trail.
  if (!prev || row.timeMs >= prev.timeMs) map.set(key, row);
}

export function parseScenarioOverlay(source: string): ScenarioOverlayPatch {
  const byScenarioKey = new Map<string, ScenarioOverlayResult>();
  const byLocation = new Map<string, ScenarioOverlayResult>();

  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const scenarioId = typeof raw.scenario_id === 'string' ? raw.scenario_id : '';
    const timeMs = parseTimeMs(raw.time);
    if (!scenarioId || timeMs === undefined) continue;
    const row: ScenarioOverlayResult = {
      scenarioId,
      result: normalizeStatus(raw.result),
      time: raw.time as string,
      timeMs,
      uri: normalizeUri(raw.uri),
      line: typeof raw.line === 'number' ? raw.line : undefined,
      runId: typeof raw.run_id === 'string' ? raw.run_id : undefined,
      source: typeof raw.source === 'string' ? raw.source : undefined,
      gitSha: typeof raw.git_sha === 'string' ? raw.git_sha : undefined,
      failingStep: raw.failing_step && typeof raw.failing_step === 'object'
        ? raw.failing_step as ScenarioNode['failingStep']
        : undefined,
      traceId: typeof raw.trace_id === 'string' ? raw.trace_id : undefined,
      traceFile: normalizeUri(raw.trace_file),
      testCaseStartedId: typeof raw.test_case_started_id === 'string' ? raw.test_case_started_id : undefined,
    };
    keepNewest(byScenarioKey, scenarioKey(scenarioId) ?? scenarioId.toLowerCase(), row);
    keepNewest(byLocation, locationKey(row.uri, row.line), row);
  }

  return { byScenarioKey, byLocation };
}

export function parseScenarioOverlayFile(absPath: string): ScenarioOverlayPatch {
  if (!fs.existsSync(absPath)) return { byScenarioKey: new Map(), byLocation: new Map() };
  return parseScenarioOverlay(fs.readFileSync(absPath, 'utf-8'));
}

function resolvePath(repoRoot: string, p: string): string {
  if (p.startsWith('file://')) return fileURLToPath(p);
  return path.isAbsolute(p) ? p : path.resolve(repoRoot, p);
}

function mtimeMs(absPath: string): number | undefined {
  try {
    return fs.statSync(absPath).mtimeMs;
  } catch {
    return undefined;
  }
}

const traceCache = new Map<string, TraceIndex | null>();

function traceIndex(repoRoot: string, traceFile: string | undefined): TraceIndex | null {
  if (!traceFile) return null;
  const abs = resolvePath(repoRoot, traceFile);
  const cached = traceCache.get(abs);
  if (cached !== undefined) return cached;
  if (!fs.existsSync(abs)) {
    traceCache.set(abs, null);
    return null;
  }

  const stepDefinitionUri = new Map<string, string>();
  const testCaseStepDefs = new Map<string, string[]>();
  const startedToCase = new Map<string, string>();

  for (const line of fs.readFileSync(abs, 'utf-8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let env: Record<string, unknown>;
    try {
      env = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const stepDefinition = env.stepDefinition as
      | { id?: string; sourceReference?: { uri?: string } }
      | undefined;
    if (stepDefinition?.id && typeof stepDefinition.sourceReference?.uri === 'string') {
      stepDefinitionUri.set(stepDefinition.id, stepDefinition.sourceReference.uri.replace(/\\/g, '/'));
      continue;
    }

    const testCase = env.testCase as
      | { id?: string; testSteps?: Array<{ stepDefinitionIds?: string[] }> }
      | undefined;
    if (testCase?.id) {
      const ids: string[] = [];
      for (const step of testCase.testSteps ?? []) {
        for (const id of step.stepDefinitionIds ?? []) ids.push(id);
      }
      testCaseStepDefs.set(testCase.id, ids);
      continue;
    }

    const started = env.testCaseStarted as { id?: string; testCaseId?: string } | undefined;
    if (started?.id && started.testCaseId) {
      startedToCase.set(started.id, started.testCaseId);
      continue;
    }
  }

  const stepDefinitionUrisByStartedId = new Map<string, string[]>();
  for (const [startedId, testCaseId] of startedToCase) {
    const uris = [...new Set((testCaseStepDefs.get(testCaseId) ?? [])
      .map((id) => stepDefinitionUri.get(id))
      .filter((u): u is string => typeof u === 'string' && u.length > 0))];
    if (uris.length > 0) stepDefinitionUrisByStartedId.set(startedId, uris);
  }

  const index = { stepDefinitionUrisByStartedId };
  traceCache.set(abs, index);
  return index;
}

function startedId(row: ScenarioOverlayResult): string | undefined {
  if (row.testCaseStartedId) return row.testCaseStartedId;
  const m = row.traceId?.match(/#([^#]+)$/);
  return m?.[1];
}

function applyTraceRef(scenario: ScenarioNode, row: ScenarioOverlayResult): void {
  if (!row.traceId) {
    scenario.trace = undefined;
    return;
  }
  scenario.trace = {
    traceId: row.traceId,
    traceFile: row.traceFile,
    testCaseStartedId: startedId(row),
    runId: row.runId,
    source: row.source,
    gitSha: row.gitSha,
  };
}

function freshnessThresholdMs(repoRoot: string, scenario: ScenarioNode, row: ScenarioOverlayResult): number | undefined {
  const candidates: number[] = [];
  const featureMtime = mtimeMs(resolvePath(repoRoot, scenario.file));
  if (featureMtime !== undefined) candidates.push(featureMtime);

  const trace = traceIndex(repoRoot, row.traceFile);
  const start = startedId(row);
  for (const uri of start && trace ? (trace.stepDefinitionUrisByStartedId.get(start) ?? []) : []) {
    const ms = mtimeMs(resolvePath(repoRoot, uri));
    if (ms !== undefined) candidates.push(ms);
  }

  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

function findByLocation(patch: ScenarioOverlayPatch, scenario: ScenarioNode): ScenarioOverlayResult | undefined {
  const exactKey = `${scenario.file}:${scenario.line}`;
  const exact = patch.byLocation.get(exactKey);
  if (exact) return exact;
  const suffix = `/${scenario.file}:${scenario.line}`;
  for (const [key, row] of patch.byLocation) {
    if (key.endsWith(suffix)) return row;
  }
  return undefined;
}

export function applyScenarioOverlayResults(
  scenarios: Iterable<ScenarioNode>,
  patch: ScenarioOverlayPatch,
  opts: { repoRoot: string; currentGitSha?: string },
): number {
  let applied = 0;
  for (const scenario of scenarios) {
    const key = scenarioKey(scenario.id);
    const byId = key ? patch.byScenarioKey.get(key) : undefined;
    const byLocation = findByLocation(patch, scenario);
    const row = byId && byLocation
      ? (byId.timeMs >= byLocation.timeMs ? byId : byLocation)
      : byId ?? byLocation;
    if (!row) continue;

    const currentMs = parseTimeMs(scenario.lastRunAt);
    const overlayWins = currentMs === undefined || row.timeMs > currentMs;
    // Equal timestamps happen when the same append-only row is re-applied after a
    // source edit. It still represents the effective evidence, so freshness must
    // be recomputed even though the result fields do not change.
    const overlayEffective = overlayWins || row.timeMs === currentMs;
    if (overlayWins) {
      scenario.lastResult = row.result;
      scenario.lastRunAt = row.time;
      applyTraceRef(scenario, row);
      // Overlay rows are compact; failure detail stays a P29-3/P29-4 trace lookup concern.
      scenario.durationMs = undefined;
      scenario.failingStep = row.failingStep ?? null;
      applied++;
    } else if (overlayEffective && row.traceId) {
      applyTraceRef(scenario, row);
    }

    if (overlayEffective && row.result === 'PASSED') {
      const threshold = freshnessThresholdMs(opts.repoRoot, scenario, row);
      const sourceStale = threshold !== undefined && row.timeMs < threshold;
      const commitStale = Boolean(opts.currentGitSha) && row.gitSha !== opts.currentGitSha;
      scenario.resultStale = sourceStale || commitStale || !row.gitSha;
    } else if (overlayEffective) {
      scenario.resultStale = false;
    }
  }
  return applied;
}
