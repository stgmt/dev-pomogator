/**
 * Tests for the SpecGraph incremental rebuilder (Phase 1, FR-2, NFR-Performance-2).
 *
 * The chokidar watcher is asynchronous + filesystem-flaky, so these tests
 * drive the deterministic `applyChange` / `applyUnlink` helpers directly.
 * They cover the four mutation contracts the watcher relies on:
 *
 *   1. add of a new MD file appends nodes + backlinks idempotently.
 *   2. change of an existing MD file replaces only that file's slice.
 *   3. unlink drops every node + edge + definition tied to the file.
 *   4. NFR-Performance-2 — a single-file change patches in ≤100ms p95.
 *
 * The bench branch runs 20 single-file change iterations; the hard
 * assertion is p95 ≤ 100ms (NFR-Performance-2). On the CI corpus we
 * typically see p95 ≤ 5ms — the budget exists for the wall-clock host.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { buildGraph } from '../builder.ts';
import { applyChange, applyUnlink, dropFileSlice } from '../incremental.ts';
import type { TaskNode } from '../types.ts';

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  return sortedMs[Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length))];
}

describe('incremental — applyChange / applyUnlink / dropFileSlice', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `spec-graph-inc-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs', 'auth'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('change replaces a file slice — old nodes gone, new nodes in', () => {
    fs.writeFileSync(
      path.join(root, '.specs/auth/FR.md'),
      '## FR-1: Old title\n',
    );
    const graph = buildGraph({ repoRoot: root, skipNdjson: true });
    expect(graph.nodes.get('auth:FR-1')?.type).toBe('FR');
    expect(graph.definitions.get('fr-1-old-title')).toBeDefined();

    // Rewrite the file with a new heading + new line for the same id.
    fs.writeFileSync(
      path.join(root, '.specs/auth/FR.md'),
      '\n\n## FR-1: New title\n',
    );
    applyChange(graph, root, '.specs/auth/FR.md');

    // FR-36a: the watcher patch applies the SAME spec-qualification as the
    // cold build — no bare-id duplicate may appear next to the composite key.
    expect(graph.nodes.get('auth:FR-1')?.type).toBe('FR');
    expect(graph.nodes.has('FR-1')).toBe(false);
    // The old slug alias must be gone, the new one present.
    expect(graph.definitions.get('fr-1-old-title')).toBeUndefined();
    expect(graph.definitions.get('fr-1-new-title')).toBeDefined();
  });

  it('change of TASKS.md preserves Task nodes with updated status (regression)', () => {
    // Bug 2026-06-15: classify() routed TASKS.md to the 'md' branch, which
    // dropFileSlice()'d every Task node then re-parsed with parseMarkdownFile
    // (emits NO Task nodes) — so any TASKS.md edit (e.g. a set_entity_status
    // write) wiped all tasks for the spec from the live graph until restart.
    // The cold build parses TASKS.md with BOTH md + tasks parsers; the
    // incremental path must mirror that.
    fs.writeFileSync(
      path.join(root, '.specs/auth/TASKS.md'),
      '## Phase 1\n\n- [ ] Build the thing — id: build-thing — Status: TODO\n  _Requirements:_ FR-1\n  **Done When:**\n  - [ ] it works\n',
    );
    const graph = buildGraph({ repoRoot: root, skipNdjson: true });
    expect(graph.nodes.get('auth:build-thing')?.type).toBe('Task');
    expect((graph.nodes.get('auth:build-thing') as TaskNode).status).toBe('todo');

    // Flip the status on disk (exactly what set_entity_status does) and patch.
    fs.writeFileSync(
      path.join(root, '.specs/auth/TASKS.md'),
      '## Phase 1\n\n- [ ] Build the thing — id: build-thing — Status: IN_PROGRESS\n  _Requirements:_ FR-1\n  **Done When:**\n  - [ ] it works\n',
    );
    applyChange(graph, root, '.specs/auth/TASKS.md');

    // The node MUST survive the patch (it was dropped before the fix) and carry
    // the new status — back-to-back set_entity_status calls depend on this.
    const node = graph.nodes.get('auth:build-thing');
    expect(node?.type).toBe('Task');
    expect((node as TaskNode).status).toBe('in-progress');
  });

  it('add wires a brand-new spec file into the graph', () => {
    fs.writeFileSync(path.join(root, '.specs/auth/FR.md'), '## FR-1: A\n');
    const graph = buildGraph({ repoRoot: root, skipNdjson: true });
    expect(graph.nodes.has('logout:FR-2')).toBe(false);

    fs.mkdirSync(path.join(root, '.specs/logout'), { recursive: true });
    fs.writeFileSync(path.join(root, '.specs/logout/FR.md'), '## FR-2: B\n');
    applyChange(graph, root, '.specs/logout/FR.md');

    expect(graph.nodes.get('logout:FR-2')?.type).toBe('FR');
    expect(graph.definitions.get('FR-2')).toEqual({
      file: '.specs/logout/FR.md',
      line: 1,
    });
  });

  it('unlink drops nodes + edges + definitions tied to the file', () => {
    fs.writeFileSync(path.join(root, '.specs/auth/FR.md'), '## FR-1: A\n');
    fs.writeFileSync(
      path.join(root, '.specs/auth/ACCEPTANCE_CRITERIA.md'),
      '## AC-1 (FR-1)\n',
    );
    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    expect(graph.nodes.has('auth:FR-1')).toBe(true);
    expect(graph.nodes.has('auth:AC-1')).toBe(true);
    expect(graph.edges).toContainEqual({ from: 'auth:FR-1', to: 'auth:AC-1', type: 'covers' });

    fs.rmSync(path.join(root, '.specs/auth/ACCEPTANCE_CRITERIA.md'));
    applyUnlink(graph, '.specs/auth/ACCEPTANCE_CRITERIA.md');

    expect(graph.nodes.has('auth:FR-1')).toBe(true); // FR.md untouched
    expect(graph.nodes.has('auth:AC-1')).toBe(false);
    expect(graph.edges).not.toContainEqual({ from: 'auth:FR-1', to: 'auth:AC-1', type: 'covers' });
    // FR-36b: anchor aliases stay bare — the definitions index uses them.
    expect(graph.definitions.has('AC-1')).toBe(false);
  });

  it('dropFileSlice returns the set of removed ids for downstream consumers', () => {
    fs.writeFileSync(
      path.join(root, '.specs/auth/FR.md'),
      '## FR-1: A\n## FR-2: B\n',
    );
    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    const { removedNodeIds } = dropFileSlice(graph, '.specs/auth/FR.md');
    expect(Array.from(removedNodeIds).sort()).toEqual(['auth:FR-1', 'auth:FR-2']);
    expect(graph.nodes.has('auth:FR-1')).toBe(false);
    expect(graph.nodes.has('auth:FR-2')).toBe(false);
  });

  it('idempotent on no-op change of an unrelated file', () => {
    fs.writeFileSync(path.join(root, '.specs/auth/FR.md'), '## FR-1: A\n');
    const graph = buildGraph({ repoRoot: root, skipNdjson: true });
    const nodesBefore = graph.nodes.size;
    const edgesBefore = graph.edges.length;

    // Apply on a non-existent path — should noop, not throw.
    const delta = applyChange(graph, root, '.specs/auth/MISSING.md');
    expect(delta).toEqual({ nodesDelta: 0, edgesDelta: 0 });
    expect(graph.nodes.size).toBe(nodesBefore);
    expect(graph.edges.length).toBe(edgesBefore);
  });

  it('NFR-Performance-2: 20 single-file changes complete with p95 ≤ 100ms', () => {
    // Seed corpus: 5 FR files + 2 AC files + 1 .feature.
    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(
        path.join(root, '.specs/auth/', `FR${i}.md`),
        `## FR-${i}: Feature ${i}\n`,
      );
    }
    fs.writeFileSync(
      path.join(root, '.specs/auth/ACCEPTANCE_CRITERIA.md'),
      '## AC-1 (FR-1)\n## AC-2 (FR-2)\n',
    );
    fs.mkdirSync(path.join(root, 'tests/features'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'tests/features/auth.feature'),
      '@FR-1\nFeature: Auth\n  Scenario: Login\n    Given x\n',
    );
    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    const samples: number[] = [];
    for (let iter = 0; iter < 20; iter++) {
      const fr = (iter % 5) + 1;
      fs.writeFileSync(
        path.join(root, '.specs/auth/', `FR${fr}.md`),
        `## FR-${fr}: Feature ${fr} (rev ${iter})\n`,
      );
      const start = process.hrtime.bigint();
      applyChange(graph, root, `.specs/auth/FR${fr}.md`);
      samples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
    }
    samples.sort((a, b) => a - b);
    const p95 = percentile(samples, 95);
    // eslint-disable-next-line no-console
    console.log(
      `[incremental] p50=${percentile(samples, 50).toFixed(2)}ms p95=${p95.toFixed(2)}ms n=20`,
    );
    expect(p95).toBeLessThanOrEqual(100);
  });
});
