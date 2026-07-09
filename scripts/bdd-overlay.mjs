#!/usr/bin/env node
/**
 * Append-only scenario-result overlay writer (FR-56 / P29-1).
 *
 * Reads Cucumber Messages NDJSON and appends one compact JSONL row per executed
 * test case into `.dev-pomogator/.scenario-results.ndjson`. The canonical
 * `.last-test-run.ndjson` remains the full-run snapshot; this overlay is the
 * per-scenario freshness trail written by full, filtered, and explicit-config
 * runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_OVERLAY = path.join('.dev-pomogator', '.scenario-results.ndjson');

const SEVERITY = new Map([
  ['UNKNOWN', 0],
  ['PASSED', 1],
  ['SKIPPED', 2],
  ['PENDING', 3],
  ['UNDEFINED', 4],
  ['AMBIGUOUS', 5],
  ['FAILED', 6],
]);

function normalizeStatus(raw) {
  if (typeof raw !== 'string') return 'UNKNOWN';
  const upper = raw.toUpperCase();
  return SEVERITY.has(upper) ? upper : 'UNKNOWN';
}

function worseStatus(a, b) {
  return (SEVERITY.get(b) ?? 0) > (SEVERITY.get(a) ?? 0) ? b : a;
}

function timestampToIso(ts) {
  if (!ts || typeof ts !== 'object') return undefined;
  const seconds = typeof ts.seconds === 'number' ? ts.seconds : 0;
  const nanos = typeof ts.nanos === 'number' ? ts.nanos : 0;
  return new Date(seconds * 1000 + Math.round(nanos / 1_000_000)).toISOString();
}

function slugifyName(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unnamed';
}

function scenarioIdFromPickle(info) {
  // Repo convention: scenario names start with stable ids like SPECGEN004_149,
  // TESTQUAL001_10, PLUGIN006_03. Keep that human/debug id when present.
  const m = String(info.name ?? '').match(/\b([A-Z][A-Z0-9]+_\d+)\b/);
  if (m) return m[1];
  if (info.uri && typeof info.astLine === 'number') return `${info.uri}:${info.astLine}`;
  return `SCEN-${slugifyName(info.name)}`;
}

function indexScenarioLinesFromDocument(doc, astLineByNodeId) {
  const indexScenario = (scenario) => {
    if (scenario?.id && typeof scenario.location?.line === 'number') {
      astLineByNodeId.set(scenario.id, scenario.location.line);
    }
  };
  const children = doc?.feature?.children ?? [];
  for (const child of children) {
    indexScenario(child.scenario);
    for (const rc of child.rule?.children ?? []) indexScenario(rc.scenario);
  }
}

export function parseScenarioResults(source, opts = {}) {
  const astLineByNodeId = new Map();
  const pickles = new Map();
  const testCaseToPickle = new Map();
  const startedToTestCase = new Map();
  const testStepToPickleStep = new Map();
  const pickleStepText = new Map();
  const results = new Map();
  const order = [];

  for (const line of String(source ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let env;
    try {
      env = JSON.parse(line);
    } catch {
      continue;
    }

    if (env.gherkinDocument) {
      indexScenarioLinesFromDocument(env.gherkinDocument, astLineByNodeId);
      continue;
    }

    const pickle = env.pickle;
    if (pickle?.id) {
      const astLine = (pickle.astNodeIds ?? [])
        .map((id) => astLineByNodeId.get(id))
        .find((lineNo) => typeof lineNo === 'number');
      const info = {
        id: pickle.id,
        uri: String(pickle.uri ?? '').replace(/\\/g, '/'),
        name: pickle.name ?? '',
        astLine,
        tags: (pickle.tags ?? []).map((tag) => tag.name).filter(Boolean),
      };
      pickles.set(pickle.id, info);
      for (const step of pickle.steps ?? []) {
        if (step.id && typeof step.text === 'string') pickleStepText.set(step.id, step.text);
      }
      continue;
    }

    const testCase = env.testCase;
    if (testCase?.id && testCase.pickleId) {
      testCaseToPickle.set(testCase.id, testCase.pickleId);
      for (const step of testCase.testSteps ?? []) {
        if (step.id && step.pickleStepId) testStepToPickleStep.set(step.id, step.pickleStepId);
      }
      continue;
    }

    const started = env.testCaseStarted;
    if (started?.id && started.testCaseId) {
      startedToTestCase.set(started.id, started.testCaseId);
      const acc = results.get(started.testCaseId) ?? { result: 'UNKNOWN' };
      acc.testCaseStartedId = started.id;
      acc.startedAt = timestampToIso(started.timestamp);
      results.set(started.testCaseId, acc);
      continue;
    }

    const stepFinished = env.testStepFinished;
    if (stepFinished?.testCaseStartedId && stepFinished.testStepResult) {
      const testCaseId = startedToTestCase.get(stepFinished.testCaseStartedId);
      if (!testCaseId) continue;
      const status = normalizeStatus(stepFinished.testStepResult.status);
      const acc = results.get(testCaseId) ?? { result: 'UNKNOWN' };
      acc.result = worseStatus(acc.result, status);
      if (status === 'FAILED' && !acc.failingStep) {
        const pickleStepId = stepFinished.testStepId ? testStepToPickleStep.get(stepFinished.testStepId) : undefined;
        acc.failingStep = {
          step: pickleStepId ? (pickleStepText.get(pickleStepId) ?? '') : '',
          errorMessage: stepFinished.testStepResult.message ?? '',
        };
      }
      results.set(testCaseId, acc);
      continue;
    }

    const finished = env.testCaseFinished;
    if (finished?.testCaseStartedId) {
      const testCaseId = startedToTestCase.get(finished.testCaseStartedId);
      if (!testCaseId) continue;
      const acc = results.get(testCaseId) ?? { result: 'UNKNOWN' };
      const explicit = normalizeStatus(finished.testStepResult?.status);
      if (explicit !== 'UNKNOWN') acc.result = worseStatus(acc.result, explicit);
      if (acc.result === 'UNKNOWN') acc.result = 'PASSED';
      acc.finishedAt = timestampToIso(finished.timestamp);
      acc.testCaseStartedId ??= finished.testCaseStartedId;
      if (!order.includes(testCaseId)) order.push(testCaseId);
      results.set(testCaseId, acc);
      continue;
    }
  }

  const runId = String(opts.runId ?? Date.now());
  const sourceName = String(opts.source ?? 'run-bdd');
  const traceFile = opts.traceFile ? String(opts.traceFile).split(path.sep).join('/') : undefined;
  const rows = [];
  for (const testCaseId of order) {
    const pickleId = testCaseToPickle.get(testCaseId);
    const pickle = pickleId ? pickles.get(pickleId) : undefined;
    if (!pickle) continue;
    const acc = results.get(testCaseId) ?? { result: 'UNKNOWN' };
    const testCaseStartedId = acc.testCaseStartedId ?? '';
    const traceId = traceFile ? `${traceFile}#${testCaseStartedId || testCaseId}` : (testCaseStartedId || testCaseId);
    rows.push({
      scenario_id: scenarioIdFromPickle(pickle),
      result: acc.result,
      time: acc.finishedAt ?? acc.startedAt ?? new Date().toISOString(),
      run_id: runId,
      source: sourceName,
      trace_id: traceId,
      trace_file: traceFile,
      test_case_started_id: testCaseStartedId || undefined,
      uri: pickle.uri,
      line: pickle.astLine,
      scenario_name: pickle.name,
      tags: pickle.tags,
    });
  }
  return rows;
}

export function appendJsonLinesAtomic(filePath, rows) {
  if (!rows.length) return 0;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = fs.openSync(filePath, 'a');
  try {
    for (const row of rows) {
      // One O_APPEND write per JSON line: no read/modify/write window, no truncation.
      fs.writeSync(fd, `${JSON.stringify(row)}\n`);
    }
  } finally {
    fs.closeSync(fd);
  }
  return rows.length;
}

export function writeScenarioOverlayFromNdjson(ndjsonPath, opts = {}) {
  if (!ndjsonPath || !fs.existsSync(ndjsonPath) || fs.statSync(ndjsonPath).size === 0) return 0;
  const rows = parseScenarioResults(fs.readFileSync(ndjsonPath, 'utf8'), opts);
  return appendJsonLinesAtomic(opts.overlayPath ?? DEFAULT_OVERLAY, rows);
}

function parseCli(argv) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--overlay') opts.overlayPath = argv[++i];
    else if (arg === '--run-id') opts.runId = argv[++i];
    else if (arg === '--source') opts.source = argv[++i];
    else if (arg === '--trace-file') opts.traceFile = argv[++i];
    else positional.push(arg);
  }
  return { ndjsonPath: positional[0], opts };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { ndjsonPath, opts } = parseCli(process.argv.slice(2));
  if (!ndjsonPath) {
    process.stderr.write('Usage: node scripts/bdd-overlay.mjs <cucumber.ndjson> [--overlay path] [--run-id id] [--source name] [--trace-file path]\n');
    process.exit(2);
  }
  try {
    const count = writeScenarioOverlayFromNdjson(ndjsonPath, opts);
    process.stdout.write(`[bdd-overlay] appended ${count} scenario result(s)\n`);
  } catch (err) {
    process.stderr.write(`[bdd-overlay] failed: ${err?.message ?? err}\n`);
    process.exit(1);
  }
}
