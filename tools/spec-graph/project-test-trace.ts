/**
 * Project-test → spec reverse traceability (FR-44 / GT-1, P20-1).
 *
 * The SpecGraph is built ONLY from `.feature` files, so a vitest `it()` that
 * exists in the PROJECT but maps to no spec scenario is structurally invisible
 * to every graph-based check — the "левый сценарий ниоткуда" hole (audit
 * 2026-06-09: 419 vitest test-ids, 72 with no scenario node). This module closes
 * the REVERSE direction WITHOUT perturbing the graph (advisor: Option A): it
 * reads the project test tree and cross-references the graph's scenario codes via
 * the project's own naming convention (`DOMAIN_CODE_NN` ↔ `Scenario: DOMAIN_CODE_NN`).
 *
 * INTENTIONALLY non-gating (INFO): the real corpus carries 72 such tests today —
 * a hard gate would flood RED on legacy debt. Surface them; the promote-to-gate
 * decision (after cleanup) is P20-5. Mirrors the TASK_NO_REQUIREMENT discipline.
 *
 * Two real naming conventions are both honoured (verified on the corpus):
 *   - full-id   `it('SPECGEN004_140: …')` ↔ `Scenario: SPECGEN004_140 …`
 *               (the `_NN` IS the scenario number) → match the FULL code.
 *   - prefixed  `it('HVTR001_01: …')` ↔ `Scenario: HVTR001 …`
 *               (the `_NN` is a sub-test) → match the code PREFIX.
 *
 * @see .specs/spec-generator-v4/FR.md FR-44 (GT-1)
 * @see audit-reports/bidirectional-traceability-audit-2026-06-09.md
 * @see .claude/rules/extension-test-quality.md (the 1:1 test↔scenario convention)
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SpecGraph, ScenarioNode } from './types.ts';
import type { Finding } from './conformance.ts';

/** A project test-id that traces to no spec scenario. */
export interface OrphanProjectTest {
  testId: string;
  file: string;
  line: number;
}

/** Default project test roots scanned for `it('CODE_NN: …')` ids. */
const DEFAULT_TEST_ROOTS = ['tests/e2e'];
/** Capture an id only at the START of an it/test/describe string literal — a
 *  bare token elsewhere (a `SHA256_64` constant) is NOT a test-id (junk filter). */
const TEST_ID_RE = /(?:\bit|\btest|\bdescribe)\s*\(\s*['"`]\s*([A-Z][A-Z0-9]*[0-9]{3,}_[0-9]+)/g;

/** The scenario codes the graph knows, from `…:SCEN-<code>-<desc>` ids.
 *  `<code>` = `[a-z]+\d+` optionally `-\d+` (e.g. `hvtr001` | `specgen004-140`). */
export function scenarioCodes(graph: SpecGraph): Set<string> {
  const codes = new Set<string>();
  for (const n of graph.nodes.values()) {
    if (n.type !== 'Scenario') continue;
    const m = String((n as ScenarioNode).id).match(/SCEN-([a-z]+\d+(?:-\d+)?)/);
    if (m) codes.add(m[1]);
  }
  return codes;
}

/** Is a test-id covered by some scenario code (full-id OR prefix convention)? */
export function testIdHasScenario(testId: string, codes: ReadonlySet<string>): boolean {
  const norm = testId.toLowerCase().replace(/_/g, '-');
  if (codes.has(norm)) return true; // full-id convention (SPECGEN004_140)
  return codes.has(norm.replace(/-\d+$/, '')); // prefix convention (HVTR001_01 → hvtr001)
}

function walkTs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkTs(p));
    else if (e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/**
 * Find every project vitest test-id with no backing spec scenario. Pure over
 * (graph, repoRoot) — `roots` overridable for tests. First occurrence of each id
 * wins (dedupe across files). Lines are 1-based.
 */
export function findOrphanProjectTests(
  graph: SpecGraph,
  repoRoot: string,
  roots: readonly string[] = DEFAULT_TEST_ROOTS,
): OrphanProjectTest[] {
  const codes = scenarioCodes(graph);
  const seen = new Set<string>();
  const orphans: OrphanProjectTest[] = [];
  for (const root of roots) {
    for (const file of walkTs(path.join(repoRoot, root))) {
      const text = fs.readFileSync(file, 'utf-8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        let m: RegExpExecArray | null;
        const re = new RegExp(TEST_ID_RE.source, 'g');
        while ((m = re.exec(lines[i]))) {
          const id = m[1];
          if (seen.has(id)) continue;
          seen.add(id);
          if (!testIdHasScenario(id, codes)) {
            orphans.push({ testId: id, file: path.relative(repoRoot, file).replace(/\\/g, '/'), line: i + 1 });
          }
        }
      }
    }
  }
  return orphans;
}

/** Orphans as INFO `Finding`s (the conformance shape) — non-gating by design. */
export function orphanProjectTestFindings(
  graph: SpecGraph,
  repoRoot: string,
  roots?: readonly string[],
): Finding[] {
  return findOrphanProjectTests(graph, repoRoot, roots).map((o) => ({
    code: 'ORPHAN_PROJECT_TEST',
    severity: 'info' as const,
    location: { file: o.file, line: o.line },
    message: `Project test ${o.testId} (${o.file}:${o.line}) maps to NO spec scenario — it exists in the project but is described in no .feature (reverse-traceability gap, FR-44/GT-1). Add a paired Scenario, or rename the it() to its scenario id.`,
    nodeId: o.testId,
    suggestions: [
      { action: 'add_scenario', reason: `Add a 'Scenario: ${o.testId} …' to the relevant spec .feature (1:1 test↔scenario), or align the it() id to an existing scenario.`, confidence: 'medium' },
    ],
  }));
}

// CLI: `npx tsx tools/spec-graph/project-test-trace.ts` → corpus orphan report.
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void (async () => {
    const { buildGraphFromCwd } = await import('./builder.ts');
    const repoRoot = process.cwd();
    const orphans = findOrphanProjectTests(buildGraphFromCwd(repoRoot), repoRoot);
    const byFile = new Map<string, number>();
    for (const o of orphans) byFile.set(o.file, (byFile.get(o.file) ?? 0) + 1);
    process.stdout.write(`ORPHAN_PROJECT_TEST (project tests with no spec scenario): ${orphans.length}\n`);
    for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
      process.stdout.write(`  ${n}\t${f}\n`);
    }
    process.stdout.write('\nINFO (non-gating) — reverse-traceability gap FR-44/GT-1. Promote-to-gate after cleanup = P20-5.\n');
  })();
}
