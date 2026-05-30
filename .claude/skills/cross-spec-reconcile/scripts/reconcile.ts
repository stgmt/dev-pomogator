// cross-spec-reconcile light-mode entry (FR-17 mechanical subset).
//
// Pure-ish: globs .specs/<slug>/, extracts identifiers + file references
// via regex, compares against on-disk reality + cross-spec corpus.
// Produces a `consistency-report.yaml`-shaped object. Caller writes to
// disk (see yaml-writer.ts).
//
// Output finding codes (rc1 + post-rc1 expansion — all 28 mechanical codes ship):
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
//   • impl-drift/missing-test              — FR-N defined but no @featureN tag exists in spec's .feature files
//   • spec-only/orphan-AC                  — AC-N references FR-N that isn't defined in the spec
//   • impl-drift/test-result-stale         — .feature mtime older than the latest spec MD mtime
//   • spec-only/unreachable-task           — Task with Phase N where spec's .progress.json::phase_index < N
//   • schema-drift/json-shape-drift        — JSON fixture top-level keys diverge from declared schema bullets
//   • cross-spec/missing-cross-ref         — spec mentions another slug by name but has no markdown link to it
//   • cross-spec/contradictory-nfr         — same NFR budget (latency/uptime/...) with divergent numeric values
//   • cross-spec/schema-mismatch           — same TS `interface`/`type` name with divergent field sets across specs
//   • cross-spec/decision-locked-but-reality-diverges — LOCKED decision says "use X" but referenced impl imports Y
//
// The 28-code mechanical matrix is COMPLETE. Future work is full-mode
// semantic checks (see full-mode.ts) and SARIF/audit-log improvements.

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
  /**
   * FR id namespace policy across specs. Default `'per-spec'`: every spec
   * keeps its own FR-1..N numbering, so `cross-spec/duplicate-fr-id` and
   * `cross-spec/contradictory-fr` are NOT emitted across specs (dogfood
   * batch-9 surfaced 33,000+ false positives on real corpora). Use
   * `'shared'` only when the repo enforces a global FR namespace, e.g. a
   * monolithic spec / docs-as-code setup where FR ids are assigned once.
   */
  crossSpecFrNamespace?: 'per-spec' | 'shared';
  /**
   * Path-substring stoplist for `cross-spec/module-ownership-conflict`.
   * Paths matching any substring here are excluded from ownership
   * comparison (avoids 900+ FPs on shared test infra like `helpers.ts`,
   * `_shared/`, fixtures, mocks).
   */
  ownershipStoplist?: string[];
}

/** Default ownership stoplist — shared infra that multiple specs legitimately reference. */
/* Batch-10 (readiness audit): expanded with 15 corpus-derived paths so the
 * default dogfood produces actionable CRITICAL ownership conflicts only.
 * Pre-expansion: 554 CRITICAL findings on this repo. Post-expansion target:
 * <100 (the rest are legitimately-shared infra paths). */
const DEFAULT_OWNERSHIP_STOPLIST = [
  // Pre-batch-10 base — expanded to entire tests/e2e dir per readiness audit
  // (individual test files shared across specs trigger ownership FPs).
  'tests/e2e/',
  'tests/unit/',
  'tests/fixtures/',
  'tests/setup/',
  'tests/hooks/',
  'tests/step_definitions/',
  'tools/_shared/',
  'tools/test-statusline/',
  'tools/tui-test-runner/',
  '.claude-plugin/',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vitest.config.ts',
  // Batch-10 corpus expansion — shared tooling + skills + rules infra.
  'tools/specs-generator/',
  'tools/specs-validator/',
  'tools/auto-commit/',
  'tools/plan-pomogator/',
  'tools/migrate-v1-to-v2/',
  'tools/marksman-installer/',
  'tools/spec-graph/',
  '.claude/skills/',
  '.claude/rules/',
  '.claude/commands/',
  '.dev-pomogator/',
  '.devcontainer/',
  'scripts/',
  'Dockerfile.test',
  'docker-compose.test.yml',
];

/** Minimum shared-concept count to fire `cross-spec/concept-overlap`
 * (batch-3: 3, batch-9: 5, batch-10 readiness audit: 10 — kills ~1800
 * INFO findings on the real corpus without losing genuine signal). */
const CONCEPT_OVERLAP_MIN_SHARED = 10;

/** Stoplist of generic concept nouns that appear in many unrelated specs.
 * Batch-10 (readiness audit): expanded from 34 → 80+ entries so common
 * design-pattern nouns (Builder/Handler/Manager/etc.) don't fire as
 * "shared concepts". The readiness audit estimated this alone kills
 * ~1500 noise findings even before the threshold bump. */
const CONCEPT_NOUN_STOPLIST = new Set([
  // Spec-ecosystem terms (batch-9 base)
  'Acceptance', 'Criteria', 'Schema', 'Changelog', 'Stop', 'Docker',
  'TypeScript', 'JavaScript', 'Python', 'GitHub', 'README', 'Phase',
  'Status', 'TODO', 'FIXME', 'WARNING', 'CRITICAL', 'INFO',
  'JSON', 'YAML', 'Feature', 'Scenario', 'Requirement', 'NFR',
  'Performance', 'Security', 'Reliability', 'Usability',
  'Implementation', 'Definition', 'Validation', 'Verification',
  'Configuration', 'Documentation', 'Integration', 'Migration',
  // Batch-10: design-pattern + framework nouns (audit-derived corpus)
  'Builder', 'Handler', 'Manager', 'Factory', 'Provider', 'Runner',
  'Validator', 'Parser', 'Serializer', 'Transformer', 'Strategy',
  'Observer', 'Facade', 'Adapter', 'Bridge', 'Registry', 'Store',
  'Cache', 'Queue', 'Service', 'Controller', 'Component', 'Module',
  'Extension', 'Plugin', 'Skill', 'Command', 'Hook', 'Workflow',
  'Pipeline', 'Worker', 'Listener', 'Emitter', 'Subscriber',
  'Publisher', 'Generator', 'Iterator', 'Visitor', 'Composer',
  'Decorator', 'Proxy', 'Wrapper', 'Container', 'Context', 'Session',
  'Request', 'Response', 'Message', 'Event', 'Action', 'State',
  'Reducer', 'Selector', 'Middleware', 'Repository', 'Aggregate',
  'Entity', 'Model', 'View', 'Template', 'Render', 'Layout',
  // Batch-10 dogfood pass-2: Keep-a-Changelog + spec-workflow vocab
  // surfaced as the dominant residual concept-overlap noise.
  'Unreleased', 'Added', 'Changed', 'Removed', 'Fixed', 'Released',
  'Deprecated', 'Code', 'Claude', 'Discovery', 'Spec', 'Pass', 'Fail',
  'Test', 'Tests', 'Notes', 'Comments', 'Description', 'Title',
  'Summary', 'Details', 'Overview', 'Reference', 'References',
  'Example', 'Examples', 'Note', 'See', 'Also', 'TODO', 'TBD',
]);

export interface ReconcileResult {
  generatedAt: string;
  mode: 'light';
  specSlug: string;
  findings: Finding[];
}

const PATH_REF_RE = /`(?:src|tools|tests|lib)\/[\w./-]+\*?(?:\.[\w]+)?`/g;
// Catches both snake_case (`session_token`) and camelCase (`sessionToken`)
// identifier names ending in the canonical suffixes. The lemma normaliser
// in `normalizeIdentifierKey` collapses them to the same key so two specs
// using divergent casing for the same concept register as drift.
const IDENTIFIER_LINE_RE = /\b(\w+(?:_key|_id|_token|_path|Key|Id|Token|Path))\s*=\s*["']([^"']+)["']/g;
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

export interface PathResolveResult {
  exists: boolean;
  /** True iff the path is a glob AND its prefix dir doesn't exist (UX hint). */
  globPrefixMissing: boolean;
}

/** Resolve a glob-ish path (supports trailing `*`) against the repo. */
function pathExistsResolvingDetail(
  repoRoot: string,
  ref: string,
  implRoots?: string[],
): PathResolveResult {
  const cleanRef = ref.replace(/`/g, '');
  const candidates = (implRoots ?? ['.']).map((r) => path.join(repoRoot, r, cleanRef));
  let anyGlobPrefixMissing = false;
  for (const c of candidates) {
    if (!c.includes('*') && fs.existsSync(c)) return { exists: true, globPrefixMissing: false };
    if (c.includes('*')) {
      // Cheap glob: strip everything after the last `*` and confirm the
      // prefix dir exists with at least one matching entry.
      const star = c.lastIndexOf('*');
      const prefixDir = path.dirname(c.slice(0, star));
      const baseName = path.basename(c.slice(0, star));
      if (!fs.existsSync(prefixDir)) {
        anyGlobPrefixMissing = true;
        continue;
      }
      const matches = fs.readdirSync(prefixDir).some((f) => f.startsWith(baseName));
      if (matches) return { exists: true, globPrefixMissing: false };
    }
  }
  return { exists: false, globPrefixMissing: anyGlobPrefixMissing };
}

function pathExistsResolving(repoRoot: string, ref: string, implRoots?: string[]): boolean {
  return pathExistsResolvingDetail(repoRoot, ref, implRoots).exists;
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
        const detail = pathExistsResolvingDetail(repoRoot, ref, implRoots);
        if (detail.exists) continue;
        const hint = detail.globPrefixMissing
          ? 'Add the implementation, OR mark the FR as OUT_OF_SCOPE, OR remove the reference. (Glob prefix dir does not exist — was the parent directory removed or renamed?)'
          : 'Add the implementation, OR mark the FR as OUT_OF_SCOPE, OR remove the reference.';
        out.push({
          code: 'impl-drift/missing-file',
          class: 'uncovered',
          severity: 'WARNING',
          referenced_in: `${path.relative(repoRoot, file.path)}:${i + 1}`,
          expected_path: ref.replace(/`/g, ''),
          suggested_fix: hint,
        });
      }
    }
  }
  return out;
}

/** Strip fenced code blocks (```...```) — they hold examples, not decisions. */
function stripFencedBlocks(body: string): string {
  return body.replace(/```[\s\S]*?```/g, '');
}

/** Normalize key name: snake_case + camelCase + kebab → same key. */
function normalizeIdentifierKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function collectIdentifiers(
  files: { body: string; path: string }[],
): Map<string, { value: string; where: string; originalKey: string }> {
  // Adversarial-review fixes:
  //   • strip fenced code blocks — assignments inside `````ts ...` ` ` blocks
  //     are examples, not decisions (HIGH FP)
  //   • normalize snake_case vs camelCase to the same lemma so
  //     `session_token` and `sessionToken` register the same concept (HIGH FN)
  const out = new Map<string, { value: string; where: string; originalKey: string }>();
  for (const f of files) {
    const cleanBody = stripFencedBlocks(f.body);
    let m: RegExpExecArray | null;
    IDENTIFIER_LINE_RE.lastIndex = 0;
    while ((m = IDENTIFIER_LINE_RE.exec(cleanBody)) !== null) {
      const lemma = normalizeIdentifierKey(m[1]);
      out.set(lemma, { value: m[2], where: f.path, originalKey: m[1] });
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
      for (const lemma of a.keys()) {
        if (!b.has(lemma)) continue;
        const va = a.get(lemma)!;
        const vb = b.get(lemma)!;
        if (va.value !== vb.value || va.originalKey !== vb.originalKey) {
          out.push({
            code: 'cross-spec/runtime-identifier-drift',
            class: 'runtime-identifier-drift',
            severity: 'CRITICAL',
            spec_a: `${va.where} (${va.originalKey} = "${va.value}")`,
            spec_b: `${vb.where} (${vb.originalKey} = "${vb.value}")`,
            suggested_fix:
              va.originalKey !== vb.originalKey
                ? `Concept normalises to "${lemma}" but spelled "${va.originalKey}" / "${vb.originalKey}". Pick one canonical key + update both specs in lockstep.`
                : 'Pick one canonical name + update both specs in lockstep.',
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
// TS export-name detection — `export {X, Y}`, `export const X`, `export function X`,
// `export default X`, `export default function X()`, `export default class X`.
const TS_EXPORT_RE = /\bexport\s+(?:(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)|\{\s*([^}]+)\s*\})/g;
// Bare `export default <expression>` — captures the identifier when it's a simple name.
const TS_DEFAULT_EXPORT_RE = /\bexport\s+default\s+(\w+)\s*;?/g;
// `export * from './x'` — star re-export. Cannot resolve symbol names without
// recursing into the re-exported file; treat as opt-out (suppress missing-symbol findings).
const TS_STAR_REEXPORT_RE = /\bexport\s*\*\s*from\s*['"]/;
const TS_IMPORT_RE = /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g;
// Enum-like definition in MD: `Values: A | B | C` or bullet list `- A` / `- B` after «values:» / «enum:» header.
const ENUM_HEADER_RE = /(?:^|\n)\s*(?:Values|Enum|Options|Allowed):\s*([\w |,/-]+)/g;

// AC → FR backref: matches `## AC-3 (FR-5)` heading OR `**Requirement:** [FR-5]` body line.
const AC_TO_FR_RE = /AC-\d+[^\n]*?\(FR-(\d+)\)|\*\*Requirement:\*\*\s*\[FR-(\d+)\]/g;
// Schema declarations in `*_SCHEMA.md` / `SCHEMA.md` — bullets under "Schema" or "Keys" headings.
const SCHEMA_KEY_BULLET_RE = /^\s*[-*]\s+`([a-zA-Z_][\w]*)`/gm;
// Phase column inside a TASKS.md task-table row.
const PHASE_CELL_RE = /\bPhase\s+(\d+)\b/i;
// NFR budget heuristics — verb-noun + numeric + unit. Order matters: more
// specific patterns (`response-time`) before generic (`latency`).
const NFR_BUDGET_RE = /\b(response[-\s]?time|latency|throughput|availability|uptime|error[-\s]rate|cpu|memory|storage)\b[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*(ms|s|mb|gb|%|req\/s)/gi;
// Decision blocks in DECISIONS.md / DESIGN.md.
const DECISION_BLOCK_RE = /^#{2,3}\s+Decision[:\s]+([\w-]+)([\s\S]*?)(?=\n#{2,3}\s|$)/gm;
const DECISION_STATUS_LOCKED_RE = /\bStatus\s*[:=]\s*(?:LOCKED|FINAL)\b/i;
// Adversarial-review fix (HIGH FN): `[^\n(@`]+` greedily captured trailing
// prose like `jsonwebtoken library for signing tokens`. Restrict to a
// package-identifier-like token (allow `.`, `/`, `@`, `-`, scope prefix).
const DECISION_CHOSEN_RE = /\bChosen\s*[:=]\s*(@?[\w./-]+)/i;
const DECISION_IMPL_PATH_RE = /\bImplemented\s+in\s*[:=]\s*`([^`]+)`/i;
const TS_FILE_IMPORT_RE = /^\s*import\s+[^'"]+['"]([^'"]+)['"]/gm;
// TypeScript interface/type body — captures name + body until matching `}`.
const TS_INTERFACE_RE = /(?:interface|type)\s+(\w+)\s*[={]\s*([\s\S]*?)^\s*\}/gm;
const TS_FIELD_RE = /^\s*(?:readonly\s+)?(\w+)\s*\??\s*:/gm;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
      // `export * from './x'` re-exports an unknown set of symbols. Cannot
      // verify membership without recursing, so suppress missing-symbol
      // for the whole import statement to avoid noisy false-positives
      // (adversarial-review finding HIGH-FP).
      if (TS_STAR_REEXPORT_RE.test(tsBody)) continue;
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
      // `export default <ident>` — captured separately, and `default` is
      // imported via `import { default as X }` shape (handled by symbol parse).
      TS_DEFAULT_EXPORT_RE.lastIndex = 0;
      let dm: RegExpExecArray | null;
      let hasDefault = false;
      while ((dm = TS_DEFAULT_EXPORT_RE.exec(tsBody)) !== null) {
        exported.add(dm[1]);
        hasDefault = true;
      }
      if (/\bexport\s+default\s+(?:function|class|async\s+function)/.test(tsBody)) {
        hasDefault = true;
      }
      if (hasDefault) exported.add('default');
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
  // Generic action verbs / list/index words — too noisy to use as a sole
  // last-segment matcher (would flag `/admin/users/list` vs `/api/users/list`
  // as drift, which is wrong — they're unrelated routes).
  const GENERIC_LAST_SEGMENTS = new Set([
    'list', 'get', 'add', 'set', 'post', 'put', 'delete', 'patch',
    'all', 'new', 'edit', 'create', 'remove', 'update', 'index',
    'show', 'view', 'find', 'search', 'query',
  ]);
  for (const [url, slugMap] of urlsBySlug) {
    // Adversarial-review fix (HIGH FP): only register a suffix if the
    // final segment is NOT a generic action verb — otherwise unrelated
    // APIs collide. Domain-specific nouns (`orders`, `customers`,
    // `inventory`) are kept; generic verbs (`list`, `get`) are dropped.
    const parts = url.split('/').filter(Boolean);
    if (parts.length < 1) continue;
    const last = parts[parts.length - 1].toLowerCase().replace(/[{}]/g, '');
    if (GENERIC_LAST_SEGMENTS.has(last)) continue;
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
      // Adversarial-review fix (HIGH FP): flags inside fenced ```ts code
      // blocks are examples, not real CLI declarations. Strip them first.
      const body = stripFencedBlocks(f.body);
      let m: RegExpExecArray | null;
      CLI_FLAG_RE.lastIndex = 0;
      while ((m = CLI_FLAG_RE.exec(body)) !== null) flags.add(m[1]);
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
      // Adversarial-review fix (HIGH FP): enum values inside fenced ```ts
      // blocks are examples, not real schema declarations. Strip first.
      const body = stripFencedBlocks(f.body);
      // Find headings followed by `Values:` block. Heading captures the enum name.
      const sections = body.split(/(?=^#{2,4}\s+)/m);
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
  stoplist: string[] = DEFAULT_OWNERSHIP_STOPLIST,
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
        // Adversarial-review fix (HIGH FN): normalize embedded `*` (not just
        // trailing) to a canonical empty marker so two specs both claiming
        // `tools/foo*/main.ts` still collide. Concrete-file references
        // remain unchanged; pure-glob references compare as their normalised
        // string (e.g. `tools/foo/main.ts`).
        const raw = m[0].replace(/`/g, '');
        const ref = raw.replace(/\*/g, '');
        // Dogfood batch-9: skip shared infra paths (helpers.ts, fixtures,
        // _shared/, etc.) — they are legitimately referenced by N specs.
        if (stoplist.some((s) => ref.includes(s))) continue;
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
        // Adversarial-review fix (HIGH FP): `path.isAbsolute('/GUIDE.md')`
        // is true on POSIX and resolves from filesystem root — almost
        // always wrong for repo links. Treat leading-`/` as repo-root
        // relative on every OS.
        const primary = target.startsWith('/')
          ? path.join(repoRoot, target.slice(1))
          : path.isAbsolute(target)
            ? target
            : path.resolve(path.dirname(file.path), target);
        if (fs.existsSync(primary)) continue;
        // Dogfood batch-11 PoC fix: authors routinely write
        // `../../../foo/bar.md` meaning "repo-root + foo/bar.md", but a
        // spec living at `.specs/<slug>/file.md` only needs `../../foo/bar.md`
        // (or, often, `foo/bar.md`). When the relative resolution misses,
        // try `repoRoot + basename-tail` as a fallback before flagging dead.
        const cleaned = target.replace(/^(?:\.\.[/\\])+/, '');
        const fallback = path.join(repoRoot, cleaned);
        if (fs.existsSync(fallback)) continue;
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

// ============================================================================
// Batch-7: final 9 finding codes (per workflow wzbmwybag design spec).
// ============================================================================

/** Stricter variant of orphan-FR: every defined FR-N MUST have a matching */
/** @featureN tag in the spec's .feature corpus.                          */
function findMissingTestPerFR(
  files: { body: string; path: string }[],
  featureTags: Set<string>,
  repoRoot: string,
  slug: string,
): Finding[] {
  // Batch-10 (readiness audit): phase-gate — only emit when
  // `.progress.json::phase_index >= 2`. Phase 0/1 specs are intentionally
  // FR-first, .feature mapping comes later. Without this gate the detector
  // fires ~110 noise findings on early-phase specs.
  const progressFile = path.join(repoRoot, '.specs', slug, '.progress.json');
  let phaseIndex = 0;
  if (fs.existsSync(progressFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(progressFile, 'utf8')) as {
        phase_index?: number;
      };
      if (typeof parsed.phase_index === 'number') phaseIndex = parsed.phase_index;
    } catch { /* malformed JSON — treat as phase 0 */ }
  }
  // If no .progress.json OR phase_index < 2 → skip the check.
  if (phaseIndex < 2) return [];

  const defs = collectFrDefinitions(files);
  const out: Finding[] = [];
  for (const [fr, definedIn] of defs.entries()) {
    if (featureTags.has(fr)) continue;
    out.push({
      code: 'impl-drift/missing-test',
      class: 'uncovered',
      severity: 'INFO',
      referenced_in: path.relative(repoRoot, definedIn),
      suggested_fix:
        `Add @${fr.toLowerCase().replace('-', '')} tag + Scenario covering ${fr}, OR mark FR as [OUT_OF_SCOPE].`,
    });
  }
  return out;
}

/** AC heading references an FR that this spec never defines. */
function findOrphanACs(
  files: { body: string; path: string }[],
  repoRoot: string,
): Finding[] {
  const defs = collectFrDefinitions(files);
  const out: Finding[] = [];
  for (const f of files) {
    if (!/(?:^|\/|\\)(?:ACCEPTANCE_CRITERIA|AC)\.md$/i.test(f.path)) continue;
    const body = stripFencedBlocks(f.body);
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      let m: RegExpExecArray | null;
      AC_TO_FR_RE.lastIndex = 0;
      while ((m = AC_TO_FR_RE.exec(lines[i])) !== null) {
        const num = m[1] ?? m[2];
        if (!num) continue;
        const fr = `FR-${num}`;
        if (defs.has(fr)) continue;
        out.push({
          code: 'spec-only/orphan-AC',
          class: 'spec-only',
          severity: 'INFO',
          referenced_in: `${path.relative(repoRoot, f.path)}:${i + 1}`,
          suggested_fix:
            `AC references ${fr} which is not defined in this spec. Either add ${fr} to FR.md or fix the AC backref.`,
        });
      }
    }
  }
  return out;
}

/** `.feature` files older than the latest spec MD mtime (with 1 min skew). */
function findStaleFeatureFiles(
  repoRoot: string,
  slug: string,
  files: { body: string; path: string }[],
): Finding[] {
  const dir = path.join(repoRoot, '.specs', slug);
  if (!fs.existsSync(dir)) return [];
  const MD_TARGETS = ['FR.md', 'ACCEPTANCE_CRITERIA.md', 'REQUIREMENTS.md', 'DESIGN.md'];
  let latestSpecMtime = 0;
  for (const f of files) {
    if (!MD_TARGETS.some((m) => f.path.endsWith(m))) continue;
    try {
      const stat = fs.statSync(f.path);
      if (stat.mtimeMs > latestSpecMtime) latestSpecMtime = stat.mtimeMs;
    } catch {
      // ignore missing/transient files
    }
  }
  if (latestSpecMtime === 0) return [];
  const out: Finding[] = [];
  const SKEW_MS = 60_000;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.feature')) continue;
    const abs = path.join(dir, name);
    let featureMtime: number;
    try {
      featureMtime = fs.statSync(abs).mtimeMs;
    } catch {
      continue;
    }
    if (featureMtime >= latestSpecMtime - SKEW_MS) continue;
    out.push({
      code: 'impl-drift/test-result-stale',
      class: 'uncovered',
      severity: 'WARNING',
      referenced_in: `.specs/${slug}/${name}`,
      suggested_fix:
        `.feature last modified ${new Date(featureMtime).toISOString()} but spec MD last modified ${new Date(latestSpecMtime).toISOString()}. Re-run scenarios and/or update .feature to reflect spec changes. (CI gotcha: git clone resets mtimes — skip this finding on fresh checkouts.)`,
    });
  }
  return out;
}

/** Tasks targeting a Phase higher than `.progress.json::phase_index`. */
function findUnreachableTasks(
  files: { body: string; path: string }[],
  repoRoot: string,
  slug: string,
): Finding[] {
  const out: Finding[] = [];
  const progressFile = path.join(repoRoot, '.specs', slug, '.progress.json');
  if (!fs.existsSync(progressFile)) return [];
  let currentPhase = 1;
  try {
    const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8')) as {
      phase_index?: number;
    };
    if (typeof progress.phase_index === 'number') currentPhase = progress.phase_index;
  } catch {
    return [];
  }
  for (const f of files) {
    if (!/TASKS\.md$/i.test(f.path)) continue;
    const lines = f.body.split(/\r?\n/);
    // Find header row to locate Phase column index.
    let phaseColIdx = -1;
    let statusColIdx = -1;
    let idColIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes('|')) continue;
      const cells = lines[i].split('|').map((c) => c.trim().toLowerCase());
      const pIdx = cells.indexOf('phase');
      if (pIdx === -1) continue;
      phaseColIdx = pIdx;
      statusColIdx = cells.indexOf('status');
      idColIdx = cells.findIndex((c) => c === 'id' || c === 'task' || c === 'title');
      // Scan subsequent rows for tasks.
      for (let j = i + 2; j < lines.length; j++) {
        const row = lines[j];
        if (!row.includes('|') || /^\|[\s-:|]+\|/.test(row)) continue;
        if (row.trim() === '') break;
        const rowCells = row.split('|').map((c) => c.trim());
        const phaseCell = rowCells[phaseColIdx] ?? '';
        const statusCell = statusColIdx >= 0 ? (rowCells[statusColIdx] ?? '').toLowerCase() : '';
        const idCell = idColIdx >= 0 ? rowCells[idColIdx] ?? '' : `row-${j}`;
        if (statusCell === 'done') continue;
        const phaseMatch = phaseCell.match(PHASE_CELL_RE);
        if (!phaseMatch) continue;
        const taskPhase = parseInt(phaseMatch[1], 10);
        if (Number.isNaN(taskPhase) || taskPhase <= currentPhase) continue;
        out.push({
          code: 'spec-only/unreachable-task',
          class: 'spec-only',
          severity: 'INFO',
          referenced_in: `${path.relative(repoRoot, f.path)}:${j + 1}`,
          suggested_fix:
            `Task "${idCell}" targets Phase ${taskPhase} but spec is at Phase ${currentPhase}. Advance phase_index, defer the task, or mark [OUT_OF_SCOPE].`,
        });
      }
      break;
    }
  }
  return out;
}

/** JSON fixture top-level keys diverge from declared SCHEMA.md bullets. */
function findJsonShapeDrift(
  files: { body: string; path: string }[],
  repoRoot: string,
  slug: string,
): Finding[] {
  const dir = path.join(repoRoot, '.specs', slug);
  if (!fs.existsSync(dir)) return [];
  const declared = new Set<string>();
  for (const f of files) {
    if (!/SCHEMA\.md$/i.test(f.path)) continue;
    // Slice the body into sections under headings containing "Schema" / "Keys".
    const sections = f.body.split(/^##\s+/m);
    for (const sec of sections) {
      // Adversarial-review fix (MEDIUM FP): heading match was too narrow —
      // missed `Data Shape`, `Fields`, `Structure` headings that are
      // common in spec writing.
      if (!/Schema|Keys|Shape|Fields|Structure/i.test(sec.split(/\n/)[0] ?? '')) continue;
      let m: RegExpExecArray | null;
      SCHEMA_KEY_BULLET_RE.lastIndex = 0;
      while ((m = SCHEMA_KEY_BULLET_RE.exec(sec)) !== null) declared.add(m[1]);
    }
  }
  if (declared.size === 0) return [];
  const out: Finding[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    // Skip volatile state files — their shape is not the responsibility of SCHEMA.md.
    if (name === '.progress.json') continue;
    const abs = path.join(dir, name);
    let observed: Set<string>;
    try {
      const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      observed = new Set(Object.keys(parsed));
    } catch {
      continue;
    }
    const missing: string[] = [];
    const extra: string[] = [];
    for (const k of declared) if (!observed.has(k)) missing.push(k);
    for (const k of observed) if (!declared.has(k)) extra.push(k);
    if (missing.length === 0 && extra.length === 0) continue;
    out.push({
      code: 'schema-drift/json-shape-drift',
      class: 'schema-drift',
      severity: 'WARNING',
      referenced_in: `.specs/${slug}/${name}`,
      suggested_fix:
        `JSON ${name} top-level keys diverge from SCHEMA.md. Missing: [${missing.join(', ') || '(none)'}]. Extra: [${extra.join(', ') || '(none)'}].`,
    });
  }
  return out;
}

/** Slugs mentioned in body but never linked via markdown. */
function findMissingCrossRef(
  filesBySlug: Map<string, { body: string; path: string }[]>,
  allSlugs: string[],
): Finding[] {
  const out: Finding[] = [];
  for (const slug of allSlugs) {
    const ownFiles = filesBySlug.get(slug) ?? [];
    const ownBodies = ownFiles.map((f) => f.body).join('\n');
    for (const otherSlug of allSlugs) {
      if (otherSlug === slug) continue;
      const mentionRe = new RegExp(`\\b${escapeRegex(otherSlug)}\\b`, 'g');
      if (!mentionRe.test(ownBodies)) continue;
      const linkRe = new RegExp(
        `\\]\\([^)]*\\.specs[/\\\\]${escapeRegex(otherSlug)}[/\\\\][^)]*\\)`,
        'g',
      );
      if (linkRe.test(ownBodies)) continue;
      // Locate first mention for actionable hint.
      let where = '';
      mentionRe.lastIndex = 0;
      for (const f of ownFiles) {
        const idx = f.body.search(mentionRe);
        if (idx === -1) continue;
        const lineNum = f.body.slice(0, idx).split(/\r?\n/).length;
        where = `${path.relative('.', f.path)}:${lineNum}`;
        break;
      }
      out.push({
        code: 'cross-spec/missing-cross-ref',
        class: 'concept-overlap',
        severity: 'INFO',
        spec_a: `.specs/${slug}`,
        spec_b: `.specs/${otherSlug}`,
        referenced_in: where,
        suggested_fix:
          `Spec mentions "${otherSlug}" but has no markdown link. Add [...](../${otherSlug}/FR.md) to make the cross-ref explicit.`,
      });
    }
  }
  return out;
}

interface NfrBudget {
  key: string;
  value: number;
  unit: string;
  context: string;
}

function collectNfrBudgets(
  filesBySlug: Map<string, { body: string; path: string }[]>,
): Map<string, Map<string, NfrBudget>> {
  const out = new Map<string, Map<string, NfrBudget>>();
  for (const [slug, files] of filesBySlug) {
    const budgets = new Map<string, NfrBudget>();
    for (const f of files) {
      const body = stripFencedBlocks(f.body);
      let m: RegExpExecArray | null;
      NFR_BUDGET_RE.lastIndex = 0;
      while ((m = NFR_BUDGET_RE.exec(body)) !== null) {
        let key = m[1].toLowerCase().replace(/[-\s]+/g, '-');
        if (key === 'response-time') key = 'latency';
        // Adversarial-review fix (MEDIUM FN): `latency|s` and `latency|ms`
        // were bucketed separately, so `200ms vs 2s` silently passed.
        // Normalize seconds → milliseconds in the bucket key.
        const rawValue = parseFloat(m[2]);
        const rawUnit = m[3].toLowerCase();
        const isTimeUnit = rawUnit === 's' || rawUnit === 'ms';
        const normValue = isTimeUnit && rawUnit === 's' ? rawValue * 1000 : rawValue;
        const normUnit = isTimeUnit ? 'ms' : rawUnit;
        budgets.set(`${key}|${normUnit}`, {
          key,
          value: normValue,
          unit: normUnit,
          context: f.path,
        });
      }
    }
    out.set(slug, budgets);
  }
  return out;
}

/** Two specs declare the same NFR budget with different numeric values. */
function findContradictoryNFR(
  filesBySlug: Map<string, { body: string; path: string }[]>,
): Finding[] {
  const budgets = collectNfrBudgets(filesBySlug);
  const out: Finding[] = [];
  const slugs = [...budgets.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = budgets.get(slugs[i])!;
      const b = budgets.get(slugs[j])!;
      for (const key of a.keys()) {
        if (!b.has(key)) continue;
        const ba = a.get(key)!;
        const bb = b.get(key)!;
        // Tolerance: >10% difference fires. Same-value pairs skip.
        const diff = Math.abs(ba.value - bb.value);
        const max = Math.max(Math.abs(ba.value), Math.abs(bb.value), 1);
        if (diff / max <= 0.1) continue;
        out.push({
          code: 'cross-spec/contradictory-nfr',
          class: 'contradiction',
          severity: 'CRITICAL',
          spec_a: `.specs/${slugs[i]} (${ba.key} = ${ba.value}${ba.unit})`,
          spec_b: `.specs/${slugs[j]} (${bb.key} = ${bb.value}${bb.unit})`,
          suggested_fix:
            `NFR "${ba.key}" contradicts: ${ba.value}${ba.unit} vs ${bb.value}${bb.unit}. Reconcile budgets or document why they differ.`,
        });
      }
    }
  }
  return out;
}

function collectTsInterfaces(
  filesBySlug: Map<string, { body: string; path: string }[]>,
): Map<string, Map<string, Set<string>>> {
  const out = new Map<string, Map<string, Set<string>>>();
  for (const [slug, files] of filesBySlug) {
    const ifaces = new Map<string, Set<string>>();
    for (const f of files) {
      if (!/DESIGN\.md|SCHEMA\.md/i.test(f.path)) continue;
      let m: RegExpExecArray | null;
      TS_INTERFACE_RE.lastIndex = 0;
      while ((m = TS_INTERFACE_RE.exec(f.body)) !== null) {
        const name = m[1];
        const fields = new Set<string>();
        let fm: RegExpExecArray | null;
        TS_FIELD_RE.lastIndex = 0;
        while ((fm = TS_FIELD_RE.exec(m[2])) !== null) fields.add(fm[1]);
        if (fields.size > 0) ifaces.set(name, fields);
      }
    }
    out.set(slug, ifaces);
  }
  return out;
}

/** Same TS type/interface name with divergent field sets across specs. */
function findSchemaMismatch(
  filesBySlug: Map<string, { body: string; path: string }[]>,
): Finding[] {
  const ifacesBySlug = collectTsInterfaces(filesBySlug);
  const out: Finding[] = [];
  const slugs = [...ifacesBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = ifacesBySlug.get(slugs[i])!;
      const b = ifacesBySlug.get(slugs[j])!;
      for (const name of a.keys()) {
        if (!b.has(name)) continue;
        const fieldsA = a.get(name)!;
        const fieldsB = b.get(name)!;
        const diff: string[] = [];
        for (const f of fieldsA) if (!fieldsB.has(f)) diff.push(`A:${f}`);
        for (const f of fieldsB) if (!fieldsA.has(f)) diff.push(`B:${f}`);
        if (diff.length === 0) continue;
        out.push({
          code: 'cross-spec/schema-mismatch',
          class: 'schema-drift',
          severity: 'CRITICAL',
          spec_a: `.specs/${slugs[i]} (${name}: ${[...fieldsA].sort().join(', ')})`,
          spec_b: `.specs/${slugs[j]} (${name}: ${[...fieldsB].sort().join(', ')})`,
          suggested_fix:
            `Type "${name}" differs across specs. Symmetric diff: [${diff.join(', ')}]. Unify the schema or rename one type.`,
        });
      }
    }
  }
  return out;
}

/** LOCKED decision claims package X, but referenced impl file imports Y. */
function findLockedDecisionDrift(
  files: { body: string; path: string }[],
  repoRoot: string,
): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    if (!/DECISIONS\.md|DESIGN\.md/i.test(f.path)) continue;
    // Split body by `## ` or `### ` headings — first segment has the
    // pre-heading prose (discarded), subsequent segments start with the
    // heading text. Iterate looking for "Decision:" prefixed sections.
    const sections = f.body.split(/^#{2,3}\s+/m);
    // The split discards the heading marker but preserves the body. Each
    // section starts with `<heading text>\n<body...>`. Re-scan each:
    for (const section of sections) {
      const firstLine = section.split(/\r?\n/)[0] ?? '';
      const decisionMatch = firstLine.match(/^Decision[:\s]+([\w-]+)/);
      if (!decisionMatch) continue;
      const decisionId = decisionMatch[1];
      const block = section.slice(firstLine.length);
      if (!DECISION_STATUS_LOCKED_RE.test(block)) continue;
      const chosenMatch = block.match(DECISION_CHOSEN_RE);
      const implMatch = block.match(DECISION_IMPL_PATH_RE);
      if (!chosenMatch || !implMatch) continue;
      const chosen = chosenMatch[1].trim().replace(/@[\w.~^>=<*-]+$/, '');
      const implPath = implMatch[1].trim();
      const abs = path.isAbsolute(implPath)
        ? implPath
        : path.resolve(repoRoot, implPath);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
      const code = fs.readFileSync(abs, 'utf8');
      const imports: string[] = [];
      let im: RegExpExecArray | null;
      TS_FILE_IMPORT_RE.lastIndex = 0;
      while ((im = TS_FILE_IMPORT_RE.exec(code)) !== null) imports.push(im[1]);
      const hasChosen = imports.some(
        (i) => i === chosen || i.startsWith(`${chosen}/`) || i.endsWith(`/${chosen}`),
      );
      if (hasChosen) continue;
      out.push({
        code: 'cross-spec/decision-locked-but-reality-diverges',
        class: 'architectural-decision-vs-reality',
        severity: 'CRITICAL',
        referenced_in: `${path.relative(repoRoot, f.path)} (decision ${decisionId})`,
        expected_path: implPath,
        suggested_fix:
          `LOCKED decision "${decisionId}" picks "${chosen}" but ${implPath} imports [${imports.slice(0, 3).join(', ')}…]. Update the implementation, change Status → SUPERSEDED, or update DECISIONS.md.`,
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
    // Adversarial-review fix (HIGH FP): FR citations inside fenced ```
    // blocks are example code — not real "this spec mentions FR-N" claims.
    const body = stripFencedBlocks(f.body);
    let m: RegExpExecArray | null;
    FR_REF_RE.lastIndex = 0;
    while ((m = FR_REF_RE.exec(body)) !== null) cited.add(m[0]);
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

/** Adversarial-review fix (HIGH FN): collect WITHIN-spec duplicate FR ids — */
/** scan one spec at a time and emit one finding per duplicate.            */
function findWithinSpecDuplicateFRs(
  files: { body: string; path: string }[],
  repoRoot: string,
  slug: string,
): Finding[] {
  const seen = new Map<string, string>();
  const out: Finding[] = [];
  for (const f of files) {
    let m: RegExpExecArray | null;
    FR_HEADING_RE.lastIndex = 0;
    while ((m = FR_HEADING_RE.exec(f.body)) !== null) {
      const fr = m[1];
      if (seen.has(fr)) {
        // Adversarial-review fix (MEDIUM): use a distinct code so reports
        // can tell within-spec from cross-spec duplicates at a glance.
        out.push({
          code: 'spec-only/duplicate-fr-id',
          class: 'contradiction',
          severity: 'CRITICAL',
          referenced_in: `${path.relative(repoRoot, f.path)} (${fr})`,
          suggested_fix:
            `Two \`## ${fr}\` headings within the same spec — rename the second one or merge their content. First at ${path.basename(seen.get(fr)!)}, duplicate at ${path.basename(f.path)}.`,
        });
        continue;
      }
      seen.set(fr, f.path);
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
      // Adversarial-review fix (HIGH FN): `@feature05` was producing
      // `FR-05` which never matched `FR-5` in collectFrDefinitions. Strip
      // leading zeros via parseInt.
      out.add(`FR-${parseInt(m[1], 10)}`);
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
  const out: Finding[] = [];
  for (const [fr, definedIn] of defs.entries()) {
    // A heading counts as a definition, so we need ≥1 reference outside
    // the heading. Adversarial-review fix (HIGH FN): count `FR-N` hits
    // ONLY in non-heading lines so a self-citation inside the heading
    // (`## FR-1: See FR-1 for context`) doesn't suppress the orphan.
    const refRe = new RegExp(`\\b${fr}\\b`, 'g');
    const headingPrefixRe = /^#{1,6}\s/;
    let externalRefs = 0;
    for (const f of files) {
      for (const line of f.body.split(/\r?\n/)) {
        if (headingPrefixRe.test(line)) continue;
        refRe.lastIndex = 0;
        const matches = line.match(refRe);
        if (matches) externalRefs += matches.length;
      }
    }
    if (externalRefs >= 1) continue;
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
        // Adversarial-review fix (MEDIUM FP): raised threshold 0.4 → 0.55
        // — generic domain vocabulary alone shouldn't suppress contradiction.
        if (cheapTextOverlap(bodyA, bodyB) >= 0.55) continue;
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
        // Dogfood batch-9: skip generic spec-ecosystem nouns (Schema,
        // Changelog, Acceptance, Criteria, ...) — they appear in
        // nearly every spec and produce ~2200 noise findings.
        if (CONCEPT_NOUN_STOPLIST.has(m[0])) continue;
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
      // Dogfood batch-9: bumped threshold 3 → 5 — three-noun overlap was
      // routinely hit by unrelated specs sharing common framework names.
      if (shared.length < CONCEPT_OVERLAP_MIN_SHARED) continue;
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
  // Dogfood batch-9: per-spec FR namespace by default — both
  // `cross-spec/duplicate-fr-id` and `cross-spec/contradictory-fr`
  // produce thousands of FPs when each spec uses its own FR-1..N
  // numbering (the common case). Opt in via `crossSpecFrNamespace: 'shared'`.
  const sharedFrNs = opts.crossSpecFrNamespace === 'shared';
  const duplicateFrFindings = sharedFrNs ? findDuplicateFrIds(defsBySlug) : [];
  const contradictoryFrFindings = sharedFrNs
    ? findContradictoryFRs(defsBySlug, filesBySlug)
    : [];
  const urlDriftFindings = findUrlShapeDrift(filesBySlug);
  const cliDriftFindings = findCliFlagDrift(filesBySlug);
  const enumDivergenceFindings = findEnumDivergence(filesBySlug);
  const ownershipStoplist = opts.ownershipStoplist ?? DEFAULT_OWNERSHIP_STOPLIST;
  const moduleOwnershipFindings = findModuleOwnershipConflict(filesBySlug, ownershipStoplist);
  const missingCrossRefFindings = findMissingCrossRef(filesBySlug, allSlugs);
  const contradictoryNfrFindings = findContradictoryNFR(filesBySlug);
  const schemaMismatchFindings = findSchemaMismatch(filesBySlug);

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
    findings.push(...findWithinSpecDuplicateFRs(files, opts.repoRoot, slug));
    findings.push(...findMissingTestPerFR(files, featureTags, opts.repoRoot, slug));
    findings.push(...findOrphanACs(files, opts.repoRoot));
    findings.push(...findStaleFeatureFiles(opts.repoRoot, slug, files));
    findings.push(...findUnreachableTasks(files, opts.repoRoot, slug));
    findings.push(...findJsonShapeDrift(files, opts.repoRoot, slug));
    findings.push(...findLockedDecisionDrift(files, opts.repoRoot));
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
      ...missingCrossRefFindings,
      ...contradictoryNfrFindings,
      ...schemaMismatchFindings,
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
