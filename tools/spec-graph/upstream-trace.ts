/**
 * Upstream-artifact → requirement reverse traceability (FR-44 / GT-4, P20-4).
 *
 * USER_STORIES / USE_CASES / DESIGN decisions are upstream of requirements, and
 * none of them is graph-ingested as a node — so "a story / use-case / decision
 * wired to no requirement" is invisible to every graph walk. Same Option-A shape
 * as P20-1/P20-2: a standalone file pass, no graph perturbation.
 *
 * One finding code, three artifact kinds:
 *   story     `## User Story N:` block with no `FR-N` mention
 *   use-case  `## UC-N` block with no `FR-N` mention
 *   decision  `### Decision:` block with no `FR-N` AND no `RESEARCH.md` mention
 *             (a decision may legitimately ground in research instead of an FR)
 *
 * INTENTIONALLY non-gating (INFO): real corpus — stories 0/78 cite an FR (the
 * convention does not exist yet), use-cases 42/307, decisions 28/70 → ~385
 * legacy findings. Per the P20-5 decision these surface (corpus-health section 7)
 * and gate only `--strict`; promotion follows the burn-down criteria.
 *
 * @see .specs/spec-generator-v4/FR.md FR-44 (GT-4)
 * @see ./research-trace.ts / ./project-test-trace.ts (the GT-2 / GT-1 siblings)
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from './conformance.ts';

export type UpstreamKind = 'story' | 'use-case' | 'decision';

export interface UnlinkedUpstream {
  kind: UpstreamKind;
  /** e.g. `demo:User Story 2` / `demo:UC-5` / `demo:Decision: In-memory storage`. */
  nodeId: string;
  file: string;
  line: number;
}

const FR_CITE = /\bFR-\d+\b/;

interface KindSpec {
  kind: UpstreamKind;
  doc: string;
  headRe: RegExp;
  /** Is this section linked? (decisions may ground in research instead of an FR) */
  linked: (section: string) => boolean;
}

const KINDS: KindSpec[] = [
  { kind: 'story', doc: 'USER_STORIES.md', headRe: /^#{2,3} (User Story \d+[^\n]*|US-\d+[^\n]*)/, linked: (s) => FR_CITE.test(s) },
  { kind: 'use-case', doc: 'USE_CASES.md', headRe: /^#{2,3} (UC-\d+[^\n]*)/, linked: (s) => FR_CITE.test(s) },
  { kind: 'decision', doc: 'DESIGN.md', headRe: /^### (Decision:[^\n]*)/, linked: (s) => FR_CITE.test(s) || /RESEARCH\.md/i.test(s) },
];

/** Scan ONE doc's sections for unlinked upstream artifacts. */
export function unlinkedSectionsOf(slug: string, kindSpec: KindSpec, text: string): UnlinkedUpstream[] {
  const lines = text.split('\n');
  const heads: Array<{ title: string; line: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(kindSpec.headRe);
    if (m) heads.push({ title: m[1].trim().replace(/[:：]\s*$/, ''), line: i });
  }
  const out: UnlinkedUpstream[] = [];
  for (let k = 0; k < heads.length; k++) {
    const end = heads[k + 1]?.line ?? lines.length;
    const section = lines.slice(heads[k].line, end).join('\n');
    if (!kindSpec.linked(section)) {
      out.push({
        kind: kindSpec.kind,
        nodeId: `${slug}:${heads[k].title.slice(0, 60)}`,
        file: `.specs/${slug}/${kindSpec.doc}`,
        line: heads[k].line + 1,
      });
    }
  }
  return out;
}

/** Corpus pass over every spec's USER_STORIES / USE_CASES / DESIGN. */
export function findUnlinkedUpstream(repoRoot: string): UnlinkedUpstream[] {
  const specsRoot = path.join(repoRoot, '.specs');
  if (!fs.existsSync(specsRoot)) return [];
  const out: UnlinkedUpstream[] = [];
  for (const e of fs.readdirSync(specsRoot, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    for (const ks of KINDS) {
      const p = path.join(specsRoot, e.name, ks.doc);
      if (!fs.existsSync(p)) continue;
      out.push(...unlinkedSectionsOf(e.name, ks, fs.readFileSync(p, 'utf-8')));
    }
  }
  return out;
}

/** As INFO `Finding`s (conformance shape) — non-gating by design (P20-5 decision). */
export function upstreamUnlinkedFindings(repoRoot: string): Finding[] {
  return findUnlinkedUpstream(repoRoot).map((u) => ({
    code: 'UPSTREAM_UNLINKED',
    severity: 'info' as const,
    location: { file: u.file, line: u.line },
    message: `${u.kind} «${u.nodeId}» links to no requirement${u.kind === 'decision' ? ' and no research finding' : ''} — an upstream artifact nobody wired downstream (reverse-traceability gap, FR-44/GT-4). Reference the FR-N it motivates${u.kind === 'decision' ? ' (or the RESEARCH.md finding it rests on)' : ''}.`,
    nodeId: u.nodeId,
    suggestions: [
      { action: 'link_requirement', reason: 'Add an FR-N reference inside the block (stories/use-cases), or FR-N / RESEARCH.md for a decision.', confidence: 'medium' },
    ],
  }));
}

// CLI: `npx tsx tools/spec-graph/upstream-trace.ts` → corpus report by kind.
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const all = findUnlinkedUpstream(process.cwd());
  const byKind = new Map<string, number>();
  for (const u of all) byKind.set(u.kind, (byKind.get(u.kind) ?? 0) + 1);
  process.stdout.write(`UPSTREAM_UNLINKED (stories/use-cases/decisions wired to no requirement): ${all.length}\n`);
  for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) process.stdout.write(`  ${n}\t${k}\n`);
  process.stdout.write('\nINFO (non-gating, P20-5 keep-advisory) — reverse-traceability gap FR-44/GT-4.\n');
}
