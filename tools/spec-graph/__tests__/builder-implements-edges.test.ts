/**
 * Integration tests for FR-29 — builder wires `implements` edges + `File`
 * nodes from FILE_CHANGES.md and DESIGN.md.
 *
 * Each test materialises a tiny spec corpus on disk under `os.tmpdir()` and
 * calls the real `buildGraph` (no mocks, no stubs). Assertions verify the
 * three FR-29 acceptance criteria:
 *
 *   AC-29.1 — 5 unique paths in FILE_CHANGES.md → 5 File nodes + matching
 *             implements edges (one per (FR, path) pair).
 *   AC-29.2 — DESIGN.md "App-код" citation → implements edge with
 *             source_section='DESIGN'.
 *   AC-29.3 — Glob path skipped with a single warn-once log entry per build;
 *             no implements edge created; build does not crash.
 *
 * Additional pins:
 *   - Empty FILE_CHANGES.md → 0 implements edges, builder doesn't crash.
 *   - Path appearing in both FILE_CHANGES and DESIGN → single File node
 *     (deduped); FILE_CHANGES precedence wins (action metadata present).
 *
 * @see ../builder.ts
 * @see ../parsers/file-changes.ts
 * @see ../parsers/design.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { buildGraph } from '../builder.ts';
import type { Edge, FileNode } from '../types.ts';

function writeSpec(root: string, slug: string, files: Record<string, string>): void {
  const dir = path.join(root, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
}

function implementsEdges(edges: Edge[]): Edge[] {
  return edges.filter((e) => e.type === 'implements');
}

describe('buildGraph — FR-29 implements edges + File nodes', () => {
  let root: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = path.join(os.tmpdir(), `spec-graph-impl-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('AC-29.1: 5 paths in FILE_CHANGES → 5 File nodes + 5 implements edges', () => {
    const fr = '## FR-1: Alpha\n\n## FR-2: Beta\n';
    const fc = [
      '# File Changes',
      '',
      '| Path | Action | Reason |',
      '|------|--------|--------|',
      '| `src/a.ts` | create | Foo for FR-1 |',
      '| `src/b.ts` | edit | Bar for FR-1 |',
      '| `src/c.ts` | create | Baz for FR-2 |',
      '| `src/d.ts` | edit | Qux for FR-2 |',
      '| `src/e.ts` | delete | Old for FR-1 |',
      '',
    ].join('\n');
    writeSpec(root, 'alpha', { 'FR.md': fr, 'FILE_CHANGES.md': fc });

    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    // 5 unique paths → 5 File nodes
    const fileNodes = Array.from(graph.nodes.values()).filter(
      (n): n is FileNode => n.type === 'File',
    );
    expect(fileNodes).toHaveLength(5);
    const paths = fileNodes.map((n) => n.path).sort();
    expect(paths).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts']);

    // 5 implements edges (one per (FR, path) pair).
    const impls = implementsEdges(graph.edges);
    expect(impls).toHaveLength(5);

    // Every implements edge has metadata with source_section=FILE_CHANGES.
    for (const edge of impls) {
      expect(edge.metadata?.source_section).toBe('FILE_CHANGES');
      expect(edge.metadata?.file_path).toMatch(/^src\/[a-e]\.ts$/);
      expect(['create', 'edit', 'delete']).toContain(edge.metadata?.action);
    }

    // Specific FR→path mapping spot-checks (FR-36a: FR ends are spec-qualified).
    const fileIdByPath = new Map(fileNodes.map((n) => [n.path, n.id]));
    expect(
      impls.some(
        (e) => e.from === 'alpha:FR-1' && e.to === fileIdByPath.get('src/a.ts') &&
               e.metadata?.action === 'create',
      ),
    ).toBe(true);
    expect(
      impls.some(
        (e) => e.from === 'alpha:FR-2' && e.to === fileIdByPath.get('src/c.ts'),
      ),
    ).toBe(true);
  });

  it('AC-29.2: DESIGN.md "App-код" citation emits implements edge with source_section=DESIGN', () => {
    const fr = '## FR-3: Gamma\n';
    const design = [
      '# Design',
      '',
      '## Где лежит реализация',
      '',
      '- App-код: `src/foo.ts` for FR-3 — primary entry point',
      '- Tests: `tests/foo.test.ts`',
      '',
    ].join('\n');
    writeSpec(root, 'gamma', { 'FR.md': fr, 'DESIGN.md': design });

    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    const fileNodes = Array.from(graph.nodes.values()).filter(
      (n): n is FileNode => n.type === 'File',
    );
    expect(fileNodes.map((n) => n.path).sort()).toContain('src/foo.ts');

    const impls = implementsEdges(graph.edges);
    const fooImpl = impls.find(
      (e) => e.from === 'gamma:FR-3' && e.metadata?.file_path === 'src/foo.ts',
    );
    expect(fooImpl).toBeDefined();
    expect(fooImpl!.metadata?.source_section).toBe('DESIGN');
    // No action metadata expected for DESIGN-sourced edges.
    expect(fooImpl!.metadata?.action).toBeUndefined();
  });

  it('AC-29.3: glob path skipped with single warn-once, no implements edge, no crash', () => {
    const fr = '## FR-4: Delta\n';
    const fc = [
      '# File Changes',
      '',
      '| Path | Action | Reason |',
      '|------|--------|--------|',
      '| `tools/spec-graph/*.ts` | edit | All TS files for FR-4 |',
      '| `src/concrete.ts` | create | Concrete file for FR-4 |',
      '| `tests/**/*.test.ts` | edit | All tests for FR-4 |',
      '',
    ].join('\n');
    writeSpec(root, 'delta', { 'FR.md': fr, 'FILE_CHANGES.md': fc });

    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    // The glob rows must produce no implements edges; only `src/concrete.ts`.
    const impls = implementsEdges(graph.edges);
    expect(impls).toHaveLength(1);
    expect(impls[0].metadata?.file_path).toBe('src/concrete.ts');

    // File nodes: only the concrete path.
    const fileNodes = Array.from(graph.nodes.values()).filter(
      (n): n is FileNode => n.type === 'File',
    );
    expect(fileNodes.map((n) => n.path)).toEqual(['src/concrete.ts']);

    // Exactly one warn emitted for the entire build despite TWO glob rows.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnArg = String(warnSpy.mock.calls[0][0]);
    expect(warnArg).toContain('glob');
  });

  it('Empty FILE_CHANGES.md → 0 implements edges and no crash', () => {
    const fr = '## FR-5: Echo\n';
    const fc = '# File Changes\n\nNo files yet.\n';
    writeSpec(root, 'echo', { 'FR.md': fr, 'FILE_CHANGES.md': fc });

    expect(() => buildGraph({ repoRoot: root, skipNdjson: true })).not.toThrow();
    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    expect(implementsEdges(graph.edges)).toHaveLength(0);
    const fileNodes = Array.from(graph.nodes.values()).filter((n) => n.type === 'File');
    expect(fileNodes).toHaveLength(0);
  });

  it('Path duplicated across FILE_CHANGES + DESIGN: single File node, single edge (FILE_CHANGES wins)', () => {
    const fr = '## FR-6: Foxtrot\n';
    const fc = [
      '# File Changes',
      '',
      '| Path | Action | Reason |',
      '|------|--------|--------|',
      '| `src/shared.ts` | edit | Shared module for FR-6 |',
      '',
    ].join('\n');
    const design = [
      '# Design',
      '',
      '## Где код',
      '',
      '- App-код: `src/shared.ts` for FR-6 — also referenced in design',
      '',
    ].join('\n');
    writeSpec(root, 'foxtrot', {
      'FR.md': fr,
      'FILE_CHANGES.md': fc,
      'DESIGN.md': design,
    });

    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    // Exactly one File node for the duplicated path.
    const fileNodes = Array.from(graph.nodes.values()).filter(
      (n): n is FileNode => n.type === 'File',
    );
    expect(fileNodes).toHaveLength(1);
    expect(fileNodes[0].path).toBe('src/shared.ts');

    // Exactly one implements edge — FILE_CHANGES processed first, so its
    // source_section + action metadata wins, DESIGN duplicate is suppressed.
    const impls = implementsEdges(graph.edges);
    expect(impls).toHaveLength(1);
    expect(impls[0].metadata?.source_section).toBe('FILE_CHANGES');
    expect(impls[0].metadata?.action).toBe('edit');
  });

  it('Duplicate path across two different specs: single File node (cross-spec dedup)', () => {
    writeSpec(root, 'spec1', {
      'FR.md': '## FR-10: Specsone\n',
      'FILE_CHANGES.md':
        '# F\n\n| Path | Action | Reason |\n|--|--|--|\n| `src/shared.ts` | edit | For FR-10 |\n',
    });
    writeSpec(root, 'spec2', {
      'FR.md': '## FR-20: Spectwo\n',
      'FILE_CHANGES.md':
        '# F\n\n| Path | Action | Reason |\n|--|--|--|\n| `src/shared.ts` | edit | For FR-20 |\n',
    });

    const graph = buildGraph({ repoRoot: root, skipNdjson: true });

    const fileNodes = Array.from(graph.nodes.values()).filter(
      (n): n is FileNode => n.type === 'File',
    );
    expect(fileNodes).toHaveLength(1);
    expect(fileNodes[0].path).toBe('src/shared.ts');

    // Two implements edges — one per (spec-qualified) FR — both pointing at
    // the same shared File node (File ids are path-hashed, NOT spec-scoped).
    const impls = implementsEdges(graph.edges);
    expect(impls).toHaveLength(2);
    expect(impls.map((e) => e.from).sort()).toEqual(['spec1:FR-10', 'spec2:FR-20']);
    expect(new Set(impls.map((e) => e.to)).size).toBe(1);
  });
});
