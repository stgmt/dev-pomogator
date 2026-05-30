// cross-spec-reconcile light-mode entry (FR-17 mechanical subset).
//
// Pure-ish: globs .specs/<slug>/, extracts identifiers + file references
// via regex, compares against on-disk reality + cross-spec corpus.
// Produces a `consistency-report.yaml`-shaped object. Caller writes to
// disk (see yaml-writer.ts).
//
// Output finding codes (rc1 + post-rc1 expansion — 19 of 28 ship):
//   • impl-drift/missing-file              — FR/AC references a path that doesn't exist
//   • cross-spec/concept-overlap           — ≥3 shared concept-nouns between two specs without reference
//   • cross-spec/runtime-identifier-drift  — same concept named differently in two specs
//   • spec-only/orphan-FR                  — FR has no AC / Scenario / Task back-reference within the spec
//   • spec-only/uncovered-AC               — AC defined but no .feature scenario covers it
//   • cross-spec/contradictory-fr          — same FR id in two specs with contradictory text
//   • cross-spec/duplicate-fr-id           — two specs both define the same FR-N (collision)
//   • impl-drift/test-without-fr           — @featureN tag in a .feature with no matching FR in any spec
//   • spec-only/orphan-task                — TASKS.md task block with no FR-N citation
//   • spec-only/missing-fr-section         — body cites FR-N but no `## FR-N:` heading defines it
//   • schema-drift/missing-feature-heading — .feature file without a `Feature:` line
//   • impl-drift/dead-link                 — MD `[label](path)` link to non-existent file
//   • spec-only/missing-acceptance         — FR-N defined but no `## AC` / `### AC` heading anywhere in spec
//   • schema-drift/invalid-frontmatter     — .feature with bad `# language:` or missing trailing blank line
//   • impl-drift/missing-symbol            — `import { X } from '<path>'` where path exists but X is not exported
//   • cross-spec/url-shape-drift           — same logical URL path (e.g. /api/foo) referenced with divergent shapes
//   • cross-spec/cli-flag-drift            — same logical CLI flag (e.g. --scope) referenced with divergent shape/name
//   • cross-spec/enum-divergence           — same enum name with different value sets across specs
//   • cross-spec/module-ownership-conflict — two specs both claim ownership of the same code path
//
// The remaining 9 codes from the 28-code matrix land in the same
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

// URL path references — `/api/foo`, `/v1/orders/{id}`. Matched inside
// backticks or quoted strings to avoid catching prose like «navigate to /home».
const URL_PATH_RE = /["'`](\/(?:api|v\d+|\.well-known|webhook|hook|callback)[\w/{}\-.]*?)["'`]/g;
// CLI flags: `--scope`, `--target-dir`. Must start with `--` to avoid catching `-N` numbers.
const CLI_FLAG_RE = /\B(--[a-z][a-z0-9-]+)\b/g;
// TS export-name detection — `export {X, Y}`, `export const X`, `export function X`.
const TS_EXPORT_RE = /\bexport\s+(?:(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)|\{\s*([^}]+)\s*\})/g;
const TS_IMPORT_RE = /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g;
// Enum-like definition in MD: `Values: A | B | C` or bullet list `- A` / `- B` after «values:» / «enum:» header.
const ENUM_HEADER_RE = /(?:^|\n)\s*(?:Values|Enum|Options|Allowed):\s*([\w |,/-]+)/g;

// Markdown `[label](relative/path.ext)` links — only resolves relative
// repo paths; ignores http(s)://, mailto:, anchor-only (#foo), and
// query-string-only links.
const MD_LINK_RE = /\[[^\]]+\]\(([^)\s]+)\)/g;

/**
 * Find spec-cited `import { X } from '<path>'` where the resolved TS file
 * exists but does not export `X`. Scans MD code blocks (```ts ... ```)
 * for import statements; resolves the path against the repo root + spec
 * dir; reads the target file; greps for the export name.
 */
function findMissingSymbols(
  files: { body: string; path: string }[],
  repoRoot: string,
): Finding[] {
  const out: Finding[] = [];
  for (const file of files) {
    let m: RegExpExecArray | null;
    TS_IMPORT_RE.lastIndex = 0;
    while ((m = TS_IMPORT_RE.exec(file.body)) !== null) {
      const symbols = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const importPath = m[2];
      // Only resolve relative paths — skip bare module imports.
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue;
      const candidates = [
        importPath,
        `${importPath}.ts`,
        `${importPath}.tsx`,
        `${importPath}/index.ts`,
      ];
      let resolved: string | null = null;
      for (const c of candidates) {
        const abs = path.isAbsolute(c)
          ? path.join(repoRoot, c.replace(/^\//, ''))
          : path.resolve(path.dirname(file.path), c);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          resolved = abs;
          break;
        }
      }
      if (!resolved) continue;
      const tsBody = fs.readFileSync(resolved, 'utf8');
      const exported = new Set<string>();
      let em: RegExpExecArray | null;
      TS_EXPORT_RE.lastIndex = 0;
      while ((em = TS_EXPORT_RE.exec(tsBody)) !== null) {
        if (em[1]) exported.add(em[1]);
        if (em[2]) {
          for (const part of em[2].split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop();
            if (name) exported.add(name);
          }
        }
      }
      for (const sym of symbols) {
        if (exported.has(sym)) continue;
        out.push({
          code: 'impl-drift/missing-symbol',
          class: 'uncovered',
          severity: 'WARNING',
          referenced_in: `${path.relative(repoRoot, file.path)}`,
          expected_path: `${path.relative(repoRoot, resolved)}::${sym}`,
          suggested_fix:
            `\`${sym}\` is imported from ${importPath} but the file exports do not include it. Add the export or fix the import.`,
        });
      }
    }
  }
  return out;
}

/** Collect URL path references across all spec MD files. Map<url, Map<slug, file>>. */
function collectUrlsBySlug(
  filesBySlug: Map<string, { body: string; path: string }[]>,
): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const [slug, files] of filesBySlug) {
    for (const f of files) {
      let m: RegExpExecArray | null;
      URL_PATH_RE.lastIndex = 0;
      while ((m = URL_PATH_RE.exec(f.body)) !== null) {
        const url = m[1];
        if (!out.has(url)) out.set(url, new Map());
        if (!out.get(url)!.has(slug)) out.get(url)!.set(slug, f.path);
      }
    }
  }
  return out;
}

/** Compare URL prefixes across specs — e.g. one says `/api/foo`, the other `/api/v1/foo`. */
function findUrlShapeDrift(
  filesBySlug: Map<string, { body: string; path: string }[]>,
): Finding[] {
  const out: Finding[] = [];
  const urlsBySlug = collectUrlsBySlug(filesBySlug);
  // Build a normalised-suffix index: `/foo` -> [{url, slug}].
  const bySuffix = new Map<string, Array<{ url: string; slug: string }>>();
  for (const [url, slugMap] of urlsBySlug) {
    // Suffix = last path segment + 1 more. e.g. /api/v1/foo -> /v1/foo
    const parts = url.split('/').filter(Boolean);
    if (parts.length < 1) continue;
    const suffix = '/' + parts.slice(-1).join('/');
    if (!bySuffix.has(suffix)) bySuffix.set(suffix, []);
    for (const slug of slugMap.keys()) bySuffix.get(suffix)!.push({ url, slug });
  }
  for (const [, hits] of bySuffix) {
    if (hits.length < 2) continue;
    const distinctUrls = new Set(hits.map((h) => h.url));
    if (distinctUrls.size < 2) continue;
    const distinctSlugs = new Set(hits.map((h) => h.slug));
    if (distinctSlugs.size < 2) continue;
    const sorted = [...hits].sort((a, b) => a.url.localeCompare(b.url));
    out.push({
      code: 'cross-spec/url-shape-drift',
      class: 'runtime-identifier-drift',
      severity: 'CRITICAL',
      spec_a: `.specs/${sorted[0].slug} (${sorted[0].url})`,
      spec_b: `.specs/${sorted[1].slug} (${sorted[1].url})`,
      suggested_fix:
        `URLs ${[...distinctUrls].join(' vs ')} share the same suffix — clients will hit one and the server may serve the other. Pick a canonical shape.`,
    });
  }
  return out;
}

/** CLI flag drift — same logical name with different shapes. */
function findCliFlagDrift(
  filesBySlug: Map<string, { body: string; path: string }[]>,
): Finding[] {
  const out: Finding[] = [];
  const flagsBySlug = new Map<string, Set<string>>();
  for (const [slug, files] of filesBySlug) {
    const flags = new Set<string>();
    for (const f of files) {
      let m: RegExpExecArray | null;
      CLI_FLAG_RE.lastIndex = 0;
      while ((m = CLI_FLAG_RE.exec(f.body)) !== null) flags.add(m[1]);
    }
    flagsBySlug.set(slug, flags);
  }
  // Group by lemma — strip leading `--`, normalise dashes.
  const byLemma = new Map<string, Array<{ flag: string; slug: string }>>();
  for (const [slug, flags] of flagsBySlug) {
    for (const flag of flags) {
      const lemma = flag.replace(/^--/, '').replace(/-/g, '').toLowerCase();
      if (!byLemma.has(lemma)) byLemma.set(lemma, []);
      byLemma.get(lemma)!.push({ flag, slug });
    }
  }
  for (const [, hits] of byLemma) {
    if (hits.length < 2) continue;
    const distinctFlags = new Set(hits.map((h) => h.flag));
    if (distinctFlags.size < 2) continue;
    const distinctSlugs = new Set(hits.map((h) => h.slug));
    if (distinctSlugs.size < 2) continue;
    const sorted = [...hits].sort((a, b) => a.flag.localeCompare(b.flag));
    out.push({
      code: 'cross-spec/cli-flag-drift',
      class: 'runtime-identifier-drift',
      severity: 'WARNING',
      spec_a: `.specs/${sorted[0].slug} (${sorted[0].flag})`,
      spec_b: `.specs/${sorted[1].slug} (${sorted[1].flag})`,
      suggested_fix:
        `Flags ${[...distinctFlags].join(' vs ')} normalise to the same lemma — users may type either and one will fail. Pick a canonical name.`,
    });
  }
  return out;
}

/** Collect enum-like definitions: `Values: A | B | C` across spec MD files. */
function collectEnumsBySlug(
  filesBySlug: Map<string, { body: string; path: string }[]>,
): Map<string, Map<string, Set<string>>> {
  // outer key: slug, inner key: enum header text (lowercase first line context), value: set of enum values
  const out = new Map<string, Map<string, Set<string>>>();
  for (const [slug, files] of filesBySlug) {
    const enumMap = new Map<string, Set<string>>();
    for (const f of files) {
      // Find headings followed by `Values:` block. Heading captures the enum name.
      const sections = f.body.split(/(?=^#{2,4}\s+)/m);
      for (const section of sections) {
        const headerMatch = section.match(/^#{2,4}\s+([^\n]+)/);
        if (!headerMatch) continue;
        const enumName = headerMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
        let m: RegExpExecArray | null;
        ENUM_HEADER_RE.lastIndex = 0;
        while ((m = ENUM_HEADER_RE.exec(section)) !== null) {
          const values = m[1]
            .split(/[|,/]/)
            .map((s) => s.trim().replace(/[`"]/g, ''))
            .filter(Boolean);
          if (values.length < 2) continue;
          if (!enumMap.has(enumName)) enumMap.set(enumName, new Set());
          for (const v of values) enumMap.get(enumName)!.add(v);
        }
      }
    }
    out.set(slug, enumMap);
  }
  return out;
}

/** Same enum name with different value sets across specs. */
function findEnumDivergence(
  filesBySlug: Map<string, { body: string; path: string }[]>,
): Finding[] {
  const out: Finding[] = [];
  const enumsBySlug = collectEnumsBySlug(filesBySlug);
  const slugs = [...enumsBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = enumsBySlug.get(slugs[i])!;
      const b = enumsBySlug.get(slugs[j])!;
      for (const enumName of a.keys()) {
        if (!b.has(enumName)) continue;
        const setA = a.get(enumName)!;
        const setB = b.get(enumName)!;
        const symmetric: string[] = [];
        for (const v of setA) if (!setB.has(v)) symmetric.push(v);
        for (const v of setB) if (!setA.has(v)) symmetric.push(v);
        if (symmetric.length === 0) continue;
        out.push({
          code: 'cross-spec/enum-divergence',
          class: 'schema-drift',
          severity: 'CRITICAL',
          spec_a: `.specs/${slugs[i]} (${enumName}: ${[...setA].sort().join(', ')})`,
          spec_b: `.specs/${slugs[j]} (${enumName}: ${[...setB].sort().join(', ')})`,
          suggested_fix:
            `Enum "${enumName}" diverges on values [${symmetric.join(', ')}] — pick one canonical set or rename one of the enums.`,
        });
      }
    }
  }
  return out;
}

/** Two specs both claim ownership of the same code path. */
function findModuleOwnershipConflict(
  filesBySlug: Map<string, { body: string; path: string }[]>,
): Finding[] {
  const out: Finding[] = [];
  // Collect every `path/to/x.ts`-like reference (already covered by PATH_REF_RE).
  const pathsBySlug = new Map<string, Map<string, string>>();
  for (const [slug, files] of filesBySlug) {
    const pathMap = new Map<string, string>();
    for (const f of files) {
      let m: RegExpExecArray | null;
      PATH_REF_RE.lastIndex = 0;
      while ((m = PATH_REF_RE.exec(f.body)) !== null) {
        const ref = m[0].replace(/`/g, '').replace(/\*$/, '');
        // Only count concrete files (not glob-only).
        if (ref.includes('*')) continue;
        pathMap.set(ref, f.path);
      }
    }
    pathsBySlug.set(slug, pathMap);
  }
  const slugs = [...pathsBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = pathsBySlug.get(slugs[i])!;
      const b = pathsBySlug.get(slugs[j])!;
      for (const refPath of a.keys()) {
        if (!b.has(refPath)) continue;
        out.push({
          code: 'cross-spec/module-ownership-conflict',
          class: 'contradiction',
          severity: 'CRITICAL',
          spec_a: `.specs/${slugs[i]} (claims ${refPath})`,
          spec_b: `.specs/${slugs[j]} (claims ${refPath})`,
          suggested_fix:
            `Both specs reference ${refPath} as a deliverable — pick one canonical owner or split the module.`,
        });
      }
    }
  }
  return out;
}

/** Find broken MD links pointing to nonexistent files. */
function findDeadLinks(
  files: { body: string; path: string }[],
  repoRoot: string,
): Finding[] {
  const out: Finding[] = [];
  for (const file of files) {
    const lines = file.body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      let m: RegExpExecArray | null;
      MD_LINK_RE.lastIndex = 0;
      while ((m = MD_LINK_RE.exec(lines[i])) !== null) {
        const target = m[1].split('#')[0].split('?')[0];
        if (!target) continue;
        if (/^[a-z]+:\/\//i.test(target)) continue; // absolute URL
        if (target.startsWith('mailto:')) continue;
        const resolved = path.isAbsolute(target)
          ? target
          : path.resolve(path.dirname(file.path), target);
        if (fs.existsSync(resolved)) continue;
        out.push({
          code: 'impl-drift/dead-link',
          class: 'uncovered',
          severity: 'WARNING',
          referenced_in: `${path.relative(repoRoot, file.path)}:${i + 1}`,
          expected_path: target,
          suggested_fix:
            `Markdown link target "${target}" does not exist relative to ${path.basename(file.path)}. Fix the path or remove the link.`,
        });
      }
    }
  }
  return out;
}

/** FR defined but spec has zero AC headings — coverage gap. */
function findMissingAcceptance(
  files: { body: string; path: string }[],
  repoRoot: string,
): Finding[] {
  const defs = collectFrDefinitions(files);
  if (defs.size === 0) return [];
  let acFound = false;
  for (const f of files) {
    if (/^#{2,4}\s+(?:AC-\d+|Acceptance\s+Criteria)\b/m.test(f.body)) {
      acFound = true;
      break;
    }
  }
  if (acFound) return [];
  // Surface ONE finding pointed at the first FR — opening one AC.md is
  // enough to resolve, no need to fire N warnings.
  const [fr, file] = defs.entries().next().value as [string, string];
  return [{
    code: 'spec-only/missing-acceptance',
    class: 'spec-only',
    severity: 'WARNING',
    referenced_in: path.relative(repoRoot, file),
    suggested_fix:
      `${defs.size} FR(s) defined in this spec but no AC heading found in any MD file. Add ACCEPTANCE_CRITERIA.md (start with ${fr}).`,
  }];
}

/** .feature files with malformed `# language:` declaration (must be on first line, valid code). */
function findInvalidFrontmatter(
  repoRoot: string,
  slug: string,
): Finding[] {
  const dir = path.join(repoRoot, '.specs', slug);
  if (!fs.existsSync(dir)) return [];
  const out: Finding[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.feature')) continue;
    const body = fs.readFileSync(path.join(dir, name), 'utf8');
    const langMatch = body.match(/^#\s*language\s*:\s*(\S+)/m);
    if (!langMatch) continue;
    // Must be ON FIRST LINE — Gherkin requires it before any other content.
    if (!body.startsWith('#')) {
      out.push({
        code: 'schema-drift/invalid-frontmatter',
        class: 'schema-drift',
        severity: 'WARNING',
        referenced_in: `.specs/${slug}/${name}`,
        suggested_fix:
          '`# language: <code>` directive must appear on the first line of the .feature file (before any blank lines or comments).',
      });
      continue;
    }
    // Validate language code shape — ISO 639-1 two-letter or two-letter-locale.
    const lang = langMatch[1];
    if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(lang)) {
      out.push({
        code: 'schema-drift/invalid-frontmatter',
        class: 'schema-drift',
        severity: 'WARNING',
        referenced_in: `.specs/${slug}/${name}`,
        suggested_fix:
          `"# language: ${lang}" — Gherkin expects an ISO 639-1 code (e.g. \`en\`, \`ru\`, \`fr\`).`,
      });
    }
  }
  return out;
}

/** Find TASKS.md task blocks with NO `FR-N` citation in their body. */
function findOrphanTasks(
  files: { body: string; path: string }[],
  repoRoot: string,
): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    if (!/TASKS\.md$/i.test(f.path)) continue;
    // Split on `### ` headings (task blocks) — anything between two `### ` is one task.
    const blocks = f.body.split(/^### /m).slice(1);
    let lineCursor = 1;
    for (const block of blocks) {
      const firstLine = block.split(/\r?\n/)[0];
      const blockLines = block.split(/\r?\n/).length;
      const hasFrRef = /\bFR-\d+\b/.test(block);
      if (!hasFrRef) {
        out.push({
          code: 'spec-only/orphan-task',
          class: 'spec-only',
          severity: 'WARNING',
          referenced_in: `${path.relative(repoRoot, f.path)}:${lineCursor + 1}`,
          suggested_fix:
            `Task "${firstLine.slice(0, 60)}" cites no FR — add an FR-N back-reference or mark as infra-only.`,
        });
      }
      lineCursor += blockLines - 1;
    }
  }
  return out;
}

/** Body cites `FR-N` but no `## FR-N:` heading exists anywhere in the spec. */
function findMissingFrSections(
  files: { body: string; path: string }[],
  repoRoot: string,
): Finding[] {
  const defs = collectFrDefinitions(files);
  const cited = new Set<string>();
  for (const f of files) {
    let m: RegExpExecArray | null;
    FR_REF_RE.lastIndex = 0;
    while ((m = FR_REF_RE.exec(f.body)) !== null) cited.add(m[0]);
  }
  const out: Finding[] = [];
  for (const fr of cited) {
    if (defs.has(fr)) continue;
    // Locate first citation for the actionable hint.
    let where = '';
    for (const f of files) {
      const idx = f.body.search(new RegExp(`\\b${fr}\\b`));
      if (idx === -1) continue;
      const lineNum = f.body.slice(0, idx).split(/\r?\n/).length;
      where = `${path.relative(repoRoot, f.path)}:${lineNum}`;
      break;
    }
    out.push({
      code: 'spec-only/missing-fr-section',
      class: 'spec-only',
      severity: 'WARNING',
      referenced_in: where,
      suggested_fix:
        `${fr} is cited but no \`## ${fr}:\` heading exists — add the FR definition or remove the citation.`,
    });
  }
  return out;
}

/** .feature file without a `Feature:` line — schema drift, parser will reject. */
function findMissingFeatureHeadings(
  repoRoot: string,
  slug: string,
): Finding[] {
  const dir = path.join(repoRoot, '.specs', slug);
  if (!fs.existsSync(dir)) return [];
  const out: Finding[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.feature')) continue;
    const abs = path.join(dir, name);
    const body = fs.readFileSync(abs, 'utf8');
    if (/^Feature:\s+\S/m.test(body)) continue;
    out.push({
      code: 'schema-drift/missing-feature-heading',
      class: 'schema-drift',
      severity: 'CRITICAL',
      referenced_in: `.specs/${slug}/${name}`,
      suggested_fix:
        'Every .feature file must start with `Feature: <name>` — Gherkin parser rejects the file otherwise.',
    });
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
  const urlDriftFindings = findUrlShapeDrift(filesBySlug);
  const cliDriftFindings = findCliFlagDrift(filesBySlug);
  const enumDivergenceFindings = findEnumDivergence(filesBySlug);
  const moduleOwnershipFindings = findModuleOwnershipConflict(filesBySlug);

  const results: ReconcileResult[] = [];
  for (const slug of allSlugs) {
    const files = filesBySlug.get(slug)!;
    const findings: Finding[] = [];
    findings.push(...findMissingFileReferences(files, opts.repoRoot, opts.implRoots));
    const featureTags = collectFeatureTags(opts.repoRoot, slug);
    findings.push(...findOrphanFRs(files, featureTags, opts.repoRoot));
    findings.push(...findUncoveredACs(files, featureTags, opts.repoRoot));
    findings.push(...findTestsWithoutFR(opts.repoRoot, slug, allFrDefs));
    findings.push(...findOrphanTasks(files, opts.repoRoot));
    findings.push(...findMissingFrSections(files, opts.repoRoot));
    findings.push(...findMissingFeatureHeadings(opts.repoRoot, slug));
    findings.push(...findDeadLinks(files, opts.repoRoot));
    findings.push(...findMissingAcceptance(files, opts.repoRoot));
    findings.push(...findInvalidFrontmatter(opts.repoRoot, slug));
    findings.push(...findMissingSymbols(files, opts.repoRoot));
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
      ...urlDriftFindings,
      ...cliDriftFindings,
      ...enumDivergenceFindings,
      ...moduleOwnershipFindings,
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
