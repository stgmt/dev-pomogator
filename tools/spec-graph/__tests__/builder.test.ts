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
import type { FrNode, ScenarioNode } from '../types.ts';

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
