// cross-spec-reconcile light-mode entry (FR-17 mechanical subset).
//
// Pure-ish: globs .specs/<slug>/, extracts identifiers + file references
// via regex, compares against on-disk reality + cross-spec corpus.
// Produces a `consistency-report.yaml`-shaped object. Caller writes to
// disk (see yaml-writer.ts).
//
// Output finding codes (rc1 + post-rc1 expansion — 8 of 28 ship):
//   • impl-drift/missing-file              — FR/AC references a path that doesn't exist
//   • cross-spec/concept-overlap           — ≥3 shared concept-nouns between two specs without reference
//   • cross-spec/runtime-identifier-drift  — same concept named differently in two specs
//   • spec-only/orphan-FR                  — FR has no AC / Scenario / Task back-reference within the spec
//   • spec-only/uncovered-AC               — AC defined but no .feature scenario covers it
//   • cross-spec/contradictory-fr          — same FR id in two specs with contradictory text
//   • cross-spec/duplicate-fr-id           — two specs both define the same FR-N (collision)
//   • impl-drift/test-without-fr           — @featureN tag in a .feature with no matching FR in any spec
//
// The remaining 20 codes from the 28-code matrix land in the same
// branch as further small follow-ups; this file owns the mechanical
// (LLM-free) subset.

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
// FR heading match — both v4 (`## FR-N: title`) and legacy triple-anchor
// forms (`### Requirement: FR-N title`) survive parsing via the spec-graph
// MD parser; this module just needs the FR id to count cross-refs.
const FR_HEADING_RE = /^#{2,3}\s+(?:Requirement:\s+)?(FR-\d+)(?:[:\s]|$)/gm;
const AC_HEADING_RE = /^#{2,4}\s+(?:AC-\d+|Acceptance Criteria\b)/gm;
const FR_REF_RE = /\bFR-\d+\b/g;
const FEATURE_TAG_RE = /@feature(\d+)\b/g;

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

/** Extract FR ids defined in this spec's MD files. Map<FR-id, fileWhereDefined>. */
function collectFrDefinitions(
  files: { body: string; path: string }[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of files) {
    let m: RegExpExecArray | null;
    FR_HEADING_RE.lastIndex = 0;
    while ((m = FR_HEADING_RE.exec(f.body)) !== null) {
      // First wins — later duplicates are flagged by a separate code.
      if (!out.has(m[1])) out.set(m[1], f.path);
    }
  }
  return out;
}

/** Extract every FR reference (`FR-N` anywhere in the body) — both definitions and citations. */
function collectFrReferences(files: { body: string }[]): Set<string> {
  const refs = new Set<string>();
  for (const f of files) {
    let m: RegExpExecArray | null;
    FR_REF_RE.lastIndex = 0;
    while ((m = FR_REF_RE.exec(f.body)) !== null) refs.add(m[0]);
  }
  return refs;
}

/** Extract every @featureN tag from .feature files in the spec dir. */
function collectFeatureTags(repoRoot: string, slug: string): Set<string> {
  const dir = path.join(repoRoot, '.specs', slug);
  const out = new Set<string>();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.feature')) continue;
    const body = fs.readFileSync(path.join(dir, name), 'utf8');
    let m: RegExpExecArray | null;
    FEATURE_TAG_RE.lastIndex = 0;
    while ((m = FEATURE_TAG_RE.exec(body)) !== null) {
      out.add(`FR-${m[1]}`);
    }
  }
  return out;
}

/** FR defined in spec but referenced by NOTHING (no AC, no scenario, no task). */
function findOrphanFRs(
  files: { body: string; path: string }[],
  featureTags: Set<string>,
  repoRoot: string,
): Finding[] {
  const defs = collectFrDefinitions(files);
  // References = anywhere FR-N appears OUTSIDE its own heading line.
  const refs = collectFrReferences(files);
  const out: Finding[] = [];
  for (const [fr, definedIn] of defs.entries()) {
    // A heading counts as a definition, so we need ≥2 hits (definition + ≥1 reference)
    // OR a matching @feature tag in the .feature corpus.
    let hits = 0;
    for (const f of files) {
      const re = new RegExp(`\\b${fr}\\b`, 'g');
      const matches = f.body.match(re);
      if (matches) hits += matches.length;
    }
    if (refs.has(fr) && hits >= 2) continue;
    if (featureTags.has(fr)) continue;
    out.push({
      code: 'spec-only/orphan-FR',
      class: 'spec-only',
      severity: 'WARNING',
      referenced_in: path.relative(repoRoot, definedIn),
      suggested_fix:
        `Add an AC, Scenario, or Task that references ${fr} — or mark the FR as OUT_OF_SCOPE.`,
    });
  }
  return out;
}

/** AC defined in spec body but no @featureN scenario covers it. */
function findUncoveredACs(
  files: { body: string; path: string }[],
  featureTags: Set<string>,
  repoRoot: string,
): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    let m: RegExpExecArray | null;
    AC_HEADING_RE.lastIndex = 0;
    let acCount = 0;
    while ((m = AC_HEADING_RE.exec(f.body)) !== null) acCount++;
    if (acCount === 0) continue;
    // Need at least ONE @feature tag in the spec's feature corpus to consider
    // ACs covered — exhaustive per-AC mapping is the create-spec audit's job.
    if (featureTags.size > 0) continue;
    out.push({
      code: 'spec-only/uncovered-AC',
      class: 'spec-only',
      severity: 'WARNING',
      referenced_in: path.relative(repoRoot, f.path),
      suggested_fix:
        `${acCount} AC heading(s) in this spec have no matching @featureN scenario in the spec's .feature files.`,
    });
  }
  return out;
}

/** Two specs both define the same FR-N — id collision. */
function findDuplicateFrIds(
  defsBySlug: Map<string, Map<string, string>>,
): Finding[] {
  const out: Finding[] = [];
  const slugs = [...defsBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = defsBySlug.get(slugs[i])!;
      const b = defsBySlug.get(slugs[j])!;
      for (const fr of a.keys()) {
        if (!b.has(fr)) continue;
        out.push({
          code: 'cross-spec/duplicate-fr-id',
          class: 'contradiction',
          severity: 'CRITICAL',
          spec_a: `.specs/${slugs[i]} (${fr} at ${path.basename(a.get(fr)!)})`,
          spec_b: `.specs/${slugs[j]} (${fr} at ${path.basename(b.get(fr)!)})`,
          suggested_fix:
            `Rename one definition — FR ids are unique per repo. Each spec should own a disjoint FR namespace.`,
        });
      }
    }
  }
  return out;
}

/** Same FR id in two specs with contradictory body text (≥20% different leading 200 chars). */
function findContradictoryFRs(
  defsBySlug: Map<string, Map<string, string>>,
  filesBySlug: Map<string, { path: string; body: string }[]>,
): Finding[] {
  const out: Finding[] = [];
  const slugs = [...defsBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = defsBySlug.get(slugs[i])!;
      const b = defsBySlug.get(slugs[j])!;
      for (const fr of a.keys()) {
        if (!b.has(fr)) continue;
        const bodyA = extractFrBody(filesBySlug.get(slugs[i])!, fr);
        const bodyB = extractFrBody(filesBySlug.get(slugs[j])!, fr);
        if (!bodyA || !bodyB) continue;
        if (cheapTextOverlap(bodyA, bodyB) >= 0.4) continue;
        out.push({
          code: 'cross-spec/contradictory-fr',
          class: 'contradiction',
          severity: 'CRITICAL',
          spec_a: `.specs/${slugs[i]} (${fr})`,
          spec_b: `.specs/${slugs[j]} (${fr})`,
          suggested_fix:
            `${fr} appears in both specs with substantially different body text. Pick one canonical definition.`,
        });
      }
    }
  }
  return out;
}

function extractFrBody(files: { body: string }[], fr: string): string | null {
  for (const f of files) {
    const idx = f.body.search(new RegExp(`^#{2,3}\\s+(?:Requirement:\\s+)?${fr}\\b`, 'm'));
    if (idx === -1) continue;
    const slice = f.body.slice(idx, idx + 400);
    return slice.replace(/\s+/g, ' ').trim();
  }
  return null;
}

function cheapTextOverlap(a: string, b: string): number {
  const tokenize = (s: string): Set<string> =>
    new Set(s.toLowerCase().split(/\W+/).filter((t) => t.length >= 3));
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared++;
  return shared / Math.min(sa.size, sb.size);
}

/** @featureN tag with no matching FR-N anywhere in the cross-spec corpus. */
function findTestsWithoutFR(
  repoRoot: string,
  slug: string,
  allFrDefs: Set<string>,
): Finding[] {
  const tags = collectFeatureTags(repoRoot, slug);
  const out: Finding[] = [];
  for (const fr of tags) {
    if (allFrDefs.has(fr)) continue;
    out.push({
      code: 'impl-drift/test-without-fr',
      class: 'uncovered',
      severity: 'WARNING',
      referenced_in: `.specs/${slug}/*.feature (@${fr.toLowerCase().replace('-', '')})`,
      suggested_fix:
        `Scenario tagged @${fr.toLowerCase().replace('-', '')} but no ${fr} heading exists in any spec. Add the FR or remove the tag.`,
    });
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
  const defsBySlug = new Map<string, Map<string, string>>();
  const allFrDefs = new Set<string>();
  for (const [slug, files] of filesBySlug.entries()) {
    idsBySlug.set(slug, collectIdentifiers(files));
    const defs = collectFrDefinitions(files);
    defsBySlug.set(slug, defs);
    for (const fr of defs.keys()) allFrDefs.add(fr);
  }
  const driftFindings = findRuntimeIdentifierDrift(idsBySlug);
  const overlapFindings = findConceptOverlap(filesBySlug);
  const duplicateFrFindings = findDuplicateFrIds(defsBySlug);
  const contradictoryFrFindings = findContradictoryFRs(defsBySlug, filesBySlug);

  const results: ReconcileResult[] = [];
  for (const slug of allSlugs) {
    const files = filesBySlug.get(slug)!;
    const findings: Finding[] = [];
    findings.push(...findMissingFileReferences(files, opts.repoRoot, opts.implRoots));
    const featureTags = collectFeatureTags(opts.repoRoot, slug);
    findings.push(...findOrphanFRs(files, featureTags, opts.repoRoot));
    findings.push(...findUncoveredACs(files, featureTags, opts.repoRoot));
    findings.push(...findTestsWithoutFR(opts.repoRoot, slug, allFrDefs));
    // Attribute cross-spec findings to BOTH specs they touch. Normalise
    // OS path separators so the `.specs/<slug>` substring match works on
    // Windows + POSIX.
    const slugForward = `.specs/${slug}`;
    const slugBackward = `.specs\\${slug}`;
    for (const f of [
      ...driftFindings,
      ...overlapFindings,
      ...duplicateFrFindings,
      ...contradictoryFrFindings,
    ]) {
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
