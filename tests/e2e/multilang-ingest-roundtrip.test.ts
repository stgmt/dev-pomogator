/**
 * End-to-end roundtrip for the multi-language NDJSON adapter (FR-31, AC-31.1/2).
 *
 * For each of the three real-runner fixtures (reqnroll / behave / cucumber-jvm),
 * this suite pins the full ingest pipeline:
 *
 *   1. `detectRunner(file)` returns the expected language tag.
 *   2. `parseNdjson(file)` produces a TestResultPatch with ≥2 scenarios that
 *      include at least one PASSED and one FAILED.
 *   3. Mirroring the on-disk feature into a tmpdir + copying the NDJSON to
 *      `.dev-pomogator/.last-test-run.ndjson`, `buildGraph()` then merges the
 *      results into the in-memory SpecGraph. The MCP tool registry's
 *      `get_trace(FR-N)` SHALL surface the same per-scenario lastResult values,
 *      and `get_test_result(SCEN-...)` SHALL agree on a per-scenario basis.
 *
 * Why tmpdir + featureRoots override: the fixture `.feature` content lives
 * inside the NDJSON itself (`source.data`) but is NOT shipped as a separate
 * `.feature` file under `tests/fixtures/`; we materialise it into a tmpdir
 * because the builder needs the live file on disk to produce Scenario nodes,
 * and `tests/features/` already holds the project's own feature corpus.
 *
 * @see .specs/spec-generator-v4/FR.md FR-31
 * @see .specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md AC-31.1, AC-31.2
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { detectRunner } from '../../tools/spec-graph/parsers/multilang.ts';
import { parseNdjson } from '../../tools/spec-graph/parsers/ndjson.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import type { ScenarioNode, SpecGraph } from '../../tools/spec-graph/types.ts';

interface FixtureSpec {
  /** Display name used in the test title. */
  label: string;
  /** Fixture directory under `tests/fixtures/`. */
  dirname: string;
  /** Expected `detectRunner` return value. */
  expectedRunner: 'reqnroll' | 'behave' | 'cucumber-jvm';
  /** FR id tagged on the feature (matches NDJSON `@FR-N` tag). */
  frId: string;
  /** FR title written into FR.md (purely cosmetic — keeps the heading well-formed). */
  frTitle: string;
  /**
   * Repo-relative POSIX path of the `.feature` file as it appears in the
   * NDJSON `pickle.uri`. The test materialises a file at the same relative
   * path inside the tmpdir so the builder sees the same URI.
   */
  featureUri: string;
  /**
   * Expected scenario-id → status map. Scenario ids are derived by the
   * Gherkin parser via `SCEN-${slugify(name)}`, so they're a function of
   * the scenario name embedded in the NDJSON `source.data`.
   */
  expected: { [scenarioId: string]: 'PASSED' | 'FAILED' };
}

const FIXTURES: FixtureSpec[] = [
  {
    label: 'Reqnroll',
    dirname: 'reqnroll-sample',
    expectedRunner: 'reqnroll',
    frId: 'FR-1',
    frTitle: 'Authentication',
    featureUri: 'features/Auth.feature',
    expected: {
      'SCEN-login-ok': 'PASSED',
      'SCEN-login-wrong-password': 'FAILED',
    },
  },
  {
    label: 'behave',
    dirname: 'behave-sample',
    expectedRunner: 'behave',
    frId: 'FR-2',
    frTitle: 'Checkout flow',
    featureUri: 'features/checkout.feature',
    expected: {
      'SCEN-add-item-to-cart': 'PASSED',
      'SCEN-apply-expired-coupon': 'FAILED',
    },
  },
  {
    label: 'Cucumber-JVM',
    dirname: 'jvm-sample',
    expectedRunner: 'cucumber-jvm',
    frId: 'FR-3',
    frTitle: 'Payment processing',
    featureUri: 'src/test/resources/features/payment.feature',
    expected: {
      'SCEN-charge-succeeds': 'PASSED',
      'SCEN-insufficient-funds': 'FAILED',
    },
  },
];

/**
 * Extract the embedded `.feature` source from an NDJSON stream. Cucumber
 * Messages ship the original Gherkin text inside the `source` envelope —
 * we replay that into the tmpdir so line numbers line up exactly.
 */
function extractFeatureSource(ndjson: string, expectedUri: string): string {
  for (const line of ndjson.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let env: { source?: { uri?: string; data?: string } };
    try {
      env = JSON.parse(line);
    } catch {
      continue;
    }
    if (env.source?.uri === expectedUri && typeof env.source.data === 'string') {
      return env.source.data;
    }
  }
  throw new Error(`No source envelope for URI ${expectedUri} found in NDJSON`);
}

/** Locate a fixture file relative to this test file (works in any cwd). */
function fixturePath(dirname: string): string {
  // Compiled vs source: vitest runs the TS directly, so __dirname-equivalent
  // is `dirname(import.meta.url)` — but we can also derive from `process.cwd`
  // (the test runner pins cwd to repo root). Use cwd to keep things simple.
  return path.resolve(process.cwd(), 'tests', 'fixtures', dirname);
}

/**
 * Helper: build a graph from a freshly-prepared tmpdir whose .feature URI
 * matches the fixture NDJSON's pickle URI. Returns the graph + the tmpdir
 * path for downstream tools to inspect.
 */
function buildGraphForFixture(spec: FixtureSpec): {
  graph: SpecGraph;
  ndjson: string;
} {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `mlir-${spec.dirname}-`));
  try {
    const fixDir = fixturePath(spec.dirname);
    const ndjson = fs.readFileSync(path.join(fixDir, 'output.ndjson'), 'utf-8');
    const featureSource = extractFeatureSource(ndjson, spec.featureUri);

    // Materialise the .feature at the URI the NDJSON expects.
    const featureAbs = path.join(tmpRoot, spec.featureUri);
    fs.mkdirSync(path.dirname(featureAbs), { recursive: true });
    fs.writeFileSync(featureAbs, featureSource);

    // Materialise the FR.md whose id matches the @FR-N tag on the feature.
    const specSlug = spec.dirname.replace(/-sample$/, '');
    const specDir = path.join(tmpRoot, '.specs', specSlug);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'FR.md'),
      `## ${spec.frId}: ${spec.frTitle}\n\nFixture spec for the ${spec.label} ingest roundtrip.\n`,
    );

    // Drop the NDJSON at the default ingest location.
    const ndjsonDir = path.join(tmpRoot, '.dev-pomogator');
    fs.mkdirSync(ndjsonDir, { recursive: true });
    fs.writeFileSync(path.join(ndjsonDir, '.last-test-run.ndjson'), ndjson);

    // Override `featureRoots` because the NDJSON URI points outside the
    // builder's default scan paths (`.specs` / `tests/features`).
    const featureRootDir = spec.featureUri.split('/')[0];
    const graph = buildGraph({
      repoRoot: tmpRoot,
      featureRoots: ['.specs', 'tests/features', featureRootDir],
    });
    return { graph, ndjson };
  } finally {
    // Tmpdir cleanup happens in the test's afterEach via the registered path.
    afterTestCleanup.push(tmpRoot);
  }
}

const afterTestCleanup: string[] = [];

describe('multilang NDJSON ingest — full roundtrip from real-runner fixtures', () => {
  afterEach(() => {
    while (afterTestCleanup.length > 0) {
      const p = afterTestCleanup.pop()!;
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; nothing to do on Windows file-locking races.
      }
    }
  });

  for (const spec of FIXTURES) {
    describe(`${spec.label} fixture (${spec.dirname})`, () => {
      it(`AC-31.1: detectRunner returns "${spec.expectedRunner}"`, () => {
        const ndjson = fs.readFileSync(
          path.join(fixturePath(spec.dirname), 'output.ndjson'),
          'utf-8',
        );
        expect(detectRunner(ndjson)).toBe(spec.expectedRunner);
      });

      it('AC-31.1: parseNdjson produces ≥2 scenarios with ≥1 PASSED and ≥1 FAILED', () => {
        const ndjson = fs.readFileSync(
          path.join(fixturePath(spec.dirname), 'output.ndjson'),
          'utf-8',
        );
        const patch = parseNdjson(ndjson);
        const fields = Array.from(patch.byLocation.values());
        expect(fields.length).toBeGreaterThanOrEqual(2);
        const passed = fields.filter((f) => f.lastResult === 'PASSED').length;
        const failed = fields.filter((f) => f.lastResult === 'FAILED').length;
        expect(passed).toBeGreaterThanOrEqual(1);
        expect(failed).toBeGreaterThanOrEqual(1);
      });

      it('AC-31.2: builder + MCP get_trace surface per-scenario lastResult', () => {
        const { graph } = buildGraphForFixture(spec);

        const fr = graph.nodes.get(spec.frId);
        expect(fr, `FR node ${spec.frId} missing from graph`).toBeDefined();
        expect(fr!.type).toBe('FR');

        // Sanity: each expected Scenario node landed in the graph.
        for (const scenarioId of Object.keys(spec.expected)) {
          const s = graph.nodes.get(scenarioId);
          expect(s, `Scenario ${scenarioId} missing from graph`).toBeDefined();
          expect(s!.type).toBe('Scenario');
        }

        // Drive the registry exactly as the MCP server would.
        const tools = buildToolRegistry(() => graph);
        const getTrace = tools.find((t) => t.name === 'get_trace')!;
        const getTestResult = tools.find((t) => t.name === 'get_test_result')!;

        // get_trace(FR-N) → scenarios[] with matching lastResult per-scenario.
        return getTrace.handler({ node_id: spec.frId }).then((traceResult) => {
          const payload = JSON.parse(traceResult.content[0].text) as {
            ok: boolean;
            scenarios: Array<{ id: string; lastResult: string }>;
          };
          expect(payload.ok).toBe(true);
          const byId = new Map(payload.scenarios.map((s) => [s.id, s.lastResult]));
          for (const [scenarioId, expectedStatus] of Object.entries(spec.expected)) {
            expect(
              byId.get(scenarioId),
              `get_trace did not surface lastResult for ${scenarioId}`,
            ).toBe(expectedStatus);
          }

          // get_test_result(SCEN-...) → identical statuses per-scenario.
          return Promise.all(
            Object.entries(spec.expected).map(async ([scenarioId, expectedStatus]) => {
              const result = await getTestResult.handler({ scenario_id: scenarioId });
              const r = JSON.parse(result.content[0].text) as {
                ok: boolean;
                lastResult: string;
              };
              expect(r.ok).toBe(true);
              expect(r.lastResult).toBe(expectedStatus);
            }),
          );
        });
      });

      it('AC-31.2: FAILED scenarios carry the failing-step error message', () => {
        const { graph } = buildGraphForFixture(spec);
        // Find any expected-FAILED scenario for this fixture.
        const failedId = Object.entries(spec.expected).find(([, s]) => s === 'FAILED')?.[0];
        expect(failedId).toBeDefined();
        const scen = graph.nodes.get(failedId!) as ScenarioNode | undefined;
        expect(scen?.lastResult).toBe('FAILED');
        expect(scen?.failingStep).toBeTruthy();
        expect(scen?.failingStep?.errorMessage.length ?? 0).toBeGreaterThan(0);
      });
    });
  }
});
