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

// Skip build/vendor dirs AND non-suite trees: `fixtures` holds sample/fixture *.test.ts that are
// test DATA (e.g. a deliberate fake-positive.test.ts), and `.specs` holds backlog `_artifact/tests`
// — neither is the repo's real suite, so neither is a migration target. Roadmapping them overcounts
// and would tempt the rollout to "migrate" a fixture (actively wrong).
const SKIP_DIRS = new Set(['node_modules', '.git', '.stryker-tmp', 'dist', '.dev-pomogator', 'coverage', 'fixtures', '.specs']);
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
}

export interface CorpusReport {
  root: string;
  /** Gross: every vitest file found. */
  fileCount: number;
  /** Net: files NOT already BDD-twinned — the real remaining rollout. */
  netCount: number;
  /** Files whose prod module an existing step-def already drives (likely migrated). */
  twinnedCount: number;
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
    reports.push({ file: path.relative(root, file).replace(/\\/g, '/'), total: inv.total, kinds, ease: rankEase(kinds, inv.total), twinHint: twinnedVia.length > 0, twinnedVia });
  }

  // Net-remaining first (un-twinned, easy-first, fewest cases); already-twinned files sink to the bottom.
  const order = { easy: 0, medium: 1, hard: 2 };
  reports.sort((a, b) => Number(a.twinHint) - Number(b.twinHint) || order[a.ease] - order[b.ease] || a.total - b.total);

  const twinnedCount = reports.filter((f) => f.twinHint).length;
  return { root, fileCount: reports.length, netCount: reports.length - twinnedCount, twinnedCount, caseCount, kindTotals, files: reports };
}

export function renderRoadmap(r: CorpusReport): string {
  const lines = [
    `# BDD migration roadmap`,
    ``,
    `${r.netCount} files have NO existing BDD twin (definitely need migration). ${r.twinnedCount} of ${r.fileCount} are twin-CANDIDATES — a prod module they test is already driven by an existing step-def, so they MAY be done; verify per file (a shared module ≠ every behaviour migrated).`,
    `${r.caseCount} cases — ${r.kindTotals.pure} pure / ${r.kindTotals.runtime} runtime / ${r.kindTotals.artifact} artifact / ${r.kindTotals.manual} manual.`,
    `Migrate easy-first (mostly-pure files: deterministic in-process step-defs, no spawn). ✓twin rows are likely done — verify before re-migrating.`,
    ``,
    `| twin | ease | cases | file | pure/runtime/artifact/manual |`,
    `|------|------|-------|------|------------------------------|`,
  ];
  for (const f of r.files) {
    lines.push(`| ${f.twinHint ? '✓' : ''} | ${f.ease} | ${f.total} | ${f.file} | ${f.kinds.pure}/${f.kinds.runtime}/${f.kinds.artifact}/${f.kinds.manual} |`);
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
