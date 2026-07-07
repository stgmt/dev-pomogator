/**
 * Deterministic pre-pass for the spec-status skill (honest-status-command).
 *
 * The skill orchestrator runs this ONCE before delegating to the independent
 * sub-agent. It produces (a) the ≤4KB context bundle the sub-agent receives
 * (FR-3) with credentials redacted (NFR-Security), and (b) a deterministic
 * findings block (AC claimed-only candidates, test-body quality, YAML recency,
 * environmental blockers) the renderer merges with the sub-agent's semantic
 * verdicts. Everything here is reproducible + unit-tested; the LLM judgment
 * (does this test ACTUALLY verify this AC?) is the sub-agent's job, not this.
 *
 * Usage: npx tsx precheck.ts [slug] [--specs-root <dir>] [--plans-dir <dir>]
 * Emits a single JSON object to stdout. Exit 0 always (read-only reporter);
 * a `null` active spec is a valid "nothing to report" result, not an error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { detectActiveSpec, isValidSlug } from './autodetect.ts';
import { classifyAcClaims, parseAcIds, type AcClaim } from './ac-claims.ts';
import { classifyTestFile, type TestQualityReport } from './test-quality.ts';
import { classifyTestStatusDir, type RecencyReport } from './yaml-recency.ts';
import { collectBlockers, type Blocker } from './env-blockers.ts';

export interface ContextBundle {
  spec_slug: string;
  spec_path: string;
  plan_path: string | null;
  test_paths: string[];
  ac_ids: string[];
  git_sha: string | null;
  redacted: true;
}

export interface DeterministicFindings {
  ac_claims: AcClaim[];
  test_quality: { file: string; report: TestQualityReport }[];
  recency: RecencyReport;
  blockers: Blocker[];
}

export interface PrecheckResult {
  active: boolean;
  reason: string;
  bundle: ContextBundle | null;
  deterministic: DeterministicFindings | null;
}

const CRED_LINE =
  /^.*(?:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)[A-Z0-9_]*\s*[:=]|password\s*[:=]|authorization\s*:).*$/gim;

/** Redact obvious secret-bearing lines before any content goes into the bundle. */
export function filterCredentials(text: string): string {
  return text.replace(CRED_LINE, '[REDACTED]');
}

const safeRead = (p: string): string => {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
};

/** Resolve `tests/**` paths mentioned in FILE_CHANGES.md, filtered to existing files. */
export function resolveTestPaths(specPath: string, repoRoot: string): string[] {
  const fc = safeRead(path.join(specPath, 'FILE_CHANGES.md'));
  const found = new Set<string>();
  for (const m of fc.matchAll(/`?(tests\/[A-Za-z0-9_./-]+\.(?:test\.[tj]sx?|feature))`?/g)) {
    const abs = path.join(repoRoot, m[1]);
    if (fs.existsSync(abs)) found.add(abs);
  }
  return [...found];
}

/** Assemble the ≤4KB context bundle; trims test_paths if serialization overflows. */
export function buildContextBundle(
  slug: string,
  specPath: string,
  testPaths: string[],
  opts: { planPath?: string | null; gitSha?: string | null } = {},
): ContextBundle {
  const acIds = parseAcIds(safeRead(path.join(specPath, 'ACCEPTANCE_CRITERIA.md'))).map((a) => a.id);
  let bundle: ContextBundle = {
    spec_slug: slug,
    spec_path: specPath,
    plan_path: opts.planPath ?? null,
    test_paths: [...testPaths],
    ac_ids: acIds,
    git_sha: opts.gitSha ?? null,
    redacted: true,
  };
  // ≤4KB invariant (SCHEMA): drop test_paths from the tail until it fits.
  while (JSON.stringify(bundle).length > 4096 && bundle.test_paths.length > 0) {
    bundle = { ...bundle, test_paths: bundle.test_paths.slice(0, -1) };
  }
  return bundle;
}

/** Build the deterministic findings the renderer merges with sub-agent verdicts. */
export function runDeterministic(
  specPath: string,
  testPaths: string[],
  repoRoot: string,
  opts: { now?: number; dockerCmd?: string } = {},
): DeterministicFindings {
  const acContent = safeRead(path.join(specPath, 'ACCEPTANCE_CRITERIA.md'));
  const tasksContent = safeRead(path.join(specPath, 'TASKS.md'));
  const testContents = testPaths.map(safeRead);
  const recency = classifyTestStatusDir(path.join(repoRoot, '.dev-pomogator', '.test-status'), opts.now);
  return {
    ac_claims: classifyAcClaims(acContent, tasksContent, testContents),
    test_quality: testPaths.map((file, i) => ({ file, report: classifyTestFile(testContents[i]) })),
    recency,
    blockers: collectBlockers({ dockerCmd: opts.dockerCmd, recency }),
  };
}

function parseArgs(argv: string[]): { slug: string | null; specsRoot: string; plansDir?: string } {
  let slug: string | null = null;
  let specsRoot = path.join(process.cwd(), '.specs');
  let plansDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--specs-root') specsRoot = argv[++i];
    else if (argv[i] === '--plans-dir') plansDir = argv[++i];
    else if (!argv[i].startsWith('--')) slug = argv[i];
  }
  return { slug, specsRoot, plansDir };
}

export function precheck(argv: string[], repoRoot: string = process.cwd()): PrecheckResult {
  const { slug, specsRoot, plansDir } = parseArgs(argv);

  let specSlug: string;
  let specPath: string;
  let reason: string;
  if (slug) {
    if (!isValidSlug(slug)) {
      return { active: false, reason: `invalid slug "${slug}" — expected ^[a-zA-Z0-9_-]+$`, bundle: null, deterministic: null };
    }
    specSlug = slug;
    specPath = path.join(specsRoot, slug);
    reason = 'explicit slug';
    if (!fs.existsSync(specPath)) {
      return { active: false, reason: `spec "${slug}" not found under ${specsRoot}`, bundle: null, deterministic: null };
    }
  } else {
    const detected = detectActiveSpec(specsRoot, { plansDir });
    if (!detected) {
      return { active: false, reason: 'no active spec (no .progress.json ≤7 days). Pass slug explicitly.', bundle: null, deterministic: null };
    }
    specSlug = detected.slug;
    specPath = detected.specPath;
    reason = detected.reason;
  }

  const testPaths = resolveTestPaths(specPath, repoRoot);
  const bundle = buildContextBundle(specSlug, specPath, testPaths);
  const deterministic = runDeterministic(specPath, testPaths, repoRoot);
  return { active: true, reason, bundle, deterministic };
}

const isDirectRun = process.argv[1]?.endsWith('precheck.ts') || process.argv[1]?.endsWith('precheck.js');
if (isDirectRun) {
  const result = precheck(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
