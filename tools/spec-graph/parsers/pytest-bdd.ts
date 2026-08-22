// Canonical pytest-bdd Cucumber JSON ingestion (issue #230).
//
// pytest-bdd's supported `--cucumber-json <path>` reporter writes one feature
// object with `elements[]` for each executed scenario. SpecGraph converts those
// elements into the same location-addressed evidence contract consumed by the
// scenario overlay: normalized `uri + line` is primary, element `id` is the
// secondary scenario identity.

import fs from 'node:fs';
import path from 'node:path';
import type { ArtifactIngestionReason, ArtifactIngestionState, ScenarioNode } from '../types.ts';
import { parseScenarioOverlay, type ScenarioOverlayPatch } from './scenario-overlay.ts';

export const DEFAULT_PYTEST_BDD_REPORT_PATH = '.dev-pomogator/pytest-bdd-report.json';
export const PYTEST_BDD_SOURCE = 'pytest-bdd:cucumber-json';

interface PytestBddStepResult {
  status?: unknown;
  duration?: unknown;
  error_message?: unknown;
}

interface PytestBddStep {
  name?: unknown;
  keyword?: unknown;
  result?: PytestBddStepResult;
}

interface PytestBddScenario {
  id?: unknown;
  name?: unknown;
  line?: unknown;
  steps?: PytestBddStep[];
}

interface PytestBddFeature {
  uri?: unknown;
  elements?: PytestBddScenario[];
}

export interface PytestBddEvidence {
  patch: ScenarioOverlayPatch;
  reportPath: string;
  reportTime: string | null;
  runId: string | null;
  executed: number;
  malformed: number;
  state: ArtifactIngestionState;
  reason: ArtifactIngestionReason | null;
}

function normalizeUri(uri: string, repoRoot?: string): string {
  let normalized = uri.replace(/\\/g, '/').replace(/^\.\//, '');
  if (path.isAbsolute(uri) && repoRoot) {
    normalized = path.relative(repoRoot, uri).split(path.sep).join('/');
  }
  return normalized;
}

function resultStatus(steps: readonly PytestBddStep[]): NonNullable<ScenarioNode['lastResult']> {
  const statuses = steps
    .map((step) => typeof step.result?.status === 'string' ? step.result.status.toLowerCase() : '')
    .filter(Boolean);
  if (statuses.includes('failed')) return 'FAILED';
  if (statuses.includes('undefined')) return 'UNDEFINED';
  if (statuses.includes('ambiguous')) return 'AMBIGUOUS';
  if (statuses.includes('pending')) return 'PENDING';
  if (statuses.includes('skipped')) return 'SKIPPED';
  return statuses.length > 0 && statuses.every((status) => status === 'passed') ? 'PASSED' : 'UNKNOWN';
}

function durationMs(steps: readonly PytestBddStep[]): number | undefined {
  const nanoseconds = steps.reduce((total, step) => {
    const value = step.result?.duration;
    return total + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  }, 0);
  return nanoseconds > 0 ? nanoseconds / 1_000_000 : undefined;
}

function failingStep(steps: readonly PytestBddStep[]): ScenarioNode['failingStep'] | undefined {
  const index = steps.findIndex((step) => step.result?.status === 'failed');
  if (index < 0) return undefined;
  const step = steps[index];
  return {
    step: [step.keyword, step.name].filter((value): value is string => typeof value === 'string').join(' ').trim(),
    errorMessage: typeof step.result?.error_message === 'string' ? step.result.error_message : '',
  };
}

function reportRunId(reportTime: string): string {
  return `pytest-bdd-${reportTime.replace(/[-:.TZ]/g, '')}`;
}

export function parsePytestBddReport(
  source: string,
  opts: { reportPath?: string; reportTime?: string; runId?: string; repoRoot?: string } = {},
): PytestBddEvidence {
  const reportPath = normalizeUri(opts.reportPath ?? DEFAULT_PYTEST_BDD_REPORT_PATH);
  const reportTime = opts.reportTime ?? new Date(0).toISOString();
  const runId = opts.runId ?? reportRunId(reportTime);
  let features: PytestBddFeature[];
  try {
    const parsed: unknown = JSON.parse(source);
    if (!Array.isArray(parsed)) {
      return {
        patch: parseScenarioOverlay(''), reportPath, reportTime: null, runId: null,
        executed: 0, malformed: 1, state: 'NOT_INGESTED', reason: 'MALFORMED_ARTIFACT',
      };
    }
    features = parsed as PytestBddFeature[];
  } catch {
    return {
      patch: parseScenarioOverlay(''), reportPath, reportTime: null, runId: null,
      executed: 0, malformed: 1, state: 'NOT_INGESTED', reason: 'MALFORMED_ARTIFACT',
    };
  }

  const rows: string[] = [];
  let malformed = 0;
  for (const feature of features) {
    let uri = typeof feature.uri === 'string' ? normalizeUri(feature.uri, opts.repoRoot) : '';
    const reportDir = path.posix.dirname(reportPath);
    if (uri && reportDir !== '.' && reportDir !== '.dev-pomogator' && !uri.startsWith(`${reportDir}/`)) {
      const reportBase = path.posix.basename(reportDir);
      uri = uri.startsWith(`${reportBase}/`)
        ? path.posix.join(path.posix.dirname(reportDir), uri)
        : path.posix.join(reportDir, uri);
    }
    for (const scenario of Array.isArray(feature.elements) ? feature.elements : []) {
      if (
        !uri ||
        typeof scenario.id !== 'string' ||
        !scenario.id.trim() ||
        typeof scenario.line !== 'number' ||
        !Number.isInteger(scenario.line) ||
        scenario.line < 1
      ) {
        malformed += 1;
        continue;
      }
      const steps = Array.isArray(scenario.steps) ? scenario.steps : [];
      rows.push(JSON.stringify({
        scenario_id: scenario.id,
        scenario_name: typeof scenario.name === 'string' ? scenario.name : undefined,
        uri,
        line: scenario.line,
        result: resultStatus(steps),
        time: reportTime,
        run_id: runId,
        source: PYTEST_BDD_SOURCE,
        trace_id: `${reportPath}#${scenario.id}`,
        trace_file: reportPath,
        duration_ms: durationMs(steps),
        failing_step: failingStep(steps),
      }));
    }
  }

  const reason = malformed > 0
    ? 'MALFORMED_ARTIFACT'
    : rows.length === 0
      ? 'MISSING_SCENARIO_RESULTS'
      : null;
  return {
    patch: parseScenarioOverlay(rows.join('\n')),
    reportPath,
    reportTime,
    runId,
    executed: rows.length,
    malformed,
    state: reason ? 'NOT_INGESTED' : 'INGESTED',
    reason,
  };
}

export function parsePytestBddReportFile(absPath: string, repoRoot: string): PytestBddEvidence {
  const reportPath = path.relative(repoRoot, absPath).split(path.sep).join('/');
  if (!fs.existsSync(absPath)) {
    return {
      patch: parseScenarioOverlay(''), reportPath, reportTime: null, runId: null,
      executed: 0, malformed: 0, state: 'NOT_INGESTED', reason: 'ARTIFACT_ABSENT',
    };
  }
  const stat = fs.statSync(absPath);
  const reportTime = stat.mtime.toISOString();
  return parsePytestBddReport(fs.readFileSync(absPath, 'utf-8'), { reportPath, reportTime, repoRoot });
}
