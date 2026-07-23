#!/usr/bin/env npx tsx
/**
 * spec-verdict — the AUTHORITATIVE spec-health verdict entrypoint (FR-37).
 *
 * P14-1 seed: composes the two layers that exist before the FR-36 one-graph
 * lands —
 *   1. `validate-spec` (structure + links) as a PRE-FILTER ONLY. Its pass is
 *      NOT reportable as "valid / clean / done" (FR-37a); structural errors
 *      still make the verdict RED (a broken file can't be healthy either).
 *   2. `audit-spec` as a HARD GATE: every severity=ERROR finding fails the
 *      verdict with a per-class, per-item gap list. A stale FILE_CHANGES path
 *      (FILE_CHANGES_VERIFY) is therefore a hard verdict ERROR (FR-37e) — it
 *      can no longer be bypassed by reading `validate-spec` alone.
 *
 * P14-2 adds the traceability-completeness check (cell→atom invariants),
 * P14-3 composes `conformance_check` + `get_coverage` + FR-8 semantic over the
 * one graph and makes this module THE health entrypoint for skills (P14-4).
 * Until then the verdict carries explicit notes for what is NOT yet checked —
 * fail-loud, never a silent all-clear (FR-37c discipline).
 *
 * @see .specs/spec-generator-v4/FR.md FR-37 (a, b, e)
 * @see .specs/spec-generator-v4/TASKS.md Phase 14 P14-1
 * @see audit-reports/v4-smart-verdict-and-organism-traceability.md
 */

import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildGraphFromCwd } from '../spec-graph/builder.ts';
import { checkConformance, type Finding } from '../spec-graph/conformance.ts';
import { computeCoverage, scenarioKey, specOf, type ScenarioLike, type TaskLike } from '../spec-graph/coverage.ts';
import { readVerdicts } from '../spec-graph/test-quality-gate.ts';
import {
  gapsFromFindings,
  summariseGaps,
  type TraceabilityGap,
  type TraceabilityGapClass,
} from '../spec-graph/traceability.ts';
import { runJudge, type JudgeResult } from '../spec-llm-judge/index.ts';
import { buildReadinessInventory, deriveExecutionLane, type ReadinessInventory } from '../spec-graph/readiness-inventory.ts';
import { computeSpecVerdict, type SpecVerdict, type UnverifiedCompletion } from '../spec-graph/verdict.ts';
import type { FrNode, ScenarioNode, TaskNode } from '../spec-graph/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.join(__dirname, 'specs-generator-core.mjs');

export interface AuditFinding {
  check: string;
  category: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  details?: string;
}

export type ReadinessLaneName =
  | 'STRUCTURE'
  | 'TRACEABILITY'
  | 'EXECUTION'
  | 'TASK_TRUTH'
  | 'BDD_SYNC'
  | 'SEMANTIC'
  | 'FILTERED_PROOF';

export type ReadinessLaneStatus = 'GREEN' | 'RED' | 'NOT_RUN' | 'SKIPPED' | 'NOT_EVALUATED' | 'DEPENDENCY_ABSENT' | 'NONE';

export type ScenarioLite = Pick<ScenarioNode, 'id' | 'file' | 'line' | 'tags' | 'steps'>;

export interface BddSyncReport {
  debt: string[];
}

export interface FilteredProofRun {
  runId: string;
  artifact: string | null;
  selectedScenarioIds: string[];
  passed: number;
  nonPassed: number;
  timestamp: string | null;
  source: string;
  canonicalCoverageUnchanged: true;
  acceptedAttachment: boolean;
}

export interface FilteredProofReport {
  latest: FilteredProofRun | null;
  proofs: string[];
  artifacts: string[];
}

export interface ReadinessLane {
  status: ReadinessLaneStatus;
  blocking: boolean;
  summary: string;
  debt: string[];
}

export interface SpecVerdictResult {
  specPath: string;
  /** Canonical graph verdict. GREEN is emitted only when every mandatory readiness lane passes. */
  verdict: SpecVerdict;
  /** Stable machine-readable blockers; includes explicit UNVERIFIED_COMPLETION findings. */
  blocking: Array<Finding | UnverifiedCompletion>;
  /** Structural pre-filter (validate-spec). Pass is NOT a health verdict. */
  prefilter: {
    structuralErrors: number;
    warnings: number;
    note: string;
  };
  /** audit-spec hard gate: ERROR findings grouped per finding class. */
  auditGate: {
    errorCount: number;
    byClass: Record<string, AuditFinding[]>;
  };
  /**
   * FR-37b (P14-2): cell→atom traceability gate over the ONE graph — the
   * spec-scoped per-item gap list (UNCOVERED_FR / TASK_UNTESTED /
   * UNTAGGED_SCENARIO; stale FILE_CHANGES paths arrive via the audit gate
   * above). ANY gap → RED.
   */
  traceabilityGate: {
    gapCount: number;
    byClass: Record<TraceabilityGapClass, number>;
    gaps: TraceabilityGap[];
  };
  /**
   * P14-3: spec-scoped conformance summary over the one graph. Error-severity
   * findings gate (RED); warnings are surfaced, not blocking (FR-37b
   * enumerates the hard classes — they live in traceabilityGate).
   */
  conformance: {
    errorCount: number;
    warningCount: number;
    byCode: Record<string, number>;
  };
  /**
   * P14-3: FR-32 honesty rollup for this spec — scenario buckets + DONE tasks
   * whose evidence does not verify them. Visible, not gate-blocking (the
   * blocking subset is TASK_UNTESTED in the traceability gate).
   */
  coverage: {
    /** Effective newest evidence (canonical + overlay), retained for FR-56 compatibility. */
    buckets: Record<string, number>;
    /** Canonical full-run-only buckets; filtered proof never changes these. */
    canonicalBuckets: Record<string, number>;
    unverifiedDoneTasks: string[];
  };
  /** FR-61d/e evidence exposed as structured data for MCP/status consumers. */
  evidence: {
    bddSync: BddSyncReport;
    filteredProof: FilteredProofReport;
  };
  /**
   * FR-63 (foundation): the ONE graph-derived, deduplicated FR/AC/scenario
   * inventory with per-AC `test_paths`, FR-level never-run classification and
   * the evidence provenance/recency taxonomy. The SAME projection precheck
   * and the MCP status surface report (AC-63.1 — one inventory, one graph).
   */
  inventory: ReadinessInventory;
  /**
   * FR-37c (P14-3): FR-8 semantic drift in the verdict path. `ran` only when
   * a claude binary is present; otherwise an explicit SEMANTIC_SKIPPED note —
   * NEVER a silent "no drift" for unchecked content.
   */
  semantic: {
    ran: boolean;
    binaryPresent: boolean;
    pairsChecked: number;
    drifts: Array<{ frId: string; scenarioId: string; severity: string; explanation: string }>;
    failures: number;
    note?: string;
  };
  /** Actionable per-item gap list (one line per blocking finding). */
  gapList: string[];
  /** Explicit fail-loud notes (FR-37c discipline). */
  notes: string[];
  /** FR-61: product-readiness lanes; OVERALL is NOT_READY when any lane blocks readiness. */
  readiness: {
    lanes: Record<ReadinessLaneName, ReadinessLane>;
    overall: 'READY' | 'NOT_READY';
    nextAction: string;
  };
}

interface RunCoreOptions {
  cwd?: string;
  /**
   * FR-8 semantic layer controls (P14-3). `judgeSpawn` injects the
   * subprocess for tests; `semantic: false` forces an explicit skip;
   * `maxPairs` bounds the first uncached run.
   */
  semantic?: boolean;
  judgeSpawn?: (prompt: string) => Promise<string>;
  maxPairs?: number;
}

/** Is a `claude` binary reachable (CLAUDE_BIN or PATH)? Probe, don't assume. */
function claudeBinaryPresent(): boolean {
  const bin = process.env.CLAUDE_BIN ?? 'claude';
  const probe = spawnSync(bin, ['--version'], { stdio: 'ignore', timeout: 10_000, shell: process.platform === 'win32' });
  return probe.status === 0;
}

function hasMarker(s: ScenarioLite, marker: string): boolean {
  const needle = marker.toUpperCase();
  const haystack = [s.id, ...s.tags, ...s.steps.map((step) => step.text)].join(' ').toUpperCase();
  return haystack.includes(needle);
}

function scenarioCountClaims(text: string): Array<{ text: string; count: number }> {
  const out: Array<{ text: string; count: number }> = [];
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const countRe = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+scenarios?\b/gi;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/`[^`]*`/g, '');
    if (/\bat least\b|\bScenario\s*=|\bFR-\d+\s+scenario\b/i.test(line)) continue;
    const claimsCount =
      /\b(scenario count|scenarios total|total scenarios|expected scenarios|source scenarios|executable scenarios)\b/i.test(line) ||
      /\b(feature|spec|source|executable|file)\b.*\b(has|contains|includes|declares|covers)\b/i.test(line) ||
      /\bthere\s+(?:are|is)\b/i.test(line);
    if (!claimsCount) continue;
    for (const match of line.matchAll(countRe)) {
      const raw = match[1].toLowerCase();
      const count = /^\d+$/.test(raw) ? Number(raw) : words[raw];
      if (Number.isFinite(count)) out.push({ text: match[0], count });
    }
  }
  return out;
}

export function configuredCucumberPaths(cwd: string): Set<string> {
  const out = new Set<string>();
  for (const name of ['cucumber.docker.json', 'cucumber.json']) {
    const file = path.join(cwd, name);
    if (!fs.existsSync(file)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const paths = json?.default?.paths;
      if (Array.isArray(paths)) for (const p of paths) if (typeof p === 'string') out.add(p.replace(/\\/g, '/'));
    } catch {
      // Invalid cucumber config is not a BDD-sync finding; other validators own config syntax.
    }
  }
  return out;
}

/** Concrete (non-glob) feature roots declared by Cucumber configs, relative to cwd. */
export function configuredFeatureRoots(cwd: string): string[] {
  const candidates = new Set<string>(['.specs', 'tests/features']);
  for (const configured of configuredCucumberPaths(cwd)) {
    const normalized = configured.replace(/\\/g, '/');
    const globAt = normalized.search(/[?*{}[\]]/);
    const prefix = (globAt >= 0 ? normalized.slice(0, globAt) : normalized).replace(/\/+$/, '');
    if (!prefix) continue;
    const root = prefix.endsWith('.feature') ? path.posix.dirname(prefix) : prefix;
    if (root && root !== '.') candidates.add(root);
  }
  // Do not scan a child twice when a broader configured root already contains it.
  // Duplicate parsing would inflate raw-collision counts and can duplicate edges.
  const ordered = [...candidates].sort((a, b) => {
    const depth = (value: string): number => value.split('/').length;
    return depth(a) - depth(b) || a.localeCompare(b);
  });
  return ordered.filter((root, index) => !ordered.slice(0, index).some((parent) => root === parent || root.startsWith(`${parent}/`)));
}

export function compareBddSync(cwd: string, slug: string, sourceScenarios: ScenarioLite[], executableScenarios: ScenarioLite[]): BddSyncReport {
  const debt: string[] = [];
  const configuredPaths = configuredCucumberPaths(cwd);
  const sourceFeature = `.specs/${slug}/${slug.split('/').pop()}.feature`;
  const sourceFeatureExecutable = configuredPaths.size === 0 || configuredPaths.has(sourceFeature);
  const sourceByKey = new Map<string, ScenarioLite>();
  const executableByKey = new Map<string, ScenarioLite[]>();
  for (const s of sourceScenarios) {
    const key = scenarioKey(s.id);
    if (key) sourceByKey.set(key, s);
  }
  for (const s of executableScenarios) {
    const key = scenarioKey(s.id);
    if (!key) continue;
    const arr = executableByKey.get(key) ?? [];
    arr.push(s);
    executableByKey.set(key, arr);
  }
  for (const [key, execs] of executableByKey) {
    const src = sourceByKey.get(key);
    if (!src && !execs.some((s) => hasMarker(s, 'EXEC_ONLY') || hasMarker(s, 'OUT_OF_SCOPE'))) {
      debt.push(`EXEC_ONLY_MISSING_MARKER ${key}: executable scenario has no source counterpart`);
      continue;
    }
    if (!src) continue;
    const srcFeatureTags = src.tags.filter((t) => /^@feature\d+$/i.test(t)).sort().join(',');
    for (const ex of execs) {
      const execFeatureTags = ex.tags.filter((t) => /^@feature\d+$/i.test(t)).sort().join(',');
      if (srcFeatureTags !== execFeatureTags) debt.push(`FR_TAG_DRIFT ${key}: source=${srcFeatureTags || '(none)'} executable=${execFeatureTags || '(none)'}`);
    }
  }
  for (const [key, src] of sourceByKey) {
    if (sourceFeatureExecutable) continue;
    if (!executableByKey.has(key) && !hasMarker(src, 'PENDING') && !src.tags.some((t) => /^@wip$/i.test(t))) {
      debt.push(`SOURCE_ONLY ${key}: source scenario has no executable counterpart or pending marker`);
    }
  }
  const sourceFeaturePath = path.join(cwd, '.specs', slug, `${slug.split('/').pop()}.feature`);
  if (fs.existsSync(sourceFeaturePath)) {
    const text = fs.readFileSync(sourceFeaturePath, 'utf-8');
    for (const claim of scenarioCountClaims(text)) {
      if (claim.count !== sourceScenarios.length) debt.push(`SCENARIO_COUNT_DRIFT ${claim.text}: actual source scenario count is ${sourceScenarios.length}`);
    }
  }
  return { debt: [...new Set(debt)] };
}

export function latestFilteredProof(cwd: string, sourceScenarios: ScenarioLite[]): FilteredProofReport {
  const keys = new Set(sourceScenarios.map((s) => scenarioKey(s.id)).filter(Boolean) as string[]);
  const overlayPath = path.join(cwd, '.dev-pomogator', '.scenario-results.ndjson');
  if (!fs.existsSync(overlayPath)) return { latest: null, proofs: [], artifacts: [] };
  const byRun = new Map<string, { time: string; artifact?: string; passed: number; failed: number; selected: Set<string>; source?: string }>();
  for (const line of fs.readFileSync(overlayPath, 'utf-8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try { row = JSON.parse(line); } catch { continue; }
    const key = typeof row.scenario_id === 'string' ? scenarioKey(row.scenario_id) : null;
    if (!key || !keys.has(key)) continue;
    const source = String(row.source ?? '');
    if (!/filtered/i.test(source)) continue;
    const runId = String(row.run_id ?? row.trace_file ?? row.trace_id ?? 'filtered');
    const entry = byRun.get(runId) ?? { time: String(row.time ?? ''), artifact: typeof row.trace_file === 'string' ? row.trace_file : undefined, passed: 0, failed: 0, selected: new Set<string>(), source };
    if (String(row.time ?? '') > entry.time) entry.time = String(row.time ?? '');
    if (typeof row.trace_file === 'string') entry.artifact = row.trace_file;
    if (String(row.result ?? '').toUpperCase() === 'PASSED') entry.passed++;
    else entry.failed++;
    entry.selected.add(key.toUpperCase());
    entry.source = source || entry.source;
    byRun.set(runId, entry);
  }
  const runs = [...byRun.entries()].sort((a, b) => b[1].time.localeCompare(a[1].time));
  const latest = runs[0];
  if (!latest) return { latest: null, proofs: [], artifacts: [] };
  const [runId, r] = latest;
  const proof: FilteredProofRun = {
    runId,
    artifact: r.artifact ?? null,
    selectedScenarioIds: [...r.selected].sort().map((key) => key.toUpperCase()),
    passed: r.passed,
    nonPassed: r.failed,
    timestamp: r.time || null,
    source: r.source ?? 'filtered',
    canonicalCoverageUnchanged: true,
    acceptedAttachment: false,
  };
  return {
    latest: proof,
    proofs: [`${runId}: ${r.passed} passed / ${r.failed} non-passed; selected ${proof.selectedScenarioIds.join(', ')}; source=${proof.source}; at=${proof.timestamp ?? '(unknown)'}; artifact=${proof.artifact ?? '(none)'}; canonical coverage unchanged until full run or accepted attachment`],
    artifacts: proof.artifact ? [proof.artifact] : [],
  };
}

/** Run a specs-generator-core.mjs command, tolerating non-zero exit (findings ≠ crash). */
function runCoreJson(command: string, specPath: string, opts: RunCoreOptions): any {
  // core.mjs resolves a RELATIVE -Path against ITS OWN repo root (findRepoRoot
  // from the script dir), not the caller's cwd — so pass an absolute path to
  // make fixture/foreign-corpus runs (opts.cwd) actually hit the right spec.
  const absSpecPath = path.resolve(opts.cwd ?? process.cwd(), specPath);
  const args = [corePath, command, '-Path', absSpecPath];
  let stdout: string;
  try {
    stdout = execFileSync('node', args, {
      cwd: opts.cwd ?? process.cwd(),
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000, // a hung core must not hang the verdict (skills import this in P14-4)
      stdio: ['ignore', 'pipe', 'pipe'],
      // Point the generator's repo root at the caller's corpus root, so the
      // verdict works on fixture dirs and foreign repos (FR-37/P14-5), not
      // only on dev-pomogator's own .specs/.
      env: { ...process.env, SPECS_GENERATOR_ROOT: opts.cwd ?? process.cwd() },
    });
  } catch (err: any) {
    // Non-zero exit with JSON on stdout is still a usable result.
    if (err && typeof err.stdout === 'string' && err.stdout.trim().startsWith('{')) {
      stdout = err.stdout;
    } else {
      throw new Error(
        `spec-verdict: \`${command}\` failed for ${specPath}: ${err?.message ?? err}\n${String(err?.stderr ?? '').slice(0, 800)}`,
      );
    }
  }
  const parsed = JSON.parse(stdout);
  // FAIL LOUD on a core-level error object ({error: "Spec folder not found: …"}).
  // Treating it as "no findings" would be a false GREEN — the exact FR-37
  // failure class this entrypoint exists to prevent.
  if (parsed && typeof parsed.error === 'string') {
    throw new Error(`spec-verdict: \`${command}\` errored for ${absSpecPath}: ${parsed.error}`);
  }
  return parsed;
}

/**
 * Compute the authoritative verdict for one spec directory.
 *
 * @param specPath  e.g. ".specs/spec-generator-v4" (relative to opts.cwd)
 * @param opts.cwd  repo root the spec (and its FILE_CHANGES paths) resolve against
 */
export async function runSpecVerdict(
  specPath: string,
  opts: RunCoreOptions = {},
): Promise<SpecVerdictResult> {
  const validation = runCoreJson('validate-spec', specPath, opts);
  const audit = runCoreJson('audit-spec', specPath, opts);

  const structuralErrors: number = Array.isArray(validation.errors) ? validation.errors.length : 0;
  const warnings: number = Array.isArray(validation.warnings) ? validation.warnings.length : 0;

  const errorFindings: AuditFinding[] = (audit.findings ?? []).filter(
    (f: AuditFinding) => f.severity === 'ERROR',
  );
  const byClass: Record<string, AuditFinding[]> = {};
  for (const f of errorFindings) (byClass[f.check] ??= []).push(f);

  // ── The ONE graph (FR-36) + ONE conformance pass — every smart layer below
  // derives from these two (FR-37a composition, P14-3). ─────────────────────
  const cwd = opts.cwd ?? process.cwd();
  const slug = specPath
    .replace(/\\/g, '/')
    .replace(/^\.?\/?\.specs\//, '')
    .replace(/\/+$/, '');
  const graph = buildGraphFromCwd(cwd, { featureRoots: configuredFeatureRoots(cwd) });
  // FR-63 (foundation): the shared graph-derived readiness inventory — the SAME
  // projection precheck + MCP status report (AC-63.1). Derived from the one
  // graph above; never assembled from a second source of truth.
  const inventory = buildReadinessInventory(graph, { spec: slug });
  // FR-35a: the per-task test-quality side-channel caps a green-but-weak DONE task
  // to IN_PROGRESS on this surface too (absent file → {} → no change). Same reader
  // as the Stop-gate and get_coverage — one source of truth.
  const testQualityByTask = readVerdicts(cwd);
  const allFindings = checkConformance(graph, { testQualityByTask });
  const inSpec = (file: string): boolean =>
    String(file).replace(/\\/g, '/').includes(`.specs/${slug}/`);
  const specFindings = allFindings.filter((f) => inSpec(f.location.file));

  // FR-37b (P14-2): the cell→atom traceability HARD gate.
  const gaps = gapsFromFindings(specFindings, {});

  // P14-3: conformance summary — error-severity gates, warnings surface.
  const confErrors = specFindings.filter((f) => f.severity === 'error');
  const confByCode: Record<string, number> = {};
  for (const f of specFindings) confByCode[f.code] = (confByCode[f.code] ?? 0) + 1;

  // P14-3: FR-32 honesty rollup for this spec.
  const taskLikes: TaskLike[] = [];
  const scenLikes: ScenarioLike[] = [];
  const sourceScenarios: ScenarioLite[] = [];
  const executableScenarios: ScenarioLite[] = [];
  const doneTaskIds = new Set<string>();
  const doneTasks = new Map<string, TaskNode>();
  // not_run grouped by feature-file basename — distinguishes a genuinely
  // filtered run of the MAIN feature (transient; re-run) from a feature file
  // that is never in the test config (e.g. a legacy `*.feature` not in
  // cucumber `paths` — a PERSISTENT gap a full run won't fix). 2026-06-08.
  const notRunByFile = new Map<string, number>();
  for (const n of graph.nodes.values()) {
    if (!inSpec(n.file)) continue;
    if (n.type === 'Task') {
      const t = n as TaskNode;
      taskLikes.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: specOf(t.file), status: t.status });
      if (t.status === 'done') {
        doneTaskIds.add(t.id);
        doneTasks.set(t.id, t);
      }
    } else if (n.type === 'Scenario') {
      const s = n as ScenarioNode;
      scenLikes.push({ id: s.id, tags: s.tags, result: s.lastResult, stale: s.resultStale, spec: specOf(s.file), source: s.trace?.source, canonicalResult: s.canonicalResult, canonicalRunAt: s.canonicalRunAt });
      sourceScenarios.push(s);
      if (!s.canonicalResult) {
        const base = String(s.file).replace(/\\/g, '/').split('/').pop() ?? String(s.file);
        notRunByFile.set(base, (notRunByFile.get(base) ?? 0) + 1);
      }
    }
  }
  for (const n of graph.nodes.values()) {
    if (n.type !== 'Scenario') continue;
    const s = n as ScenarioNode;
    const file = String(s.file).replace(/\\/g, '/');
    if (file.includes('/.tmp/') || file.includes('/archive/')) continue;
    const outsideSpec = !file.startsWith('.specs/');
    if (outsideSpec && file.toLowerCase().includes(slug.split('/').pop()!.toLowerCase())) executableScenarios.push(s);
  }
  const cov = computeCoverage(taskLikes, scenLikes, testQualityByTask);
  const canonicalScenarioLikes = scenLikes.map((scenario) => ({
    ...scenario,
    result: scenario.canonicalResult,
    stale: false,
    source: scenario.canonicalResult ? 'canonical-full-run' : undefined,
  }));
  const canonicalCov = computeCoverage(taskLikes, canonicalScenarioLikes, testQualityByTask);
  const buckets: Record<string, number> = {};
  const canonicalBuckets: Record<string, number> = {};
  for (const [b, ids] of Object.entries(cov.buckets)) buckets[b] = ids.length;
  for (const [b, ids] of Object.entries(canonicalCov.buckets)) canonicalBuckets[b] = ids.length;
  const unverifiedDoneTasks = [...doneTaskIds].filter(
    (id) => canonicalCov.tasks[id]?.verified_status !== 'DONE',
  );
  const truthIssuesByTask = new Map(
    [...doneTaskIds].map((id) => [id, canonicalCov.tasks[id]?.truth_issues ?? []]),
  );
  const uncheckedDoneWhenTasks = [...truthIssuesByTask]
    .filter(([, issues]) => issues.some((issue) => issue.code === 'TASK_DONE_CHECKLIST_OPEN'))
    .map(([id]) => id);
  const canonicalBucketByScenarioId = new Map<string, string>();
  for (const [bucket, ids] of Object.entries(canonicalCov.buckets)) {
    for (const id of ids) canonicalBucketByScenarioId.set(id, bucket);
  }

  // FR-37c (P14-3): FR-8 semantic drift IN the verdict path — ON when a
  // claude binary is present; explicit skip otherwise. Fail-loud always.
  const semanticWanted = opts.semantic !== false;
  const binaryPresent = opts.judgeSpawn ? true : semanticWanted && claudeBinaryPresent();
  const drifts: SpecVerdictResult['semantic']['drifts'] = [];
  let pairsChecked = 0;
  let judgeFailures = 0;
  let semanticNote: string | undefined;
  if (semanticWanted && binaryPresent) {
    // Pairs = this spec's FR ↔ tested-by Scenario edges (the REAL edges, FR-36c).
    const pairs: Array<{ fr: FrNode; scen: ScenarioNode }> = [];
    for (const e of graph.edges) {
      if (e.type !== 'tested-by') continue;
      const fr = graph.nodes.get(e.from);
      const scen = graph.nodes.get(e.to);
      if (!fr || fr.type !== 'FR' || !scen || scen.type !== 'Scenario') continue;
      if (!inSpec(fr.file)) continue;
      pairs.push({ fr: fr as FrNode, scen: scen as ScenarioNode });
    }
    const limit = opts.maxPairs ?? Number.POSITIVE_INFINITY;
    for (const { fr, scen } of pairs.slice(0, limit)) {
      const res: JudgeResult = await runJudge({
        repoRoot: cwd,
        frId: fr.id,
        frText: `${fr.title}\n${fr.body ?? ''}`,
        scenarioId: scen.id,
        scenarioText: scen.steps.map((s) => `${s.keyword} ${s.text}`).join('\n'),
        spawn: opts.judgeSpawn,
      });
      pairsChecked++;
      if (res.result === 'DRIFT') {
        drifts.push({
          frId: fr.id,
          scenarioId: scen.id,
          severity: res.severity ?? 'warning',
          explanation: res.explanation ?? '',
        });
      } else if (res.result === 'SUBPROCESS_FAILED') {
        judgeFailures++;
      }
    }
    if (pairs.length > pairsChecked) {
      semanticNote = `SEMANTIC_TRUNCATED — ${pairsChecked} of ${pairs.length} FR↔Scenario pairs checked (maxPairs); the rest are UNCHECKED, not "no drift" (FR-37c)`;
    } else if (judgeFailures > 0) {
      semanticNote = `SEMANTIC_DEGRADED — ${judgeFailures} judge subprocess failure(s); those pairs are UNCHECKED, not "no drift" (FR-37c)`;
    }
  } else {
    semanticNote =
      'SEMANTIC_SKIPPED — no claude binary available (or semantic disabled); unchecked content is NOT "no drift" (FR-37c)';
  }

  // THE definition of «what blocks» — the verdict derives from this list and
  // nothing else (a future 6th gate is added HERE once, not in two places).
  const gapList: string[] = [
    ...(validation.errors ?? []).map(
      (e: any) => `[STRUCTURAL] ${e.file ?? ''}: ${e.message ?? JSON.stringify(e)}`,
    ),
    ...errorFindings.map((f) => `[${f.check}] ${f.message}`),
    ...gaps.map((g) => `[${g.class}] ${g.file}:${g.line} — ${g.message}`),
    ...confErrors.map((f) => `[CONFORMANCE:${f.code}] ${f.location.file}:${f.location.line} — ${f.message}`),
    ...drifts.map((d) => `[SEMANTIC_DRIFT:${d.severity}] ${d.frId} ↔ ${d.scenarioId} — ${d.explanation}`),
  ];

  const notes: string[] = [];
  if (semanticNote) notes.push(semanticNote);
  // PARTIAL last run (FR-32 honesty): scenarios absent from the last NDJSON land
  // in `not_run`, NOT `undefined`. A non-zero count means the last `cucumber` run
  // was filtered (`--tags …`) or never ran some scenarios — the coverage picture
  // is partial, NOT a spec defect. Loud note so a filtered debug run can't be
  // misread as "the spec fell apart" (2026-06-08 incident).
  const notRun = canonicalBuckets.not_run ?? 0;
  if (notRun > 0) {
    const byFile = [...notRunByFile.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `${f}:${n}`)
      .join(', ');
    notes.push(
      `NOT_RUN — ${notRun} scenario(s) have no result in the last run (not_run, NOT "undefined"/unverified), by feature: ${byFile}. ` +
        `A count on the MAIN feature ⇒ the last run was FILTERED (re-run the full suite). A feature absent from the test config ` +
        `(e.g. a legacy *.feature not in cucumber \`paths\`) is a PERSISTENT gap a full run won't close — add it to paths or retire it.`,
    );
  }

  const effectiveExecution = deriveExecutionLane(inventory);
  const executionHardFailures = ['failed', 'undefined', 'ambiguous', 'pending', 'skipped']
    .map((key) => [key, canonicalBuckets[key] ?? 0] as const)
    .filter(([, count]) => count > 0);
  const executionDebt = effectiveExecution.debt;
  const semanticDebt = [
    ...drifts.map((d) => `${d.frId} ↔ ${d.scenarioId}: ${d.severity}`),
    ...(judgeFailures > 0 ? [`${judgeFailures} judge subprocess failure(s)`] : []),
    ...(semanticWanted && semanticNote ? [semanticNote] : []),
  ];
  const bddSync = compareBddSync(cwd, slug, sourceScenarios, executableScenarios);
  const filteredProof = latestFilteredProof(cwd, sourceScenarios);
  const taskTruthDebt = [...new Set([...unverifiedDoneTasks, ...uncheckedDoneWhenTasks])].map((id) => {
    const issues = truthIssuesByTask.get(id) ?? [];
    const parts: string[] = issues.map((issue) => issue.message);
    if (unverifiedDoneTasks.includes(id) && parts.length === 0) {
      const scenarios = canonicalCov.tasks[id]?.scenarios ?? [];
      const evidence = scenarios.length > 0
        ? scenarios.map((sid) => `${sid}=${canonicalBucketByScenarioId.get(sid) ?? 'unverified'}`).join(', ')
        : 'no mapped scenario evidence';
      parts.push(`evidence-derived ${canonicalCov.tasks[id]?.verified_status ?? 'unverified'} (${evidence})`);
    }
    return `${id}: ${parts.join('; ')}`;
  });
  const lanes: Record<ReadinessLaneName, ReadinessLane> = {
    STRUCTURE: {
      status: structuralErrors > 0 || errorFindings.length > 0 || confErrors.length > 0 ? 'RED' : 'GREEN',
      blocking: structuralErrors > 0 || errorFindings.length > 0 || confErrors.length > 0,
      summary: `${structuralErrors} structural error(s), ${errorFindings.length} audit error(s), ${confErrors.length} conformance error(s)`,
      debt: [
        ...(structuralErrors > 0 ? [`${structuralErrors} structural error(s)`] : []),
        ...(errorFindings.length > 0 ? [`${errorFindings.length} audit error(s)`] : []),
        ...(confErrors.length > 0 ? [`${confErrors.length} conformance error(s)`] : []),
      ],
    },
    TRACEABILITY: {
      status: gaps.length > 0 ? 'RED' : 'GREEN',
      blocking: gaps.length > 0,
      summary: gaps.length > 0 ? `${gaps.length} traceability gap(s)` : '0 traceability gaps',
      debt: gaps.map((g) => `${g.class}: ${g.nodeId}`),
    },
    EXECUTION: {
      status: effectiveExecution.status,
      blocking: effectiveExecution.status !== 'GREEN',
      summary: effectiveExecution.debt?.join(', ') || 'all effective scenario evidence is current and passing',
      debt: effectiveExecution.debt ?? [],
    },
    TASK_TRUTH: {
      status: taskTruthDebt.length > 0 ? 'RED' : 'GREEN',
      blocking: taskTruthDebt.length > 0,
      summary: taskTruthDebt.length > 0
        ? `${unverifiedDoneTasks.length} DONE-but-unverified task(s), ${uncheckedDoneWhenTasks.length} DONE task(s) with unchecked Done When item(s)`
        : 'no DONE-but-unverified tasks',
      debt: taskTruthDebt,
    },
    BDD_SYNC: {
      status: bddSync.debt.length > 0 ? 'RED' : 'GREEN',
      blocking: bddSync.debt.length > 0,
      summary: bddSync.debt.length > 0 ? `${bddSync.debt.length} source/executable BDD sync drift(s)` : 'no source/executable BDD sync debt reported by the current verdict inputs',
      debt: bddSync.debt,
    },
    SEMANTIC: {
      status: !semanticWanted ? 'SKIPPED' : semanticDebt.length > 0 ? 'SKIPPED' : 'GREEN',
      blocking: semanticWanted && semanticDebt.length > 0,
      summary: !semanticWanted
        ? 'semantic check explicitly disabled for this run'
        : semanticDebt.length > 0
          ? semanticDebt.join(', ')
          : `${pairsChecked} semantic pair(s) checked with no drift`,
      debt: !semanticWanted ? [] : semanticDebt,
    },
    FILTERED_PROOF: {
      status: filteredProof.proofs.length > 0 ? 'GREEN' : 'NONE',
      blocking: false,
      summary: filteredProof.proofs.length > 0 ? filteredProof.proofs[0] : (notRun > 0 ? 'no filtered proof attached to this verdict output' : 'no filtered proof needed'),
      debt: [],
    },
  };
  const canonical = computeSpecVerdict({
    inventory,
    lanes: Object.fromEntries(Object.entries(lanes).map(([name, lane]) => [name, {
      status: lane.status,
      debt: lane.debt,
    }])),
  }, specFindings);
  const canonicalLanes = Object.fromEntries(Object.entries(canonical.readiness.lanes).map(([name, lane]) => [name, {
    status: lane.status,
    blocking: lane.blocking,
    summary: lanes[name as ReadinessLaneName]?.summary ?? (lane.debt.join(', ') || `${name} ${lane.status}`),
    debt: lane.debt,
  }])) as Record<ReadinessLaneName, ReadinessLane>;
  const readiness = {
    lanes: canonicalLanes,
    overall: canonical.readiness.overall,
    nextAction: canonical.readiness.next_action,
  };

  return {
    specPath,
    verdict: canonical.verdict,
    blocking: canonical.blocking,
    prefilter: {
      structuralErrors,
      warnings,
      note: 'pre-filter only — a structural pass is NOT reportable as "valid/clean/done" (FR-37a)',
    },
    auditGate: { errorCount: errorFindings.length, byClass },
    traceabilityGate: { gapCount: gaps.length, byClass: summariseGaps(gaps), gaps },
    conformance: {
      errorCount: confErrors.length,
      warningCount: specFindings.filter((f) => f.severity === 'warning').length,
      byCode: confByCode,
    },
    coverage: { buckets, canonicalBuckets, unverifiedDoneTasks },
    inventory,
    evidence: { bddSync, filteredProof },
    semantic: {
      ran: semanticWanted && binaryPresent,
      binaryPresent,
      pairsChecked,
      drifts,
      failures: judgeFailures,
      note: semanticNote,
    },
    gapList,
    notes,
    readiness,
  };
}

/**
 * FR-37 DX: per-code remediation for conformance warnings/errors. The verdict used
 * to print only counts (`FR_NO_STORY:6`), forcing the reader into conformance.ts to
 * learn the fix. This maps each code to a one-line "how to fix". Additive — printed
 * AFTER the count line so existing assertions on that line are unaffected.
 */
const CONFORMANCE_REMEDIATION: Record<string, string> = {
  FR_NO_STORY: 'add a `**Требование:** [FR-N]` line INSIDE a `### User Story` block (the story→FR covers edge is built only from that line)',
  FR_NO_DESIGN: 'add a `**Требование:** [FR-N]` line INSIDE a `### Decision` block in DESIGN.md',
  TOOTHLESS_STORY: 'the `### User Story` block declares no `**Требование:** [FR-N]` — add one (else its story leg dangles)',
  TOOTHLESS_DECISION: 'the `### Decision` block declares no `**Требование:** [FR-N]` — add one (else its design leg dangles)',
  UNCOVERED_FR: 'FR has no covering AC — add an `## AC-N (FR-N)` with `**Требование:** [FR-N](FR.md#...)` + a tagged @featureN scenario',
  UNTAGGED_SCENARIO: 'scenario carries no `@featureN` tag — add the tag mapping it to its FR',
  TASK_UNTESTED: 'task has no covering scenario — add a clickable `[FR-N]` ref + a @featureN scenario',
  LINK_VALIDITY: 'reference is plain text — make it a clickable `[FR-N](FR.md#fr-n-...)` / `[AC-N](ACCEPTANCE_CRITERIA.md#...)` link',
};

/** Render the verdict for humans. `VERDICT` is the graph gate; `OVERALL` is product readiness (FR-61). */
export function renderVerdict(r: SpecVerdictResult): string {
  const lines: string[] = [];
  lines.push(`═══ spec-verdict (authoritative, FR-37) — ${r.specPath} ═══`);
  lines.push(
    `pre-filter (validate-spec, structural): ${r.prefilter.structuralErrors} errors / ${r.prefilter.warnings} warnings — ${r.prefilter.note}`,
  );
  if (r.auditGate.errorCount === 0) {
    lines.push('audit gate (audit-spec): 0 ERROR findings — gate PASSES');
  } else {
    const classCount = Object.keys(r.auditGate.byClass).length;
    lines.push(`audit gate (audit-spec): ${r.auditGate.errorCount} ERROR across ${classCount} class(es) — gate FAILS:`);
    for (const [cls, findings] of Object.entries(r.auditGate.byClass)) {
      lines.push(`  [${cls}] ×${findings.length}`);
      for (const f of findings) lines.push(`    - ${f.message}`);
    }
  }
  lines.push(
    `conformance (one graph, spec-scoped): ${r.conformance.errorCount} error / ${r.conformance.warningCount} warning — ` +
      Object.entries(r.conformance.byCode)
        .map(([c, n]) => `${c}:${n}`)
        .join(', '),
  );
  // FR-37 DX: surface HOW to fix, not just the counts (additive lines, one per code present).
  for (const code of Object.keys(r.conformance.byCode)) {
    const hint = CONFORMANCE_REMEDIATION[code];
    if (hint) lines.push(`  fix ${code}: ${hint}`);
  }
  const notRunCount = (r.coverage.buckets as Record<string, number>).not_run ?? 0;
  lines.push(
    `coverage (FR-32 honesty): effective ${JSON.stringify(r.coverage.buckets)}; canonical ${JSON.stringify(r.coverage.canonicalBuckets)}` +
      (notRunCount > 0 ? ` — ⚠️ ${notRunCount} effective not_run (no latest evidence; see NOT_RUN note for per-feature breakdown)` : '') +
      (r.coverage.unverifiedDoneTasks.length
        ? ` — DONE-but-unverified: ${r.coverage.unverifiedDoneTasks.join(', ')}`
        : ''),
  );
  // FR-63 (foundation): the shared deduplicated inventory — per-AC test_paths,
  // FR-level never-run classification, evidence taxonomy (additive line).
  const neverRunFrs = r.inventory.frs.filter((fr) => fr.never_run).map((fr) => fr.id);
  const emptyTestPathAcs = r.inventory.acs.filter((ac) => ac.test_paths.length === 0).map((ac) => ac.id);
  lines.push(
    `inventory (FR-63, one graph): ${r.inventory.counts.fr} FR / ${r.inventory.counts.ac} AC / ${r.inventory.counts.scenario} scenario (deduplicated)` +
      (neverRunFrs.length ? ` — never-run FRs: ${neverRunFrs.join(', ')}` : '') +
      (emptyTestPathAcs.length ? ` — ACs with test_paths=[]: ${emptyTestPathAcs.join(', ')}` : '') +
      (r.inventory.duplicates.length ? ` — duplicate candidates deduplicated: ${r.inventory.duplicates.map((d) => `${d.kind}:${d.key}`).join(', ')}` : ''),
  );
  if (r.semantic.ran) {
    lines.push(
      `semantic (FR-8): ${r.semantic.pairsChecked} pair(s) checked — ${r.semantic.drifts.length} drift(s), ${r.semantic.failures} failure(s)` +
        (r.semantic.note ? ` — ${r.semantic.note}` : ''),
    );
  } else {
    lines.push(`semantic (FR-8): ${r.semantic.note}`);
  }
  if (r.traceabilityGate.gapCount === 0) {
    lines.push('traceability gate (FR-37b, cell→atom): 0 gaps — gate PASSES');
  } else {
    const tb = r.traceabilityGate.byClass;
    lines.push(
      `traceability gate (FR-37b, cell→atom): ${r.traceabilityGate.gapCount} gap(s) — gate FAILS ` +
        `(UNCOVERED_FR: ${tb.UNCOVERED_FR}, TASK_UNTESTED: ${tb.TASK_UNTESTED}, UNTAGGED_SCENARIO: ${tb.UNTAGGED_SCENARIO}):`,
    );
    for (const g of r.traceabilityGate.gaps.slice(0, 20)) {
      lines.push(`  [${g.class}] ${g.nodeId} @ ${g.file}:${g.line}`);
    }
    if (r.traceabilityGate.gaps.length > 20) {
      lines.push(`  … and ${r.traceabilityGate.gaps.length - 20} more (see --json for the full list)`);
    }
  }
  lines.push('readiness lanes (FR-61):');
  const laneOrder: ReadinessLaneName[] = ['STRUCTURE', 'TRACEABILITY', 'EXECUTION', 'TASK_TRUTH', 'BDD_SYNC', 'SEMANTIC', 'FILTERED_PROOF'];
  for (const name of laneOrder) {
    const lane = r.readiness.lanes[name];
    lines.push(`  ${name}: ${lane.status}${lane.blocking ? ' (blocking)' : ''} — ${lane.summary}`);
    for (const item of lane.debt.slice(0, 8)) lines.push(`    - ${item}`);
    if (lane.debt.length > 8) lines.push(`    … and ${lane.debt.length - 8} more`);
  }
  lines.push('notes (fail-loud, FR-37c):');
  for (const n of r.notes) lines.push(`  - ${n}`);
  const everyLaneGreen = Object.values(r.readiness.lanes).every((lane) => lane.status === 'GREEN');
  if (r.verdict === 'RED') {
    lines.push(`VERDICT: RED — ${r.blocking.length} blocking finding(s)`);
  } else if (r.verdict === 'GREEN' && everyLaneGreen) {
    lines.push('VERDICT: GREEN');
  } else {
    lines.push(`VERDICT: NOT_READY — ${r.blocking.length} blocking finding(s)`);
  }
  lines.push(`OVERALL: ${r.readiness.overall}`);
  lines.push(`NEXT: ${r.readiness.nextAction}`);
  return lines.join('\n');
}

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): {
  specPath: string;
  json: boolean;
  semantic: boolean;
  maxPairs?: number;
} {
  let specPath = '';
  let json = false;
  let semantic = true;
  let maxPairs: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-Path' || a === '--path') specPath = argv[++i] ?? '';
    else if (a === '--json') json = true;
    else if (a === '--no-semantic') semantic = false;
    else if (a === '--max-pairs') maxPairs = Number(argv[++i]);
    else if (!a.startsWith('-') && !specPath) specPath = a;
  }
  if (!specPath) {
    console.error('Usage: spec-verdict.ts -Path .specs/<slug> [--json] [--no-semantic] [--max-pairs N]');
    process.exit(2);
  }
  return { specPath, json, semantic, maxPairs };
}

export function verdictExitCode(result: Pick<SpecVerdictResult, 'verdict'>): 0 | 1 {
  return result.verdict === 'GREEN' ? 0 : 1;
}

const isDirectRun =
  process.argv[1]?.endsWith('spec-verdict.ts') || process.argv[1]?.endsWith('spec-verdict.js');
if (isDirectRun) {
  const { specPath, json, semantic, maxPairs } = parseArgs(process.argv.slice(2));
  const result = await runSpecVerdict(specPath, { semantic, maxPairs });
  console.log(json ? JSON.stringify(result, null, 2) : renderVerdict(result));
  // Machine contract follows product readiness, not only the legacy graph gate:
  // GRAPH_GREEN + OVERALL NOT_READY must be a non-zero exit (FR-61a).
  process.exit(verdictExitCode(result));
}
