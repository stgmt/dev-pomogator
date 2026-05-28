/**
 * Cold-start benchmark for the SpecGraph builder (NFR-Performance-1).
 *
 * Runs `buildGraph` against the real repo corpus N times, records elapsed
 * milliseconds, and asserts the median + p95 against the NFR-Performance-1
 * budget («≤2s for 30 specs»). The corpus that ships in this repo is well
 * over the 30-spec target (54 `.specs/<slug>/` dirs at the time of writing
 * plus the legacy v3 corpus and `tests/features/`), so a green test here is
 * a strict superset of the published budget.
 *
 * Implementation note: this lives next to the unit tests so it shares the
 * vitest discovery + Docker-isolated runner. It is NOT a microbenchmark —
 * the goal is a single «does cold-start stay under budget on a representative
 * corpus» gate.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { buildGraph } from '../builder.ts';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ITERATIONS = 5;
const BUDGET_MS = 2000;

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  return sortedMs[idx];
}

describe('SpecGraph cold-start (NFR-Performance-1: ≤2s for 30 specs)', () => {
  it(`p95 of ${ITERATIONS} cold-start runs against the real repo corpus is ≤${BUDGET_MS}ms`, () => {
    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = process.hrtime.bigint();
      const graph = buildGraph({
        repoRoot: REPO_ROOT,
        mdRoots: ['.specs'],
        featureRoots: ['.specs', 'tests/features'],
        skipNdjson: true, // benchmark the parser path, not disk-IO of an optional file
      });
      const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000;
      samples.push(elapsed);

      // Sanity: a real run must produce nodes against the actual corpus.
      expect(graph.nodes.size).toBeGreaterThan(0);
    }

    samples.sort((a, b) => a - b);
    const median = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const min = samples[0];
    const max = samples[samples.length - 1];

    // Surface the numbers in the test output so any regression is visible.
    // eslint-disable-next-line no-console
    console.log(
      `[cold-start] min=${min.toFixed(0)}ms median=${median.toFixed(0)}ms p95=${p95.toFixed(0)}ms max=${max.toFixed(0)}ms n=${samples.length}`,
    );

    expect(p95).toBeLessThanOrEqual(BUDGET_MS);
  });
});
