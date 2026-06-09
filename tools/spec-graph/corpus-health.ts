/**
 * corpus-health — the GENERAL spec-corpus auditor (FR-37b + FR-36, P14-5).
 *
 * One report + a 🟢/🔴 verdict over ANY `.specs/` corpus (corpus root as
 * input — NOT hardcoded to this repo). Surfaces the whole disease class the
 * FR-36 dogfood discovered by hand:
 *   1. bare-id COLLISIONS across specs (raw PRE-MAP stats from the builder's
 *      single pass — `graph.rawCollisions`; the map dedup would hide them);
 *   2. UNRESOLVED / dangling edges (an endpoint no node carries — a bare
 *      cross-root tag, a typo'd @featureN, a deleted target);
 *   3. UNTRACED ATOMS — the FR-37b invariants via the P14-2
 *      traceability-completeness check (UNCOVERED_FR / TASK_UNTESTED /
 *      UNTAGGED_SCENARIO);
 *   4. graph-side STALE FILE_CHANGES paths (an `implements` edge with
 *      action=edit whose File node points at a path missing on disk).
 *
 * Per-spec verdicts stay `spec-verdict.ts`'s job (audit + semantic layers);
 * this is the ORGANISM view — cheap, graph-only, no subprocess spawns.
 *
 * Run:  node --import tsx tools/spec-graph/corpus-health.ts [corpusRoot] [--json]
 * Exit: 0 ⇔ 🟢 (no collisions, no stale paths; untraced atoms + dangling
 *       edges are REPORTED as debt but only gate when --strict).
 *
 * @see .specs/spec-generator-v4/TASKS.md P14-5
 * @see .claude/skills/corpus-health/SKILL.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildGraphFromCwd } from './builder.ts';
import type { CollisionScan } from './collision-probe.ts';
import { checkTraceabilityCompleteness, summariseGaps } from './traceability.ts';
import { findOrphanProjectTests } from './project-test-trace.ts';
import { findFrsWithoutResearch } from './research-trace.ts';
import { findUnlinkedUpstream } from './upstream-trace.ts';
import type { SpecGraph, FileNode } from './types.ts';

export interface CorpusHealthReport {
  corpusRoot: string;
  nodes: number;
  edges: number;
  collisions: CollisionScan;
  danglingEdges: {
    count: number;
    samples: Array<{ from: string; to: string; type: string; missing: 'from' | 'to' }>;
  };
  untracedAtoms: {
    total: number;
    byClass: Record<string, number>;
    samples: Array<{ class: string; nodeId: string; file: string; line: number }>;
  };
  staleFileChanges: {
    count: number;
    samples: Array<{ fr: string; path: string }>;
  };
  /** FR-44/GT-1 reverse gap: project vitest tests with no spec scenario. */
  orphanProjectTests: {
    count: number;
    samples: Array<{ testId: string; file: string; line: number }>;
  };
  /** FR-44/GT-2 reverse gap: FR sections citing no RESEARCH.md (in specs that have one). */
  frsWithoutResearch: {
    count: number;
    samples: Array<{ nodeId: string; file: string; line: number }>;
  };
  /** FR-44/GT-4 reverse gap: stories / use-cases / decisions wired to no requirement. */
  unlinkedUpstream: {
    count: number;
    byKind: Record<string, number>;
    samples: Array<{ kind: string; nodeId: string; file: string; line: number }>;
  };
  /** 🟢 ⇔ no collisions AND no stale paths (hard); debt classes reported. */
  verdict: 'GREEN' | 'RED';
  strictVerdict: 'GREEN' | 'RED';
}

/** Pseudo-node id prefixes that are not graph nodes by design. */
const SYNTHETIC_TARGET = /^RESULT-/;

export function corpusHealth(corpusRoot: string): CorpusHealthReport {
  const root = path.resolve(corpusRoot);
  const graph: SpecGraph = buildGraphFromCwd(root);
  // Pre-map collision stats come from the builder's single pass (/simplify
  // 2026-06-07 — was a second full corpus parse via rawCollisionScan; the
  // standalone collision-probe CLI remains the independent cross-check).
  const collisions: CollisionScan = graph.rawCollisions ?? {
    totalRawNodes: graph.nodes.size,
    uniqueIds: graph.nodes.size,
    collisions: [],
  };

  // 2) dangling edges — an endpoint that resolves to NO node.
  const danglingSamples: CorpusHealthReport['danglingEdges']['samples'] = [];
  let dangling = 0;
  for (const e of graph.edges) {
    const fromMissing = !graph.nodes.has(e.from);
    const toMissing = !graph.nodes.has(e.to) && !SYNTHETIC_TARGET.test(e.to);
    if (!fromMissing && !toMissing) continue;
    dangling++;
    if (danglingSamples.length < 15) {
      danglingSamples.push({
        from: e.from,
        to: e.to,
        type: e.type,
        missing: fromMissing ? 'from' : 'to',
      });
    }
  }

  // 3) untraced atoms — the FR-37b invariants, corpus-wide (P14-2 check).
  const gaps = checkTraceabilityCompleteness(graph);
  const byClass = summariseGaps(gaps);

  // 4) graph-side stale FILE_CHANGES paths: implements + action=edit + path
  //    missing on disk. (Glob rows are skipped by the parser — per-spec audit
  //    via spec-verdict catches those; this is the cheap organism-wide pass.)
  const staleSamples: CorpusHealthReport['staleFileChanges']['samples'] = [];
  let stale = 0;
  for (const e of graph.edges) {
    if (e.type !== 'implements' || e.metadata?.action !== 'edit') continue;
    const file = graph.nodes.get(e.to) as FileNode | undefined;
    if (!file || file.type !== 'File') continue;
    if (fs.existsSync(path.join(root, file.path))) continue;
    stale++;
    if (staleSamples.length < 15) staleSamples.push({ fr: e.from, path: file.path });
  }

  // 5) orphan project tests — vitest it() with no spec scenario (FR-44/GT-1,
  //    reverse traceability). Reads the project test tree; INFO-class debt
  //    (contributes to strict, not hard — like untraced atoms).
  const orphanTests = findOrphanProjectTests(graph, root);

  // 6) FRs citing no RESEARCH.md (FR-44/GT-2, reverse traceability) — file pass
  //    over FR.md sections in specs that HAVE a RESEARCH.md; INFO-class debt.
  const frsNoResearch = findFrsWithoutResearch(root);

  // 7) upstream artifacts wired to no requirement (FR-44/GT-4) — stories /
  //    use-cases / decisions; file pass; INFO-class debt.
  const upstream = findUnlinkedUpstream(root);
  const upstreamByKind: Record<string, number> = {};
  for (const u of upstream) upstreamByKind[u.kind] = (upstreamByKind[u.kind] ?? 0) + 1;

  const hardRed = collisions.collisions.length > 0 || stale > 0;
  const anyDebt = hardRed || dangling > 0 || gaps.length > 0 || orphanTests.length > 0 || frsNoResearch.length > 0 || upstream.length > 0;

  return {
    corpusRoot: root,
    nodes: graph.nodes.size,
    edges: graph.edges.length,
    collisions,
    danglingEdges: { count: dangling, samples: danglingSamples },
    untracedAtoms: {
      total: gaps.length,
      byClass,
      samples: gaps.slice(0, 15).map((g) => ({ class: g.class, nodeId: g.nodeId, file: g.file, line: g.line })),
    },
    staleFileChanges: { count: stale, samples: staleSamples },
    orphanProjectTests: {
      count: orphanTests.length,
      samples: orphanTests.slice(0, 15).map((o) => ({ testId: o.testId, file: o.file, line: o.line })),
    },
    frsWithoutResearch: {
      count: frsNoResearch.length,
      samples: frsNoResearch.slice(0, 15).map((f) => ({ nodeId: f.nodeId, file: f.file, line: f.line })),
    },
    unlinkedUpstream: {
      count: upstream.length,
      byKind: upstreamByKind,
      samples: upstream.slice(0, 15).map((u) => ({ kind: u.kind, nodeId: u.nodeId, file: u.file, line: u.line })),
    },
    verdict: hardRed ? 'RED' : 'GREEN',
    strictVerdict: anyDebt ? 'RED' : 'GREEN',
  };
}

export function renderCorpusHealth(r: CorpusHealthReport): string {
  const icon = (v: 'GREEN' | 'RED'): string => (v === 'GREEN' ? '🟢' : '🔴');
  const lines: string[] = [];
  lines.push(`═══ corpus-health — ${r.corpusRoot} ═══`);
  lines.push(`graph: ${r.nodes} nodes / ${r.edges} edges`);
  lines.push(
    `1) collisions (raw pre-map): ${r.collisions.collisions.length} ` +
      `(${r.collisions.totalRawNodes} raw / ${r.collisions.uniqueIds} unique)`,
  );
  for (const c of r.collisions.collisions.slice(0, 10)) {
    lines.push(`   COLLISION ${c.id}: ${c.firstFile} <-> ${c.secondFile}`);
  }
  lines.push(`2) dangling edges: ${r.danglingEdges.count}`);
  for (const d of r.danglingEdges.samples.slice(0, 5)) {
    lines.push(`   [${d.type}] ${d.from} → ${d.to} (missing: ${d.missing})`);
  }
  lines.push(
    `3) untraced atoms (FR-37b): ${r.untracedAtoms.total} — ` +
      Object.entries(r.untracedAtoms.byClass)
        .map(([k, v]) => `${k}:${v}`)
        .join(', '),
  );
  lines.push(`4) stale FILE_CHANGES paths (graph-side): ${r.staleFileChanges.count}`);
  for (const s of r.staleFileChanges.samples.slice(0, 5)) {
    lines.push(`   ${s.fr} → ${s.path} (missing on disk)`);
  }
  lines.push(`5) orphan project tests (FR-44/GT-1, reverse): ${r.orphanProjectTests.count} — vitest it() with no spec scenario`);
  for (const o of r.orphanProjectTests.samples.slice(0, 5)) {
    lines.push(`   ${o.testId} @ ${o.file}:${o.line} (no .feature scenario)`);
  }
  lines.push(`6) FRs citing no RESEARCH.md (FR-44/GT-2, reverse): ${r.frsWithoutResearch.count} — requirement traces to no research finding`);
  for (const f of r.frsWithoutResearch.samples.slice(0, 5)) {
    lines.push(`   ${f.nodeId} @ ${f.file}:${f.line} (no RESEARCH.md citation in the FR section)`);
  }
  lines.push(
    `7) upstream unlinked (FR-44/GT-4, reverse): ${r.unlinkedUpstream.count} — ` +
      Object.entries(r.unlinkedUpstream.byKind).map(([k, v]) => `${k}:${v}`).join(', ') +
      ' wired to no requirement',
  );
  for (const u of r.unlinkedUpstream.samples.slice(0, 5)) {
    lines.push(`   [${u.kind}] ${u.nodeId} @ ${u.file}:${u.line}`);
  }
  lines.push(
    `VERDICT: ${icon(r.verdict)} ${r.verdict} (hard: collisions+stale) | strict: ${icon(r.strictVerdict)} ${r.strictVerdict} (any debt)`,
  );
  lines.push('Per-spec deep verdict (audit + semantic): tools/specs-generator/spec-verdict.ts');
  return lines.join('\n');
}

// ── CLI ────────────────────────────────────────────────────────────────────
const isDirectRun =
  process.argv[1]?.endsWith('corpus-health.ts') || process.argv[1]?.endsWith('corpus-health.js');
if (isDirectRun) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const strict = args.includes('--strict');
  const rootArg = args.find((a) => !a.startsWith('-')) ?? process.cwd();
  const report = corpusHealth(rootArg);
  console.log(json ? JSON.stringify(report, null, 2) : renderCorpusHealth(report));
  const gate = strict ? report.strictVerdict : report.verdict;
  process.exit(gate === 'GREEN' ? 0 : 1);
}
