/**
 * BDD migrator — corpus stage (FR-M1 + FR-M5 roadmap).
 *
 * For a ~100-file migration the first real need is a ROADMAP: which files exist, how many cases
 * each has, of what kind, and how hard each is to migrate — so the rollout goes easy-first and the
 * effort is visible (FR-M5: ledger of progress, repo green each step). Walks the repo for vitest
 * test files, runs the inventory stage on each, and ranks them by migration ease.
 *
 * Ease heuristic (from the hand-recipe experience): a file that is mostly `pure` (drives functions
 * in-process) is EASY — deterministic, CI-safe step-defs, no spawn. A `runtime`/`artifact`-heavy
 * file is MEDIUM — step-defs must spawn the real process / read real artifacts. A file with any
 * `manual` (it.skip) case, or a large mixed file, is HARD — needs human authoring decisions.
 *
 * Node-builtins-only (fs/path) — dep-safe; may ship in-plugin. Skips node_modules/.git/.stryker-tmp.
 *
 * @see ./inventory.ts (per-file stage) · .specs/spec-generator-v4/FR.md FR-M1/FR-M5
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { inventoryVitestSource, type CaseKind } from './inventory.ts';

// Skip build/vendor dirs AND non-suite trees: `fixtures` (and any `__fixtures__`) hold sample/fixture
// test DATA (e.g. a deliberate fake-positive.steps.ts BDD sample), and `.specs` holds backlog
// `_artifact/__fixtures__` scaffolding (generated example tests for never-built specs — dead refs to
// the removed v2.0 `extensions/` layout; relocated from `_artifact/tests/` so they stop masquerading
// as live `*.test.ts` twins). Neither is the repo's real suite, so neither is a migration target.
// Roadmapping them overcounts and would tempt the rollout to "migrate" a fixture (actively wrong).
const SKIP_DIRS = new Set(['node_modules', '.git', '.stryker-tmp', 'dist', '.dev-pomogator', 'coverage', 'fixtures', '__fixtures__', '.specs']);
const TEST_RE = /\.test\.ts$/;

export interface FileReport {
  file: string;
  total: number;
  kinds: Record<CaseKind, number>;
  ease: 'easy' | 'medium' | 'hard';
  /** A production module this file imports is ALSO imported by an existing step-def → already BDD-twinned. */
  twinHint: boolean;
  /** The shared prod module(s) that triggered twinHint (repo-relative, ext-stripped) — evidence, not a guess. */
  twinnedVia: string[];
  /**
   * This file's spec slug has a `.feature` ALREADY wired in cucumber.json → the spec is MIGRATED, so
   * this vitest is a kept twin, NOT remaining work. DEFINITIVE (the ground truth), unlike twinHint
   * which is import-overlap-only and misses spawn/dynamic-import-driven migrations (the false-NET that
   * sent migrators at already-done specs, dogfood 2026-06-19). null = no spec slug maps to this file.
   */
  wired: boolean;
}

export interface CorpusReport {
  root: string;
  /** Gross: every vitest file found. */
  fileCount: number;
  /** Net: files NOT wired AND NOT twinned — the real remaining rollout. */
  netCount: number;
  /** Files whose prod module an existing step-def already drives (likely migrated). */
  twinnedCount: number;
  /** Files whose spec is already wired in cucumber.json (migrated — kept twins, not work). */
  wiredCount: number;
  caseCount: number;
  kindTotals: Record<CaseKind, number>;
  files: FileReport[];
}

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (TEST_RE.test(e.name)) {
      out.push(path.join(dir, e.name));
    }
  }
}

/** A resolved module under tools/ or src/ is production code (not a test helper / node builtin). */
const PROD_RE = /^(tools|src)\//;

/** Like walk(), but collects ALL *.ts files — step-defs are not *.test.ts. */
function walkTs(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walkTs(path.join(dir, e.name), out);
    } else if (e.name.endsWith('.ts')) {
      out.push(path.join(dir, e.name));
    }
  }
}

/** Resolve a relative import specifier to a repo-relative, ext-stripped POSIX path; null if it is a bare package import. */
function resolveSpec(fromFile: string, spec: string, root: string): string | null {
  if (!spec.startsWith('.')) return null;
  const abs = path.resolve(path.dirname(fromFile), spec);
  return path.relative(root, abs).replace(/\\/g, '/').replace(/\.(tsx?|mjs|cjs|js)$/, '');
}

/** Every prod module (under tools/ or src/) already imported by a tests/step_definitions/*.ts file. */
function collectTwinnedTargets(root: string): Set<string> {
  const files: string[] = [];
  walkTs(path.join(root, 'tests', 'step_definitions'), files);
  const targets = new Set<string>();
  for (const f of files) {
    let src = '';
    try {
      src = fs.readFileSync(f, 'utf-8');
    } catch {
      continue;
    }
    for (const m of src.matchAll(/from\s+(['"])(\.[^'"]+)\1/g)) {
      const resolved = resolveSpec(f, m[2], root);
      if (resolved && PROD_RE.test(resolved)) targets.add(resolved);
    }
  }
  return targets;
}

/**
 * Spec slugs whose `.feature` is already wired into cucumber.json `paths` — the DEFINITIVE
 * "this spec is migrated" signal. Reads cucumber.json with builtins only; empty set if absent.
 */
export function collectWiredSlugs(root: string): Set<string> {
  const slugs = new Set<string>();
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'cucumber.json'), 'utf-8'));
    const paths: string[] = cfg?.default?.paths ?? [];
    for (const p of paths) {
      // `.specs/<slug>/<file>.feature` — slug may be nested (e.g. backlog/honest-status-command).
      const m = p.replace(/\\/g, '/').match(/specs\/(.+)\/[^/]+\.feature$/);
      if (m) slugs.add(m[1]);
    }
  } catch {
    /* no cucumber.json (or malformed) → no wired specs known */
  }
  return slugs;
}

/**
 * Does this test file belong to a spec whose `.feature` is wired? Maps `tests/e2e/<slug>.test.ts`
 * (and a hyphen-prefix of it, e.g. `spec-reality-check-hook` → `spec-reality-check`) to a wired
 * slug, plus the trailing segment of a nested slug. A tool test (no 1:1 spec) maps to nothing →
 * stays correctly net-remaining.
 */
export function isWired(file: string, wiredSlugs: Set<string>): boolean {
  if (wiredSlugs.size === 0) return false;
  const base = path.basename(file).replace(/\.test\.ts$/, '');
  if (wiredSlugs.has(base)) return true;
  // a wired slug may be a hyphen-prefix of the test basename (hook/variant test files)
  const parts = base.split('-');
  for (let i = parts.length - 1; i > 0; i--) {
    if (wiredSlugs.has(parts.slice(0, i).join('-'))) return true;
  }
  // a nested wired slug (a/b) matches when the test basename equals its last segment
  for (const s of wiredSlugs) {
    const last = s.split('/').pop();
    if (last && (last === base || base.startsWith(last + '-'))) return true;
  }
  return false;
}

function rankEase(kinds: Record<CaseKind, number>, total: number): 'easy' | 'medium' | 'hard' {
  if (kinds.manual > 0 || total > 25) return 'hard';
  const heavy = (k: CaseKind) => kinds[k] >= total / 2;
  if (heavy('pure')) return 'easy';
  return 'medium';
}

export function buildCorpusReport(root: string): CorpusReport {
  const files: string[] = [];
  walk(root, files);
  const twinned = collectTwinnedTargets(root);
  const wiredSlugs = collectWiredSlugs(root);

  const kindTotals: Record<CaseKind, number> = { runtime: 0, artifact: 0, pure: 0, manual: 0 };
  const reports: FileReport[] = [];
  let caseCount = 0;

  for (const file of files) {
    let src = '';
    try {
      src = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const inv = inventoryVitestSource(src, file);
    const kinds: Record<CaseKind, number> = { runtime: 0, artifact: 0, pure: 0, manual: 0 };
    for (const c of inv.cases) kinds[c.kind]++;
    for (const k of Object.keys(kinds) as CaseKind[]) kindTotals[k] += kinds[k];
    caseCount += inv.total;
    // twinHint: a prod module this file imports is ALSO driven by an existing step-def → likely already migrated.
    const twinnedVia = [...new Set(inv.prodImports.map((s) => resolveSpec(file, s, root)).filter((p): p is string => !!p && PROD_RE.test(p) && twinned.has(p)))];
    const rel = path.relative(root, file).replace(/\\/g, '/');
    reports.push({ file: rel, total: inv.total, kinds, ease: rankEase(kinds, inv.total), twinHint: twinnedVia.length > 0, twinnedVia, wired: isWired(rel, wiredSlugs) });
  }

  // Real remaining (NOT wired, NOT twinned) first, easy-first, fewest cases. Wired files (spec
  // already migrated) sink to the very bottom, then twin-candidates — neither is rollout work.
  const order = { easy: 0, medium: 1, hard: 2 };
  const doneRank = (f: FileReport) => (f.wired ? 2 : f.twinHint ? 1 : 0);
  reports.sort((a, b) => doneRank(a) - doneRank(b) || order[a.ease] - order[b.ease] || a.total - b.total);

  const wiredCount = reports.filter((f) => f.wired).length;
  // twin-candidates that are NOT already wired (wired supersedes twinHint as the stronger signal).
  const twinnedCount = reports.filter((f) => f.twinHint && !f.wired).length;
  const netCount = reports.filter((f) => !f.wired && !f.twinHint).length;
  return { root, fileCount: reports.length, netCount, twinnedCount, wiredCount, caseCount, kindTotals, files: reports };
}

export function renderRoadmap(r: CorpusReport): string {
  const lines = [
    `# BDD migration roadmap`,
    ``,
    `${r.netCount} files are REAL remaining work (not wired, not twinned). ${r.wiredCount} of ${r.fileCount} are 🔒WIRED — their spec's .feature is already in cucumber.json, so the spec is MIGRATED and the vitest is a kept twin (retire-after-verify, NOT rollout work — do not re-migrate). ${r.twinnedCount} more are twin-CANDIDATES (a prod module they test is already driven by a step-def; MAY be done — verify, a shared module ≠ every behaviour migrated).`,
    `${r.caseCount} cases — ${r.kindTotals.pure} pure / ${r.kindTotals.runtime} runtime / ${r.kindTotals.artifact} artifact / ${r.kindTotals.manual} manual.`,
    `Migrate easy-first (mostly-pure files: deterministic in-process step-defs, no spawn). 🔒wired rows are DONE (verify-then-retire only); ✓twin rows are likely done — verify before re-migrating.`,
    ``,
    `| done | ease | cases | file | pure/runtime/artifact/manual |`,
    `|------|------|-------|------|------------------------------|`,
  ];
  for (const f of r.files) {
    const done = f.wired ? '🔒wired' : f.twinHint ? '✓twin' : '';
    lines.push(`| ${done} | ${f.ease} | ${f.total} | ${f.file} | ${f.kinds.pure}/${f.kinds.runtime}/${f.kinds.artifact}/${f.kinds.manual} |`);
  }
  return lines.join('\n') + '\n';
}

// CLI: `node --import tsx tools/bdd-migrator/corpus.ts [root] [--json]` → roadmap (markdown or JSON).
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const root = args.find((a) => !a.startsWith('--')) ?? process.cwd();
  const report = buildCorpusReport(root);
  process.stdout.write(json ? JSON.stringify(report, null, 2) + '\n' : renderRoadmap(report));
}
