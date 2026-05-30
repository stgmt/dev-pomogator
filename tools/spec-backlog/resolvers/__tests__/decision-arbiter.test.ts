import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { decisionArbiter } from '../decision-arbiter.ts';
import type { BacklogEntry } from '../../types.ts';

function mkEntry(slug: string, specA: string, specB: string): BacklogEntry {
  return {
    id: 'test5678efgh',
    ts: '2026-05-31T00:00:00Z',
    slug,
    code: 'cross-spec/contradictory-nfr',
    category: 'contradictory-nfr',
    evidence: { spec_a: specA, spec_b: specB },
    suggested_resolver: 'decision-arbiter',
    difficulty: 'hard',
    status: 'open',
  };
}

describe.skip('decision-arbiter resolver', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `arb-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs/perf-spec'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tools/impl'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('generates recommendation when spec_a and spec_b have contradictory NFRs', async () => {
    // Create implementation files with references to one value
    fs.writeFileSync(
      path.join(root, 'tools/impl/worker.ts'),
      [
        'export const CACHE_TTL_MS = 500;',
        'export const TIMEOUT = 500;',
        'export const RETRY_DELAY = 500;',
      ].join('\n'),
    );

    const entry = mkEntry('perf-spec', 'latency = 500ms', 'latency = 200ms');
    const result = await decisionArbiter.resolve({ repoRoot: root, entry });

    expect(result.bailed_out).toBeUndefined();
    expect(result.files_changed).toEqual(['.specs/perf-spec/DECISION_RECOMMENDATION.md']);
    expect(result.confidence).toBe(0.7);

    const rec = fs.readFileSync(path.join(root, '.specs/perf-spec/DECISION_RECOMMENDATION.md'), 'utf8');
    expect(rec).toContain('Decision Recommendation');
    expect(rec).toContain('500ms');
    expect(rec).toContain('200ms');
    expect(rec).toContain('Code-Based Ground Truth');
  });

  it('bails out when spec_a or spec_b is missing', async () => {
    const entry = mkEntry('perf-spec', 'latency = 500ms', '');
    const result = await decisionArbiter.resolve({ repoRoot: root, entry });

    expect(result.bailed_out?.reason).toBe('incomplete-evidence');
    expect(result.confidence).toBe(0);
  });

  it('bails out when no NFR markers are found in specs', async () => {
    const entry = mkEntry('perf-spec', 'No numeric constraints here', 'Just plain text');
    const result = await decisionArbiter.resolve({ repoRoot: root, entry });

    expect(result.bailed_out?.reason).toBe('no-nfr-markers');
    expect(result.confidence).toBe(0);
  });

  it('idempotent — does NOT overwrite existing DECISION_RECOMMENDATION.md', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/perf-spec/DECISION_RECOMMENDATION.md'),
      '# Manual recommendation\nKeep this.\n',
    );

    const entry = mkEntry('perf-spec', 'latency = 500ms', 'latency = 200ms');
    const result = await decisionArbiter.resolve({ repoRoot: root, entry });

    expect(result.bailed_out?.reason).toBe('already-arbitrated');
    expect(result.files_changed).toEqual([]);

    const rec = fs.readFileSync(path.join(root, '.specs/perf-spec/DECISION_RECOMMENDATION.md'), 'utf8');
    expect(rec).toContain('Keep this');
  });

  it('handles multiple contradictory NFRs in one decision', async () => {
    // Create impl files with distinct value patterns
    fs.writeFileSync(
      path.join(root, 'tools/impl/config.ts'),
      [
        'export const MAX_CONNECTIONS = 100;',
        'export const CACHE_SIZE = 256;',
        'export const TIMEOUT_MS = 1000;',
      ].join('\n'),
    );

    const entry = mkEntry(
      'perf-spec',
      'max_connections = 100, cache_size = 256',
      'max_connections = 50, cache_size = 512',
    );

    const result = await decisionArbiter.resolve({ repoRoot: root, entry });

    expect(result.bailed_out).toBeUndefined();
    const rec = fs.readFileSync(path.join(root, '.specs/perf-spec/DECISION_RECOMMENDATION.md'), 'utf8');

    // Should analyze both conflicts
    expect(rec).toContain('max_connections');
    expect(rec).toContain('cache_size');
    expect(rec).toContain('100');
    expect(rec).toContain('256');
  });

  it('bails out when NFRs have same values (no actual conflict)', async () => {
    const entry = mkEntry('perf-spec', 'latency = 500ms', 'latency = 500ms');
    const result = await decisionArbiter.resolve({ repoRoot: root, entry });

    expect(result.bailed_out?.reason).toBe('no-conflicts');
    expect(result.confidence).toBe(0);
  });

  it('recommends value with higher code frequency as ground truth', async () => {
    // Create impl files with many refs to one value, few to another
    fs.writeFileSync(
      path.join(root, 'tools/impl/high-freq.ts'),
      [
        'const val1 = 5000;',
        'const val2 = 5000;',
        'const val3 = 5000;',
        'const val4 = 100;',
      ].join('\n'),
    );

    const entry = mkEntry('perf-spec', 'timeout_ms = 5000', 'timeout_ms = 100');
    const result = await decisionArbiter.resolve({ repoRoot: root, entry });

    expect(result.bailed_out).toBeUndefined();
    const rec = fs.readFileSync(path.join(root, '.specs/perf-spec/DECISION_RECOMMENDATION.md'), 'utf8');

    // Should recommend 5000 (appears 3x) over 100 (appears 1x)
    expect(rec).toContain('5000');
    expect(rec).toMatch(/Code Occurrences.*[3]/); // At least one tally showing 3+
  });
});
