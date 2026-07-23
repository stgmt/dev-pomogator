/**
 * @feature63 step definitions — FR-63 canonical readiness precheck & verdict
 * (Phase 36 foundation), bound to the REAL shared code (no mocks):
 *   555 → precheck + MCP get_spec_status + spec-verdict derive ONE deduplicated
 *         graph inventory (AC-63.1) and a structural-only result stays NOT_READY,
 *   556 → the evidence taxonomy preserves source/time/recency/run identity and
 *         filtered proof never replaces canonical evidence (AC-63.2),
 *   557 → AC readiness exposes honest test_paths=[] + FR never-run taxonomy,
 *         AND-gated over every mandatory lane; dependency-absent evidence is
 *         never success (AC-63.3 / FR-63b / FR-64 boundary).
 *
 * Integration discipline: the steps drive `precheckWithInventory()`, the real
 * MCP `get_spec_status` handler, `runSpecVerdict()` and the shared
 * `buildReadinessInventory` / `evaluateReadiness` over temp fixture corpora
 * with REAL canonical NDJSON + overlay evidence — break the dedup, taxonomy or
 * AND gate and these scenarios fail (no re-implementation to fake-green).
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_555..557
 * @see .specs/spec-generator-v4/FR.md FR-63
 * @see tools/spec-graph/readiness-inventory.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { runSpecVerdict, type SpecVerdictResult } from '../../tools/specs-generator/spec-verdict.ts';
import { parseAcIds } from '../../.claude/skills/spec-status/scripts/ac-claims.ts';
import { buildGraphFromCwd } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { precheckWithInventory, type PrecheckWithInventoryResult } from '../../.claude/skills/spec-status/scripts/precheck.ts';
import {
  buildReadinessInventory,
  classifyEvidence,
  evaluateReadiness,
  type EvidenceOutcome,
  type EvidenceRecord,
  type ReadinessEvaluation,
  type ReadinessInventory,
  type SurfaceLane,
  type ReadinessLaneName,
} from '../../tools/spec-graph/readiness-inventory.ts';

interface F63World extends V4World {
  slug?: string;
  precheckResult?: PrecheckWithInventoryResult;
  mcpPayload?: any;
  verdictResult?: SpecVerdictResult;
  inventory?: ReadinessInventory;
  recordsRoundtrip?: EvidenceRecord[];
  evaluation?: ReadinessEvaluation;
  candidateLanes?: Partial<Record<ReadinessLaneName, SurfaceLane>>;
  passInventory?: ReadinessInventory;
  filteredInventory?: ReadinessInventory;
  depAbsentOutcomes?: { dependency: EvidenceOutcome; sourceTree: EvidenceOutcome };
  depLaneEvaluation?: ReadinessEvaluation;
  passControl?: ReadinessEvaluation;
  staleMcpPayload?: any;
  staleVerdict?: SpecVerdictResult;
}

// ── fixture producers (real canonical NDJSON + overlay evidence) ────────────

async function withGitSha<T>(gitSha: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = process.env.DEV_POMOGATOR_GIT_SHA;
  process.env.DEV_POMOGATOR_GIT_SHA = gitSha;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.DEV_POMOGATOR_GIT_SHA;
    else process.env.DEV_POMOGATOR_GIT_SHA = previous;
  }
}

function lineOf(text: string, needle: string): number {
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => l.includes(needle));
  assert.ok(idx >= 0, `fixture feature is missing "${needle}"`);
  return idx + 1;
}

interface CanonicalEntry {
  name: string;
  uri: string;
  line: number;
  status: 'PASSED' | 'FAILED' | 'UNKNOWN';
  seconds: number;
  tags?: string[];
  message?: string;
}

/**
 * A REAL Cucumber-messages stream — the exact shape the canonical
 * `.last-test-run.ndjson` producer emits and `parseNdjson` ingests.
 * `UNKNOWN` = testCaseStarted with no finished envelope (observed, unresolved).
 */
function canonicalMessages(entries: CanonicalEntry[]): string {
  const rows: string[] = [];
  const byUri = new Map<string, CanonicalEntry[]>();
  for (const e of entries) {
    const arr = byUri.get(e.uri) ?? [];
    arr.push(e);
    byUri.set(e.uri, arr);
  }
  for (const [uri, list] of byUri) {
    rows.push(JSON.stringify({
      gherkinDocument: {
        uri,
        feature: {
          children: list.map((e, i) => ({
            scenario: { id: `sc63-${uri}-${i}`, name: e.name, location: { line: e.line } },
          })),
        },
      },
    }));
  }
  entries.forEach((e, idx) => {
    const siblings = byUri.get(e.uri)!;
    const pickleId = `pk63-${idx}`;
    rows.push(JSON.stringify({
      pickle: {
        id: pickleId,
        uri: e.uri,
        name: e.name,
        tags: (e.tags ?? []).map((t) => ({ name: t })),
        astNodeIds: [`sc63-${e.uri}-${siblings.indexOf(e)}`],
        steps: [{ id: `ps63-${idx}`, text: 'a fixture step' }],
      },
    }));
    rows.push(JSON.stringify({
      testCase: { id: `tc63-${idx}`, pickleId, testSteps: [{ id: `ts63-${idx}`, pickleStepId: `ps63-${idx}` }] },
    }));
    rows.push(JSON.stringify({
      testCaseStarted: { id: `tcs63-${idx}`, testCaseId: `tc63-${idx}`, timestamp: { seconds: e.seconds, nanos: 0 } },
    }));
    if (e.status !== 'UNKNOWN') {
      rows.push(JSON.stringify({
        testStepFinished: {
          testCaseStartedId: `tcs63-${idx}`,
          testStepId: `ts63-${idx}`,
          testStepResult: { status: e.status, ...(e.message ? { message: e.message } : {}) },
        },
      }));
      rows.push(JSON.stringify({
        testCaseFinished: { testCaseStartedId: `tcs63-${idx}`, timestamp: { seconds: e.seconds, nanos: 0 } },
      }));
    }
  });
  return rows.join('\n') + '\n';
}

interface OverlayRowInput {
  scenarioId: string;
  result: string;
  time: string;
  runId: string;
  source: string;
  uri: string;
  line: number;
  tcs: string;
  traceFile: string;
  name: string;
  tags: string[];
  gitSha?: string;
  failingStep?: { step: string; errorMessage: string; status?: string; durationMs?: number | null } | null;
}

/** A REAL compact overlay row — the shape `scripts/bdd-overlay.mjs` appends. */
function overlayRow(o: OverlayRowInput): string {
  return JSON.stringify({
    scenario_id: o.scenarioId,
    result: o.result,
    time: o.time,
    run_id: o.runId,
    source: o.source,
    trace_id: `${o.traceFile}#${o.tcs}`,
    trace_file: o.traceFile,
    test_case_started_id: o.tcs,
    uri: o.uri,
    line: o.line,
    scenario_name: o.name,
    tags: o.tags,
    git_sha: o.gitSha ?? 'fixture-sha',
    failing_step: o.failingStep ?? null,
  });
}

function writeMinimalSpecDocs(dir: string, frs: Array<{ id: number; title: string; acs: number[] }>): void {
  const frLines = ['# Functional Requirements', ''];
  const acLines = ['# Acceptance Criteria', ''];
  for (const fr of frs) {
    frLines.push(`## FR-${fr.id}: ${fr.title}`, '', `Body of FR-${fr.id}.`, '',
      `**Связанные AC:** ${fr.acs.map((n) => `[AC-${n}](ACCEPTANCE_CRITERIA.md#ac-${n}-fr-${fr.id})`).join(', ')}`, '');
    for (const n of fr.acs) {
      acLines.push(`## AC-${n} (FR-${fr.id})`, '',
        `**Требование:** [FR-${fr.id}](FR.md#fr-${fr.id}-${fr.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')})`, '',
        `WHEN the inventory is read THEN AC-${n} SHALL be counted exactly once.`, '');
    }
  }
  fs.writeFileSync(path.join(dir, 'FR.md'), frLines.join('\n'), 'utf-8');
  fs.writeFileSync(path.join(dir, 'ACCEPTANCE_CRITERIA.md'), acLines.join('\n'), 'utf-8');
}

// ── SPECGEN004_555 — one deduplicated inventory across three surfaces ───────

const INV_SECONDS = { passed: 4_100_000_000, unknown: 4_100_000_100 };

function writeInventoryFixture(root: string): void {
  const dir = path.join(root, '.specs', 'inventory-demo');
  fs.mkdirSync(dir, { recursive: true });
  writeMinimalSpecDocs(dir, [
    { id: 1, title: 'Inventory agreement', acs: [1, 2] },
    { id: 2, title: 'Evidence taxonomy', acs: [4] },
    { id: 3, title: 'Never-run FR', acs: [3] },
  ]);
  // Duplicate AC row — the inventory candidate the dedup must catch (AC-63.1).
  fs.appendFileSync(
    path.join(dir, 'ACCEPTANCE_CRITERIA.md'),
    '\n## AC-1 (FR-1)\n\n**Требование:** [FR-1](FR.md#fr-1-inventory-agreement)\n\nDuplicate AC row — same id, must be counted once.\n',
    'utf-8',
  );
  const featureText = [
    'Feature: SPECGEN004_Inventory',
    '',
    '  @feature1',
    '  Scenario: SPECGEN004_600 inventory candidate one',
    '    Given a graph-mapped scenario',
    '',
    '  @feature2',
    '  Scenario: SPECGEN004_601 inventory candidate two',
    '    Given an unresolved scenario',
    '',
    '  @feature3',
    '  Scenario: SPECGEN004_608 never-run candidate',
    '    Given a never-run scenario',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'inventory-demo.feature'), featureText, 'utf-8');
  // Executable mirror of the SAME canonical scenario — the duplicate scenario
  // candidate the inventory must deduplicate to one canonical key.
  const mirrorDir = path.join(root, 'tests', 'features');
  fs.mkdirSync(mirrorDir, { recursive: true });
  fs.writeFileSync(
    path.join(mirrorDir, 'inventory-demo-mirror.feature'),
    [
      'Feature: Inventory demo mirror',
      '',
      '  @feature1',
      '  Scenario: SPECGEN004_600 inventory candidate one',
      '    Given an executable mirror of the same scenario',
      '',
    ].join('\n'),
    'utf-8',
  );
  const uri = '.specs/inventory-demo/inventory-demo.feature';
  const line600 = lineOf(featureText, 'SPECGEN004_600');
  const line601 = lineOf(featureText, 'SPECGEN004_601');
  const dev = path.join(root, '.dev-pomogator');
  fs.mkdirSync(dev, { recursive: true });
  // Baseline canonical full-run: 600 PASSED, 601 observed-but-UNKNOWN.
  fs.writeFileSync(path.join(dev, '.last-test-run.ndjson'), canonicalMessages([
    { name: 'SPECGEN004_600 inventory candidate one', uri, line: line600, status: 'PASSED', seconds: INV_SECONDS.passed, tags: ['@feature1'] },
    { name: 'SPECGEN004_601 inventory candidate two', uri, line: line601, status: 'UNKNOWN', seconds: INV_SECONDS.unknown, tags: ['@feature2'] },
  ]));
  // Run identity: an overlay row carrying run id + source for the canonical pass.
  fs.writeFileSync(path.join(dev, '.scenario-results.ndjson'), overlayRow({
    scenarioId: 'SPECGEN004_600',
    result: 'PASSED',
    time: new Date((INV_SECONDS.passed + 1) * 1000).toISOString(),
    runId: 'run-baseline-555',
    source: 'docker-bdd:full',
    uri,
    line: line600,
    tcs: 'tcs63-inv600',
    traceFile: '.dev-pomogator/.test-history/run-555.ndjson',
    name: 'SPECGEN004_600 inventory candidate one',
    tags: ['@feature1'],
  }) + '\n');
}

function inventoryProjection(inv: ReadinessInventory): unknown {
  return {
    counts: inv.counts,
    frs: inv.frs.map((f) => ({
      id: f.id,
      classification: f.classification,
      never_run: f.never_run,
      scenario_keys: f.scenario_keys,
      ac_ids: f.ac_ids,
    })),
    acs: inv.acs.map((a) => ({ id: a.id, parent_fr: a.parent_fr, test_paths: a.test_paths, scenario_keys: a.scenario_keys })),
    scenarios: inv.scenarios.map((s) => ({ scenario_key: s.scenario_key, outcome: s.outcome })),
    duplicates: inv.duplicates.map((d) => ({ kind: d.kind, key: d.key })),
  };
}

Given(
  'a real fixture has graph-mapped FRs, ACs, scenarios, baseline and run identities, and duplicate inventory candidates',
  function (this: F63World) {
    writeInventoryFixture(this.tempDir);
    this.slug = 'inventory-demo';
  },
);

When('precheck, MCP status, and spec-verdict evaluate the fixture', async function (this: F63World) {
  this.precheckResult = await withGitSha('fixture-sha', () => precheckWithInventory(
    [this.slug!, '--specs-root', path.join(this.tempDir, '.specs')],
    this.tempDir,
  ));
  const graph = await withGitSha('fixture-sha', () => buildGraphFromCwd(this.tempDir));
  const statusTool = buildToolRegistry(() => graph, { repoRoot: this.tempDir }).find((t) => t.name === 'get_spec_status');
  assert.ok(statusTool, 'get_spec_status tool must be registered');
  const status = await statusTool!.handler({ spec: this.slug, view: 'status' });
  this.mcpPayload = JSON.parse((status as any).content[0].text);
  this.verdictResult = await withGitSha('fixture-sha', () =>
    runSpecVerdict(path.join('.specs', this.slug!), { cwd: this.tempDir, semantic: false }),
  );
});

Then(
  'each surface reports the same deduplicated FR, AC, and scenario inventory with mandatory readiness lanes',
  function (this: F63World) {
    assert.ok(this.precheckResult?.inventory, `precheck must carry the graph inventory: ${this.precheckResult?.inventory_error}`);
    assert.equal(this.precheckResult.inventory_error, null);
    assert.ok(this.mcpPayload?.inventory, 'MCP status must carry the graph inventory');
    assert.ok(this.verdictResult?.inventory, 'spec-verdict must carry the graph inventory');

    const precheckProj = inventoryProjection(this.precheckResult.inventory);
    const mcpProj = inventoryProjection(this.mcpPayload.inventory);
    const verdictProj = inventoryProjection(this.verdictResult.inventory);
    assert.deepEqual(mcpProj, precheckProj, 'MCP inventory must equal the precheck inventory');
    assert.deepEqual(verdictProj, precheckProj, 'verdict inventory must equal the precheck inventory');

    // Absolute shape — a consistently-wrong dedup across surfaces still fails.
    const proj = precheckProj as ReturnType<typeof inventoryProjection> & {
      counts: { fr: number; ac: number; scenario: number };
      frs: Array<{ id: string; classification: string }>;
      acs: Array<{ id: string }>;
      scenarios: Array<{ scenario_key: string; outcome: string }>;
      duplicates: Array<{ kind: string; key: string }>;
    };
    assert.deepEqual(proj.counts, { fr: 3, ac: 4, scenario: 3 });
    assert.deepEqual(proj.frs.map((f) => f.id), ['FR-1', 'FR-2', 'FR-3']);
    assert.deepEqual(proj.frs.map((f) => f.classification), ['passed', 'not_passed', 'never_run']);
    assert.deepEqual(proj.acs.map((a) => a.id), ['AC-1', 'AC-2', 'AC-3', 'AC-4']);
    assert.deepEqual(
      proj.scenarios.map((s) => [s.scenario_key, s.outcome]),
      [
        ['specgen004_600', 'PASSED'],
        ['specgen004_601', 'UNKNOWN'],
        ['specgen004_608', 'not_recorded'],
      ],
    );
    // Duplicate candidates surfaced + deduplicated (AC-63.1 uniqueness invariant).
    assert.ok(proj.duplicates.some((d) => d.kind === 'AC' && d.key === 'AC-1'), JSON.stringify(proj.duplicates));
    assert.ok(proj.duplicates.some((d) => d.kind === 'Scenario' && d.key === 'specgen004_600'), JSON.stringify(proj.duplicates));
    // Discovered executable paths: the source feature AND its executable mirror.
    const ac1 = this.precheckResult.inventory.acs.find((a) => a.id === 'AC-1')!;
    assert.ok(ac1.test_paths.includes('.specs/inventory-demo/inventory-demo.feature'), JSON.stringify(ac1.test_paths));
    assert.ok(ac1.test_paths.includes('tests/features/inventory-demo-mirror.feature'), JSON.stringify(ac1.test_paths));

    // Mandatory readiness lanes on every surface.
    assert.deepEqual([...this.precheckResult.readiness!.mandatory_lanes], ['STRUCTURE', 'TRACEABILITY', 'EXECUTION', 'TASK_TRUTH', 'BDD_SYNC']);
    for (const lane of ['STRUCTURE', 'TRACEABILITY', 'EXECUTION', 'TASK_TRUTH', 'BDD_SYNC', 'SEMANTIC', 'FILTERED_PROOF']) {
      assert.ok(this.verdictResult.readiness.lanes[lane as keyof typeof this.verdictResult.readiness.lanes], `verdict must carry lane ${lane}`);
    }
    for (const lane of ['TRACEABILITY', 'EXECUTION', 'TASK_TRUTH', 'BDD_SYNC', 'FILTERED_PROOF']) {
      assert.ok(this.mcpPayload.readiness.lanes[lane], `MCP must carry lane ${lane}`);
    }
  },
);

Then('a structural-only result remains NOT_READY', function (this: F63World) {
  assert.equal(this.precheckResult!.readiness!.overall, 'NOT_READY');
  assert.equal(this.mcpPayload.readiness.overall, 'NOT_READY');
  assert.equal(this.verdictResult!.readiness.overall, 'NOT_READY');
  // A structural pass is not reportable as health (FR-37a survives FR-63).
  assert.match(this.verdictResult!.prefilter.note, /NOT reportable as "valid\/clean\/done"/);
  // The missing-execution truth the inventory makes visible.
  assert.ok(this.verdictResult!.inventory.frs.some((fr) => fr.id === 'FR-3' && fr.never_run));
  assert.notEqual(this.verdictResult!.readiness.lanes.EXECUTION.status, 'GREEN');
  // Mechanical proof: every NON-execution lane green still cannot certify
  // readiness — the AND gate derives EXECUTION from the inventory alone.
  const forced = evaluateReadiness({
    inventory: this.verdictResult!.inventory,
    lanes: {
      STRUCTURE: { status: 'GREEN' },
      TRACEABILITY: { status: 'GREEN' },
      TASK_TRUTH: { status: 'GREEN' },
      BDD_SYNC: { status: 'GREEN' },
      SEMANTIC: { status: 'SKIPPED' },
    },
  });
  assert.equal(forced.overall, 'NOT_READY', 'structural-only readiness must stay NOT_READY');
  assert.equal(forced.lanes.EXECUTION.status, 'RED');
});

// ── SPECGEN004_556 — evidence taxonomy keeps provenance; filtered ≠ canonical ─

const EV_SECONDS = { passed: 4_100_001_000, unknown: 4_100_001_100, failed: 4_100_001_200 };

function writeEvidenceFixture(root: string): void {
  const dir = path.join(root, '.specs', 'evidence-demo');
  fs.mkdirSync(dir, { recursive: true });
  writeMinimalSpecDocs(dir, [{ id: 1, title: 'Evidence provenance', acs: [1] }]);
  const featureText = [
    'Feature: SPECGEN004_Evidence',
    '',
    '  @feature1',
    '  Scenario: SPECGEN004_602 canonical passed evidence',
    '    Given canonical passed evidence',
    '',
    '  @feature1',
    '  Scenario: SPECGEN004_603 unresolved unknown evidence',
    '    Given unresolved evidence',
    '',
    '  @feature1',
    '  Scenario: SPECGEN004_604 never recorded evidence',
    '    Given no evidence at all',
    '',
    '  @feature1',
    '  Scenario: SPECGEN004_605 stale passed evidence',
    '    Given a stale pass',
    '',
    '  @feature1',
    '  Scenario: SPECGEN004_606 filtered only evidence',
    '    Given a filtered-only pass',
    '',
    '  @feature1',
    '  Scenario: SPECGEN004_607 canonical failed behind filtered pass',
    '    Given canonical failed evidence',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'evidence-demo.feature'), featureText, 'utf-8');
  const uri = '.specs/evidence-demo/evidence-demo.feature';
  const lines = {
    602: lineOf(featureText, 'SPECGEN004_602'),
    603: lineOf(featureText, 'SPECGEN004_603'),
    605: lineOf(featureText, 'SPECGEN004_605'),
    606: lineOf(featureText, 'SPECGEN004_606'),
    607: lineOf(featureText, 'SPECGEN004_607'),
  };
  const dev = path.join(root, '.dev-pomogator');
  fs.mkdirSync(dev, { recursive: true });
  // Canonical full-run: 602 PASSED, 603 UNKNOWN (started, never finished),
  // 607 FAILED; 604/605/606 have NO canonical record.
  fs.writeFileSync(path.join(dev, '.last-test-run.ndjson'), canonicalMessages([
    { name: 'SPECGEN004_602 canonical passed evidence', uri, line: lines[602], status: 'PASSED', seconds: EV_SECONDS.passed, tags: ['@feature1'] },
    { name: 'SPECGEN004_603 unresolved unknown evidence', uri, line: lines[603], status: 'UNKNOWN', seconds: EV_SECONDS.unknown, tags: ['@feature1'] },
    { name: 'SPECGEN004_607 canonical failed behind filtered pass', uri, line: lines[607], status: 'FAILED', seconds: EV_SECONDS.failed, tags: ['@feature1'], message: 'canonical failure' },
  ]));
  // Overlay trail: run identity for 602; a STALE pass for 605 (older than the
  // feature source); a FILTERED-only pass for 606; a newer filtered pass for
  // 607 that must NOT replace its canonical FAILED.
  const overlay = [
    overlayRow({
      scenarioId: 'SPECGEN004_602', result: 'PASSED',
      time: new Date((EV_SECONDS.passed + 1) * 1000).toISOString(),
      runId: 'run-556', source: 'docker-bdd:full', uri, line: lines[602],
      tcs: 'tcs63-ev602', traceFile: '.dev-pomogator/.test-history/run-556.ndjson',
      name: 'SPECGEN004_602 canonical passed evidence', tags: ['@feature1'],
    }),
    overlayRow({
      scenarioId: 'SPECGEN004_605', result: 'PASSED',
      time: '2026-01-01T00:00:00.000Z', // older than the freshly-written feature source ⇒ stale
      runId: 'run-556-stale', source: 'docker-bdd:full', uri, line: lines[605],
      tcs: 'tcs63-ev605', traceFile: '.dev-pomogator/.test-history/run-556-stale.ndjson',
      name: 'SPECGEN004_605 stale passed evidence', tags: ['@feature1'],
    }),
    overlayRow({
      scenarioId: 'SPECGEN004_606', result: 'PASSED',
      time: '2099-12-02T06:00:00.000Z',
      runId: 'run-556-filtered', source: 'docker-bdd:filtered', uri, line: lines[606],
      tcs: 'tcs63-ev606', traceFile: '.dev-pomogator/.test-history/run-556-filtered.ndjson',
      name: 'SPECGEN004_606 filtered only evidence', tags: ['@feature1'],
    }),
    overlayRow({
      scenarioId: 'SPECGEN004_607', result: 'PASSED',
      time: '2099-12-02T07:00:00.000Z', // newer than the canonical FAILED — must NOT win
      runId: 'run-556-filtered2', source: 'docker-bdd:filtered', uri, line: lines[607],
      tcs: 'tcs63-ev607', traceFile: '.dev-pomogator/.test-history/run-556-filtered2.ndjson',
      name: 'SPECGEN004_607 canonical failed behind filtered pass', tags: ['@feature1'],
    }),
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(dev, '.scenario-results.ndjson'), overlay);
}

Given(
  'a BDD run has source, timestamp, recency, baseline, run identity, and PASSED, UNKNOWN, not_recorded, stale, or filtered evidence states',
  function (this: F63World) {
    writeEvidenceFixture(this.tempDir);
    this.slug = 'evidence-demo';
  },
);

When('the readiness evaluator serializes graph evidence', async function (this: F63World) {
  const graph = await withGitSha('fixture-sha', () => buildGraphFromCwd(this.tempDir));
  this.inventory = buildReadinessInventory(graph, { spec: this.slug! });
  // Serialization round-trip — a discarded field shows up as a missing key.
  this.recordsRoundtrip = JSON.parse(JSON.stringify(this.inventory.scenarios));
  this.evaluation = evaluateReadiness({ inventory: this.inventory });
});

Then('each state remains explicit and no source, time, or recency field is discarded', function (this: F63World) {
  const byKey = new Map(this.recordsRoundtrip!.map((r) => [r.scenario_key, r]));
  assert.deepEqual(
    [...byKey.entries()].map(([k, r]) => [k, r.outcome]).sort(),
    [
      ['specgen004_602', 'PASSED'],
      ['specgen004_603', 'UNKNOWN'],
      ['specgen004_604', 'not_recorded'],
      ['specgen004_605', 'stale'],
      ['specgen004_606', 'filtered'],
      ['specgen004_607', 'FAILED'],
    ],
    'every evidence state must remain explicit after serialization',
  );
  for (const [key, record] of byKey) {
    for (const field of ['outcome', 'result', 'source', 'run_id', 'timestamp', 'recency', 'provenance']) {
      assert.ok(Object.prototype.hasOwnProperty.call(record, field), `${key} lost field "${field}" on serialization`);
    }
    assert.equal(typeof record.recency.stale, 'boolean', `${key} recency.stale must stay explicit`);
    assert.equal(typeof record.recency.canonical, 'boolean', `${key} recency.canonical must stay explicit`);
  }
  // Recorded states keep their source + source-time; never-run states name the absence.
  for (const key of ['specgen004_602', 'specgen004_603', 'specgen004_605', 'specgen004_606', 'specgen004_607']) {
    assert.ok(byKey.get(key)!.source, `${key} must keep its evidence source`);
    assert.ok(byKey.get(key)!.timestamp, `${key} must keep its source time`);
  }
  const passed = byKey.get('specgen004_602')!;
  assert.equal(passed.run_id, 'run-556', 'run identity must be preserved');
  assert.equal(passed.source, 'docker-bdd:full');
  assert.equal(passed.recency.canonical, true);
  const unknown = byKey.get('specgen004_603')!;
  assert.equal(unknown.recency.canonical, true);
  assert.equal(unknown.source, 'canonical-full-run');
  const notRecorded = byKey.get('specgen004_604')!;
  assert.equal(notRecorded.source, null);
  assert.equal(notRecorded.timestamp, null);
  assert.equal(notRecorded.result, null);
  assert.deepEqual(notRecorded.recency, { stale: false, canonical: false });
  assert.equal(byKey.get('specgen004_605')!.recency.stale, true, 'the stale pass must keep its recency flag');
  assert.equal(byKey.get('specgen004_606')!.source, 'docker-bdd:filtered');
  // Baseline + run identities survive the evaluator.
  assert.ok(this.inventory!.baseline.canonical_timestamp, 'baseline canonical timestamp must be preserved');
  assert.ok(this.inventory!.baseline.run_ids.includes('run-556'), JSON.stringify(this.inventory!.baseline.run_ids));
  for (const source of ['canonical-full-run', 'docker-bdd:full', 'docker-bdd:filtered']) {
    assert.ok(this.inventory!.baseline.sources.includes(source), JSON.stringify(this.inventory!.baseline.sources));
  }
});

Then('filtered proof cannot replace canonical full-run execution evidence', function (this: F63World) {
  const byKey = new Map(this.recordsRoundtrip!.map((r) => [r.scenario_key, r]));
  assert.equal(byKey.get('specgen004_607')!.outcome, 'FAILED', 'a newer filtered PASSED must NOT replace a canonical FAILED');
  assert.equal(byKey.get('specgen004_607')!.recency.canonical, true);
  assert.equal(byKey.get('specgen004_606')!.outcome, 'filtered', 'filtered-only proof stays "filtered", never PASSED');
  const fr1 = this.inventory!.frs.find((fr) => fr.id === 'FR-1')!;
  assert.notEqual(fr1.classification, 'passed', 'filtered/stale/unknown evidence must not pass the FR');
  assert.equal(this.evaluation!.overall, 'NOT_READY');
  assert.notEqual(this.evaluation!.lanes.EXECUTION.status, 'GREEN');
  // A surface may NOT supply EXECUTION green over missing canonical evidence.
  const forced = evaluateReadiness({
    inventory: this.inventory!,
    lanes: {
      STRUCTURE: { status: 'GREEN' },
      TRACEABILITY: { status: 'GREEN' },
      TASK_TRUTH: { status: 'GREEN' },
      BDD_SYNC: { status: 'GREEN' },
      EXECUTION: { status: 'GREEN' },
    },
  });
  assert.notEqual(forced.lanes.EXECUTION.status, 'GREEN', 'EXECUTION is inventory-derived; a caller cannot override it');
  assert.equal(forced.overall, 'NOT_READY');
});

// ── SPECGEN004_557 — empty test_paths, never-run FRs, AND-gated mandatory lanes ─

const TAX_SECONDS = { pass610: 4_100_002_000, pass613: 4_100_002_100 };

function writeTaxonomyFixture(root: string): void {
  const taxonomy = path.join(root, '.specs', 'taxonomy-demo');
  fs.mkdirSync(taxonomy, { recursive: true });
  writeMinimalSpecDocs(taxonomy, [
    { id: 1, title: 'Passed lane', acs: [1] },
    { id: 2, title: 'Never-run lane', acs: [2] },
    { id: 3, title: 'Unmapped lane', acs: [3] },
  ]);
  const featureText = [
    'Feature: SPECGEN004_Taxonomy',
    '',
    '  @feature1',
    '  Scenario: SPECGEN004_610 passed lane evidence',
    '    Given passed evidence',
    '',
    '  @feature2',
    '  Scenario: SPECGEN004_611 never-run lane evidence',
    '    Given never-run evidence',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(taxonomy, 'taxonomy-demo.feature'), featureText, 'utf-8');

  // Control spec: canonical PASSED everywhere — the gate CAN pass on real evidence.
  const passDemo = path.join(root, '.specs', 'pass-demo');
  fs.mkdirSync(passDemo, { recursive: true });
  writeMinimalSpecDocs(passDemo, [{ id: 1, title: 'Canonical pass control', acs: [1] }]);
  const passFeature = [
    'Feature: SPECGEN004_Pass',
    '',
    '  @feature1',
    '  Scenario: SPECGEN004_613 canonical pass control',
    '    Given canonical pass evidence',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(passDemo, 'pass-demo.feature'), passFeature, 'utf-8');

  // Filtered-only spec: its FR must never classify as "passed".
  const filteredDemo = path.join(root, '.specs', 'filtered-demo');
  fs.mkdirSync(filteredDemo, { recursive: true });
  writeMinimalSpecDocs(filteredDemo, [{ id: 1, title: 'Filtered only FR', acs: [1] }]);
  const filteredFeature = [
    'Feature: SPECGEN004_Filtered',
    '',
    '  @feature1',
    '  Scenario: SPECGEN004_614 filtered only evidence',
    '    Given filtered-only evidence',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(filteredDemo, 'filtered-demo.feature'), filteredFeature, 'utf-8');

  const dev = path.join(root, '.dev-pomogator');
  fs.mkdirSync(dev, { recursive: true });
  fs.writeFileSync(path.join(dev, '.last-test-run.ndjson'), canonicalMessages([
    { name: 'SPECGEN004_610 passed lane evidence', uri: '.specs/taxonomy-demo/taxonomy-demo.feature', line: lineOf(featureText, 'SPECGEN004_610'), status: 'PASSED', seconds: TAX_SECONDS.pass610, tags: ['@feature1'] },
    { name: 'SPECGEN004_613 canonical pass control', uri: '.specs/pass-demo/pass-demo.feature', line: lineOf(passFeature, 'SPECGEN004_613'), status: 'PASSED', seconds: TAX_SECONDS.pass613, tags: ['@feature1'] },
  ]));
  fs.writeFileSync(path.join(dev, '.scenario-results.ndjson'), overlayRow({
    scenarioId: 'SPECGEN004_614', result: 'PASSED',
    time: '2099-12-02T08:00:00.000Z',
    runId: 'run-557-filtered', source: 'docker-bdd:filtered',
    uri: '.specs/filtered-demo/filtered-demo.feature', line: lineOf(filteredFeature, 'SPECGEN004_614'),
    tcs: 'tcs63-tx614', traceFile: '.dev-pomogator/.test-history/run-557-filtered.ndjson',
    name: 'SPECGEN004_614 filtered only evidence', tags: ['@feature1'],
  }) + '\n');
}

Given(
  /mapped AC ids include an AC with test_paths=\[\] and a never-run FR and readiness lanes have mixed pass and missing evidence/,
  async function (this: F63World) {
    writeTaxonomyFixture(this.tempDir);
    this.slug = 'taxonomy-demo';
    const graph = await withGitSha('fixture-sha', () => buildGraphFromCwd(this.tempDir));
    this.inventory = buildReadinessInventory(graph, { spec: 'taxonomy-demo' });
    this.passInventory = buildReadinessInventory(graph, { spec: 'pass-demo' });
    this.filteredInventory = buildReadinessInventory(graph, { spec: 'filtered-demo' });
    // Mixed lanes: three green, TASK_TRUTH evidence MISSING (not evaluated) —
    // EXECUTION stays inventory-derived (never-run FRs present).
    this.candidateLanes = {
      STRUCTURE: { status: 'GREEN' },
      TRACEABILITY: { status: 'GREEN' },
      BDD_SYNC: { status: 'GREEN' },
    };
  },
);

When('the FR-61 readiness taxonomy evaluates the candidate', function (this: F63World) {
  this.evaluation = evaluateReadiness({ inventory: this.inventory!, lanes: this.candidateLanes });
  this.depAbsentOutcomes = {
    dependency: classifyEvidence({
      id: 'taxonomy-demo:SCEN-specgen004-612-absent',
      lastResult: 'PASSED',
      lastRunAt: '2099-01-01T00:00:00.000Z',
      trace: { source: 'dependency-absent' },
    }).outcome,
    sourceTree: classifyEvidence({
      id: 'taxonomy-demo:SCEN-specgen004-612-tree',
      lastResult: 'PASSED',
      lastRunAt: '2099-01-01T00:00:00.000Z',
      trace: { source: 'source-tree' },
    }).outcome,
  };
  this.depLaneEvaluation = evaluateReadiness({
    inventory: this.passInventory!,
    lanes: {
      STRUCTURE: { status: 'DEPENDENCY_ABSENT' },
      TRACEABILITY: { status: 'GREEN' },
      TASK_TRUTH: { status: 'GREEN' },
      BDD_SYNC: { status: 'GREEN' },
    },
  });
  this.passControl = evaluateReadiness({
    inventory: this.passInventory!,
    lanes: {
      STRUCTURE: { status: 'GREEN' },
      TRACEABILITY: { status: 'GREEN' },
      TASK_TRUTH: { status: 'GREEN' },
      BDD_SYNC: { status: 'GREEN' },
    },
  });
});

Then(
  /the result exposes the AC ids, test_paths=\[\], and explicit never-run classification while AND-gating every mandatory lane/,
  function (this: F63World) {
    const inv = this.inventory!;
    assert.deepEqual(inv.acs.map((a) => a.id), ['AC-1', 'AC-2', 'AC-3']);
    const ac3 = inv.acs.find((a) => a.id === 'AC-3')!;
    assert.deepEqual(ac3.test_paths, [], 'an unmapped AC must expose an HONEST test_paths=[]');
    assert.ok(inv.acs.find((a) => a.id === 'AC-1')!.test_paths.length > 0, 'a mapped AC with a discovered feature must expose its test paths');
    assert.ok(inv.acs.find((a) => a.id === 'AC-2')!.test_paths.length > 0, 'a never-run AC still exposes the feature path that maps it');

    const fr2 = inv.frs.find((f) => f.id === 'FR-2')!;
    const fr3 = inv.frs.find((f) => f.id === 'FR-3')!;
    assert.equal(fr2.never_run, true, 'an FR whose scenarios were never run must be explicitly never_run');
    assert.equal(fr2.classification, 'never_run');
    assert.equal(fr3.never_run, true, 'an FR with no scenarios must be explicitly never_run');
    assert.equal(fr3.classification, 'never_run');
    assert.equal(inv.frs.find((f) => f.id === 'FR-1')!.classification, 'passed');

    const ev = this.evaluation!;
    assert.equal(ev.overall, 'NOT_READY');
    assert.deepEqual([...ev.mandatory_lanes], ['STRUCTURE', 'TRACEABILITY', 'EXECUTION', 'TASK_TRUTH', 'BDD_SYNC']);
    for (const lane of [...ev.mandatory_lanes, 'SEMANTIC', 'FILTERED_PROOF']) {
      assert.ok(ev.lanes[lane], `lane ${lane} must be rendered`);
    }
    // AND gate: three green lanes do NOT override one missing + one red lane.
    assert.equal(ev.lanes.STRUCTURE.blocking, false);
    assert.equal(ev.lanes.TRACEABILITY.blocking, false);
    assert.equal(ev.lanes.BDD_SYNC.blocking, false);
    assert.equal(ev.lanes.TASK_TRUTH.status, 'NOT_EVALUATED');
    assert.equal(ev.lanes.TASK_TRUTH.blocking, true, 'missing lane evidence must block the AND gate');
    assert.equal(ev.lanes.EXECUTION.blocking, true);
    const debt = ev.lanes.EXECUTION.debt.join(' ');
    assert.match(debt, /FR_NEVER_RUN:FR-2,FR-3/);
    assert.match(debt, /SCENARIO_NOT_RUN:1/);
    assert.match(ev.next_action, /full Docker BDD suite/);
    assert.match(ev.next_action, /FR-2, FR-3/);
  },
);

Then(
  'it reports the next action without treating dependency-absent evidence as source-tree success or dependency-absent FR-64 evidence as FR-63 success',
  function (this: F63World) {
    // Dependency-absent / source-tree proof may not classify as a pass.
    assert.equal(this.depAbsentOutcomes!.dependency, 'UNKNOWN', 'dependency-absent evidence may not classify as PASSED');
    assert.equal(this.depAbsentOutcomes!.sourceTree, 'UNKNOWN', 'source-tree-only evidence may not classify as PASSED');

    // FR-64-shaped dependency absence in a lane: blocks, NEVER succeeds.
    assert.equal(this.depLaneEvaluation!.lanes.STRUCTURE.status, 'DEPENDENCY_ABSENT');
    assert.equal(this.depLaneEvaluation!.lanes.STRUCTURE.blocking, true);
    assert.equal(this.depLaneEvaluation!.overall, 'NOT_READY', 'dependency absence is NOT FR-63 success');
    assert.match(this.depLaneEvaluation!.next_action, /absent dependencies|dependency absence is not readiness proof/i);

    // Control: the gate CAN pass on real canonical evidence (not a blanket NOT_READY).
    assert.equal(this.passControl!.overall, 'READY');
    assert.equal(this.passControl!.lanes.EXECUTION.status, 'GREEN');

    // A filtered-only FR never classifies as passed, and its lane stays red.
    const filteredFr = this.filteredInventory!.frs.find((f) => f.id === 'FR-1')!;
    assert.notEqual(filteredFr.classification, 'passed', 'filtered-only evidence must not pass an FR');
    assert.equal(this.filteredInventory!.scenarios[0].outcome, 'filtered');
    const filteredEval = evaluateReadiness({
      inventory: this.filteredInventory!,
      lanes: {
        STRUCTURE: { status: 'GREEN' },
        TRACEABILITY: { status: 'GREEN' },
        TASK_TRUTH: { status: 'GREEN' },
        BDD_SYNC: { status: 'GREEN' },
      },
    });
    assert.equal(filteredEval.overall, 'NOT_READY');
    assert.equal(filteredEval.lanes.EXECUTION.status, 'RED');
  },
);

Given('a spec whose canonical full-run pass became stale after a source change', function (this: F63World) {
  writeInventoryFixture(this.tempDir);
  this.slug = 'inventory-demo';
  const feature = path.join(this.tempDir, '.specs', this.slug, `${this.slug}.feature`);
  const future = new Date('2099-12-31T23:59:59.000Z');
  fs.utimesSync(feature, future, future);
});

When('MCP status and spec-verdict evaluate the same graph snapshot', async function (this: F63World) {
  const graph = await withGitSha('fixture-sha', () => buildGraphFromCwd(this.tempDir));
  const statusTool = buildToolRegistry(() => graph, { repoRoot: this.tempDir }).find((tool) => tool.name === 'get_spec_status');
  assert.ok(statusTool, 'get_spec_status must exist');
  const status = await statusTool.handler({ spec: this.slug, view: 'status' });
  this.staleMcpPayload = JSON.parse(status.content[0].text);
  this.staleVerdict = await runSpecVerdict(path.join('.specs', this.slug!), { cwd: this.tempDir, semantic: false });
});

Then('both surfaces report the stale scenario as effective execution debt', function (this: F63World) {
  const mcpDebt = this.staleMcpPayload.readiness.lanes.EXECUTION.debt as string[];
  const verdictDebt = this.staleVerdict!.readiness.lanes.EXECUTION.debt;
  assert.ok(mcpDebt.some((item) => /SCENARIO_STALE|stale/i.test(item)), JSON.stringify(mcpDebt));
  assert.deepEqual(mcpDebt, verdictDebt, 'MCP and spec-verdict must consume the same effective execution lane');
});

Then('both surfaces report EXECUTION RED and OVERALL NOT_READY', function (this: F63World) {
  assert.equal(this.staleMcpPayload.readiness.lanes.EXECUTION.status, 'RED');
  assert.equal(this.staleVerdict!.readiness.lanes.EXECUTION.status, 'RED');
  assert.equal(this.staleMcpPayload.readiness.overall, 'NOT_READY');
  assert.equal(this.staleVerdict!.readiness.overall, 'NOT_READY');
});

Then('canonical coverage remains visible without overriding effective readiness', function (this: F63World) {
  assert.ok(this.staleMcpPayload.canonical_coverage.totals.passed > 0);
  assert.ok(this.staleMcpPayload.coverage.totals.stale > 0);
  assert.equal(this.staleMcpPayload.readiness.lanes.EXECUTION.blocking, true);
});

Then('dotted acceptance criterion ids remain exact in the spec-status parser', function () {
  assert.deepEqual(parseAcIds('## AC-63.10 (FR-63.2): exact dotted ids'), [
    { id: 'AC-63.10', fr: 'FR-63.2' },
  ]);
});
