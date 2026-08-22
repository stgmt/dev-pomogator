/**
 * Integration tests for the SpecGraph builder (Phase 1, FR-2).
 *
 * Cover the cold-start path end-to-end on a synthetic fixture rooted under
 * `os.tmpdir()`: a tiny multi-file spec corpus + one .feature file, optionally
 * with an NDJSON test-run record. Pin the three Phase-1 invariants:
 *   1. MD + Gherkin parser slices both make it into the final graph.
 *   2. `covers` and `tested-by` edges are correctly populated.
 *   3. NDJSON ingest mutates scenario nodes in place + emits `last-result`
 *      edges.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { buildGraph } from '../builder.ts';
import { bucketScenarios } from '../coverage.ts';
import { parsePytestBddReport } from '../parsers/pytest-bdd.ts';
import { applyScenarioOverlayResults, parseScenarioOverlay } from '../parsers/scenario-overlay.ts';
import { buildReadinessInventory, evaluateReadiness } from '../readiness-inventory.ts';
import type { FrNode, NfrNode, ScenarioNode, SpecGraph, TaskNode } from '../types.ts';

describe('buildGraph — cold-start integration', () => {
  let root: string;

  beforeEach(() => {
    root = path.join(os.tmpdir(), `spec-graph-test-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs', 'auth'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests', 'features'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('merges MD nodes and Gherkin scenarios into one graph', () => {
    fs.writeFileSync(
      path.join(root, '.specs/auth/FR.md'),
      '## FR-1: Login flow\n\n## FR-2: Logout flow\n',
    );
    fs.writeFileSync(
      path.join(root, '.specs/auth/ACCEPTANCE_CRITERIA.md'),
      '## AC-1 (FR-1)\n\nWHEN x THEN y SHALL z.\n',
    );
    // Spec-owned feature file — the same-spec `@FR-N` convention qualifies
    // the tested-by edge with the spec slug (FR-36a).
    fs.writeFileSync(
      path.join(root, '.specs/auth/auth.feature'),
      '@FR-1\nFeature: Auth\n  Scenario: Login OK\n    Given x\n    Then y\n',
    );

    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    // FR-36a: nodes inside `.specs/<slug>/` are keyed `<slug>:<localId>`.
    expect(graph.nodes.get('auth:FR-1')?.type).toBe('FR');
    expect(graph.nodes.get('auth:FR-2')?.type).toBe('FR');
    expect(graph.nodes.get('auth:AC-1')?.type).toBe('AC');
    expect(graph.nodes.get('auth:SCEN-login-ok')?.type).toBe('Scenario');
    expect(graph.nodes.get('auth:FR-1')?.spec).toBe('auth');

    // covers + tested-by edges reference the composite keys on both ends.
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'auth:FR-1', to: 'auth:AC-1', type: 'covers' },
        { from: 'auth:FR-1', to: 'auth:SCEN-login-ok', type: 'tested-by' },
      ]),
    );
  });

  it('ISSUE230_01: ingests a real pytest-bdd report as 11 PASSED plus 11 not_run with provenance', () => {
    const fixtureRoot = path.resolve('tests/fixtures/pytest-bdd-sample');
    fs.mkdirSync(path.join(root, '.specs/issue-230'), { recursive: true });
    fs.mkdirSync(path.join(root, '.dev-pomogator'), { recursive: true });
    fs.copyFileSync(path.join(fixtureRoot, 'features/issue_230.feature'), path.join(root, '.specs/issue-230/issue-230.feature'));
    fs.copyFileSync(path.join(fixtureRoot, 'cucumber-report.json'), path.join(root, '.dev-pomogator/pytest-bdd-report.json'));
    const reportTime = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(root, '.dev-pomogator/pytest-bdd-report.json'), reportTime, reportTime);
    fs.writeFileSync(path.join(root, '.specs/issue-230/FR.md'), '# FR-1: pytest-bdd execution\n');

    const parsed = parsePytestBddReport(fs.readFileSync(path.join(fixtureRoot, 'cucumber-report.json'), 'utf-8'), {
      reportPath: '.dev-pomogator/pytest-bdd-report.json',
      reportTime: '2026-08-18T00:00:00.000Z',
      runId: 'pytest-bdd-real-230',
    });
    expect(parsed.executed).toBe(11);
    expect(parsed.malformed).toBe(0);
    expect([...parsed.patch.byScenarioKey.keys()]).toEqual([
      'test_executed_scenario_01',
      'test_executed_scenario_03',
      'test_executed_scenario_05',
      'test_executed_scenario_07',
      'test_executed_scenario_09',
      'test_executed_scenario_11',
      'test_executed_scenario_13',
      'test_executed_scenario_15',
      'test_executed_scenario_17',
      'test_executed_scenario_19',
      'test_executed_scenario_21',
    ]);
    expect([...parsed.patch.byLocation.keys()]).toEqual([
      'pytest-bdd-sample/features/issue_230.feature:3',
      'pytest-bdd-sample/features/issue_230.feature:13',
      'pytest-bdd-sample/features/issue_230.feature:23',
      'pytest-bdd-sample/features/issue_230.feature:33',
      'pytest-bdd-sample/features/issue_230.feature:43',
      'pytest-bdd-sample/features/issue_230.feature:53',
      'pytest-bdd-sample/features/issue_230.feature:63',
      'pytest-bdd-sample/features/issue_230.feature:73',
      'pytest-bdd-sample/features/issue_230.feature:83',
      'pytest-bdd-sample/features/issue_230.feature:93',
      'pytest-bdd-sample/features/issue_230.feature:103',
    ]);

    const graph = buildGraph({ repoRoot: root, featureRoots: ['.specs/issue-230'] });
    const scenarios = [...graph.nodes.values()].filter((node): node is ScenarioNode => node.type === 'Scenario');
    const buckets = bucketScenarios(scenarios.map((scenario) => ({ id: scenario.id, tags: scenario.tags, result: scenario.lastResult, stale: scenario.resultStale })));
    const inventory = buildReadinessInventory(graph, { spec: 'issue-230' });

    expect(scenarios).toHaveLength(22);
    expect(buckets.passed).toHaveLength(11);
    expect(buckets.not_run).toHaveLength(11);
    expect(inventory.scenarios.filter((scenario) => scenario.outcome === 'PASSED')).toHaveLength(11);
    expect(inventory.scenarios.filter((scenario) => scenario.outcome === 'not_recorded')).toHaveLength(11);
    expect(inventory.scenarios.find((scenario) => scenario.scenario_id === 'issue-230:SCEN-executed-scenario-01')).toMatchObject({
      outcome: 'PASSED',
      result: 'PASSED',
      source: 'pytest-bdd:cucumber-json',
      run_id: expect.stringMatching(/^pytest-bdd-/),
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      provenance: 'pytest-bdd-report',
    });
    expect(inventory.scenarios.find((scenario) => scenario.scenario_id === 'issue-230:SCEN-unbound-scenario-02')).toMatchObject({
      outcome: 'not_recorded', result: null, source: null, run_id: null, timestamp: null, provenance: 'none',
    });
    expect(inventory.baseline.run_ids).toHaveLength(1);
    expect(inventory.baseline.sources).toEqual(['pytest-bdd:cucumber-json']);
    expect(inventory.baseline.canonical_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('FR86B_01: records a valid real pytest-bdd artifact as INGESTED even when it joins no authored scenario', () => {
    const fixtureRoot = path.resolve('tests/fixtures/pytest-bdd-sample');
    fs.mkdirSync(path.join(root, '.specs/unjoined'), { recursive: true });
    fs.mkdirSync(path.join(root, '.dev-pomogator'), { recursive: true });
    fs.copyFileSync(path.join(fixtureRoot, 'cucumber-report.json'), path.join(root, '.dev-pomogator/pytest-bdd-report.json'));
    fs.writeFileSync(path.join(root, '.specs/unjoined/FR.md'), '# FR-1: report joins are not ingestion\n');
    fs.writeFileSync(
      path.join(root, '.specs/unjoined/unjoined.feature'),
      '@FR-1\nFeature: Unjoined\n\n  Scenario: FR86B unmatched\n    Given no producer scenario matches\n    Then the artifact remains ingested\n',
    );

    const graph = buildGraph({ repoRoot: root, featureRoots: ['.specs/unjoined'] });
    const inventory = buildReadinessInventory(graph, { spec: 'unjoined' });
    const pytestArtifact = inventory.artifacts.find((artifact) => artifact.kind === 'pytest-bdd-cucumber-json');

    expect(pytestArtifact).toMatchObject({
      canonical: true,
      state: 'INGESTED',
      reason: null,
      provenance: 'pytest-bdd:cucumber-json',
      counts: { parsed: 11, matched: 0, unmatched: 11, malformed: 0 },
    });
    expect(inventory.frs).toEqual([
      expect.objectContaining({
        id: 'FR-1',
        evidence_state: 'exercised',
        canonical_evidence_state: 'NOT_RUN',
        evidence_demotion_reasons: ['SCENARIO_NOT_RUN'],
      }),
    ]);
  });

  it('FR86B_02: keeps absent canonical artifacts distinct from a valid not_run report', () => {
    fs.mkdirSync(path.join(root, '.specs/absent'), { recursive: true });
    fs.writeFileSync(path.join(root, '.specs/absent/FR.md'), '# FR-1: canonical input absence\n');
    fs.writeFileSync(
      path.join(root, '.specs/absent/absent.feature'),
      '@FR-1\nFeature: Absent\n\n  Scenario: FR86B no artifact\n    Given no canonical report exists\n    Then readiness exposes NOT_INGESTED\n',
    );

    const graph = buildGraph({ repoRoot: root, featureRoots: ['.specs/absent'] });
    const inventory = buildReadinessInventory(graph, { spec: 'absent' });

    expect(inventory.artifacts).toEqual([
      expect.objectContaining({
        kind: 'cucumber-messages-ndjson',
        state: 'NOT_INGESTED',
        reason: 'ARTIFACT_ABSENT',
        counts: { parsed: 0, matched: 0, unmatched: 0, malformed: 0 },
      }),
      expect.objectContaining({
        kind: 'pytest-bdd-cucumber-json',
        state: 'NOT_INGESTED',
        reason: 'ARTIFACT_ABSENT',
        counts: { parsed: 0, matched: 0, unmatched: 0, malformed: 0 },
      }),
    ]);
    expect(inventory.frs[0]).toMatchObject({
      evidence_state: 'exercised',
      canonical_evidence_state: 'NOT_INGESTED',
      evidence_demotion_reasons: ['CANONICAL_ARTIFACT_NOT_INGESTED', 'SCENARIO_NOT_RUN'],
    });
  });

  it('ISSUE230_02: prefers exact uri + line over a conflicting secondary scenario_id', () => {
    const first = {
      type: 'Scenario', id: 'SCEN-first', file: 'features/identity.feature', line: 3,
      title: 'First', tags: [], steps: [],
    } satisfies ScenarioNode;
    const second = {
      type: 'Scenario', id: 'SCEN-second', file: 'features/identity.feature', line: 8,
      title: 'Second', tags: [], steps: [],
    } satisfies ScenarioNode;
    const third = {
      type: 'Scenario', id: 'producer-third', file: 'features/canonical-mirror.feature', line: 12,
      title: 'Third', tags: [], steps: [],
    } satisfies ScenarioNode;
    const patch = parseScenarioOverlay([
      JSON.stringify({
        scenario_id: 'SCEN-second', scenario_name: 'First', uri: 'features/identity.feature', line: 3,
        result: 'PASSED', time: '2026-08-18T00:00:00.000Z', source: 'pytest-bdd:cucumber-json',
      }),
      JSON.stringify({
        scenario_id: 'producer-second', scenario_name: 'Second', uri: 'features/identity.feature', line: 8,
        result: 'FAILED', time: '2026-08-18T00:00:01.000Z', source: 'pytest-bdd:cucumber-json',
      }),
      JSON.stringify({
        scenario_id: 'producer-third', scenario_name: 'Third', uri: 'producer/features/identity.feature', line: 99,
        result: 'SKIPPED', time: '2026-08-18T00:00:02.000Z', source: 'pytest-bdd:cucumber-json',
      }),
    ].join('\n'));

    expect(applyScenarioOverlayResults([first, second, third], patch, { repoRoot: root })).toBe(3);
    expect(first.lastResult).toBe('PASSED');
    expect(first.lastRunAt).toBe('2026-08-18T00:00:00.000Z');
    expect(second.lastResult).toBe('FAILED');
    expect(second.lastRunAt).toBe('2026-08-18T00:00:01.000Z');
    expect(third.lastResult).toBe('SKIPPED');
    expect(third.lastRunAt).toBe('2026-08-18T00:00:02.000Z');
  });

  it('ISSUE230_03: preserves canonical pytest-bdd provenance under a newer filtered overlay', () => {
    const fixtureRoot = path.resolve('tests/fixtures/pytest-bdd-sample');
    fs.mkdirSync(path.join(root, '.specs/issue-230'), { recursive: true });
    fs.mkdirSync(path.join(root, '.dev-pomogator'), { recursive: true });
    fs.copyFileSync(path.join(fixtureRoot, 'features/issue_230.feature'), path.join(root, '.specs/issue-230/issue-230.feature'));
    fs.copyFileSync(path.join(fixtureRoot, 'cucumber-report.json'), path.join(root, '.dev-pomogator/pytest-bdd-report.json'));
    const reportTime = new Date('2026-08-18T00:00:00.000Z');
    fs.utimesSync(path.join(root, '.dev-pomogator/pytest-bdd-report.json'), reportTime, reportTime);
    fs.writeFileSync(path.join(root, '.dev-pomogator/.scenario-results.ndjson'), `${JSON.stringify({
      scenario_id: 'SCEN-executed-scenario-01',
      result: 'FAILED',
      time: '2026-08-18T00:01:00.000Z',
      run_id: 'filtered-after-pytest',
      source: 'run-bdd:filtered',
      git_sha: 'fixture-sha',
      trace_id: '.dev-pomogator/.test-history/filtered-after-pytest.ndjson#tcs-1',
      trace_file: '.dev-pomogator/.test-history/filtered-after-pytest.ndjson',
      uri: '.specs/issue-230/issue-230.feature',
      line: 3,
    })}\n`);
    fs.writeFileSync(path.join(root, '.specs/issue-230/FR.md'), '# FR-1: pytest-bdd execution\n');

    const graph = buildGraph({ repoRoot: root, featureRoots: ['.specs/issue-230'] });
    const scenario = graph.nodes.get('issue-230:SCEN-executed-scenario-01') as ScenarioNode;
    const inventory = buildReadinessInventory(graph, { spec: 'issue-230' });
    const row = inventory.scenarios.find((candidate) => candidate.scenario_id === scenario.id);

    expect(scenario.lastResult).toBe('FAILED');
    expect(scenario.trace).toMatchObject({ runId: 'filtered-after-pytest', source: 'run-bdd:filtered' });
    expect(scenario.canonicalResult).toBe('PASSED');
    expect(scenario.canonicalRunId).toBe('pytest-bdd-20260818000000000');
    expect(scenario.canonicalSource).toBe('pytest-bdd:cucumber-json');
    expect(row).toMatchObject({
      result: 'PASSED', run_id: 'pytest-bdd-20260818000000000', source: 'pytest-bdd:cucumber-json',
      timestamp: '2026-08-18T00:00:00.000Z', provenance: 'pytest-bdd-report',
    });
    expect(inventory.baseline.run_ids).toEqual(['pytest-bdd-20260818000000000']);
    expect(inventory.baseline.sources).toEqual(['pytest-bdd:cucumber-json']);
  });

  it('ISSUE230_04: rejects pytest-bdd rows without the secondary producer scenario id', () => {
    const parsed = parsePytestBddReport(JSON.stringify([{
      uri: 'features/issue.feature',
      elements: [{ line: 3, name: 'Missing id', steps: [{ result: { status: 'passed', duration: 1 } }] }],
    }]), { reportTime: '2026-08-18T00:00:00.000Z' });

    expect(parsed.executed).toBe(0);
    expect(parsed.malformed).toBe(1);
    expect(parsed.patch.byScenarioKey.size).toBe(0);
    expect(parsed.patch.byLocation.size).toBe(0);
  });

  it('ISSUE230_05: reports missing canonical per-scenario evidence explicitly', () => {
    const fixtureRoot = path.resolve('tests/fixtures/pytest-bdd-sample');
    fs.mkdirSync(path.join(root, '.specs/issue-230'), { recursive: true });
    fs.copyFileSync(path.join(fixtureRoot, 'features/issue_230.feature'), path.join(root, '.specs/issue-230/issue-230.feature'));
    fs.writeFileSync(path.join(root, '.specs/issue-230/FR.md'), '# FR-1: pytest-bdd execution\n');

    const graph = buildGraph({ repoRoot: root, featureRoots: ['.specs/issue-230'] });
    const evaluation = evaluateReadiness({ inventory: buildReadinessInventory(graph, { spec: 'issue-230' }) });

    expect(evaluation.lanes.EXECUTION.debt).toContain('NO_CANONICAL_SCENARIO_EVIDENCE:22:no canonical per-scenario result evidence found');
    expect(evaluation.lanes.EXECUTION.debt).not.toContain('SCENARIO_NOT_RUN:22');
  });

  it('registers dual-anchor for FR headings into definitions', () => {
    fs.writeFileSync(
      path.join(root, '.specs/auth/FR.md'),
      '## FR-1: Login flow\n',
    );

    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    expect(graph.definitions.get('FR-1')).toEqual({
      file: '.specs/auth/FR.md',
      line: 1,
    });
    expect(graph.definitions.get('fr-1-login-flow')).toEqual({
      file: '.specs/auth/FR.md',
      line: 1,
    });
  });

  it('ingests NDJSON and stamps lastResult onto matching scenarios', () => {
    fs.writeFileSync(
      path.join(root, 'tests/features/auth.feature'),
      'Feature: Auth\n  Scenario: Login\n    Given x\n    Then y\n',
    );

    // NDJSON envelopes with line 2 = the Scenario heading line above.
    const envelopes = [
      JSON.stringify({ meta: { protocolVersion: '32.2.0' } }),
      JSON.stringify({
        gherkinDocument: {
          uri: 'tests/features/auth.feature',
          feature: { children: [{ scenario: { id: 'sc-1', location: { line: 2 } } }] },
        },
      }),
      JSON.stringify({
        pickle: { id: 'pk-1', uri: 'tests/features/auth.feature', name: 'Login', astNodeIds: ['sc-1'] },
      }),
      JSON.stringify({ testCase: { id: 'tc-1', pickleId: 'pk-1' } }),
      JSON.stringify({
        testCaseStarted: {
          id: 'tcs-1',
          testCaseId: 'tc-1',
          timestamp: { seconds: 1_700_000_000, nanos: 0 },
        },
      }),
      JSON.stringify({
        testCaseFinished: {
          testCaseStartedId: 'tcs-1',
          testStepResult: { status: 'PASSED' },
          timestamp: { seconds: 1_700_000_001, nanos: 500_000_000 },
        },
      }),
    ];
    fs.mkdirSync(path.join(root, '.dev-pomogator'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.dev-pomogator', '.last-test-run.ndjson'),
      envelopes.join('\n'),
    );

    const graph = buildGraph({ repoRoot: root });
    const scen = graph.nodes.get('SCEN-login') as ScenarioNode | undefined;
    expect(scen?.lastResult).toBe('PASSED');
    expect(scen?.durationMs).toBe(1500);

    // last-result edge was emitted
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'SCEN-login', to: 'RESULT-SCEN-login-PASSED', type: 'last-result' },
      ]),
    );
  });

  it('merges append-only overlay results after canonical NDJSON', () => {
    fs.writeFileSync(
      path.join(root, 'tests/features/auth.feature'),
      'Feature: Auth\n  Scenario: Login SPECGEN004_529\n    Given x\n    Then y\n',
    );

    const canonical = [
      JSON.stringify({
        gherkinDocument: {
          uri: 'tests/features/auth.feature',
          feature: { children: [{ scenario: { id: 'sc-1', location: { line: 2 } } }] },
        },
      }),
      JSON.stringify({ pickle: { id: 'pk-1', uri: 'tests/features/auth.feature', name: 'Login SPECGEN004_529', astNodeIds: ['sc-1'] } }),
      JSON.stringify({ testCase: { id: 'tc-1', pickleId: 'pk-1' } }),
      JSON.stringify({ testCaseStarted: { id: 'tcs-1', testCaseId: 'tc-1', timestamp: { seconds: 1_700_000_000, nanos: 0 } } }),
      JSON.stringify({ testCaseFinished: { testCaseStartedId: 'tcs-1', testStepResult: { status: 'FAILED' }, timestamp: { seconds: 1_700_000_001, nanos: 0 } } }),
    ];
    fs.mkdirSync(path.join(root, '.dev-pomogator'), { recursive: true });
    fs.writeFileSync(path.join(root, '.dev-pomogator', '.last-test-run.ndjson'), canonical.join('\n'));
    fs.writeFileSync(
      path.join(root, '.dev-pomogator', '.scenario-results.ndjson'),
      JSON.stringify({
        scenario_id: 'SPECGEN004_529',
        result: 'PASSED',
        time: '2027-01-15T08:00:01.000Z',
        run_id: 'run-529',
        source: 'run-bdd:filtered',
        git_sha: 'fixture-sha',
        trace_id: '.dev-pomogator/.test-history/run-529.ndjson#tcs-529',
        trace_file: '.dev-pomogator/.test-history/run-529.ndjson',
        test_case_started_id: 'tcs-529',
        uri: 'tests/features/auth.feature',
        line: 2,
      }) + '\n',
    );

    const graph = buildGraph({ repoRoot: root });
    const scen = graph.nodes.get('SCEN-login-specgen004-529') as ScenarioNode | undefined;
    expect(scen?.lastResult).toBe('PASSED');
    expect(scen?.lastRunAt).toBe('2027-01-15T08:00:01.000Z');
    expect(scen?.canonicalResult).toBe('FAILED');
    expect(scen?.canonicalRunAt).toBe('2023-11-14T22:13:20.000Z');
    expect(scen?.resultStale).toBe(false);
    expect(scen?.trace).toMatchObject({
      traceId: '.dev-pomogator/.test-history/run-529.ndjson#tcs-529',
      traceFile: '.dev-pomogator/.test-history/run-529.ndjson',
      testCaseStartedId: 'tcs-529',
      runId: 'run-529',
      source: 'run-bdd:filtered',
    });
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'SCEN-login-specgen004-529', to: 'RESULT-SCEN-login-specgen004-529-PASSED', type: 'last-result' },
        { from: 'SCEN-login-specgen004-529', to: 'TRACE-.dev-pomogator/.test-history/run-529.ndjson#tcs-529', type: 'runtime-trace' },
      ]),
    );
  });

  it('marks an overlay pass stale when feature source is newer than the pass', () => {
    const featurePath = path.join(root, 'tests/features/auth.feature');
    fs.writeFileSync(
      featurePath,
      'Feature: Auth\n  Scenario: Login SPECGEN004_530\n    Given x\n',
    );
    fs.utimesSync(featurePath, new Date('2001-01-01T00:00:00.000Z'), new Date('2001-01-01T00:00:00.000Z'));
    fs.mkdirSync(path.join(root, '.dev-pomogator'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.dev-pomogator', '.scenario-results.ndjson'),
      JSON.stringify({
        scenario_id: 'SPECGEN004_530',
        result: 'PASSED',
        time: '2000-01-01T00:00:00.000Z',
        uri: 'tests/features/auth.feature',
        line: 2,
      }) + '\n',
    );

    const graph = buildGraph({ repoRoot: root });
    const scen = graph.nodes.get('SCEN-login-specgen004-530') as ScenarioNode | undefined;
    expect(scen?.lastResult).toBe('PASSED');
    expect(scen?.resultStale).toBe(true);
  });

  it('marks an overlay pass stale when a traced step definition is newer than the pass', () => {
    const featurePath = path.join(root, 'tests/features/auth.feature');
    const stepPath = path.join(root, 'tests/step_definitions/auth.ts');
    fs.mkdirSync(path.dirname(stepPath), { recursive: true });
    fs.writeFileSync(
      featurePath,
      'Feature: Auth\n  Scenario: Login SPECGEN004_531\n    Given x\n',
    );
    fs.writeFileSync(stepPath, 'export const step = true;\n');
    fs.utimesSync(featurePath, new Date('1999-01-01T00:00:00.000Z'), new Date('1999-01-01T00:00:00.000Z'));
    fs.utimesSync(stepPath, new Date('2001-01-01T00:00:00.000Z'), new Date('2001-01-01T00:00:00.000Z'));
    fs.mkdirSync(path.join(root, '.dev-pomogator', '.test-history'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.dev-pomogator', '.test-history', 'run-531.ndjson'),
      [
        JSON.stringify({ stepDefinition: { id: 'sd-1', sourceReference: { uri: 'tests/step_definitions/auth.ts' } } }),
        JSON.stringify({ testCase: { id: 'tc-1', testSteps: [{ stepDefinitionIds: ['sd-1'] }] } }),
        JSON.stringify({ testCaseStarted: { id: 'tcs-1', testCaseId: 'tc-1' } }),
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(root, '.dev-pomogator', '.scenario-results.ndjson'),
      JSON.stringify({
        scenario_id: 'SPECGEN004_531',
        result: 'PASSED',
        time: '2000-01-01T00:00:00.000Z',
        uri: 'tests/features/auth.feature',
        line: 2,
        trace_file: '.dev-pomogator/.test-history/run-531.ndjson',
        test_case_started_id: 'tcs-1',
      }) + '\n',
    );

    const graph = buildGraph({ repoRoot: root });
    const scen = graph.nodes.get('SCEN-login-specgen004-531') as ScenarioNode | undefined;
    expect(scen?.lastResult).toBe('PASSED');
    expect(scen?.resultStale).toBe(true);
  });

  it('survives a malformed `.feature` file without aborting the rest', () => {
    fs.writeFileSync(
      path.join(root, '.specs/auth/FR.md'),
      '## FR-1: Alpha\n',
    );
    fs.writeFileSync(
      path.join(root, 'tests/features/broken.feature'),
      'this is not gherkin at all\n@bogus tag with spaces\n',
    );
    fs.writeFileSync(
      path.join(root, 'tests/features/ok.feature'),
      'Feature: OK\n  Scenario: Works\n    Given x\n',
    );

    const graph = buildGraph({ repoRoot: root, skipNdjson: true });
    expect(graph.nodes.get('auth:FR-1')).toBeDefined();
    // Outside `.specs/` (tests/features) ids stay bare (FR-36a).
    expect(graph.nodes.get('SCEN-works')).toBeDefined();
    // The broken scenario produced no node — but the build did not crash.
    expect(graph.nodes.get('SCEN-broken')).toBeUndefined();
  });

  it('stamps `version: 1` and `builtAt` ISO timestamp on every graph', () => {
    fs.writeFileSync(path.join(root, '.specs/auth/FR.md'), '## FR-1: X\n');

    const before = new Date().toISOString();
    const graph = buildGraph({ repoRoot: root, skipNdjson: true });
    const after = new Date().toISOString();

    expect(graph.version).toBe(1);
    expect(graph.builtAt >= before && graph.builtAt <= after).toBe(true);
  });

  it('preserves the FrNode body and anchor pair through the merge', () => {
    fs.writeFileSync(
      path.join(root, '.specs/auth/FR.md'),
      '## FR-7: Edge case handling\n\nLong description...\n',
    );

    const graph = buildGraph({ repoRoot: root, skipNdjson: true });
    const fr = graph.nodes.get('auth:FR-7') as FrNode | undefined;
    expect(fr?.title).toBe('Edge case handling');
    // FR-36b: anchors stay BARE + file-local even though the node key is
    // composite — Marksman / markdown links must be unaffected.
    expect(fr?.anchors).toEqual(['FR-7', 'fr-7-edge-case-handling']);
  });
});
describe('buildGraph — feature alias ownership', () => {
  let aliasRoot: string;

  beforeEach(() => {
    aliasRoot = path.join(os.tmpdir(), `spec-graph-alias-test-${randomUUID()}`);
    fs.mkdirSync(path.join(aliasRoot, '.specs', 'auth'), { recursive: true });
  });
  afterEach(() => fs.rmSync(aliasRoot, { recursive: true, force: true }));

  it('does not attach an ambiguous @feature tag to the direct FR-N node', () => {
    fs.writeFileSync(
      path.join(aliasRoot, '.specs/auth/FR.md'),
      '## FR-1: Legacy flow @feature3\n\n## FR-3: Direct flow\n\n## FR-5: Modern flow @feature3\n',
    );
    fs.writeFileSync(
      path.join(aliasRoot, '.specs/auth/auth.feature'),
      '@feature3\nFeature: Auth\n  Scenario: Ambiguous alias\n    Given x\n    Then y\n',
    );

    const graph = buildGraph({ repoRoot: aliasRoot, skipNdjson: true });
    expect(graph.edges).not.toContainEqual(
      expect.objectContaining({ from: 'auth:FR-3', type: 'tested-by' }),
    );
  });
  it('maps an external owner feature tag through a unique custom alias', () => {
    fs.mkdirSync(path.join(aliasRoot, 'tests', 'features'), { recursive: true });
    fs.writeFileSync(
      path.join(aliasRoot, '.specs/auth/FR.md'),
      '## FR-1: Owner @feature100\n\n## FR-100: Direct\n',
    );
    fs.writeFileSync(
      path.join(aliasRoot, 'tests/features/external.feature'),
      '# Owner: auth\n@feature100\nFeature: External\n  Scenario: Custom owner\n    Given x\n',
    );

    const graph = buildGraph({ repoRoot: aliasRoot, skipNdjson: true });
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: 'auth:FR-1', type: 'tested-by' }));
    expect(graph.edges).not.toContainEqual(expect.objectContaining({ from: 'auth:FR-100', type: 'tested-by' }));
  });
});
describe('buildReadinessInventory — canonical rollup', () => {
  it('uses canonical pass evidence for NFR satisfaction after a filtered failure', () => {
    const nfr = {
      id: 'demo:NFR-1',
      type: 'NFR',
      spec: 'demo',
      file: '.specs/demo/NFR.md',
      line: 1,
      title: 'required performance',
      body: '',
      anchors: ['NFR-1'],
      metadata: { demands: [{ obligation: 'required' }] },
    } as NfrNode;
    const scenario = {
      id: 'demo:SCEN-one',
      type: 'Scenario',
      spec: 'demo',
      file: '.specs/demo/demo.feature',
      line: 1,
      tags: ['@feature1'],
      steps: [],
      lastResult: 'FAILED',
      canonicalResult: 'PASSED',
    } as ScenarioNode;
    const graph: SpecGraph = {
      version: 1,
      builtAt: new Date().toISOString(),
      nodes: new Map([[nfr.id, nfr], [scenario.id, scenario]]),
      edges: [
        { from: nfr.id, to: scenario.id, type: 'tested-by' },
        { from: scenario.id, to: nfr.id, type: 'verifies' },
      ],
      definitions: new Map(),
      backlinks: new Map(),
    };

    const inventory = buildReadinessInventory(graph, { spec: 'demo' });
    expect(inventory.nfr_satisfaction).toMatchObject({ status: 'GREEN', required: 1, satisfied: 1, debt: [] });
  });

  it('FR86B_03: demotes fresh canonical proof when its owning task has a weak test body', () => {
    const fr = {
      id: 'demo:FR-1',
      type: 'FR',
      spec: 'demo',
      file: '.specs/demo/FR.md',
      line: 1,
      title: 'quality-gated requirement',
      body: '',
      anchors: ['FR-1'],
    } as FrNode;
    const scenario = {
      id: 'demo:SCEN-quality',
      type: 'Scenario',
      spec: 'demo',
      file: '.specs/demo/demo.feature',
      line: 3,
      tags: ['@FR-1'],
      steps: [],
      lastResult: 'PASSED',
      canonicalResult: 'PASSED',
      canonicalSource: 'cucumber-messages-ndjson',
    } as ScenarioNode;
    const task = {
      id: 'demo:TASK-quality',
      type: 'Task',
      spec: 'demo',
      file: '.specs/demo/TASKS.md',
      line: 1,
      status: 'done',
      refs: ['FR-1'],
    } as TaskNode;
    const foreignTask = {
      id: 'other:TASK-quality',
      type: 'Task',
      spec: 'other',
      file: '.specs/other/TASKS.md',
      line: 1,
      status: 'done',
      refs: ['FR-1'],
    } as TaskNode;
    const graph: SpecGraph = {
      version: 1,
      builtAt: new Date().toISOString(),
      nodes: new Map([[fr.id, fr], [scenario.id, scenario], [task.id, task], [foreignTask.id, foreignTask]]),
      edges: [{ from: fr.id, to: scenario.id, type: 'tested-by' }],
      definitions: new Map(),
      backlinks: new Map(),
      executionArtifacts: [{
        kind: 'cucumber-messages-ndjson',
        canonical: true,
        state: 'INGESTED',
        reason: null,
        provenance: 'cucumber-messages-ndjson',
        path: '.dev-pomogator/.last-test-run.ndjson',
        run_id: null,
        timestamp: '2026-08-22T00:00:00.000Z',
        counts: { parsed: 1, matched: 1, unmatched: 0, malformed: 0 },
      }],
    };

    const inventory = buildReadinessInventory(graph, {
      spec: 'demo',
      testQualityByTask: { 'demo:TASK-quality': 'WEAK' },
    });

    expect(inventory.frs).toEqual([
      expect.objectContaining({
        evidence_state: 'exercised',
        canonical_evidence_state: 'PARTIAL',
        evidence_demotion_reasons: ['TEST_QUALITY_WEAK'],
      }),
    ]);

    const scopedInventory = buildReadinessInventory(graph, {
      spec: 'demo',
      testQualityByTask: {
        'demo:TASK-quality': 'STRONG',
        'other:TASK-quality': 'WEAK',
      },
    });
    expect(scopedInventory.frs[0]).toEqual(expect.objectContaining({
      canonical_evidence_state: 'VERIFIED',
      evidence_demotion_reasons: [],
    }));
  });
});
