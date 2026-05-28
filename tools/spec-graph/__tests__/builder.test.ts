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
    fs.writeFileSync(
      path.join(root, 'tests/features/auth.feature'),
      '@FR-1\nFeature: Auth\n  Scenario: Login OK\n    Given x\n    Then y\n',
    );

    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    expect(graph.nodes.get('FR-1')?.type).toBe('FR');
    expect(graph.nodes.get('FR-2')?.type).toBe('FR');
    expect(graph.nodes.get('AC-1')?.type).toBe('AC');
    expect(graph.nodes.get('SCEN-login-ok')?.type).toBe('Scenario');

    // covers + tested-by edges
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'FR-1', to: 'AC-1', type: 'covers' },
        { from: 'FR-1', to: 'SCEN-login-ok', type: 'tested-by' },
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
    expect(graph.nodes.get('FR-1')).toBeDefined();
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
    const fr = graph.nodes.get('FR-7') as FrNode | undefined;
    expect(fr?.title).toBe('Edge case handling');
    expect(fr?.anchors).toEqual(['FR-7', 'fr-7-edge-case-handling']);
  });
});
