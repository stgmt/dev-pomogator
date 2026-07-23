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
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { detectActiveSpec, isValidSlug } from './autodetect.ts';
import { classifyAcClaims, parseAcIds, type AcClaim } from './ac-claims.ts';
import { classifyTestFile, type TestQualityReport } from './test-quality.ts';
import { classifyTestStatusDir, type RecencyReport } from './yaml-recency.ts';
import { collectBlockers, type Blocker } from './env-blockers.ts';
// The shared FR-63 inventory/evaluator is dependency-free (pure graph logic) —
// safe to import directly. The graph BUILDER, however, pulls in
// @cucumber/gherkin, which installed plugin users may not have — it stays a
// DYNAMIC, fail-open import below (FR-63c dependency-safe command path).
import { resolveTargetProjectRoot, type RootResolution } from '../../../../tools/spec-graph/root-resolution.ts';
import {
  buildReadinessInventory,
  evaluateReadiness,
  MANDATORY_READINESS_LANES,
  type ReadinessInventory,
} from '../../../../tools/spec-graph/readiness-inventory.ts';

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
  root_resolution?: RootResolution;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export function resolvePrecheckRoot(repoRoot: string = process.cwd()): RootResolution {
  return resolveTargetProjectRoot({ envRoot: process.env.SPECS_GENERATOR_ROOT, cwd: repoRoot, scriptDir: SCRIPT_DIR });
}

const CRED_LINE =
  /^.*(?:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)[A-Z0-9_]*\s*[:=]|password\s*[:=]|authorization\s*:).*$/gim;

/** Redact obvious secret-bearing lines before any content goes into the bundle. */
export function filterCredentials(text: string): string {
  return text.replace(CRED_LINE, '[REDACTED]');
}

const resolveGitSha = (repoRoot: string): string | null => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 }).trim() || null;
  } catch {
    return null;
  }
};

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
  for (const m of fc.matchAll(/`?(tests\/(?:features|step_definitions|hooks|e2e)\/[A-Za-z0-9_./-]+\.(?:[cm]?[tj]sx?|feature))`?/g)) {
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
  const rootResolution = resolvePrecheckRoot(repoRoot);
  if (rootResolution.status === 'NOT_READY' || !rootResolution.root) {
    return { active: false, reason: `NOT_READY: ${rootResolution.corrective_action}`, bundle: null, deterministic: null, root_resolution: rootResolution };
  }
  repoRoot = rootResolution.root;
  const { slug, specsRoot: parsedSpecsRoot, plansDir } = parseArgs(argv);
  const specsRoot = argv.includes('--specs-root') ? parsedSpecsRoot : path.join(repoRoot, '.specs');

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
  const bundle = buildContextBundle(specSlug, specPath, testPaths, { gitSha: resolveGitSha(repoRoot) });
  const deterministic = runDeterministic(specPath, testPaths, repoRoot);
  return { active: true, reason, bundle, deterministic, root_resolution: rootResolution };
}

export interface PrecheckReadiness {
  overall: 'READY' | 'NOT_READY';
  mandatory_lanes: readonly string[];
  next_action: string;
  lanes: Record<string, { status: string; blocking: boolean; debt: string[] }>;
}

export interface PrecheckWithInventoryResult extends PrecheckResult {
  /**
   * FR-63 (foundation): the SAME graph-derived, deduplicated FR/AC/scenario
   * inventory the MCP status surface and spec-verdict report (AC-63.1) —
   * per-AC test_paths, FR never-run classification, evidence provenance.
   * Null when no active spec or the graph cannot be built.
   */
  inventory: ReadinessInventory | null;
  /** Why the inventory is absent: missing runtime deps (FR-64 scope) or a graph failure. Never masked. */
  inventory_error: 'DEPENDENCY_ABSENT' | 'GRAPH_UNAVAILABLE' | null;
  /** Mandatory-lane AND evaluation over the inventory (AC-63.3). Null when no active spec. */
  readiness: PrecheckReadiness | null;
}

function toPrecheckReadiness(evaluation: {
  overall: 'READY' | 'NOT_READY';
  mandatory_lanes: readonly string[];
  next_action: string;
  lanes: Record<string, { status: string; blocking: boolean; debt: string[] }>;
}): PrecheckReadiness {
  return {
    overall: evaluation.overall,
    mandatory_lanes: evaluation.mandatory_lanes,
    next_action: evaluation.next_action,
    lanes: evaluation.lanes,
  };
}

/**
 * The full precheck surface (FR-63): the dependency-safe deterministic
 * precheck PLUS the graph-derived inventory + mandatory-lane readiness the
 * MCP status surface and spec-verdict also report — one graph, one answer.
 *
 * Dependency-safe by construction: the graph builder (which needs
 * @cucumber/gherkin) is imported dynamically; when it is absent the result
 * reports `inventory_error: 'DEPENDENCY_ABSENT'` and an explicit NOT_READY —
 * dependency absence is NEVER laundered into readiness (FR-63b/c; the
 * packaging/release side of absence is FR-64's job, not a success signal).
 */
export async function precheckWithInventory(
  argv: string[],
  repoRoot: string = process.cwd(),
): Promise<PrecheckWithInventoryResult> {
  const base = precheck(argv, repoRoot);
  if (!base.active || !base.bundle) {
    return { ...base, inventory: null, inventory_error: null, readiness: null };
  }
  const slug = base.bundle.spec_slug;
  let buildGraphFromCwd: (cwd: string) => import('../../../../tools/spec-graph/types.ts').SpecGraph;
  try {
    ({ buildGraphFromCwd } = await import('../../../../tools/spec-graph/builder.ts'));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code ?? '';
    const dependencyAbsent =
      code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND' || code === 'ERR_UNSUPPORTED_NODE_IMPORT_FLAG';
    return {
      ...base,
      inventory: null,
      inventory_error: dependencyAbsent ? 'DEPENDENCY_ABSENT' : 'GRAPH_UNAVAILABLE',
      readiness: {
        overall: 'NOT_READY',
        mandatory_lanes: MANDATORY_READINESS_LANES,
        next_action: dependencyAbsent
          ? 'The spec graph cannot be built here (runtime dependencies absent) — dependency absence is NOT readiness proof; run inside the repository with dependencies installed (packaging is FR-64 scope).'
          : `The spec graph failed to build (${(err as Error)?.message ?? err}) — unreadable evidence is NOT readiness proof.`,
        lanes: Object.fromEntries(
          MANDATORY_READINESS_LANES.map((lane) => [
            lane,
            lane === 'EXECUTION'
              ? { status: dependencyAbsent ? 'DEPENDENCY_ABSENT' : 'NOT_EVALUATED', blocking: true, debt: [] }
              : { status: 'NOT_EVALUATED', blocking: true, debt: [] },
          ]),
        ) as PrecheckReadiness['lanes'],
      },
    };
  }
  const graph = buildGraphFromCwd(repoRoot);
  const inventory = buildReadinessInventory(graph, { spec: slug });
  const evaluation = evaluateReadiness({ inventory });
  return {
    ...base,
    inventory,
    inventory_error: null,
    readiness: toPrecheckReadiness(evaluation),
  };
}

const isDirectRun = process.argv[1]?.endsWith('precheck.ts') || process.argv[1]?.endsWith('precheck.js');
if (isDirectRun) {
  const result = await precheckWithInventory(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
