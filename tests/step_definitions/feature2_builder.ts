/**
 * @feature2 step definitions (FR-2 — SpecGraph builder cold-start) — SPECGEN004_211/212.
 *
 * P3-rollout migration of tools/spec-graph/__tests__/builder.test.ts (6 artifact cases — synthetic
 * tmpdir corpora). Drives the REAL buildGraph end-to-end. 211 pins the graph-structure invariants
 * (MD+Gherkin merge into composite spec-keyed ids, covers/tested-by edges, dual-anchor definitions,
 * preserved FrNode body + bare anchors). 212 pins the runtime invariants (NDJSON ingest stamps
 * lastResult/duration + last-result edge; a malformed .feature does not abort the build; every graph
 * carries version 1 + a builtAt timestamp). vitest twin kept until the gate-switch.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_211/212 · FR.md FR-2
 * @see tools/spec-graph/builder.ts (buildGraph)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import type { FrNode, ScenarioNode } from '../../tools/spec-graph/types.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

type Graph = ReturnType<typeof buildGraph>;
interface BuilderWorld extends V4World {
  bgRoots?: string[];
  bgStructRoot?: string;
  bgStruct?: Graph;
  bgR1?: string;
  bgR2?: string;
  bgR3?: string;
  bgNdjson?: Graph;
  bgMalformed?: Graph;
  bgVersion?: Graph;
  bgBefore?: string;
  bgAfter?: string;
}

function mkRoot(): string {
  const root = path.join(os.tmpdir(), `bg-bdd-${randomUUID()}`);
  fs.mkdirSync(path.join(root, '.specs', 'auth'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests', 'features'), { recursive: true });
  return root;
}

// --- SPECGEN004_211: graph structure ---
Given('a synthetic spec corpus with FR and AC docs and a spec-owned feature', function (this: BuilderWorld) {
  const root = mkRoot();
  fs.writeFileSync(path.join(root, '.specs/auth/FR.md'), '## FR-1: Login flow\n\n## FR-2: Logout flow\n\n## FR-7: Edge case handling\n\nLong description...\n');
  fs.writeFileSync(path.join(root, '.specs/auth/ACCEPTANCE_CRITERIA.md'), '## AC-1 (FR-1)\n\nWHEN x THEN y SHALL z.\n');
  fs.writeFileSync(path.join(root, '.specs/auth/auth.feature'), '@FR-1\nFeature: Auth\n  Scenario: Login OK\n    Given x\n    Then y\n');
  this.bgStructRoot = root;
});

When('buildGraph runs cold-start over it', function (this: BuilderWorld) {
  this.bgStruct = buildGraph({ repoRoot: this.bgStructRoot!, skipNdjson: true });
});

Then(
  'MD nodes and the scenario share composite spec-keyed ids covers and tested-by edges link them dual anchors register in definitions and the FR body and bare anchors are preserved',
  function (this: BuilderWorld) {
    const g = this.bgStruct!;
    assert.equal(g.nodes.get('auth:FR-1')?.type, 'FR', 'nodes are keyed <slug>:<localId> (FR-36a)');
    assert.equal(g.nodes.get('auth:FR-2')?.type, 'FR');
    assert.equal(g.nodes.get('auth:AC-1')?.type, 'AC');
    assert.equal(g.nodes.get('auth:SCEN-login-ok')?.type, 'Scenario');
    assert.equal(g.nodes.get('auth:FR-1')?.spec, 'auth');
    assert.ok(g.edges.some((e) => e.from === 'auth:FR-1' && e.to === 'auth:AC-1' && e.type === 'covers'), 'covers edge on composite keys');
    assert.ok(g.edges.some((e) => e.from === 'auth:FR-1' && e.to === 'auth:SCEN-login-ok' && e.type === 'tested-by'), 'tested-by edge on composite keys');
    assert.deepEqual(g.definitions.get('FR-1'), { file: '.specs/auth/FR.md', line: 1 }, 'compact-id definition');
    assert.deepEqual(g.definitions.get('fr-1-login-flow'), { file: '.specs/auth/FR.md', line: 1 }, 'modern-slug definition');
    const fr7 = g.nodes.get('auth:FR-7') as FrNode | undefined;
    assert.equal(fr7?.title, 'Edge case handling', 'FrNode title preserved through the merge');
    assert.deepEqual(fr7?.anchors, ['FR-7', 'fr-7-edge-case-handling'], 'anchors stay BARE + file-local despite composite key (FR-36b)');
    fs.rmSync(this.bgStructRoot!, { recursive: true, force: true });
  },
);

// --- SPECGEN004_212: runtime (NDJSON ingest, malformed-survival, version stamp) ---
Given('a corpus with a feature plus an NDJSON test-run and separately a corpus with a malformed feature', function (this: BuilderWorld) {
  const r1 = mkRoot();
  fs.writeFileSync(path.join(r1, 'tests/features/auth.feature'), 'Feature: Auth\n  Scenario: Login\n    Given x\n    Then y\n');
  const envelopes = [
    JSON.stringify({ meta: { protocolVersion: '32.2.0' } }),
    JSON.stringify({ gherkinDocument: { uri: 'tests/features/auth.feature', feature: { children: [{ scenario: { id: 'sc-1', location: { line: 2 } } }] } } }),
    JSON.stringify({ pickle: { id: 'pk-1', uri: 'tests/features/auth.feature', name: 'Login', astNodeIds: ['sc-1'] } }),
    JSON.stringify({ testCase: { id: 'tc-1', pickleId: 'pk-1' } }),
    JSON.stringify({ testCaseStarted: { id: 'tcs-1', testCaseId: 'tc-1', timestamp: { seconds: 1_700_000_000, nanos: 0 } } }),
    JSON.stringify({ testCaseFinished: { testCaseStartedId: 'tcs-1', testStepResult: { status: 'PASSED' }, timestamp: { seconds: 1_700_000_001, nanos: 500_000_000 } } }),
  ];
  fs.mkdirSync(path.join(r1, '.dev-pomogator'), { recursive: true });
  fs.writeFileSync(path.join(r1, '.dev-pomogator', '.last-test-run.ndjson'), envelopes.join('\n'));

  const r2 = mkRoot();
  fs.writeFileSync(path.join(r2, '.specs/auth/FR.md'), '## FR-1: Alpha\n');
  fs.writeFileSync(path.join(r2, 'tests/features/broken.feature'), 'this is not gherkin at all\n@bogus tag with spaces\n');
  fs.writeFileSync(path.join(r2, 'tests/features/ok.feature'), 'Feature: OK\n  Scenario: Works\n    Given x\n');

  const r3 = mkRoot();
  fs.writeFileSync(path.join(r3, '.specs/auth/FR.md'), '## FR-1: X\n');

  this.bgR1 = r1;
  this.bgR2 = r2;
  this.bgR3 = r3;
  this.bgRoots = [r1, r2, r3];
});

When('buildGraph runs with NDJSON ingest and again over the malformed corpus', function (this: BuilderWorld) {
  this.bgNdjson = buildGraph({ repoRoot: this.bgR1! });
  this.bgMalformed = buildGraph({ repoRoot: this.bgR2!, skipNdjson: true });
  this.bgBefore = new Date().toISOString();
  this.bgVersion = buildGraph({ repoRoot: this.bgR3!, skipNdjson: true });
  this.bgAfter = new Date().toISOString();
});

Then(
  'the matching scenario gets its lastResult duration and last-result edge the malformed feature does not abort the build and every graph carries version 1 and a builtAt timestamp',
  function (this: BuilderWorld) {
    const n = this.bgNdjson!;
    const scen = n.nodes.get('SCEN-login') as ScenarioNode | undefined;
    assert.equal(scen?.lastResult, 'PASSED', 'NDJSON ingest stamps lastResult');
    assert.equal(scen?.durationMs, 1500, 'and duration in ms');
    assert.ok(n.edges.some((e) => e.from === 'SCEN-login' && e.to === 'RESULT-SCEN-login-PASSED' && e.type === 'last-result'), 'last-result edge emitted');

    const m = this.bgMalformed!;
    assert.ok(m.nodes.get('auth:FR-1'), 'the spec FR still parsed');
    assert.ok(m.nodes.get('SCEN-works'), 'the OK feature still parsed (bare id outside .specs)');
    assert.equal(m.nodes.get('SCEN-broken'), undefined, 'the malformed feature produced no node but did not crash the build');

    const v = this.bgVersion!;
    assert.equal(v.version, 1, 'graph stamped version 1');
    assert.ok(v.builtAt >= this.bgBefore! && v.builtAt <= this.bgAfter!, 'builtAt is an ISO timestamp from the build moment');

    for (const r of this.bgRoots!) fs.rmSync(r, { recursive: true, force: true });
  },
);
