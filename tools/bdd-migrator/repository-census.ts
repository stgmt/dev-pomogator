import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const OLD_TEST_PATTERNS = ['*.test.ts', '*_test.py', '*Tests.cs', '*_test.go'] as const;

export type OldTestClassification = 'in_scope' | 'exempt';

export interface OldTestCensusEntry {
  path: string;
  classification: OldTestClassification;
  reason: string | null;
}

export interface OldTestCensusReport {
  available: boolean;
  patterns: readonly string[];
  tracked: OldTestCensusEntry[];
  inScope: OldTestCensusEntry[];
  exempt: OldTestCensusEntry[];
  counts: {
    tracked: number;
    inScope: number;
    exempt: number;
  };
  invariants: {
    unique: boolean;
    disjoint: boolean;
    conserved: boolean;
    reasonsComplete: boolean;
  };
  debt: string[];
}

interface ExemptionRule {
  test: (file: string) => boolean;
  reason: string;
}

const EXEMPTION_RULES: ExemptionRule[] = [
  {
    test: (file) => file.startsWith('.claude/worktrees/'),
    reason: 'generated worktree mirror; the canonical tracked source is counted separately',
  },
  {
    test: (file) => file.includes('/__fixtures__/') || file.startsWith('tests/fixtures/') || file.includes('/fixtures/'),
    reason: 'test fixture artifact, not an executable repository-owned test suite',
  },
  {
    test: (file) => file.startsWith('.specs/backlog/'),
    reason: 'backlog research fixture embedded in a specification, not an executable product test',
  },
  {
    test: (file) => file.startsWith('.agents/skills/'),
    reason: 'generated agent-skill mirror; the canonical .claude skill source is counted separately',
  },
];

function normalize(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isOldTestPath(file: string): boolean {
  const base = path.posix.basename(normalize(file));
  return base.endsWith('.test.ts') || base.endsWith('_test.py') || base.endsWith('Tests.cs') || base.endsWith('_test.go');
}

export function classifyOldTestPath(file: string): OldTestCensusEntry {
  const normalized = normalize(file);
  const exemption = EXEMPTION_RULES.find((rule) => rule.test(normalized));
  return exemption
    ? { path: normalized, classification: 'exempt', reason: exemption.reason }
    : { path: normalized, classification: 'in_scope', reason: null };
}

export function buildOldTestCensusFromPaths(files: string[], available = true): OldTestCensusReport {
  const matched = files.map(normalize).filter(isOldTestPath).sort();
  const tracked = matched.map(classifyOldTestPath);
  const inScope = tracked.filter((entry) => entry.classification === 'in_scope');
  const exempt = tracked.filter((entry) => entry.classification === 'exempt');
  const unique = new Set(tracked.map((entry) => entry.path)).size === tracked.length;
  const inScopePaths = new Set(inScope.map((entry) => entry.path));
  const disjoint = exempt.every((entry) => !inScopePaths.has(entry.path));
  const conserved = tracked.length === inScope.length + exempt.length;
  const reasonsComplete = exempt.every((entry) => Boolean(entry.reason?.trim()));
  const debt: string[] = [];

  if (!available) debt.push('OLD_TEST_CENSUS_UNAVAILABLE: git ls-files could not enumerate the repository-owned corpus');
  if (!unique) debt.push('OLD_TEST_CENSUS_DUPLICATE: one or more matched paths were classified more than once');
  if (!disjoint) debt.push('OLD_TEST_CENSUS_OVERLAP: one or more paths are both in_scope and exempt');
  if (!conserved) debt.push(`OLD_TEST_CENSUS_CONSERVATION: tracked=${tracked.length} in_scope=${inScope.length} exempt=${exempt.length}`);
  if (!reasonsComplete) debt.push('OLD_TEST_CENSUS_REASON_MISSING: every exemption requires a non-empty repository-owned reason');
  if (inScope.length > 0) debt.push(`OLD_TEST_MIGRATION_REMAINING:${inScope.length}`);

  return {
    available,
    patterns: OLD_TEST_PATTERNS,
    tracked,
    inScope,
    exempt,
    counts: { tracked: tracked.length, inScope: inScope.length, exempt: exempt.length },
    invariants: { unique, disjoint, conserved, reasonsComplete },
    debt,
  };
}

export function buildRepositoryOldTestCensus(root: string): OldTestCensusReport {
  try {
    const stdout = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
    return buildOldTestCensusFromPaths(stdout.split('\0').filter(Boolean));
  } catch {
    return buildOldTestCensusFromPaths([], false);
  }
}

export function oldTestReadinessDebt(root: string, spec: string): { report: OldTestCensusReport | null; debt: string[] } {
  if (spec !== 'bdd-only-migration') return { report: null, debt: [] };
  const report = buildRepositoryOldTestCensus(root);
  return { report, debt: report.debt };
}
