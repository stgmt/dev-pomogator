/**
 * Unit: FR-49d stale-marker reconciler report (tools/spec-graph/stale-marker-scan.ts).
 * The detection logic (findStaleInProgress) lives in + is tested via task-census; this
 * pins the human REPORT — its empty/non-empty branches were unexercised (the CLI main()
 * is a subprocess and out of reach of mutation testing).
 */
import { describe, it, expect } from 'vitest';
import { renderStaleReport } from '../stale-marker-scan.ts';
import type { StaleMarker } from '../task-census.ts';

describe('renderStaleReport — FLAG-ONLY stale in-progress report', () => {
  it('reports the clean case when there are no stale markers', () => {
    const out = renderStaleReport([]);
    expect(out).toContain('No stale in-progress markers');
  });

  it('counts the markers, names each, and points at set_entity_status (never auto-closes)', () => {
    const stale = [
      { id: 'demo:t1', title: 'Build the thing', scenarios: ['s1', 's2'], spec: 'demo' },
      { id: 'demo:t2', title: 'Other work', scenarios: ['s3'], spec: 'demo' },
    ] as unknown as StaleMarker[];
    const out = renderStaleReport(stale);
    expect(out).toContain('2 likely-stale');
    expect(out, 'flag-only: must point at the manual close, not auto-close').toContain('set_entity_status');
    expect(out).toContain('demo:t1');
    expect(out).toContain('Build the thing');
    expect(out, 's1 + s2 → 2 green scenarios').toContain('2 green scenario(s)');
    expect(out).toContain('demo:t2');
    expect(out, 'distinct count for the single-scenario marker').toContain('1 green scenario(s)');
  });
});
