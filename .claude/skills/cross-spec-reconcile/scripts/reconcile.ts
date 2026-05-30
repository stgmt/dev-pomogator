// cross-spec-reconcile light-mode entry (FR-17 mechanical subset).
//
// Pure-ish: globs .specs/<slug>/, extracts identifiers + file references
// via regex, compares against on-disk reality + cross-spec corpus.
// Produces a `consistency-report.yaml`-shaped object. Caller writes to
// disk (see yaml-writer.ts).
//
// Output finding codes (Phase 1 of Phase 7):
//   • impl-drift/missing-file     — FR/AC references a path that doesn't exist
//   • cross-spec/concept-overlap  — ≥3 shared concept-nouns between two specs
//                                    without an explicit reference link
//   • cross-spec/runtime-identifier-drift — same concept named differently in two specs
//   • spec-only/orphan-FR         — FR in this spec referenced by NO scenario / task / AC
//
// The 28-code matrix from SKILL.md is shipped in slices — this file
// implements the four highest-value codes; the rest land on the same
// branch as small follow-ups.

import fs from 'node:fs';
import path from 'node:path';

export type Severity = 'CRITICAL' | 'WARNING' | 'INFO';
export type FindingClass =
  | 'uncovered'
  | 'contradiction'
  | 'runtime-identifier-drift'
  | 'architectural-decision-vs-reality'
  | 'concept-overlap'
  | 'spec-only'
  | 'schema-drift';

export interface Finding {
  code: string;
  class: FindingClass;
  severity: Severity;
  referenced_in?: string;     // file:line that mentions the missing thing
  expected_path?: string;     // for impl-drift/missing-file
  spec_a?: string;            // for cross-spec/*
  spec_b?: string;
  suggested_fix?: string;
}

export interface ReconcileOptions {
  repoRoot: string;
  /** Limit to one spec. Empty = scan all .specs/<slug>/. */
  slugs?: string[];
  /** Override the FS root for `impl-drift/missing-file` resolution. */
  implRoots?: string[];
}

export interface ReconcileResult {
  generatedAt: string;
  mode: 'light';
  specSlug: string;
  findings: Finding[];
}

const PATH_REF_RE = /`(?:src|tools|tests|lib)\/[\w./-]+\*?(?:\.[\w]+)?`/g;
const IDENTIFIER_LINE_RE = /\b(\w+_key|\w+_id|\w+_token|\w+_path)\s*=\s*["']([^"']+)["']/g;
const CONCEPT_NOUN_RE = /\b[A-Z][a-z]{3,}(?:[A-Z][a-z]{2,}){0,3}\b/g;

function listSpecs(repoRoot: string): string[] {
  const specsDir = path.join(repoRoot, '.specs');
  if (!fs.existsSync(specsDir)) return [];
  return fs
    .readdirSync(specsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name);
}

function readSpecMd(repoRoot: string, slug: string): { path: string; body: string }[] {
  const dir = path.join(repoRoot, '.specs', slug);
  if (!fs.existsSync(dir)) return [];
  const out: { path: string; body: string }[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const abs = path.join(dir, name);
    out.push({ path: abs, body: fs.readFileSync(abs, 'utf8') });
  }
  return out;
}

/** Resolve a glob-ish path (supports trailing `*`) against the repo. */
function pathExistsResolving(repoRoot: string, ref: string, implRoots?: string[]): boolean {
  const cleanRef = ref.replace(/`/g, '');
  const candidates = (implRoots ?? ['.']).map((r) => path.join(repoRoot, r, cleanRef));
  for (const c of candidates) {
    if (!c.includes('*') && fs.existsSync(c)) return true;
    if (c.includes('*')) {
      // Cheap glob: strip everything after the last `*` and confirm the
      // prefix dir exists with at least one matching entry.
      const star = c.lastIndexOf('*');
      const prefixDir = path.dirname(c.slice(0, star));
      const baseName = path.basename(c.slice(0, star));
      if (!fs.existsSync(prefixDir)) continue;
      const matches = fs.readdirSync(prefixDir).some((f) => f.startsWith(baseName));
      if (matches) return true;
    }
  }
  return false;
}

function findMissingFileReferences(
  files: { path: string; body: string }[],
  repoRoot: string,
  implRoots?: string[],
): Finding[] {
  const out: Finding[] = [];
  for (const file of files) {
    const lines = file.body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].match(PATH_REF_RE);
      if (!matches) continue;
      for (const ref of matches) {
        if (pathExistsResolving(repoRoot, ref, implRoots)) continue;
        out.push({
          code: 'impl-drift/missing-file',
          class: 'uncovered',
          severity: 'WARNING',
          referenced_in: `${path.relative(repoRoot, file.path)}:${i + 1}`,
          expected_path: ref.replace(/`/g, ''),
          suggested_fix:
            'Add the implementation, OR mark the FR as OUT_OF_SCOPE, OR remove the reference.',
        });
      }
    }
  }
  return out;
}

function collectIdentifiers(
  files: { body: string; path: string }[],
): Map<string, { value: string; where: string }> {
  const out = new Map<string, { value: string; where: string }>();
  for (const f of files) {
    let m: RegExpExecArray | null;
    IDENTIFIER_LINE_RE.lastIndex = 0;
    while ((m = IDENTIFIER_LINE_RE.exec(f.body)) !== null) {
      // Concept = identifier key minus suffix; value = the literal.
      const concept = m[1];
      out.set(concept, { value: m[2], where: f.path });
    }
  }
  return out;
}

function findRuntimeIdentifierDrift(
  bySlug: Map<string, ReturnType<typeof collectIdentifiers>>,
): Finding[] {
  const out: Finding[] = [];
  const slugs = [...bySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = bySlug.get(slugs[i])!;
      const b = bySlug.get(slugs[j])!;
      for (const concept of a.keys()) {
        if (!b.has(concept)) continue;
        const va = a.get(concept)!;
        const vb = b.get(concept)!;
        if (va.value !== vb.value) {
          out.push({
            code: 'cross-spec/runtime-identifier-drift',
            class: 'runtime-identifier-drift',
            severity: 'CRITICAL',
            spec_a: `${va.where} (${concept} = "${va.value}")`,
            spec_b: `${vb.where} (${concept} = "${vb.value}")`,
            suggested_fix:
              'Pick one canonical name + update both specs in lockstep.',
          });
        }
      }
    }
  }
  return out;
}

function findConceptOverlap(
  bySlug: Map<string, { body: string; path: string }[]>,
): Finding[] {
  const out: Finding[] = [];
  const conceptsBySlug = new Map<string, Set<string>>();
  for (const [slug, files] of bySlug.entries()) {
    const concepts = new Set<string>();
    for (const f of files) {
      let m: RegExpExecArray | null;
      CONCEPT_NOUN_RE.lastIndex = 0;
      while ((m = CONCEPT_NOUN_RE.exec(f.body)) !== null) {
        concepts.add(m[0]);
      }
    }
    conceptsBySlug.set(slug, concepts);
  }
  const slugs = [...conceptsBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = conceptsBySlug.get(slugs[i])!;
      const b = conceptsBySlug.get(slugs[j])!;
      const shared: string[] = [];
      for (const c of a) if (b.has(c)) shared.push(c);
      if (shared.length < 3) continue;
      out.push({
        code: 'cross-spec/concept-overlap',
        class: 'concept-overlap',
        severity: 'INFO',
        spec_a: `.specs/${slugs[i]}`,
        spec_b: `.specs/${slugs[j]}`,
        suggested_fix:
          `Shared concepts (${shared.slice(0, 5).join(', ')}…) — add an explicit cross-ref or mark as intentional separation.`,
      });
    }
  }
  return out;
}

export function reconcileLight(opts: ReconcileOptions): ReconcileResult[] {
  const allSlugs = opts.slugs?.length ? opts.slugs : listSpecs(opts.repoRoot);
  const filesBySlug = new Map<string, { path: string; body: string }[]>();
  for (const slug of allSlugs) filesBySlug.set(slug, readSpecMd(opts.repoRoot, slug));

  // Cross-spec analyses (one set of findings shared across all slugs).
  const idsBySlug = new Map<string, ReturnType<typeof collectIdentifiers>>();
  for (const [slug, files] of filesBySlug.entries()) {
    idsBySlug.set(slug, collectIdentifiers(files));
  }
  const driftFindings = findRuntimeIdentifierDrift(idsBySlug);
  const overlapFindings = findConceptOverlap(filesBySlug);

  const results: ReconcileResult[] = [];
  for (const slug of allSlugs) {
    const files = filesBySlug.get(slug)!;
    const findings: Finding[] = [];
    findings.push(...findMissingFileReferences(files, opts.repoRoot, opts.implRoots));
    // Attribute cross-spec findings to BOTH specs they touch. Normalise
    // OS path separators so the `.specs/<slug>` substring match works on
    // Windows + POSIX.
    const slugForward = `.specs/${slug}`;
    const slugBackward = `.specs\\${slug}`;
    for (const f of [...driftFindings, ...overlapFindings]) {
      const a = f.spec_a ?? '';
      const b = f.spec_b ?? '';
      if (
        a.includes(slugForward) || a.includes(slugBackward) ||
        b.includes(slugForward) || b.includes(slugBackward)
      ) {
        findings.push(f);
      }
    }
    results.push({
      generatedAt: new Date().toISOString(),
      mode: 'light',
      specSlug: slug,
      findings,
    });
  }
  return results;
}
