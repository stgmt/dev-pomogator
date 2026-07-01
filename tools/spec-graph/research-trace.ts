/**
 * FR → RESEARCH reverse traceability (FR-44 / GT-2, P20-2).
 *
 * "A requirement nobody researched" is invisible: RESEARCH.md is not ingested
 * into the graph (no parser emits Research nodes), so no graph walk can ask
 * whether an FR traces back to a research finding. Like P20-1 this closes the
 * gap WITHOUT perturbing the graph: a standalone file-reading pass over
 * `.specs/<slug>/FR.md`, flagging each FR section that contains no
 * `RESEARCH.md` reference — only for specs that HAVE a RESEARCH.md (46 of 47
 * do; you cannot cite what does not exist).
 *
 * INTENTIONALLY non-gating (INFO): the real corpus has 562 FR sections of
 * which only 17 cite RESEARCH.md (~3%) — a hard gate would flood RED on 545
 * legacy FRs. Surface count + samples (corpus-health section 6); the
 * promote-to-gate decision after cleanup is P20-5's pattern.
 *
 * Citation predicate (deliberately simple + documented): the FR section text
 * mentions `RESEARCH.md` (case-insensitive) — matches the real citation shape
 * in the corpus (`[…](RESEARCH.md#anchor)` links and prose mentions).
 *
 * @see .specs/spec-generator-v4/FR.md FR-44 (GT-2)
 * @see audit-reports/bidirectional-traceability-audit-2026-06-09.md
 * @see ./project-test-trace.ts (the GT-1 sibling, same Option-A shape)
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from './conformance.ts';

/** An FR section with no RESEARCH.md reference, in a spec that has RESEARCH.md. */
export interface FrWithoutResearch {
  /** Composite id, e.g. `spec-generator-v4:FR-44`. */
  nodeId: string;
  file: string;
  line: number;
}

const FR_HEADING_RE = /^#{2,4} (FR-\d+)\b/;

/** Split an FR.md body into FR sections; return those with no RESEARCH.md mention. */
export function frSectionsWithoutResearch(slug: string, frText: string): FrWithoutResearch[] {
  const lines = frText.split('\n');
  const heads: Array<{ id: string; line: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FR_HEADING_RE);
    if (m) heads.push({ id: m[1], line: i });
  }
  const out: FrWithoutResearch[] = [];
  for (let k = 0; k < heads.length; k++) {
    const end = heads[k + 1]?.line ?? lines.length;
    const section = lines.slice(heads[k].line, end).join('\n');
    if (!/RESEARCH\.md/i.test(section)) {
      out.push({ nodeId: `${slug}:${heads[k].id}`, file: `.specs/${slug}/FR.md`, line: heads[k].line + 1 });
    }
  }
  return out;
}

/**
 * Corpus pass: every spec that HAS both FR.md and RESEARCH.md contributes its
 * un-cited FR sections. A spec without RESEARCH.md is skipped entirely — the
 * gap there is the missing research file, a different (Discovery-phase) signal.
 */
export function findFrsWithoutResearch(repoRoot: string): FrWithoutResearch[] {
  const specsRoot = path.join(repoRoot, '.specs');
  if (!fs.existsSync(specsRoot)) return [];
  const out: FrWithoutResearch[] = [];
  for (const e of fs.readdirSync(specsRoot, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const slug = e.name;
    const frPath = path.join(specsRoot, slug, 'FR.md');
    if (!fs.existsSync(frPath)) continue;
    if (!fs.existsSync(path.join(specsRoot, slug, 'RESEARCH.md'))) continue;
    out.push(...frSectionsWithoutResearch(slug, fs.readFileSync(frPath, 'utf-8')));
  }
  return out;
}

/** As INFO `Finding`s (conformance shape) — non-gating by design. */
export function frNoResearchFindings(repoRoot: string): Finding[] {
  return findFrsWithoutResearch(repoRoot).map((f) => ({
    code: 'FR_NO_RESEARCH',
    severity: 'info' as const,
    location: { file: f.file, line: f.line },
    message: `${f.nodeId} cites no RESEARCH.md finding — the requirement traces back to no research (reverse-traceability gap, FR-44/GT-2). Link the grounding finding (e.g. [research](RESEARCH.md#anchor)) or research it.`,
    nodeId: f.nodeId,
    suggestions: [
      { action: 'link_research', reason: 'Add a RESEARCH.md reference inside the FR section pointing at the finding that grounds it.', confidence: 'medium' },
    ],
  }));
}

// CLI: `npx tsx tools/spec-graph/research-trace.ts` → corpus report.
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = process.cwd();
  const all = findFrsWithoutResearch(repoRoot);
  const bySpec = new Map<string, number>();
  for (const f of all) bySpec.set(f.nodeId.split(':')[0], (bySpec.get(f.nodeId.split(':')[0]) ?? 0) + 1);
  process.stdout.write(`FR_NO_RESEARCH (FR sections citing no RESEARCH.md, in specs that have one): ${all.length}\n`);
  for (const [s, n] of [...bySpec.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    process.stdout.write(`  ${n}\t${s}\n`);
  }
  process.stdout.write('\nINFO (non-gating) — reverse-traceability gap FR-44/GT-2. Promote-to-gate after cleanup = P20-5 pattern.\n');
}
