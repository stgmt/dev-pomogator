/**
 * Step definitions for SPECGEN004_377 — multilang real-builder roundtrip.
 *
 * Covers the gap left by SPECGEN004_65..69 in feature31_multilang.ts:
 *   B3: real `buildGraph()` call with featureRoots override, then MCP
 *       get_trace / get_test_result surface per-scenario lastResult.
 *   B4: FAILED scenarios carry a non-empty `failingStep.errorMessage`.
 *
 * All step patterns are REGEX-scoped to the "multilang roundtrip" vocabulary
 * to avoid collision with feature31_multilang.ts's step patterns (which use
 * phrases like "detectRunner is invoked on the fixture file", "the test
 * ingests the fixture", etc.).
 *
 * Implementation mirrors the vitest `buildGraphForFixture` helper from
 * `tests/e2e/multilang-ingest-roundtrip.test.ts`:
 *   1. Read `tests/fixtures/<fixture-dir>/output.ndjson`
 *   2. Extract embedded `.feature` source from the NDJSON `source` envelope
 *   3. Materialise `.feature` at the NDJSON URI inside `this.tempDir`
 *   4. Materialise a minimal `FR.md` at `.specs/<slug>/FR.md` in `this.tempDir`
 *   5. Drop NDJSON at `.dev-pomogator/.last-test-run.ndjson` in `this.tempDir`
 *   6. Call `buildGraph({ repoRoot: this.tempDir, featureRoots })` — REAL builder
 *   7. Build MCP tool registry via `buildToolRegistry(() => graph)`
 *   8. Assert get_trace + get_test_result + failingStep.errorMessage
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_377
 * @see .specs/spec-generator-v4/FR.md FR-31
 * @see tests/e2e/multilang-ingest-roundtrip.test.ts (vitest being retired)
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import type { ScenarioNode, SpecGraph } from '../../tools/spec-graph/types.ts';
import type { V4World } from '../hooks/before-after.ts';

/** Absolute path to the repo root (same technique as feature31_multilang.ts). */
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * Extract the embedded Gherkin `.feature` source from a Cucumber Messages
 * NDJSON stream. The `source` envelope carries the original file content —
 * we replay it into tmpdir so line numbers match the pickles exactly.
 */
function extractFeatureSource(ndjsonContent: string, expectedUri: string): string {
  for (const line of ndjsonContent.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let env: { source?: { uri?: string; data?: string } };
    try { env = JSON.parse(line); } catch { continue; }
    if (env.source?.uri === expectedUri && typeof env.source.data === 'string') {
      return env.source.data;
    }
  }
  throw new Error(`No source envelope for URI "${expectedUri}" found in NDJSON`);
}

interface RoundtripWorld extends V4World {
  /** Columns parsed from the Scenario Outline row. */
  rt?: {
    fixtureDir: string;
    featureUri: string;
    frId: string;
    frTitle: string;
    qualifiedFrId: string;
    expectedPassed: string;
    expectedFailed: string;
  };
  /** SpecGraph built by `buildGraph()` over the materialised tmpdir. */
  rtGraph?: SpecGraph;
  /** get_trace response payload. */
  rtTraceResult?: { ok: boolean; scenarios: Array<{ id: string; lastResult: string }> };
  /** get_test_result response for the FAILED scenario. */
  rtTestResult?: { ok: boolean; lastResult: string };
}

// ─── Given ─────────────────────────────────────────────────────────────────

/**
 * SPECGEN004_377 Given step.
 *
 * Reads the fixture NDJSON and stores the row parameters on the World.
 * No tmpdir materialisation yet — that happens in the When.
 *
 * Pattern is REGEX to avoid Cucumber Expression `<placeholder>` parsing
 * and to distinguish it from the feature31_multilang.ts Given patterns
 * ("the fixture `tests/fixtures/...` exists alongside its `README.md`").
 */
Given(
  /^the multilang roundtrip fixture directory `([^`]+)` with featureUri `([^`]+)` frId `([^`]+)` frTitle `([^`]+)`$/,
  function (this: RoundtripWorld, fixtureDir: string, featureUri: string, frId: string, frTitle: string) {
    const fixturePath = path.join(REPO_ROOT, 'tests', 'fixtures', fixtureDir, 'output.ndjson');
    assert.ok(
      fs.existsSync(fixturePath),
      `multilang roundtrip: fixture NDJSON missing at ${fixturePath}`,
    );
    // Derive the qualified FR id from the fixture dir: "reqnroll-sample" → "reqnroll:FR-1"
    const slug = fixtureDir.replace(/-sample$/, '');
    const qualifiedFrId = `${slug}:${frId}`;
    this.rt = {
      fixtureDir,
      featureUri,
      frId,
      frTitle,
      qualifiedFrId,
      // These will be set by the Then step via the Examples columns; we store
      // temporary placeholders here and overwrite in the Then steps where the
      // outline columns are available.  The actual expected values are asserted
      // against the Examples row — but the Then steps receive the column values
      // from the scenario outline so we can use them directly.
      expectedPassed: '',
      expectedFailed: '',
    };
  },
);

// ─── When ──────────────────────────────────────────────────────────────────

/**
 * SPECGEN004_377 When step — the core of B3.
 *
 * Materialises the fixture into `this.tempDir` (provided by the V4World
 * Before hook), then calls the REAL `buildGraph()` with a `featureRoots`
 * override so the builder locates the materialised `.feature` file that
 * lives outside the default `.specs/` / `tests/features/` scan roots.
 */
When(
  /^the multilang roundtrip materialises the fixture into a tmpdir and calls buildGraph with featureRoots override$/,
  function (this: RoundtripWorld) {
    const rt = this.rt!;
    const tmpRoot = this.tempDir;  // fresh per-scenario tempDir from V4World Before hook

    const ndjsonContent = fs.readFileSync(
      path.join(REPO_ROOT, 'tests', 'fixtures', rt.fixtureDir, 'output.ndjson'),
      'utf-8',
    );
    const featureSource = extractFeatureSource(ndjsonContent, rt.featureUri);

    // 1. Materialise the .feature at the URI the NDJSON pickles reference.
    const featureAbs = path.join(tmpRoot, rt.featureUri);
    fs.mkdirSync(path.dirname(featureAbs), { recursive: true });
    fs.writeFileSync(featureAbs, featureSource);

    // 2. Materialise a minimal FR.md so the builder can resolve the @FR-N tag.
    const slug = rt.fixtureDir.replace(/-sample$/, '');
    const specDir = path.join(tmpRoot, '.specs', slug);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'FR.md'),
      `## ${rt.frId}: ${rt.frTitle}\n\nFixture spec for the ${rt.fixtureDir} ingest roundtrip.\n`,
    );

    // 3. Drop the NDJSON at the builder's default ingest location.
    const ndjsonDir = path.join(tmpRoot, '.dev-pomogator');
    fs.mkdirSync(ndjsonDir, { recursive: true });
    fs.writeFileSync(path.join(ndjsonDir, '.last-test-run.ndjson'), ndjsonContent);

    // 4. Call the REAL builder with featureRoots override.
    //    The fixture's featureUri (e.g. "features/Auth.feature") sits under a
    //    root dir (e.g. "features") that the builder does not scan by default.
    const featureRootDir = rt.featureUri.split('/')[0];
    this.rtGraph = buildGraph({
      repoRoot: tmpRoot,
      featureRoots: ['.specs', 'tests/features', featureRootDir],
    });
  },
);

// ─── Then ──────────────────────────────────────────────────────────────────

/**
 * SPECGEN004_377 Then step 1 — assert FR + Scenario nodes are in the graph.
 */
Then(
  /^the SpecGraph contains a `([^`]+)` FR node and scenario nodes for `([^`]+)` and `([^`]+)`$/,
  function (this: RoundtripWorld, qualifiedFrId: string, expectedPassed: string, expectedFailed: string) {
    const graph = this.rtGraph!;

    // Store the expected IDs on the World so later Then steps can reuse them.
    this.rt!.expectedPassed = expectedPassed;
    this.rt!.expectedFailed = expectedFailed;

    const frNode = graph.nodes.get(qualifiedFrId);
    assert.ok(frNode, `multilang roundtrip: FR node "${qualifiedFrId}" missing from graph`);
    assert.equal(frNode.type, 'FR', `expected node type FR, got ${frNode.type}`);

    for (const scenId of [expectedPassed, expectedFailed]) {
      const scen = graph.nodes.get(scenId);
      assert.ok(scen, `multilang roundtrip: Scenario node "${scenId}" missing from graph`);
      assert.equal(scen.type, 'Scenario', `expected node type Scenario for ${scenId}, got ${scen.type}`);
    }
  },
);

/**
 * SPECGEN004_377 Then step 2 — drive MCP get_trace and assert lastResult per scenario.
 *
 * Drives the REAL MCP tool registry exactly as the MCP server would.
 */
Then(
  /^MCP get_trace of `([^`]+)` returns lastResult PASSED for `([^`]+)` and FAILED for `([^`]+)`$/,
  async function (this: RoundtripWorld, qualifiedFrId: string, expectedPassed: string, expectedFailed: string) {
    const tools = buildToolRegistry(() => this.rtGraph!);
    const getTrace = tools.find((t) => t.name === 'get_trace');
    assert.ok(getTrace, 'multilang roundtrip: get_trace tool must be registered');

    const result = await getTrace.handler({ node_id: qualifiedFrId });
    const payload = JSON.parse(result.content[0].text) as {
      ok: boolean;
      scenarios: Array<{ id: string; lastResult: string }>;
    };
    assert.ok(payload.ok, `get_trace returned ok=false: ${JSON.stringify(payload)}`);

    this.rtTraceResult = payload;

    const byId = new Map(payload.scenarios.map((s) => [s.id, s.lastResult]));
    assert.equal(
      byId.get(expectedPassed),
      'PASSED',
      `multilang roundtrip: get_trace did not surface PASSED for ${expectedPassed}; got ${byId.get(expectedPassed) ?? 'undefined'} — scenarios: ${JSON.stringify(payload.scenarios)}`,
    );
    assert.equal(
      byId.get(expectedFailed),
      'FAILED',
      `multilang roundtrip: get_trace did not surface FAILED for ${expectedFailed}; got ${byId.get(expectedFailed) ?? 'undefined'} — scenarios: ${JSON.stringify(payload.scenarios)}`,
    );
  },
);

/**
 * SPECGEN004_377 Then step 3 — drive MCP get_test_result for the FAILED scenario.
 */
Then(
  /^MCP get_test_result of `([^`]+)` returns lastResult FAILED$/,
  async function (this: RoundtripWorld, expectedFailed: string) {
    const tools = buildToolRegistry(() => this.rtGraph!);
    const getTestResult = tools.find((t) => t.name === 'get_test_result');
    assert.ok(getTestResult, 'multilang roundtrip: get_test_result tool must be registered');

    const result = await getTestResult.handler({ scenario_id: expectedFailed });
    const payload = JSON.parse(result.content[0].text) as { ok: boolean; lastResult: string };
    assert.ok(payload.ok, `get_test_result returned ok=false: ${JSON.stringify(payload)}`);
    assert.equal(
      payload.lastResult,
      'FAILED',
      `multilang roundtrip: get_test_result for ${expectedFailed} returned ${payload.lastResult}, expected FAILED`,
    );
    this.rtTestResult = payload;
  },
);

/**
 * SPECGEN004_377 Then step 4 — B4: the FAILED ScenarioNode carries failingStep.errorMessage.
 *
 * This is the main gap from the vitest: the graph's ScenarioNode for a FAILED
 * scenario MUST have a non-empty `failingStep.errorMessage` populated by the
 * NDJSON ingester (ndjson.ts lines 258-266, 325, 383).
 */
Then(
  /^the multilang roundtrip FAILED scenario `([^`]+)` carries a non-empty failingStep errorMessage$/,
  function (this: RoundtripWorld, expectedFailed: string) {
    const graph = this.rtGraph!;
    const scen = graph.nodes.get(expectedFailed) as ScenarioNode | undefined;
    assert.ok(scen, `multilang roundtrip: scenario node "${expectedFailed}" missing from graph`);
    assert.equal(scen.lastResult, 'FAILED', `expected FAILED scenario, got ${scen.lastResult}`);
    assert.ok(
      scen.failingStep,
      `multilang roundtrip: FAILED scenario "${expectedFailed}" has no failingStep`,
    );
    assert.ok(
      typeof scen.failingStep.errorMessage === 'string' && scen.failingStep.errorMessage.length > 0,
      `multilang roundtrip: FAILED scenario "${expectedFailed}" failingStep.errorMessage is empty or missing; got: ${JSON.stringify(scen.failingStep)}`,
    );
  },
);
