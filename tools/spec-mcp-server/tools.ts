/**
 * MCP tool registry — all 16 read-only tools (graph queries + the FR-39a read door).
 *
 * Each tool is a thin wrapper over the in-memory `SpecGraph` produced by the
 * Phase 1 builder. Wrappers do exactly two things: pluck the relevant subset
 * out of the graph + format an `explanation_for_agent` summary the agent can
 * paste back into its context.
 *
 * The tools (base set per [SCHEMA Entity 3](../../.specs/spec-generator-v4/spec-generator-v4_SCHEMA.md);
 * + get_spec_status FR-38/FR-32 with status/counts/coverage views — `buildToolRegistry` below is canonical):
 *
 *   get_trace               primary — structured tree + code_impl + explanation
 *   find_by_tags            scenarios filtered by `@FR/@NFR/@AC` tags
 *   conformance_check       run Phase-1 conformance over current graph
 *   search                  bounded substring scan over node ids + titles
 *   get_node                raw node lookup by canonical id
 *   list_tasks              bounded task inventory scoped to one spec
 *   list_phase_tasks        bounded task inventory scoped to one spec + phase
 *   get_test_result         last-result for a scenario id
 *   find_orphans            ORPHAN_* / UNCOVERED_FR findings only
 *   get_spec_status         FR-38/FR-32 — one tool, three `view`s: status (lifecycle +
 *                           last_run), counts (per-spec FR/AC/Scenario/Task tallies),
 *                           coverage (per-scenario buckets + per-task verified_status)
 *   validate_anchor         compact-id/alias registry OR DOC.md#Marksman heading-slug check
 *   list_specs              top-level `.specs/<slug>/` directories
 *   find_refs               incoming references for a node
 *   list_spec_docs          FR-39a — the read_spec_doc inventory of ONE spec
 *   read_spec_doc           FR-39a — whole-document read + spec-access audit log
 *
 * The handler signature is identical to the MCP SDK v1 `server.tool` callback
 * shape — receives the parsed input object, returns `{content: [{type, text}]}`.
 *
 * @see ./server.ts (entry point that wires this registry into McpServer)
 * @see .specs/spec-generator-v4/FR.md FR-4
 */

import { z } from 'zod';
import { checkConformance, type Finding } from '../spec-graph/conformance.ts';
import { gapsFromFindings, summariseGaps } from '../spec-graph/traceability.ts';
import { buildReadinessInventory, classifyScenarioScope } from '../spec-graph/readiness-inventory.ts';
import { computeSpecVerdict } from '../spec-graph/verdict.ts';
import fs from 'node:fs';
import path from 'node:path';
import { logSpecAccess } from './spec-access-log.ts';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateSpecChange, writeDocAtomic, isSafeSlug, resolveSpecDoc, docSha, casCheck, validateTarget, findInboundLinks, rewriteInboundLinks, isArchivedSlug, type SpecChange } from './mutations.ts';
import { applySectionChange, applyReplaceChange, readForEdit, proposePatch, applyProposedPatch, applySpecTransactionCore, type SectionOpKind, type PatchEdit, type PatchEditPreview } from './section-ops.ts';
import {
  addBacklogTask,
  addPhase,
  amendRequirement,
  addAcceptanceCriterion,
  registerIncidentBacklog,
  type DomainAuthoringResult,
} from './domain-authoring.ts';
import { writeSpecStatus, readSpecStatus } from '../spec-graph/spec-status-store.ts';
import { withWriteLock, type WriteLockBusyError } from './lock-manager.ts';
import { setEntityStatus } from './set-status.ts';
import { validateRequirementMetadata, renderRequirementMetadata } from '../spec-graph/metadata-schema.ts';
import { evaluateDelivery } from '../spec-graph/delivery-demands.ts';
import { localIdOf } from '../spec-graph/identity.ts';
import { readProgressState, PHASE_ORDER, STOP_LABELS } from '../specs-validator/phase-constants.ts';
import type {
  SpecGraph,
  Node,
  FrNode,
  NfrNode,
  AcNode,
  DecisionNode,
  StoryNode,
  ScenarioNode,
  TaskNode,
  StepBindingNode,
  Edge,
  EdgeMetadata,
  NodeLocation,
} from '../spec-graph/types.ts';
import {
  computeCoverage,
  bucketScenarios,
  verifiedStatus,
  isLiveAttestedScenario,
  mapTasksToScenarios,
  scenarioKey,
  specOf,
  type Bucket,
  type ScenarioLike,
  type TaskLike,
} from '../spec-graph/coverage.ts';
import { readVerdicts } from '../spec-graph/test-quality-gate.ts';
import { oldTestReadinessDebt } from '../bdd-migrator/repository-census.ts';
import { marksmanSlug } from '../anchor-integrity/marksman-slug.mjs';
import { compareBddSync, latestFilteredProof, type ScenarioLite } from '../specs-generator/spec-verdict.ts';
import {
  analyzeRemediation,
  proposeSpecRepairs,
  applySpecRepairs,
} from '../specs-generator/spec-remediation.ts';

/**
 * FR-36d (P13-3): resolve a tool-supplied node reference against the
 * composite-keyed graph. Accepted forms:
 *   - composite `slug:FR-2`              → exact lookup;
 *   - `{spec: 'slug', node_id: 'FR-2'}`  → exact lookup of `slug:FR-2`;
 *   - BARE `FR-2`, defined by ONE spec   → soft-resolved to that node;
 *   - BARE `FR-2`, defined by 2+ specs   → the sorted candidate list of
 *     `slug:id` keys — NEVER one arbitrary node (the bare-id collision used
 *     to silently return the last-writer; that is the FR-36 root bug).
 */
function resolveNodeRef(
  graph: SpecGraph,
  nodeId: string,
  spec?: string,
): { node?: Node; candidates?: string[] } {
  if (spec) {
    const exact = graph.nodes.get(`${spec}:${nodeId}`);
    return exact ? { node: exact } : {};
  }
  const direct = graph.nodes.get(nodeId); // composite form, or a genuine bare node
  if (direct) return { node: direct };
  const matches: Node[] = [];
  for (const n of graph.nodes.values()) {
    if (n.spec && n.id === `${n.spec}:${nodeId}`) matches.push(n);
  }
  if (matches.length === 1) return { node: matches[0] };
  if (matches.length > 1) return { candidates: matches.map((n) => n.id).sort() };
  return {};
}

/** Uniform AMBIGUOUS_BARE_ID envelope for every node-ref tool (FR-36d). */
function ambiguousBareId(nodeId: string, candidates: string[]): ToolResult {
  return asJsonResult({
    ok: false,
    error: 'AMBIGUOUS_BARE_ID',
    node_id: nodeId,
    local_id: nodeId,
    candidates,
    hint: `Bare id "${nodeId}" is defined by ${candidates.length} specs — qualify as <slug>:${nodeId} or pass {spec: "<slug>"}.`,
  });
}

/** Build every Scenario as a ScenarioLike + an id→bucket index for FR-32 derivation. */
function scenarioCoverageIndex(graph: SpecGraph): { scens: ScenarioLike[]; bucketById: Map<string, Bucket> } {
  const scens: ScenarioLike[] = [];
  for (const n of graph.nodes.values()) {
    if (n.type === 'Scenario') {
      const s = n as ScenarioNode;
      scens.push({ id: s.id, tags: s.tags, result: s.lastResult, stale: s.resultStale, spec: specOf(s.file), source: s.trace?.source, canonicalResult: s.canonicalResult, canonicalRunAt: s.canonicalRunAt });
    }
  }
  const bucketById = new Map<string, Bucket>();
  const b = bucketScenarios(scens);
  for (const k of Object.keys(b) as Bucket[]) for (const id of b[k]) bucketById.set(id, k);
  return { scens, bucketById };
}

function normalizeTraceStatus(raw: unknown): string {
  return typeof raw === 'string' && raw.length > 0 ? raw.toUpperCase() : 'UNKNOWN';
}

function durationToMs(d: unknown): number | null {
  if (!d || typeof d !== 'object') return null;
  const dd = d as { seconds?: number; nanos?: number };
  if (typeof dd.seconds !== 'number' && typeof dd.nanos !== 'number') return null;
  return (dd.seconds ?? 0) * 1000 + Math.round((dd.nanos ?? 0) / 1_000_000);
}

function resolveRuntimePath(repoRoot: string, p: string): string {
  if (p.startsWith('file://')) return fileURLToPath(p);
  return path.isAbsolute(p) ? p : path.resolve(repoRoot, p);
}

function traceTarget(s: ScenarioNode): {
  traceId?: string;
  traceFile?: string;
  testCaseStartedId?: string;
  runId?: string;
  source?: string;
} {
  const ref = s.trace;
  const traceId = ref?.traceId;
  const hash = traceId?.lastIndexOf('#') ?? -1;
  return {
    traceId,
    traceFile: ref?.traceFile ?? (traceId && hash > 0 ? traceId.slice(0, hash) : undefined),
    testCaseStartedId: ref?.testCaseStartedId ?? (traceId && hash >= 0 ? traceId.slice(hash + 1) : undefined),
    runId: ref?.runId,
    source: ref?.source,
  };
}

function readTraceFailure(repoRoot: string, s: ScenarioNode): {
  trace_status: 'not_recorded' | 'available' | 'expired';
  failingStep: { step: string; errorMessage: string; status?: string; durationMs?: number | null } | null;
  note?: string;
} {
  const target = traceTarget(s);
  const fallback = s.failingStep ? { ...s.failingStep } : null;
  if (!target.traceId || !target.traceFile) {
    return { trace_status: 'not_recorded', failingStep: fallback };
  }
  const abs = resolveRuntimePath(repoRoot, target.traceFile);
  if (!fs.existsSync(abs)) {
    return {
      trace_status: 'expired',
      failingStep: fallback,
      note: 'Trace chunk expired or was rotated away — rerun the scenario to refresh runtime detail.',
    };
  }

  const pickleStepText = new Map<string, string>();
  const testStepToPickleStep = new Map<string, string>();
  const finishes: Array<{ testStepId?: string; status: string; message: string; durationMs: number | null }> = [];

  for (const line of fs.readFileSync(abs, 'utf-8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let env: Record<string, unknown>;
    try {
      env = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const pickle = env.pickle as { steps?: Array<{ id?: string; text?: string }> } | undefined;
    if (pickle?.steps) {
      for (const step of pickle.steps) {
        if (step.id && typeof step.text === 'string') pickleStepText.set(step.id, step.text);
      }
      continue;
    }

    const testCase = env.testCase as { testSteps?: Array<{ id?: string; pickleStepId?: string }> } | undefined;
    if (testCase?.testSteps) {
      for (const step of testCase.testSteps) {
        if (step.id && step.pickleStepId) testStepToPickleStep.set(step.id, step.pickleStepId);
      }
      continue;
    }

    const stepFinished = env.testStepFinished as
      | {
          testCaseStartedId?: string;
          testStepId?: string;
          testStepResult?: { status?: string; message?: string; duration?: unknown };
        }
      | undefined;
    if (stepFinished?.testCaseStartedId !== target.testCaseStartedId || !stepFinished.testStepResult) continue;
    finishes.push({
      testStepId: stepFinished.testStepId,
      status: normalizeTraceStatus(stepFinished.testStepResult.status),
      message: stepFinished.testStepResult.message ?? '',
      durationMs: durationToMs(stepFinished.testStepResult.duration),
    });
  }

  const bad = finishes.find((f) => f.status === 'FAILED') ?? finishes.find((f) => f.status !== 'PASSED');
  if (!bad) return { trace_status: 'available', failingStep: fallback };
  const pickleStepId = bad.testStepId ? testStepToPickleStep.get(bad.testStepId) : undefined;
  return {
    trace_status: 'available',
    failingStep: {
      step: pickleStepId ? (pickleStepText.get(pickleStepId) ?? '') : '',
      errorMessage: bad.message,
      status: bad.status,
      durationMs: bad.durationMs,
    },
  };
}

function scenarioTracePayload(repoRoot: string, s: ScenarioNode): Record<string, unknown> {
  const target = traceTarget(s);
  const detail = readTraceFailure(repoRoot, s);
  return {
    scenario_id: s.id,
    lastResult: s.lastResult ?? 'UNKNOWN',
    lastRunAt: s.lastRunAt ?? null,
    stale: s.resultStale === true,
    run_id: target.runId ?? null,
    source: target.source ?? null,
    git_sha: target.gitSha ?? null,
    trace_id: target.traceId ?? null,
    trace_file: target.traceFile ?? null,
    test_case_started_id: target.testCaseStartedId ?? null,
    trace_status: detail.trace_status,
    failingStep: detail.failingStep,
    note: detail.note ?? (s.resultStale === true ? 'Last pass is stale — rerun this scenario to refresh evidence.' : undefined),
  };
}

function resolveScenarioRef(graph: SpecGraph, scenarioId: string, spec?: string): { node?: ScenarioNode; candidates?: string[] } {
  const resolved = resolveNodeRef(graph, scenarioId, spec);
  if (resolved.candidates) return { candidates: resolved.candidates };
  if (resolved.node?.type === 'Scenario') return { node: resolved.node as ScenarioNode };

  const key = scenarioKey(scenarioId);
  if (!key) return {};
  const matches: ScenarioNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type !== 'Scenario') continue;
    const s = node as ScenarioNode;
    if (spec && specOf(s.file) !== spec) continue;
    if (scenarioKey(s.id) === key) matches.push(s);
  }
  if (matches.length === 1) return { node: matches[0] };
  if (matches.length > 1) return { candidates: matches.map((s) => s.id).sort() };
  return {};
}

/** Scenarios linked to a node (FR → @feature<N>, Task → refs map, else tested-by ids). */
function linkedScenarioIds(node: Node, scens: ScenarioLike[], testedByIds: string[]): string[] {
  const nodeSpec = specOf(node.file);
  if (node.type === 'Task') {
    const task = node as TaskNode;
    return (
      mapTasksToScenarios(
        [{ id: task.id, doneWhen: task.doneWhen ?? '', refs: task.refs, spec: nodeSpec }],
        scens,
      ).get(task.id) ?? []
    );
  }
  if (node.type === 'FR') {
    const num = node.id.match(/FR-(\d+)/i)?.[1];
    if (!num) return testedByIds;
    const tag = `@feature${num}`;
    // Same-spec scoping (FR-N ↔ @featureN tags collide across specs): an FR is
    // verified only by scenarios in its own spec when the spec is known.
    return scens
      .filter((s) => s.tags.map((t) => t.toLowerCase()).includes(tag))
      .filter((s) => nodeSpec === undefined || s.spec === nodeSpec)
      .map((s) => s.id);
  }
  return testedByIds;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
}

export interface ToolDefinition<TShape extends z.ZodRawShape> {
  name: string;
  description: string;
  inputShape: TShape;
  handler: (args: z.infer<z.ZodObject<TShape>>) => Promise<ToolResult>;
}

/**
 * Format a `ToolResult` from a JSON-stringifiable payload.
 * MCP responses always carry text content; the JSON is the canonical envelope.
 */
function asJsonResult(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/** Truncate a string to ≤max chars, suffixing with `…` when truncated. */
function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

/** Slugify a markdown heading the way the anchor resolver does (lowercase,
 *  non-alnum → `-`, trimmed). Lets `section` match either the heading TEXT
 *  ("## FR-14") or its anchor ("fr-14"). */
function slugifyHeading(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const DEFAULT_DOC_PAGE_LINES = 300;
const MAX_DOC_PAGE_LINES = 500;
const WHOLE_DOC_SAFE_BYTES = 64 * 1024;

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): number | null {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!/^\d+$/.test(decoded)) return null;
    const offset = Number(decoded);
    return Number.isSafeInteger(offset) && offset >= 0 ? offset : null;
  } catch {
    return null;
  }
}

function pageResult<T>(items: readonly T[], cursor: string | undefined, limit = DEFAULT_PAGE_LIMIT): {
  ok: boolean;
  error?: 'INVALID_CURSOR';
  total: number;
  returned: number;
  truncated: boolean;
  next_cursor: string | null;
  results: T[];
} {
  const offset = decodeCursor(cursor);
  if (offset === null || offset > items.length) {
    return { ok: false, error: 'INVALID_CURSOR', total: items.length, returned: 0, truncated: false, next_cursor: null, results: [] };
  }
  const results = items.slice(offset, offset + limit);
  const nextOffset = offset + results.length;
  const truncated = nextOffset < items.length;
  return {
    ok: true,
    total: items.length,
    returned: results.length,
    truncated,
    next_cursor: truncated ? encodeCursor(nextOffset) : null,
    results,
  };
}

interface HeadingCandidate {
  heading: string;
  anchor: string;
  line: number;
}

function headingCandidates(lines: readonly string[]): HeadingCandidate[] {
  const out: HeadingCandidate[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    const match = lines[i].match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (!match) continue;
    const heading = match[2].trim();
    out.push({ heading, anchor: slugifyHeading(heading), line: i + 1 });
  }
  return out;
}

function nearestHeadings(lines: readonly string[], query: string, limit = 5): HeadingCandidate[] {
  const target = slugifyHeading(query.replace(/^#+/, '').trim());
  const score = (candidate: HeadingCandidate): number => {
    const anchor = candidate.anchor;
    if (anchor === target) return 0;
    if (anchor.startsWith(target) || target.startsWith(anchor)) return 1;
    const targetTokens = new Set(target.split('-').filter(Boolean));
    const overlap = anchor.split('-').filter((token) => targetTokens.has(token)).length;
    return 10 - overlap;
  };
  return headingCandidates(lines)
    .sort((a, b) => score(a) - score(b) || a.line - b.line)
    .slice(0, limit);
}

function taskSpec(task: TaskNode): string | undefined {
  return task.spec ?? specOf(task.file);
}

function localRef(ref: string): string {
  return ref.includes(':') ? ref.slice(ref.indexOf(':') + 1) : ref;
}

function taskInventoryEntry(task: TaskNode, includeComments: boolean): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    id: task.id,
    title: task.title ?? null,
    status: task.status,
    phase: task.phase ?? null,
    requirements: task.refs.map(localRef),
    issue_refs: task.issueRefs ?? [],
    location: { file: task.file, line: task.line },
  };
  if (includeComments) {
    entry.comment = task.comment ?? null;
    entry.rationale = task.waived ?? null;
    entry.blocker = task.blocker ?? null;
  }
  return entry;
}

/**
 * P21-2: extract ONE markdown section — from the matched heading down to (but
 * not including) the next heading of the SAME-or-higher level — so the agent can
 * pull just `## FR-14` out of a 77KB FR.md instead of the whole doc. `query`
 * matches the heading text or its `#anchor` (leading `#` is tolerated). Returns
 * null when no heading matches.
 */
export function sliceSection(
  lines: readonly string[],
  query: string,
): { heading: string; startLine: number; endLine: number; lines: string[] } | null {
  const q = query.replace(/^#+/, '').trim();
  const qSlug = slugifyHeading(q);
  let startIdx = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (!m) continue;
    const text = m[2].trim();
    if (text === q || slugifyHeading(text) === qSlug) {
      startIdx = i;
      level = m[1].length;
      break;
    }
  }
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= level) {
      endIdx = i;
      break;
    }
  }
  return {
    heading: lines[startIdx].replace(/^#+\s+/, '').trim(),
    startLine: startIdx + 1,
    endLine: endIdx,
    lines: lines.slice(startIdx, endIdx),
  };
}

/** Build the «one-paragraph context for the agent» summary for a single FR. */
function summariseFrTrace(
  fr: FrNode,
  acs: AcNode[],
  scenarios: ScenarioNode[],
  tasks: TaskNode[],
): string {
  const acCount = acs.length;
  const scenCount = scenarios.length;
  const taskCount = tasks.length;
  const passed = scenarios.filter((s) => s.lastResult === 'PASSED').length;
  const failed = scenarios.filter((s) => s.lastResult === 'FAILED').length;
  const failingScenario = scenarios.find((s) => s.lastResult === 'FAILED');
  const failingStep = failingScenario?.failingStep;

  let s = `${fr.id} "${fr.title ?? '(no title)'}"`;
  s += ` — ${acCount} AC, ${scenCount} scenarios (${passed} PASS, ${failed} FAIL), ${taskCount} tasks.`;
  if (failingStep) {
    s += ` Last failure: ${failingScenario!.id} at "${clamp(failingStep.step, 60)}" — ${clamp(failingStep.errorMessage, 80)}.`;
  }
  return clamp(s, 500);
}

/**
 * One `code_impl[]` entry surfaced by `get_trace` per FR-30.
 *
 * Mirrors `EdgeMetadata` for `implements` edges (FR-29) — `file_path` is the
 * repo-relative POSIX path, `source_section` reports whether the linkage came
 * from `FILE_CHANGES.md` or `DESIGN.md`, and `action` is the FILE_CHANGES
 * verb (`create` / `edit` / ...) when available.
 *
 * `action` is omitted (not `null`) when the edge originated from DESIGN.md
 * (no action verb in that source) — matches the on-disk `EdgeMetadata` shape.
 */
interface CodeImplEntry {
  file_path: string;
  action?: EdgeMetadata['action'];
  source_section: NonNullable<EdgeMetadata['source_section']>;
}

/**
 * Compute the `code_impl[]` array surfaced for a given node per FR-30.
 *
 * Rules:
 *  - FR     → all `implements` edges from this FR, in source order.
 *  - AC     → inherits the parent FR's `code_impl` transitively.
 *  - Scenario → StepBinding code-file refs ∪ tagged-FR `code_impl` (deduped
 *               by `file_path`; first-seen entry wins).
 *  - Task   → `task.files[]` ∪ each ref'd FR's `code_impl` (deduped; first
 *             wins). `files[]` is an optional field not yet on TaskNode in
 *             the Phase-1 schema — read defensively.
 *  - Other  → [] (e.g. NFR, UseCase, Risk, File, StepBinding).
 *
 * Empty result is always an array (`[]`, never `undefined`) so the response
 * shape stays stable per FR-30 (AC-30.1 second clause).
 */
function computeCodeImpl(node: Node, graph: SpecGraph): CodeImplEntry[] {
  if (node.type === 'FR') return directImplements(node.id, graph);

  if (node.type === 'AC') {
    const parent = (node as AcNode).parentFr;
    if (!parent) return [];
    return directImplements(parent, graph);
  }

  if (node.type === 'Scenario') {
    const scen = node as ScenarioNode;
    const out: CodeImplEntry[] = [];
    const seen = new Set<string>();

    // StepBinding code files — emit BEFORE inherited FR entries so explicit
    // step bindings win on dedup.
    for (const edge of graph.edges) {
      if (edge.from !== scen.id || edge.type !== 'step-binding') continue;
      const to = graph.nodes.get(edge.to);
      if (!to || to.type !== 'StepBinding') continue;
      const codeFile = (to as StepBindingNode).codeFile;
      if (codeFile && !seen.has(codeFile)) {
        seen.add(codeFile);
        out.push({ file_path: codeFile, source_section: 'DESIGN' });
      }
    }

    // Inherit code_impl from every FR/NFR tagged by the scenario.
    for (const tag of scen.tags) {
      const bare = tag.startsWith('@') ? tag.slice(1) : tag;
      // FR-36a: tags stay bare in .feature files; nodes are spec-qualified.
      // Same-spec lookup first, then bare (hand-built graphs) — mirrors
      // collectImplementsWarnings.
      const tagged =
        (scen.spec ? graph.nodes.get(`${scen.spec}:${bare}`) : undefined) ?? graph.nodes.get(bare);
      if (!tagged) continue;
      if (tagged.type !== 'FR' && tagged.type !== 'NFR') continue;
      for (const entry of directImplements(tagged.id, graph)) {
        if (!seen.has(entry.file_path)) {
          seen.add(entry.file_path);
          out.push(entry);
        }
      }
    }
    return out;
  }

  if (node.type === 'Task') {
    const task = node as TaskNode & { files?: string[] };
    const out: CodeImplEntry[] = [];
    const seen = new Set<string>();

    // task.files[] is not part of the Phase-1 TaskNode schema yet (TASKS.md
    // parser ships in a follow-up sub-PR). Treat as optional — when absent
    // we just fall through to ref'd FR inheritance.
    for (const fp of task.files ?? []) {
      if (typeof fp !== 'string' || !fp) continue;
      if (!seen.has(fp)) {
        seen.add(fp);
        out.push({ file_path: fp, source_section: 'FILE_CHANGES' });
      }
    }

    for (const refId of task.refs ?? []) {
      const ref = graph.nodes.get(refId);
      if (!ref || (ref.type !== 'FR' && ref.type !== 'NFR')) continue;
      for (const entry of directImplements(ref.id, graph)) {
        if (!seen.has(entry.file_path)) {
          seen.add(entry.file_path);
          out.push(entry);
        }
      }
    }
    return out;
  }

  return [];
}

/**
 * Direct `implements` edges from a FR/NFR id → CodeImplEntry[].
 *
 * Walks the edge list once, materialising each `implements` edge into a
 * `code_impl` entry from its `metadata`. Edges without metadata or with no
 * `file_path` fall back to the target node's `path` (FileNode). This keeps
 * the helper robust to edges produced by future parsers that may not always
 * populate metadata.
 */
function directImplements(frId: string, graph: SpecGraph): CodeImplEntry[] {
  const out: CodeImplEntry[] = [];
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.from !== frId || edge.type !== 'implements') continue;
    const entry = edgeToCodeImpl(edge, graph);
    if (!entry) continue;
    if (seen.has(entry.file_path)) continue;
    seen.add(entry.file_path);
    out.push(entry);
  }
  return out;
}

/** Materialise one `implements` edge into a `CodeImplEntry`, or `null` if the edge is malformed. */
function edgeToCodeImpl(edge: Edge, graph: SpecGraph): CodeImplEntry | null {
  const meta = edge.metadata ?? {};
  let filePath = meta.file_path;
  if (!filePath) {
    const target = graph.nodes.get(edge.to);
    if (target?.type === 'File') filePath = (target as { path: string }).path;
  }
  if (!filePath) return null;
  const entry: CodeImplEntry = {
    file_path: filePath,
    source_section: meta.source_section ?? 'FILE_CHANGES',
  };
  if (meta.action) entry.action = meta.action;
  return entry;
}

/**
 * Shape of a malformed-edge warning surfaced inside `get_trace.warnings[]`.
 *
 * Emitted when an `implements` edge resolves to neither a `metadata.file_path`
 * nor a `FileNode.path` target. Per SPECGEN004_64 the field is REQUIRED to be
 * present and actionable — the agent needs the edge's source location to fix
 * the offending FILE_CHANGES/DESIGN row.
 */
interface ImplementsWarning {
  code: 'MALFORMED_IMPLEMENTS_EDGE';
  from: string;
  to: string;
  /**
   * Source location of the offending edge. Falls back to the source FR's file
   * + line when the edge itself carries no anchor; the FR node is always
   * reachable because the edge has a `from` pointing at it.
   */
  source: { file: string; line: number };
  message: string;
}

/**
 * Collect malformed `implements` edges originating from a node or its parent
 * FR (when the node is an AC). Mirrors the dedup/inheritance rules used by
 * `directImplements` / `computeCodeImpl` so the surfaced warnings line up with
 * what the agent would have seen as `code_impl[]` entries had they not been
 * dropped.
 */
function collectImplementsWarnings(node: Node, graph: SpecGraph): ImplementsWarning[] {
  const out: ImplementsWarning[] = [];
  const sources: string[] = [];
  if (node.type === 'FR') sources.push(node.id);
  else if (node.type === 'AC') {
    const parent = (node as AcNode).parentFr;
    if (parent) sources.push(parent);
  } else if (node.type === 'Scenario') {
    for (const tag of (node as ScenarioNode).tags) {
      const bare = tag.startsWith('@') ? tag.slice(1) : tag;
      // FR-36a: tags stay bare in .feature files; nodes are spec-qualified.
      // Resolve same-spec first, then the bare id (hand-built graphs).
      const tagged =
        (node.spec ? graph.nodes.get(`${node.spec}:${bare}`) : undefined) ?? graph.nodes.get(bare);
      if (tagged && (tagged.type === 'FR' || tagged.type === 'NFR')) sources.push(tagged.id);
    }
  }
  if (sources.length === 0) return out;
  const sourceSet = new Set(sources);
  for (const edge of graph.edges) {
    if (edge.type !== 'implements') continue;
    if (!sourceSet.has(edge.from)) continue;
    if (edgeToCodeImpl(edge, graph)) continue;
    const fromNode = graph.nodes.get(edge.from);
    out.push({
      code: 'MALFORMED_IMPLEMENTS_EDGE',
      from: edge.from,
      to: edge.to,
      source: {
        file: fromNode?.file ?? '',
        line: fromNode?.line ?? 0,
      },
      message: `implements edge ${edge.from} -> ${edge.to} is missing file_path metadata and target is not a File node`,
    });
  }
  return out;
}

interface GraphRef {
  id: string;
  type: string;
  file: string;
  line: number;
  relation: string;
  direction: 'incoming' | 'outgoing';
}

/**
 * "Find all references" over the graph's real cross-links: incoming/outgoing
 * edges plus the task→FR refs the edge set doesn't carry. This is SPEC-DOMAIN
 * reference-finding (semantic `covers` / `tested-by` / `implements` / `refs`
 * edges) — distinct from Markdown wiki-link navigation, which Marksman's native
 * LSP owns (FR-7b). Backs the `find_refs` tool.
 */
function collectGraphRefs(graph: SpecGraph, id: string): GraphRef[] {
  const seen = new Set<string>();
  const references: GraphRef[] = [];
  const add = (
    n: { id: string; type: string; file: string; line: number } | undefined,
    relation: string,
    direction: 'incoming' | 'outgoing',
  ): void => {
    if (!n || n.id === id) return;
    const key = `${n.id}|${relation}|${direction}`;
    if (seen.has(key)) return;
    seen.add(key);
    references.push({ id: n.id, type: n.type, file: n.file, line: n.line, relation, direction });
  };
  for (const e of graph.edges) {
    if (e.from === id) add(graph.nodes.get(e.to), e.type, 'outgoing');
    if (e.to === id) add(graph.nodes.get(e.from), e.type, 'incoming');
  }
  for (const n of graph.nodes.values()) {
    if (n.type === 'Task' && (n as TaskNode).refs.includes(id)) add(n, 'refs', 'incoming');
  }
  return references;
}

const MARKDOWN_LINK_RE = /^(?<doc>[^#]+\.md)#(?<slug>[^#\s]+)$/i;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^(?:```|~~~)/;

function markdownHeadingText(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function normalizeDocPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

function decodeAnchorSlug(slug: string): string {
  try {
    return decodeURIComponent(slug).toLowerCase();
  } catch {
    return slug.toLowerCase();
  }
}

function nodeHeadingSlugCandidates(node: Node): string[] {
  const title = 'title' in node && typeof node.title === 'string' ? node.title : '';
  if (!title) return [];
  const localId = node.spec && node.id.startsWith(`${node.spec}:`) ? node.id.slice(node.spec.length + 1) : node.id;
  return [title, `${localId}: ${title}`, `${localId} ${title}`].map((heading) => marksmanSlug(heading));
}

function markdownLinkLocation(graph: SpecGraph, anchor: string, spec?: string): NodeLocation | null {
  const m = anchor.match(MARKDOWN_LINK_RE);
  if (!m?.groups) return null;
  const targetDoc = normalizeDocPath(m.groups.doc);
  const targetSlug = decodeAnchorSlug(m.groups.slug);
  const files = new Set<string>();
  if (targetDoc.startsWith('.specs/')) files.add(targetDoc);
  if (fs.existsSync(path.resolve(process.cwd(), targetDoc))) files.add(targetDoc);
  if (spec) files.add(normalizeDocPath(`.specs/${spec}/${targetDoc}`));
  for (const node of graph.nodes.values()) {
    const file = normalizeDocPath(node.file);
    if (spec) {
      if (file === normalizeDocPath(`.specs/${spec}/${targetDoc}`)) files.add(file);
    } else if (file === targetDoc || file.endsWith(`/${targetDoc}`)) {
      files.add(file);
    }
  }

  for (const file of Array.from(files).sort()) {
    for (const node of graph.nodes.values()) {
      if (normalizeDocPath(node.file) !== file) continue;
      if (nodeHeadingSlugCandidates(node).includes(targetSlug)) return { file: node.file, line: node.line };
    }

    const abs = path.resolve(process.cwd(), file);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const lines = fs.readFileSync(abs, 'utf-8').split(/\r?\n/);
    let inFence = false;
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i];
      if (FENCE_RE.test(raw)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const hm = raw.match(HEADING_RE);
      if (!hm) continue;
      if (marksmanSlug(markdownHeadingText(hm[2])) === targetSlug) return { file, line: i + 1 };
    }
  }
  return null;
}

export interface RegistryOptions {
  /** Repository root used for disk-backed status evidence. Defaults to process.cwd(). */
  repoRoot?: string;
  /**
   * FR-40c graph freshness after a mutation. Inside the running MCP server the
   * FR-14 watcher patches the graph on the disk write — leave unset there.
   * Watcher-less embedders (tests, one-shot scripts) pass an explicit rebuild.
   */
  refreshGraph?: () => void;
  /**
   * P21-1 multi-session door: when this returns a holder record the server
   * booted READ-ONLY (another live session owns the write-lock). The three
   * write tools (apply_spec_change / delete_spec_doc / create_spec) then refuse
   * with `WRITE_LOCK_HELD`; reads + the `propose_spec_change` dry-run stay live.
   * Unset (or returning null) = this session owns the lock → writes proceed.
   */
  writeLockHeldBy?: () => { pid: number; env: string; started_at: string } | null;
}

export function buildToolRegistry(
  getGraph: () => SpecGraph,
  registryOpts: RegistryOptions = {},
): ToolDefinition<z.ZodRawShape>[] {
  const tools: ToolDefinition<z.ZodRawShape>[] = [];

  // P21-1: when the door is read-only (a sibling session owns the write-lock),
  // every write tool short-circuits here with the holder named. Returns null
  // when writable, so a write handler does `const ro = readOnlyRefusal(...); if
  // (ro) return ro;` as its first line.
  // E-A (FR-8..FR-13, 2026-06-18): the lifetime write-exclusivity is GONE — every session's
  // door can write, serialized per-mutation by the short `withWriteLock` (lock-manager.ts) +
  // the existing optimistic CAS for same-doc conflicts. This refusal is now a NO-OP kept only
  // so the call sites stay structurally identical (returns null → writes proceed). WRITE_LOCK_HELD
  // (lifetime) is replaced by a transient WRITE_LOCK_BUSY raised only DURING another session's
  // in-flight write. (Set TEST_QUALITY... no — controlled solely by the lock now.)
  const readOnlyRefusal = (_tool: string, _args: unknown): ToolResult | null => null;

  // ─── 1) get_trace ───────────────────────────────────────────────────────
  tools.push({
    name: 'get_trace',
    description:
      'Get the full requirement trace for a node id: AC + Scenarios + Tasks + ' +
      'code_impl[] (implements edges per FR-30) + related nodes + a ≤500-char ' +
      'natural-language summary for the agent.',
    inputShape: {
      node_id: z.string(),
      spec: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ node_id, spec }) => {
      const graph = getGraph();
      // FR-36d: slug:id / {spec, node_id} / bare-unique resolve; bare-colliding → candidates.
      const { node, candidates } = resolveNodeRef(graph, node_id as string, spec as string | undefined);
      if (candidates) return ambiguousBareId(node_id as string, candidates);
      if (!node) {
        return asJsonResult({
          ok: false,
          error: 'NODE_NOT_FOUND',
          node_id,
          hint: `No node with id ${node_id}. Try /tools/list_specs to enumerate.`,
        });
      }
      const acs: AcNode[] = [];
      const decisions: DecisionNode[] = [];
      const stories: StoryNode[] = [];
      const scenarios: ScenarioNode[] = [];
      const tasks: TaskNode[] = [];
      const related: Array<{ id: string; type: string; relation: string }> = [];

      for (const edge of graph.edges) {
        if (edge.from === node.id) {
          const to = graph.nodes.get(edge.to);
          if (!to) continue;
          if (edge.type === 'covers' && to.type === 'AC') acs.push(to as AcNode);
          else if (edge.type === 'covers' && to.type === 'Decision') decisions.push(to as DecisionNode);
          else if (edge.type === 'covers' && to.type === 'Story') stories.push(to as StoryNode);
          else if (edge.type === 'tested-by' && to.type === 'Scenario') {
            scenarios.push(to as ScenarioNode);
          } else related.push({ id: to.id, type: to.type, relation: edge.type });
        }
        if (edge.to === node.id) {
          const from = graph.nodes.get(edge.from);
          if (!from) continue;
          if (edge.type === 'covers' && from.type === 'FR') related.push({ id: from.id, type: from.type, relation: 'covered-by' });
          // #181: incoming semantic edges — scenarios that VERIFY this requirement
          // (evidence direction) and decisions that ENTITLE it (justification). Keep the
          // raw edge type as the relation (as the outgoing branch does), so trace output
          // surfaces `verifies`/`entitles` verbatim; direction is read from node types.
          else if (edge.type === 'verifies' || edge.type === 'entitles') related.push({ id: from.id, type: from.type, relation: edge.type });
        }
      }
      // FR-36c (P13-2): the FR→Scenario `tested-by` edges ARE built now — the
      // gherkin parser emits a real same-spec edge for both `@FR-N` and
      // `@featureN` tags, so the edge loop above already collected the
      // scenarios. The old tag-scan workaround (iterate every Scenario node,
      // match `@feature${N}` + same-spec file prefix) is removed: get_trace
      // answers via REAL edges (SPECGEN004_92).
      for (const n of graph.nodes.values()) {
        if (n.type !== 'Task') continue;
        const t = n as TaskNode;
        if (t.refs.includes(node.id)) tasks.push(t);
      }

      const explanation =
        node.type === 'FR'
          ? summariseFrTrace(node as FrNode, acs, scenarios, tasks)
          : `${node.id} (${node.type}) at ${node.file}:${node.line}`;

      const warnings = collectImplementsWarnings(node, graph);
      // FR-32: derive verified_status for this node from the latest run — never
      // reports DONE while a linked scenario is pending/undefined/ambiguous.
      const { scens, bucketById } = scenarioCoverageIndex(graph);
      const verified_status = verifiedStatus(
        linkedScenarioIds(node, scens, scenarios.map((s) => s.id)),
        bucketById,
        undefined,
        (id) => {
          const scen = scens.find((s) => s.id === id);
          return isLiveAttestedScenario(scen?.tags);
        },
      );
      return asJsonResult({
        ok: true,
        node: { id: node.id, type: node.type, file: node.file, line: node.line, verified_status },
        acceptance_criteria: acs.map((a) => ({ id: a.id, file: a.file, line: a.line })),
        // FR-47c: the design leg — Decisions covering this FR (real `covers` edges built
        // from explicit `**Требование:**` lines), so the trace web is navigable FR→design.
        design_decisions: decisions.map((d) => ({ id: d.id, file: d.file, line: d.line, parentFr: d.parentFr })),
        // FR-47: the story leg — user Stories motivating this FR (real `covers` edges).
        user_stories: stories.map((s) => ({ id: s.id, file: s.file, line: s.line, parentFr: s.parentFr })),
        scenarios: scenarios.map((s) => ({
          id: s.id,
          file: s.file,
          line: s.line,
          tags: s.tags,
          lastResult: s.lastResult ?? 'UNKNOWN',
          failingStep: s.failingStep ?? null,
          // FR-30/SPECGEN004_19: per-scenario code_impl so step-binding refs
          // (e.g. Reqnroll C# .cs files) surface in the FR's trace tree. Uses
          // the same computeCodeImpl — additive field, node-level code_impl
          // (and FR aggregation for _60-_64) is unchanged.
          code_impl: computeCodeImpl(s, graph),
          runtime_trace: scenarioTracePayload(process.cwd(), s),
        })),
        // FR-46d / FR-52e: surface the task's OWN scenario (the explicit scenario id it cites
        // in Done-When, e.g. SPECGEN004_NN / TESTQUAL001_NN) + its last result, so task↔own-
        // scenario traceability is visible, not just task→FR.
        tasks: tasks.map((t) => {
          const ownKey = scenarioKey(t.doneWhen ?? '');
          let own_scenario: { id: string; lastResult: string } | null = null;
          if (ownKey) {
            const sc = [...graph.nodes.values()].find((n) => n.type === 'Scenario' && scenarioKey(n.id) === ownKey) as ScenarioNode | undefined;
            own_scenario = sc
              ? { id: sc.id, lastResult: sc.lastResult ?? 'UNKNOWN' }
              : { id: ownKey.toUpperCase(), lastResult: 'NOT_FOUND' };
          }
          return { id: t.id, status: t.status, file: t.file, line: t.line, own_scenario };
        }),
        code_impl: computeCodeImpl(node, graph),
        warnings,
        related_nodes: related,
        explanation_for_agent: explanation,
      });
    },
  });

  // ─── 2) find_by_tags ────────────────────────────────────────────────────
  tools.push({
    name: 'find_by_tags',
    description: 'List all Scenarios whose tag set contains every supplied tag (AND semantics).',
    inputShape: { tags: z.array(z.string()).min(1) } as const satisfies z.ZodRawShape,
    handler: async ({ tags }) => {
      const required = new Set((tags as string[]).map((t) => t.startsWith('@') ? t : `@${t}`));
      const out: Array<{ id: string; file: string; line: number; tags: string[] }> = [];
      for (const node of getGraph().nodes.values()) {
        if (node.type !== 'Scenario') continue;
        const s = node as ScenarioNode;
        const have = new Set(s.tags);
        let ok = true;
        for (const r of required) if (!have.has(r)) { ok = false; break; }
        if (ok) out.push({ id: s.id, file: s.file, line: s.line, tags: s.tags });
      }
      return asJsonResult({ ok: true, scenarios: out, count: out.length });
    },
  });

  // ─── 3) conformance_check ───────────────────────────────────────────────
  tools.push({
    name: 'conformance_check',
    description:
      'Run the Phase-1 conformance ruleset over the in-memory graph and ' +
      'return Finding[] (UNCOVERED_FR / ORPHAN_TASK / SCENARIO_TAG_ORPHAN / UNTAGGED_SCENARIO).',
    inputShape: {
      scope: z.array(z.string()).optional(),
      severity: z.enum(['error', 'warning', 'info']).optional(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const scope = (args as { scope?: string[] }).scope;
      const severity = (args as { severity?: 'error' | 'warning' | 'info' }).severity;
      let findings: Finding[] = checkConformance(getGraph());
      if (scope?.length) {
        const ids = new Set(scope);
        findings = findings.filter((f) => (f.nodeId && ids.has(f.nodeId)) || (f.relatedId && ids.has(f.relatedId)));
      }
      if (severity) findings = findings.filter((f) => f.severity === severity);
      return asJsonResult({ ok: true, findings, count: findings.length });
    },
  });

  // ─── 4) search ──────────────────────────────────────────────────────────
  tools.push({
    name: 'search',
    description:
      'Bounded substring match across node ids and titles (case-insensitive), returning file:line per hit. ' +
      'Pass spec to scope one spec. Results use stable id ordering and cursor pagination with total/returned/truncated/next_cursor, so "all" is mechanically provable. ' +
      'Pass coverage:true to also get the `tested-by` Scenario edges + a `covered` flag per result.',
    inputShape: {
      query: z.string().min(1),
      spec: z.string().optional(),
      types: z.array(z.string()).optional(),
      limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
      cursor: z.string().optional(),
      coverage: z.boolean().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const graph = getGraph();
      const q = (args.query as string).toLowerCase();
      const spec = (args as { spec?: string }).spec;
      const limit = (args as { limit?: number }).limit ?? DEFAULT_PAGE_LIMIT;
      const cursor = (args as { cursor?: string }).cursor;
      const types = new Set((args as { types?: string[] }).types ?? []);
      const wantCoverage = (args as { coverage?: boolean }).coverage === true;
      // coverage: index node.id → tested-by Scenario ids ONCE (additive; only when requested).
      const testedBy = new Map<string, string[]>();
      if (wantCoverage) {
        for (const e of graph.edges) {
          if (e.type !== 'tested-by') continue;
          if (graph.nodes.get(e.to)?.type !== 'Scenario') continue;
          const arr = testedBy.get(e.from);
          if (arr) arr.push(e.to);
          else testedBy.set(e.from, [e.to]);
        }
      }
      const out: Array<{ id: string; type: string; file: string; line: number; title?: string; tested_by?: string[]; covered?: boolean }> = [];
      for (const node of graph.nodes.values()) {
        if (spec && (node.spec ?? specOf(node.file)) !== spec) continue;
        if (types.size > 0 && !types.has(node.type)) continue;
        const titleField = (node as Node & { title?: string }).title;
        const hay = `${node.id} ${titleField ?? ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
        const rec: { id: string; type: string; file: string; line: number; title?: string; tested_by?: string[]; covered?: boolean } =
          { id: node.id, type: node.type, file: node.file, line: node.line, title: titleField };
        if (wantCoverage) {
          const ids = testedBy.get(node.id) ?? [];
          rec.tested_by = [...ids].sort();
          rec.covered = ids.length > 0;
        }
        out.push(rec);
      }
      out.sort((a, b) => a.id.localeCompare(b.id));
      const page = pageResult(out, cursor, limit);
      return asJsonResult({ ...page, count: page.returned, spec: spec ?? null, query: args.query });
    },
  });

  // ─── 5) get_node ────────────────────────────────────────────────────────
  tools.push({
    name: 'get_node',
    description:
      'Raw node lookup by canonical id — accepts `slug:FR-2`, `{spec, node_id}`, ' +
      'or a bare id (unique → resolved; colliding → candidate list, FR-36d).',
    inputShape: {
      node_id: z.string(),
      spec: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ node_id, spec }) => {
      const { node, candidates } = resolveNodeRef(getGraph(), node_id as string, spec as string | undefined);
      if (candidates) return ambiguousBareId(node_id as string, candidates);
      if (!node) return asJsonResult({ ok: false, error: 'NODE_NOT_FOUND', node_id });
      return asJsonResult({ ok: true, node });
    },
  });

  // ─── FR-66 requirement metadata reads/validation ───────────────────────
  tools.push({
    name: 'validate_requirement_metadata',
    description: 'Validate typed FR/NFR metadata with the same schema used by parsing and migration.',
    inputShape: { metadata: z.record(z.string(), z.unknown()) } as const satisfies z.ZodRawShape,
    handler: async ({ metadata }) => asJsonResult({ ok: true, ...validateRequirementMetadata(metadata) }),
  });

  tools.push({
    name: 'policy_query_requirements',
    description: 'Query requirement nodes by typed verification method, safety class, missing method, and delivery state.',
    inputShape: {
      spec: z.string().optional(),
      verification_method: z.enum(['test', 'analysis', 'review', 'inspection', 'demonstration']).optional(),
      safety_class: z.enum(['critical', 'major', 'minor']).optional(),
      verification_method_missing: z.boolean().optional(),
      delivery: z.enum(['NOT_DECLARED', 'DELIVERED', 'INCOMPLETE']).optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ spec, verification_method, safety_class, verification_method_missing, delivery }) => {
      const graph = getGraph();
      const results = [...graph.nodes.values()].filter((node): node is FrNode | NfrNode => node.type === 'FR' || node.type === 'NFR')
        .filter((node) => !spec || node.spec === spec)
        .map((node) => ({ node, delivery: evaluateDelivery(node, graph) }))
        .filter(({ node, delivery: state }) => !verification_method || node.metadata?.verificationMethod === verification_method)
        .filter(({ node }) => !safety_class || node.metadata?.safetyClass === safety_class)
        .filter(({ node }) => !verification_method_missing || !node.metadata?.verificationMethod)
        .filter(({ delivery: state }) => !delivery || state.overall === delivery)
        .map(({ node, delivery: state }) => ({ id: node.id, file: node.file, line: node.line, metadata: node.metadata ?? null, delivery: state }));
      return asJsonResult({ ok: true, results, count: results.length });
    },
  });

  tools.push({
    name: 'set_requirement_metadata',
    description: 'Validate and render a canonical FR-local metadata block for use in an MCP spec transaction; never writes invalid metadata.',
    inputShape: { node_id: z.string(), metadata: z.record(z.string(), z.unknown()) } as const satisfies z.ZodRawShape,
    handler: async ({ node_id, metadata }) => {
      const resolved = resolveNodeRef(getGraph(), node_id as string);
      if (resolved.candidates) return ambiguousBareId(node_id as string, resolved.candidates);
      if (!resolved.node || (resolved.node.type !== 'FR' && resolved.node.type !== 'NFR')) return asJsonResult({ ok: false, error: 'REQUIREMENT_NOT_FOUND', node_id });
      const checked = validateRequirementMetadata(metadata);
      if (!checked.metadata) return asJsonResult({ ok: false, error: 'FR_METADATA_INVALID', findings: checked.issues });
      return asJsonResult({ ok: true, node_id: resolved.node.id, local_id: localIdOf(resolved.node.id), metadata: checked.metadata, yaml: renderRequirementMetadata(checked.metadata), hint: 'Apply this rendered block through apply_spec_change/apply_spec_transaction with CAS.' });
    },
  });

  // ─── 6) bounded task inventory (FR-82) ─────────────────────────────────
  const taskStatuses = ['todo', 'ready', 'in-progress', 'done', 'blocked'] as const;
  const listTasks = (
    spec: string,
    statuses: readonly string[] | undefined,
    phase: string | undefined,
    requirement: string | undefined,
    includeComments: boolean,
    cursor: string | undefined,
    limit: number,
  ): ReturnType<typeof pageResult<Record<string, unknown>>> => {
    const wantedStatuses = new Set(statuses ?? ['todo', 'ready', 'in-progress', 'blocked']);
    const wantedRequirement = requirement ? localRef(requirement).toLowerCase() : null;
    const tasks = [...getGraph().nodes.values()]
      .filter((node): node is TaskNode => node.type === 'Task')
      .filter((task) => taskSpec(task) === spec)
      .filter((task) => wantedStatuses.has(task.status))
      .filter((task) => !phase || task.phase === phase)
      .filter((task) => !wantedRequirement || task.refs.some((ref) => localRef(ref).toLowerCase() === wantedRequirement))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((task) => taskInventoryEntry(task, includeComments));
    return pageResult(tasks, cursor, limit);
  };

  tools.push({
    name: 'list_tasks',
    description:
      'List tasks for ONE spec without reading TASKS.md. By default returns every non-terminal task (todo/ready/in-progress/blocked). ' +
      'Optional filters: statuses, exact canonical phase, requirement. include_comments exposes only explicitly authored comment/rationale/blocker fields. ' +
      'Stable cursor pagination returns total/returned/truncated/next_cursor; no silent cap.',
    inputShape: {
      spec: z.string().min(1),
      statuses: z.array(z.enum(taskStatuses)).optional(),
      phase: z.string().optional(),
      requirement: z.string().optional(),
      include_comments: z.boolean().optional(),
      limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
      cursor: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ spec, statuses, phase, requirement, include_comments, limit, cursor }) => {
      const result = listTasks(
        String(spec),
        statuses as string[] | undefined,
        phase ? String(phase) : undefined,
        requirement ? String(requirement) : undefined,
        include_comments === true,
        cursor ? String(cursor) : undefined,
        Number(limit ?? DEFAULT_PAGE_LIMIT),
      );
      return asJsonResult({ ...result, spec, filters: { statuses: statuses ?? taskStatuses.filter((status) => status !== 'done'), phase: phase ?? null, requirement: requirement ?? null } });
    },
  });

  tools.push({
    name: 'list_phase_tasks',
    description:
      'List tasks under an exact canonical phase in ONE spec. Task phases are produced by the live TASKS.md parser. ' +
      'Returns PHASE_NOT_FOUND with nearest/existing phases when the phase does not exist, EMPTY_PHASE when it exists but filters match no tasks, ' +
      'or stable bounded pagination with total/returned/truncated/next_cursor.',
    inputShape: {
      spec: z.string().min(1),
      phase: z.string().min(1),
      statuses: z.array(z.enum(taskStatuses)).optional(),
      include_comments: z.boolean().optional(),
      limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
      cursor: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ spec, phase, statuses, include_comments, limit, cursor }) => {
      const slug = String(spec);
      const target = String(phase);
      const phases = [...new Set([...getGraph().nodes.values()]
        .filter((node): node is TaskNode => node.type === 'Task' && taskSpec(node) === slug)
        .map((task) => task.phase)
        .filter((value): value is string => Boolean(value)))]
        .sort();
      if (!phases.includes(target)) {
        const targetSlug = slugifyHeading(target);
        const candidates = [...phases]
          .sort((a, b) => {
            const aStarts = slugifyHeading(a).startsWith(targetSlug) || targetSlug.startsWith(slugifyHeading(a)) ? 0 : 1;
            const bStarts = slugifyHeading(b).startsWith(targetSlug) || targetSlug.startsWith(slugifyHeading(b)) ? 0 : 1;
            return aStarts - bStarts || a.localeCompare(b);
          })
          .slice(0, 5);
        return asJsonResult({ ok: false, error: 'PHASE_NOT_FOUND', spec: slug, phase: target, candidates, phases });
      }
      const result = listTasks(
        slug,
        statuses as string[] | undefined,
        target,
        undefined,
        include_comments === true,
        cursor ? String(cursor) : undefined,
        Number(limit ?? DEFAULT_PAGE_LIMIT),
      );
      if (result.ok && result.total === 0) {
        return asJsonResult({ ...result, ok: true, state: 'EMPTY_PHASE', spec: slug, phase: target, phases });
      }
      return asJsonResult({ ...result, state: 'POPULATED', spec: slug, phase: target, phases });
    },
  });

  // ─── 7) get_test_result ─────────────────────────────────────────────────
  tools.push({
    name: 'get_test_result',
    description: 'Return the last-result fields for a Scenario id.',
    inputShape: {
      scenario_id: z.string(),
      spec: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ scenario_id, spec }) => {
      const { node, candidates } = resolveNodeRef(getGraph(), scenario_id as string, spec as string | undefined);
      if (candidates) return ambiguousBareId(scenario_id as string, candidates);
      if (!node || node.type !== 'Scenario') {
        return asJsonResult({ ok: false, error: 'SCENARIO_NOT_FOUND', scenario_id });
      }
      const s = node as ScenarioNode;
      return asJsonResult({
        ok: true,
        scenario_id: s.id,
        lastResult: s.lastResult ?? 'UNKNOWN',
        lastRunAt: s.lastRunAt ?? null,
        stale: s.resultStale === true,
        durationMs: s.durationMs ?? null,
        failingStep: s.failingStep ?? null,
        runtime_trace: scenarioTracePayload(process.cwd(), s),
      });
    },
  });

  // ─── 7b) get_scenario_trace — FR-56 runtime detail ───────────────────────
  tools.push({
    name: 'get_scenario_trace',
    description:
      'FR-56e: return one Scenario result plus runtime trace detail: latest result, ' +
      'run_id/time/source, trace chunk path, and the failing step/error when the ' +
      'scenario failed or its last pass is stale. Missing rotated chunks degrade ' +
      'gracefully with trace_status:"expired".',
    inputShape: {
      scenario_id: z.string(),
      spec: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ scenario_id, spec }) => {
      const graph = getGraph();
      const { node, candidates } = resolveScenarioRef(graph, scenario_id as string, spec as string | undefined);
      if (candidates) return ambiguousBareId(scenario_id as string, candidates);
      if (!node) return asJsonResult({ ok: false, error: 'SCENARIO_NOT_FOUND', scenario_id });
      return asJsonResult({ ok: true, ...scenarioTracePayload(process.cwd(), node) });
    },
  });

  // ─── 8) find_orphans ────────────────────────────────────────────────────
  tools.push({
    name: 'find_orphans',
    description:
      'Return only orphan-class findings (UNCOVERED_FR / ORPHAN_TASK / ' +
      'SCENARIO_TAG_ORPHAN) — a focused subset of conformance_check.',
    inputShape: {} as const satisfies z.ZodRawShape,
    handler: async () => {
      const orphanCodes = new Set(['UNCOVERED_FR', 'ORPHAN_TASK', 'SCENARIO_TAG_ORPHAN']);
      const findings = checkConformance(getGraph()).filter((f) => orphanCodes.has(f.code));
      return asJsonResult({ ok: true, findings, count: findings.length });
    },
  });

  // get_coverage_summary + get_coverage MERGED into get_spec_status (view:'counts' /
  // view:'coverage') — see tool #13 below. Consolidation 2026-06-28: one "how is the spec
  // doing" tool with a `view` selector instead of three confusable tools (was 26 → now 24).

  // ─── 10) validate_anchor ────────────────────────────────────────────────
  tools.push({
    name: 'validate_anchor',
    description:
      'Validate two distinct anchor domains. Bare input (for example "FR-1" or ' +
      '"fr-1-login-flow") checks the spec-graph compact-id/alias registry. ' +
      'Markdown link input "DOC.md#heading-slug" checks a Marksman heading slug ' +
      'by recomputing slugs with the shared marksmanSlug implementation; this is ' +
      'file-scoped Markdown navigation, not a compact-id alias lookup.',
    inputShape: { anchor: z.string(), spec: z.string().optional() } as const satisfies z.ZodRawShape,
    handler: async ({ anchor, spec }) => {
      const anchorText = String(anchor);
      const markdownLocation = markdownLinkLocation(getGraph(), anchorText, spec ? String(spec) : undefined);
      if (markdownLocation) {
        return asJsonResult({
          ok: true,
          anchor: anchorText,
          registered: true,
          kind: 'marksman-heading-slug',
          location: markdownLocation,
        });
      }
      if (MARKDOWN_LINK_RE.test(anchorText)) {
        return asJsonResult({
          ok: false,
          anchor: anchorText,
          registered: false,
          kind: 'marksman-heading-slug',
        });
      }
      const def = getGraph().definitions.get(anchorText);
      if (!def) return asJsonResult({ ok: false, anchor: anchorText, registered: false, kind: 'spec-graph-alias' });
      return asJsonResult({ ok: true, anchor: anchorText, registered: true, kind: 'spec-graph-alias', location: def });
    },
  });

  // ─── 11) list_specs ─────────────────────────────────────────────────────
  tools.push({
    name: 'list_specs',
    description: 'Enumerate `.specs/<slug>/` specs present in the current graph (slug = FULL nested dir path, e.g. `backlog/honest-status-command`).',
    inputShape: {} as const satisfies z.ZodRawShape,
    handler: async () => {
      const specs = new Set<string>();
      for (const node of getGraph().nodes.values()) {
        // FR-36 slug = full dir path under .specs/ (specOf), NOT the first segment —
        // the old `/^\.specs\/([^/]+)\//` collapsed `backlog/<name>` → `backlog`, so
        // every nested backlog spec was invisible to the inventory (2026-06-08 audit).
        // Exclude artifact/fixture subdirs (a .feature under _artifact/ is NOT a spec).
        const s = specOf(node.file);
        if (s && !/(^|\/)(_artifact|_fixtures|attachments|\.architecture-research)(\/|$)/.test(s)) specs.add(s);
      }
      return asJsonResult({ ok: true, specs: Array.from(specs).sort() });
    },
  });

  // ─── 12) find_refs — spec-domain graph reference-finder (FR-7b) ──────────
  // "Find all references" over the graph's SEMANTIC cross-links: incoming /
  // outgoing edges (covers / tested-by / implements …) plus the task→FR refs the
  // edge set doesn't carry. This is the spec-DOMAIN surface the Markdown LSP has
  // no concept of (an LSP knows text wiki-links, not `tested-by` semantics).
  // Markdown wiki-link navigation itself is owned by Marksman's native LSP
  // (`.lsp.json`), exposed via Claude Code's `LSP` tool — NOT reimplemented here.
  tools.push({
    name: 'find_refs',
    description:
      'Find every spec-domain reference to a node id across the graph: ' +
      'incoming/outgoing semantic edges (covers/tested-by/implements) plus task ' +
      'refs. (Markdown wiki-link nav is the native LSP tool’s job, not this.)',
    inputShape: {
      node_id: z.string(),
      spec: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ node_id, spec }) => {
      const graph = getGraph();
      // FR-36d: refs are collected for the RESOLVED composite id — a bare id
      // that collides must list candidates, not merge unrelated specs' refs.
      const { node, candidates } = resolveNodeRef(graph, node_id as string, spec as string | undefined);
      if (candidates) return ambiguousBareId(node_id as string, candidates);
      // A non-existent id must be NODE_NOT_FOUND (like get_trace/get_node/get_test_result),
      // NOT ok:true with empty refs — that fake-positive reads as "nothing references this"
      // when the truth is "this id does not exist" (2026-06-08 audit).
      if (!node) return asJsonResult({ ok: false, error: 'NODE_NOT_FOUND', node_id: node_id as string });
      const references = collectGraphRefs(graph, node.id);
      return asJsonResult({ ok: true, node_id: node.id, references, count: references.length });
    },
  });

  // ─── 13) get_spec_status — full lifecycle of ONE spec + linked run (FR-38) ─
  tools.push({
    name: 'get_spec_status',
    description:
      'How is a spec doing — ONE tool, three VIEWS (merged: was get_spec_status + get_coverage + ' +
      'get_coverage_summary). `view`: ' +
      '"status" (default, needs `spec`) → lifecycle SPEC_ONLY/TESTS_NOT_RUN/RED/PARTIAL/GREEN ' +
      '+ last-run summary + node counts + FR-37b gaps + phases + hint (FR-38). ' +
      '"summary" (needs `spec`) → compact lifecycle/count/gap summary for bounded inventory; no per-task or per-scenario payload. ' +
      '"counts" → structural FR/AC/Scenario/Task tallies: with `spec` that one spec, without `spec` ' +
      'the per-spec table across the corpus. ' +
      '"coverage" → FR-32 honesty rollup: per-scenario buckets (passed/pending/undefined/…) + ' +
      'per-task verified_status (DONE only when EVERY mapped scenario is green); `spec` scopes, ' +
      'omit for whole-corpus (every spec not in the last run shows not_run — usually pass `spec`).',
    inputShape: {
      spec: z.string().optional(),
      view: z.enum(['status', 'summary', 'counts', 'coverage']).optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ spec, view }) => {
      const v = (view as 'status' | 'summary' | 'counts' | 'coverage' | undefined) ?? 'status';
      if (v !== 'summary') registryOpts.refreshGraph?.();
      const graph = getGraph();
      const repoRoot = registryOpts.repoRoot ?? process.cwd();
      const executionGaps = (
        scopeSpec: string | undefined,
        scenarios: ScenarioLike[],
        buckets: Record<Bucket, string[]>,
      ): {
        SCENARIO_NOT_RUN: number;
        scenario_ids: string[];
        LIVE_EVIDENCE_AWAITING: number;
        live_scenario_ids: string[];
        HISTORICAL_RETIRED: number;
        retired_scenario_ids: string[];
        FR_NOT_EXECUTION_VERIFIED: number;
        fr_ids: string[];
      } => {
        const scenarioBucket = new Map<string, Bucket>();
        for (const [bucket, ids] of Object.entries(buckets) as Array<[Bucket, string[]]>) {
          for (const id of ids) scenarioBucket.set(id, bucket);
        }
        // Execution-ownership scope (FR-81a): retired-historical scenarios are
        // not_run BY DESIGN (successor owns execution) and external-live ones
        // are closed by the live producer — only ACTIVE not-run is canonical
        // execution debt. Fail-closed: @historical without a proven successor
        // stays active debt.
        const knownSpecs = new Set<string>();
        for (const node of graph.nodes.values()) {
          if (node.spec) knownSpecs.add(node.spec);
        }
        const scenarioScope = new Map(
          scenarios.map((s) => [s.id, classifyScenarioScope(s.tags ?? [], { knownSpecs }).scope]),
        );
        const activeNotRun = buckets.not_run.filter((id) => {
          const scope = scenarioScope.get(id) ?? 'active';
          return scope === 'active' || scope === 'historical-unproven';
        });
        const liveNotRun = buckets.not_run.filter((id) => scenarioScope.get(id) === 'external-live');
        const retiredNotRun = buckets.not_run.filter((id) => scenarioScope.get(id) === 'historical-retired');
        const scenarioIds = new Set(scenarios.map((s) => s.id));
        const frToScenarios = new Map<string, string[]>();
        for (const e of graph.edges) {
          if (e.type !== 'tested-by') continue;
          const fr = graph.nodes.get(e.from);
          if (!fr || fr.type !== 'FR') continue;
          if (scopeSpec && specOf(fr.file) !== scopeSpec) continue;
          if (!scenarioIds.has(e.to)) continue;
          const arr = frToScenarios.get(e.from) ?? [];
          arr.push(e.to);
          frToScenarios.set(e.from, arr);
        }
        const frIds = [...frToScenarios.entries()]
          .filter(([, ids]) => ids.length > 0
            && !ids.every((id) => scenarioBucket.get(id) === 'passed')
            // FRs whose scenarios are ALL retired or ALL live are owned by the
            // successor spec / the live lane — not canonical execution debt.
            && !ids.every((id) => {
              const scope = scenarioScope.get(id) ?? 'active';
              return scope === 'historical-retired' || scope === 'external-live';
            }))
          .map(([fr]) => fr)
          .sort();
        return {
          SCENARIO_NOT_RUN: activeNotRun.length,
          scenario_ids: activeNotRun,
          LIVE_EVIDENCE_AWAITING: liveNotRun.length,
          live_scenario_ids: liveNotRun,
          HISTORICAL_RETIRED: retiredNotRun.length,
          retired_scenario_ids: retiredNotRun,
          FR_NOT_EXECUTION_VERIFIED: frIds.length,
          fr_ids: frIds,
        };
      };

      // view 'counts' — structural atom tallies (folds in former get_coverage_summary).
      // `spec` → that one spec; no `spec` → the per-spec table across the corpus.
      if (v === 'counts') {
        if (typeof spec === 'string' && spec.length > 0) {
          const c = { fr: 0, ac: 0, scenario: 0, task: 0 };
          for (const node of graph.nodes.values()) {
            if (specOf((node as { file: string }).file) !== spec) continue;
            if (node.type === 'FR') c.fr++;
            else if (node.type === 'AC') c.ac++;
            else if (node.type === 'Scenario') c.scenario++;
            else if (node.type === 'Task') c.task++;
          }
          return asJsonResult({ ok: true, view: 'counts', spec, ...c });
        }
        const bySpec = new Map<string, { fr: number; ac: number; scenario: number; task: number }>();
        for (const node of graph.nodes.values()) {
          const sp = specOf((node as { file: string }).file) ?? '(other)';
          const row = bySpec.get(sp) ?? { fr: 0, ac: 0, scenario: 0, task: 0 };
          if (node.type === 'FR') row.fr++;
          else if (node.type === 'AC') row.ac++;
          else if (node.type === 'Scenario') row.scenario++;
          else if (node.type === 'Task') row.task++;
          bySpec.set(sp, row);
        }
        return asJsonResult({
          ok: true,
          view: 'counts',
          specs: Array.from(bySpec.entries())
            .map(([sp, counts]) => ({ spec: sp, ...counts }))
            .sort((a, b) => a.spec.localeCompare(b.spec)),
        });
      }

      // view 'coverage' — FR-32 honesty rollup (folds in former get_coverage). The inner shape
      // (…computeCoverage + spec + scope) is unchanged; only a `view` discriminator is added
      // (additive, non-breaking) since agents read this payload across the repo.
      if (v === 'coverage') {
        const scenarios: ScenarioLike[] = [];
        const tasks: TaskLike[] = [];
        for (const node of graph.nodes.values()) {
          const nodeSpec = specOf((node as { file: string }).file);
          if (spec && nodeSpec !== spec) continue; // FR-32 scoping: per-spec when asked
          if (node.type === 'Scenario') {
            const s = node as ScenarioNode;
            scenarios.push({ id: s.id, tags: s.tags, result: s.lastResult, stale: s.resultStale, spec: nodeSpec, source: s.trace?.source, canonicalResult: s.canonicalResult, canonicalRunAt: s.canonicalRunAt });
          } else if (node.type === 'Task') {
            const t = node as TaskNode;
            tasks.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: nodeSpec, status: t.status });
          }
        }
        // FR-35a: per-task test-quality side-channel — a DONE task with a WEAK /
        // FAKE-POSITIVE-RISK test reads IN_PROGRESS here too (absent file → {}).
        const testQualityByTask = readVerdicts(repoRoot);
        const coverage = computeCoverage(tasks, scenarios, testQualityByTask);
        const canonicalScenarios = scenarios.map((scenario) => ({
          ...scenario,
          result: scenario.canonicalResult,
          stale: false,
          source: scenario.canonicalResult ? 'canonical-full-run' : undefined,
        }));
        const canonicalCoverage = computeCoverage(tasks, canonicalScenarios, testQualityByTask);
        return asJsonResult({
          ok: true,
          view: 'coverage',
          spec: spec ?? null,
          scope: spec ? 'spec' : 'corpus',
          ...coverage,
          canonical_coverage: {
            buckets: canonicalCoverage.buckets,
            totals: canonicalCoverage.totals,
            task_verification: canonicalCoverage.tasks,
          },
          execution_gaps: executionGaps(spec, canonicalScenarios, canonicalCoverage.buckets),
          filtered_proof: spec
            ? latestFilteredProof(repoRoot, [...graph.nodes.values()]
                .filter((node): node is ScenarioNode => node.type === 'Scenario' && specOf(node.file) === spec)
                .map((node) => node as ScenarioLite)).latest
            : null,
        });
      }

      // view 'status' (default) — per-spec lifecycle (FR-38). Requires a spec.
      if (typeof spec !== 'string' || spec.length === 0) {
        return asJsonResult({
          ok: false,
          error: 'SPEC_REQUIRED',
          view: 'status',
          hint: 'view "status" needs a spec; for the whole corpus use view "counts" (no spec) or view "coverage".',
        });
      }
      const slug = String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
      const inSpec = (file: string): boolean =>
        String(file).replace(/\\/g, '/').includes(`.specs/${slug}/`);

      const counts = { fr: 0, ac: 0, scenarios: 0, tasks: 0 };
      const scens: ScenarioNode[] = [];
      const statusScenarios: ScenarioLike[] = [];
      const statusTasks: TaskLike[] = [];
      for (const n of graph.nodes.values()) {
        if (!inSpec(n.file)) continue;
        const nodeSpec = specOf(n.file);
        if (n.type === 'FR') counts.fr++;
        else if (n.type === 'AC') counts.ac++;
        else if (n.type === 'Task') {
          counts.tasks++;
          const t = n as TaskNode;
          statusTasks.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: nodeSpec, status: t.status });
        } else if (n.type === 'Scenario') {
          counts.scenarios++;
          const s = n as ScenarioNode;
          scens.push(s);
          statusScenarios.push({ id: s.id, tags: s.tags, result: s.lastResult, stale: s.resultStale, spec: nodeSpec, source: s.trace?.source, canonicalResult: s.canonicalResult, canonicalRunAt: s.canonicalRunAt });
        }
      }
      if (counts.fr + counts.ac + counts.scenarios + counts.tasks === 0) {
        return asJsonResult({
          ok: false,
          error: 'SPEC_NOT_FOUND',
          spec: slug,
          hint: `No nodes under .specs/${slug}/ — check list_specs for the loaded slugs.`,
        });
      }

      // FR-38b: the linked last-run summary — ONLY from ingested NDJSON data
      // (lastResult/lastRunAt stamped by the FR-1 pipeline). Never fabricated.
      const summary = { passed: 0, failed: 0, pending: 0, undefined: 0, ambiguous: 0, skipped: 0, stale: 0, touched: 0 };
      let lastAt: string | null = null;
      for (const s of scens) {
        if (!s.canonicalResult) continue;
        summary.touched++;
        const r = s.canonicalResult.toUpperCase();
        if (s.resultStale && r === 'PASSED') summary.stale++;
        else if (r === 'PASSED') summary.passed++;
        else if (r === 'FAILED') summary.failed++;
        else if (r === 'PENDING') summary.pending++;
        else if (r === 'UNDEFINED') summary.undefined++;
        else if (r === 'AMBIGUOUS') summary.ambiguous++;
        else if (r === 'SKIPPED') summary.skipped++;
        if (s.canonicalRunAt && (!lastAt || s.canonicalRunAt > lastAt)) lastAt = s.canonicalRunAt;
      }
      const last_run =
        summary.touched > 0
          ? { at: lastAt, source: '.dev-pomogator/.last-test-run.ndjson', summary }
          : null;
      const statusCoverage = computeCoverage(statusTasks, statusScenarios, readVerdicts(repoRoot));
      const canonicalStatusScenarios = statusScenarios.map((scenario) => ({
        ...scenario,
        result: scenario.canonicalResult,
        stale: false,
        source: scenario.canonicalResult ? 'canonical-full-run' : undefined,
      }));
      const canonicalStatusCoverage = computeCoverage(statusTasks, canonicalStatusScenarios, readVerdicts(repoRoot));
      const statusExecutionGaps = executionGaps(slug, canonicalStatusScenarios, canonicalStatusCoverage.buckets);
      const sourceScenarios = scens.filter((scenario) => specOf(scenario.file) === slug) as ScenarioLite[];
      const executableScenarios: ScenarioLite[] = [];
      const slugTail = slug.split('/').pop()!.toLowerCase();
      for (const node of graph.nodes.values()) {
        if (node.type !== 'Scenario') continue;
        const scenario = node as ScenarioNode;
        const file = String(scenario.file).replace(/\\/g, '/');
        if (file.includes('/.tmp/') || file.includes('/archive/')) continue;
        const outsideSpec = !file.startsWith('.specs/');
        if (outsideSpec && file.toLowerCase().includes(slugTail)) executableScenarios.push(scenario);
      }
      const bddSync = compareBddSync(repoRoot, slug, sourceScenarios, executableScenarios);
      const oldTestCensus = oldTestReadinessDebt(repoRoot, slug);
      const bddSyncDebt = [...bddSync.debt, ...oldTestCensus.debt];
      const filteredProof = latestFilteredProof(repoRoot, sourceScenarios);
      const taskTruthDebt = Object.entries(canonicalStatusCoverage.tasks)
        .flatMap(([taskId, task]) => (task.truth_issues ?? []).map((issue) => `${taskId}: ${issue.message}`));

      // FR-38a/FR-61: lifecycle is execution-honest. A filtered run with all
      // touched scenarios passed is still PARTIAL while any authored scenario is
      // `not_run`/`stale`; the detailed reason is exposed in `execution_gaps`.
      let lifecycle: 'SPEC_ONLY' | 'TESTS_NOT_RUN' | 'RED' | 'PARTIAL' | 'GREEN';
      if (counts.scenarios === 0) lifecycle = 'SPEC_ONLY';
      else if (!last_run) lifecycle = 'TESTS_NOT_RUN';
      else if (summary.failed > 0 || summary.ambiguous > 0) lifecycle = 'RED';
      else if (
        summary.pending + summary.undefined + summary.skipped + summary.stale > 0 ||
        statusExecutionGaps.SCENARIO_NOT_RUN > 0 ||
        statusExecutionGaps.LIVE_EVIDENCE_AWAITING > 0
      ) lifecycle = 'PARTIAL';
      else lifecycle = 'GREEN';

      // FR-38c: the FR-37b gap counts for this cell + the shared canonical verdict.
      const specFindings = checkConformance(graph).filter((finding) => inSpec(finding.location.file));
      const gaps = summariseGaps(gapsFromFindings(specFindings, { spec: slug }));
      const inventory = buildReadinessInventory(graph, { spec: slug });
      const canonicalVerdict = computeSpecVerdict({
        inventory,
        lanes: {
          STRUCTURE: {
            status: specFindings.some((finding) => finding.severity === 'error') ? 'RED' : 'GREEN',
            debt: specFindings.filter((finding) => finding.severity === 'error').map((finding) => `${finding.code}:${finding.nodeId ?? finding.location.file}`),
          },
          TRACEABILITY: {
            status: Object.values(gaps).some((count) => count > 0) ? 'RED' : 'GREEN',
            debt: Object.entries(gaps).filter(([, count]) => count > 0).map(([code, count]) => `${code}:${count}`),
          },
          TASK_TRUTH: {
            status: taskTruthDebt.length > 0 ? 'RED' : 'GREEN',
            debt: taskTruthDebt,
          },
          BDD_SYNC: {
            status: bddSyncDebt.length > 0 ? 'RED' : 'GREEN',
            debt: bddSyncDebt,
          },
          FILTERED_PROOF: {
            status: filteredProof.latest ? 'GREEN' : 'NONE',
            debt: [],
          },
        },
      }, specFindings);
      const readiness = canonicalVerdict.readiness;
      const readinessLanes = readiness.lanes;
      const nextAction = bddSyncDebt.length > 0
        ? 'Fix source/executable BDD sync drift or resolve the combined BDD synchronization debt.'
        : filteredProof.latest && taskTruthDebt.length > 0
          ? `Filtered run ${filteredProof.latest.runId} is useful proof but does not update canonical coverage. Run the full Docker BDD suite or attach an accepted canonical artifact.`
          : readiness.next_action;
      const hints: Record<typeof lifecycle, string> = {
        SPEC_ONLY: 'Docs only — no scenarios written yet. Next: author the .feature (FR-38a).',
        TESTS_NOT_RUN: `${counts.scenarios} scenario(s) are SCENARIO_NOT_RUN; no canonical execution has been ingested. Next: run the suite so NDJSON lands.`,
        RED: `${summary.failed + summary.ambiguous} failing of ${summary.touched} touched. Next: get_test_result per scenario.`,
        PARTIAL:
          statusExecutionGaps.SCENARIO_NOT_RUN > 0
            ? `${statusExecutionGaps.SCENARIO_NOT_RUN} ACTIVE scenario(s) are SCENARIO_NOT_RUN after the last ingested run; NOT execution-complete.`
            : statusExecutionGaps.LIVE_EVIDENCE_AWAITING > 0
              ? `${statusExecutionGaps.LIVE_EVIDENCE_AWAITING} @live-evidence scenario(s) await real live-producer proof (manifest + trace + readback); a canonical cucumber run cannot close them.`
              : summary.stale > 0
                ? `${summary.stale} stale passed scenario(s) need rerun after source changes; NOT execution-complete.`
                : `${summary.pending + summary.undefined + summary.skipped} scenario(s) undefined/pending/skipped, 0 failed — written but not implemented; NOT green.`,
        GREEN: `All ${summary.touched} touched scenario(s) passed at ${lastAt}.`,
      };

      // FR-48e discoverability: a phase is not a graph node, so publish its
      // settable handle (`<slug>:phase:<Phase>`) + authored state HERE — the only
      // place the agent learns the id to pass to set_entity_status (else the phase
      // authored-path is unusable, violating FR-48c).
      const progress = readProgressState(path.join(repoRoot, '.specs', slug));
      const phases = PHASE_ORDER.map((name) => ({
        id: `${slug}:phase:${name}`,
        name,
        stop_label: STOP_LABELS[name] ?? null,
        stop_confirmed: progress?.phases?.[name]?.stopConfirmed ?? false,
        completed_at: progress?.phases?.[name]?.completedAt ?? null,
      }));

      if (v === 'summary') {
        return asJsonResult({
          ok: true,
          view: 'summary',
          spec: slug,
          spec_status: readSpecStatus(repoRoot, slug),
          lifecycle,
          verdict: canonicalVerdict.verdict,
          blocking: canonicalVerdict.blocking,
          counts,
          last_run,
          gaps,
          execution_gaps: statusExecutionGaps,
          readiness: {
            overall: readiness.overall,
            next_action: nextAction,
          },
          hint: hints[lifecycle],
        });
      }

      return asJsonResult({
        ok: true,
        view: 'status',
        spec: slug,
        // Explicit SPEC-level marker (set_spec_status). `backlog` ⇒ excluded from the task-census /
        // Stop-gate open-work count — its open tasks are parked by intent, not counted as work due now.
        spec_status: readSpecStatus(repoRoot, slug),
        lifecycle,
        verdict: canonicalVerdict.verdict,
        blocking: canonicalVerdict.blocking,
        counts,
        // FR-63 (foundation): the SAME graph-derived deduplicated inventory
        // precheck + spec-verdict report (AC-63.1 — one graph, one inventory),
        // with per-AC test_paths, FR never-run classification and the evidence
        // provenance/recency taxonomy (AC-63.2).
        inventory,
        last_run,
        gaps,
        execution_gaps: statusExecutionGaps,
        coverage: {
          totals: statusCoverage.totals,
          task_verification: statusCoverage.tasks,
        },
        canonical_coverage: {
          totals: canonicalStatusCoverage.totals,
          task_verification: canonicalStatusCoverage.tasks,
        },
        readiness: {
          ...readiness,
          next_action: nextAction,
        },
        filtered_proof: filteredProof.latest,
        phases,
        hint: hints[lifecycle],
      });
    },
  });

  // ─── 15) list_spec_docs — FR-39a read-sufficiency inventory (P17-1) ──────
  tools.push({
    name: 'list_spec_docs',
    description:
      'FR-39a: enumerate the readable documents of ONE spec (the read_spec_doc ' +
      'inventory): *.md + *.feature + .progress.json + .jira-cache.json (read-only) present ' +
      'in .specs/<spec>/. The agent asks THIS first — read_spec_doc accepts only ' +
      'names from this list. Every call is appended to the spec-access audit log.',
    inputShape: { spec: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ spec }) => {
      const args = { spec };
      const slug = String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
      if (!isSafeSlug(slug)) {
        logSpecAccess('list_spec_docs', args, 'denied');
        return asJsonResult({ ok: false, error: 'UNSAFE_SPEC', spec: slug, hint: 'slug must stay within .specs/ (no traversal)' });
      }
      const repoRoot = registryOpts.repoRoot ?? process.cwd();
      const dir = path.join(repoRoot, '.specs', slug);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        logSpecAccess('list_spec_docs', args, 'not_found');
        return asJsonResult({ ok: false, error: 'SPEC_NOT_FOUND', spec: slug });
      }
      // P19-6: recurse into SUBDIRECTORIES (ARCHITECTURE/, attachments/,
      // .architecture-research/) so subdir docs are discoverable. Readable text
      // docs (read_spec_doc) and binary attachments (read_attachment) are listed
      // separately. Relative subpaths use '/'.
      const docs: string[] = [];
      const attachments: string[] = [];
      const ATTACH_RE = /\.(png|jpe?g|gif|webp|bmp|pdf|svg)$/i;
      const walk = (abs: string, rel: string): void => {
        for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
          const childRel = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) {
            walk(path.join(abs, e.name), childRel);
          } else if (e.isFile()) {
            if (/\.(md|feature)$/.test(e.name) || e.name === '.progress.json' || e.name === '.jira-cache.json') docs.push(childRel);
            else if (ATTACH_RE.test(e.name)) attachments.push(childRel);
          }
        }
      };
      walk(dir, '');
      docs.sort();
      attachments.sort();
      logSpecAccess('list_spec_docs', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, docs, count: docs.length, attachments });
    },
  });

  // ─── 16) read_spec_doc — FR-39a whole-document read + audit trail (P17-1) ─
  tools.push({
    name: 'read_spec_doc',
    description:
      'FR-39a: read ONE spec document (prose outside graph nodes included) by a name ' +
      'from list_spec_docs. Unknown name → explicit DOC_NOT_FOUND (never an empty ' +
      'string). Every read lands in the spec-access audit log — the MCP-only ' +
      'replacement for direct Read/Grep over .specs/. Bounded reads for big docs: pass ' +
      '{section:"FR-14"} for one heading block, or {offset,limit} for a 1-based line window (limit ≤500). ' +
      'A no-paging read returns a whole small doc but safely pages a document over 64 KiB (300 lines by default). ' +
      'Pass whole_document:true only when the entire large document is genuinely required. ' +
      'SECTION_NOT_FOUND returns nearest canonical headings/anchors.',
    inputShape: {
      spec: z.string(),
      doc: z.string(),
      offset: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(MAX_DOC_PAGE_LINES).optional(),
      section: z.string().optional(),
      whole_document: z.boolean().optional(),
      read_for_edit: z.boolean().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ spec, doc, offset, limit, section, whole_document, read_for_edit }) => {
      const args = { spec, doc, offset, limit, section, whole_document, read_for_edit };
      const repoRoot = registryOpts.repoRoot ?? process.cwd();
      const slug = String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
      if (!isSafeSlug(slug)) {
        logSpecAccess('read_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'UNSAFE_SPEC', spec: slug, hint: 'slug must stay within .specs/ (no traversal)' });
      }
      // P19-6: accept a SUBPATH (ARCHITECTURE/AXIS-1.md) — containment-checked,
      // not basename-flattened. Traversal/abs/drive → TRAVERSAL (denied), never served.
      const resolved = resolveSpecDoc(repoRoot, slug, String(doc));
      if (!resolved.ok) {
        logSpecAccess('read_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: resolved.reason === 'TRAVERSAL' ? 'DOC_TRAVERSAL' : 'UNSAFE_SPEC', spec: slug, doc: String(doc), hint: 'doc must stay within .specs/<spec>/ (no traversal/abs path)' });
      }
      const rel = resolved.rel;
      const base = path.basename(rel);
      const okName = /\.(md|feature)$/.test(base) || base === '.progress.json' || base === '.jira-cache.json';
      if (!okName || !fs.existsSync(resolved.abs) || !fs.statSync(resolved.abs).isFile()) {
        logSpecAccess('read_spec_doc', args, 'not_found');
        return asJsonResult({
          ok: false,
          error: 'DOC_NOT_FOUND',
          spec: slug,
          doc: rel,
          hint: 'Call list_spec_docs({spec}) for the valid inventory. Binary attachments → read_attachment.',
        });
      }
      const full = fs.readFileSync(resolved.abs, 'utf-8');
      const lines = full.split(/\r?\n/);
      const totalLines = lines.length;
      const totalBytes = full.length;
      // P21-5: whole-doc CAS token — pass it back as apply_spec_change({expected_sha})
      // to make the write conditional (refuses if another session changed the doc).
      const sha = docSha(full);

      // FR-60e (P33-1): read-for-edit mode — section metadata + stable append/insert
      // tokens so a follow-up section op re-targets the same heading without an exact
      // old_string. `section` (optional) scopes the metadata to ONE heading.
      if (read_for_edit === true) {
        const meta = readForEdit(repoRoot, slug, rel, section !== undefined ? String(section) : undefined);
        if (!meta.ok) {
          logSpecAccess('read_spec_doc', args, 'not_found');
          return asJsonResult({ ok: false, error: meta.error === 'DOC_NOT_FOUND' ? 'DOC_NOT_FOUND' : 'UNSAFE_SPEC', spec: slug, doc: rel, hint: meta.hint });
        }
        logSpecAccess('read_spec_doc', args, 'ok');
        return asJsonResult({ ok: true, spec: slug, doc: rel, mode: 'read_for_edit', ...meta });
      }

      // P21-2 (a): section mode — one heading block out of a big doc.
      if (section !== undefined) {
        const sel = sliceSection(lines, String(section));
        if (!sel) {
          logSpecAccess('read_spec_doc', args, 'not_found');
          return asJsonResult({
            ok: false, error: 'SECTION_NOT_FOUND', spec: slug, doc: rel, section,
            total_lines: totalLines, total_bytes: totalBytes,
            candidates: nearestHeadings(lines, String(section)),
            hint: 'Use one of candidates[].heading / candidates[].anchor, or page with {offset,limit}.',
          });
        }
        const content = sel.lines.join('\n');
        logSpecAccess('read_spec_doc', args, 'ok');
        return asJsonResult({
          ok: true, spec: slug, doc: rel, section: sel.heading,
          start_line: sel.startLine, end_line: sel.endLine, lines: sel.lines.length,
          total_lines: totalLines, total_bytes: totalBytes, bytes: content.length, sha, content,
        });
      }

      // P21-2 (b): line-window mode — {offset,limit} (1-based, like the Read tool).
      if (offset !== undefined || limit !== undefined) {
        const startIdx = (offset ?? 1) - 1;
        if (startIdx >= totalLines) {
          logSpecAccess('read_spec_doc', args, 'ok');
          return asJsonResult({
            ok: true, spec: slug, doc: rel, start_line: startIdx + 1, end_line: startIdx + 1,
            lines: 0, total_lines: totalLines, total_bytes: totalBytes, truncated: false,
            next_offset: null, sha, content: '', note: 'offset is past end of file',
          });
        }
        const endIdx = Math.min(startIdx + (limit ?? DEFAULT_DOC_PAGE_LINES), totalLines);
        const slice = lines.slice(startIdx, endIdx);
        const truncated = endIdx < totalLines;
        const content = slice.join('\n');
        logSpecAccess('read_spec_doc', args, 'ok');
        return asJsonResult({
          ok: true, spec: slug, doc: rel, start_line: startIdx + 1, end_line: endIdx,
          lines: slice.length, total_lines: totalLines, total_bytes: totalBytes,
          truncated, next_offset: truncated ? endIdx + 1 : null, bytes: content.length, sha, content,
        });
      }

      // Default: whole small docs; bound large docs unless the caller explicitly opts in.
      if (totalBytes > WHOLE_DOC_SAFE_BYTES && whole_document !== true) {
        const endIdx = Math.min(DEFAULT_DOC_PAGE_LINES, totalLines);
        const content = lines.slice(0, endIdx).join('\n');
        logSpecAccess('read_spec_doc', args, 'ok');
        return asJsonResult({
          ok: true, spec: slug, doc: rel, start_line: 1, end_line: endIdx,
          lines: endIdx, total_lines: totalLines, total_bytes: totalBytes,
          truncated: endIdx < totalLines, next_offset: endIdx < totalLines ? endIdx + 1 : null,
          bounded_default: true, whole_document_available: true, bytes: content.length, sha, content,
          note: 'Large document safely paged. Continue with next_offset, select a section, or pass whole_document:true explicitly.',
        });
      }
      logSpecAccess('read_spec_doc', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, doc: rel, bytes: totalBytes, total_lines: totalLines, total_bytes: totalBytes, sha, content: full });
    },
  });

  // ─── 16b) read_attachment — FR-39a binary attachment read (P19-6) ────────
  tools.push({
    name: 'read_attachment',
    description:
      'P19-6: read ONE BINARY attachment of a spec (e.g. attachments/diagram.png) ' +
      'by a subpath from list_spec_docs.attachments[]. Returns base64 + mime so a ' +
      'multimodal verify (Jira screenshots, phase2 Step 5c) works under enforce ' +
      'without a raw Read. Text docs → read_spec_doc. Every read is audit-logged.',
    inputShape: { spec: z.string(), path: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ spec, path: docPath }) => {
      const args = { spec, path: docPath };
      const slug = String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
      const resolved = resolveSpecDoc(process.cwd(), slug, String(docPath));
      if (!resolved.ok) {
        logSpecAccess('read_attachment', args, 'denied');
        return asJsonResult({ ok: false, error: resolved.reason === 'TRAVERSAL' ? 'DOC_TRAVERSAL' : 'UNSAFE_SPEC', spec: slug, path: String(docPath), hint: 'path must stay within .specs/<spec>/ (no traversal/abs path)' });
      }
      const rel = resolved.rel;
      const ext = path.extname(rel).toLowerCase();
      const MIME: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
        '.webp': 'image/webp', '.bmp': 'image/bmp', '.pdf': 'application/pdf', '.svg': 'image/svg+xml',
      };
      const mime = MIME[ext];
      if (!mime || !fs.existsSync(resolved.abs) || !fs.statSync(resolved.abs).isFile()) {
        logSpecAccess('read_attachment', args, 'not_found');
        return asJsonResult({ ok: false, error: 'ATTACHMENT_NOT_FOUND', spec: slug, path: rel, hint: 'Call list_spec_docs({spec}).attachments for the valid inventory.' });
      }
      const buf = fs.readFileSync(resolved.abs);
      logSpecAccess('read_attachment', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, path: rel, mime, bytes: buf.length, base64: buf.toString('base64') });
    },
  });

  // ─── 17) propose_spec_change — FR-40 dry-run (P17-2) ─────────────────────
  const CHANGE_SHAPE = {
    spec: z.string(),
    doc: z.string(),
    content: z.string().optional(),
    old_string: z.string().optional(),
    new_string: z.string().optional(),
    replace_all: z.boolean().optional(),
    /** P21-5 optimistic CAS: the `sha` from your read_spec_doc. apply refuses
     *  with CAS_MISMATCH if the doc changed since (another session). Omit to opt out. */
    expected_sha: z.string().optional(),
    reason: z.string(),
  } as const satisfies z.ZodRawShape;
  const toChange = (a: Record<string, unknown>): SpecChange | null | 'ambiguous' => {
    const hasContent = typeof a.content === 'string';
    const hasEdit = typeof a.old_string === 'string' && typeof a.new_string === 'string';
    // Both forms supplied → ambiguous; {content} used to silently win and the
    // Edit intent was dropped (review #11). Refuse instead.
    if (hasContent && hasEdit) return 'ambiguous';
    if (hasContent) return { content: a.content as string };
    if (hasEdit) {
      return { old_string: a.old_string as string, new_string: a.new_string as string, replace_all: a.replace_all === true };
    }
    return null;
  };
  const slugOf = (spec: unknown): string =>
    String(spec).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
  // P19-6: keep the SUBPATH (ARCHITECTURE/AXIS-1.md) — validateTarget does the
  // containment check; basename-flattening would lose the subdir target.
  const docOf = (doc: unknown): string => String(doc).replace(/\\/g, '/').replace(/^\/+/, '');

  tools.push({
    name: 'propose_spec_change',
    description:
      'FR-40 DRY-RUN of a spec mutation: applies the change IN MEMORY and runs the ' +
      'full validation (form contracts + anchors + conformance of the affected spec) ' +
      'WITHOUT writing. Same checks as apply_spec_change — propose first, fix the ' +
      'findings, then apply. change = {content} (full replace) OR ' +
      '{old_string, new_string, replace_all?} (Edit-tool semantics).',
    inputShape: CHANGE_SHAPE,
    handler: async (args) => {
      const slug = slugOf(args.spec);
      const doc = docOf(args.doc);
      const change = toChange(args as Record<string, unknown>);
      if (change === 'ambiguous') {
        logSpecAccess('propose_spec_change', args, 'error');
        return asJsonResult({ ok: false, error: 'AMBIGUOUS_CHANGE', hint: 'Pass EITHER {content} OR {old_string,new_string}, not both.' });
      }
      if (!change) {
        logSpecAccess('propose_spec_change', args, 'error');
        return asJsonResult({ ok: false, error: 'BAD_CHANGE', hint: 'Pass {content} or {old_string,new_string}.' });
      }
      const r = validateSpecChange(process.cwd(), slug, doc, change);
      logSpecAccess('propose_spec_change', args, r.ok ? 'ok' : 'denied');
      return asJsonResult({ ok: r.ok, spec: slug, doc, dry_run: true, findings: r.findings });
    },
  });

  // ─── 18) apply_spec_change — FR-40 validated atomic write (P17-2) ────────
  tools.push({
    name: 'apply_spec_change',
    description:
      'FR-40 «живой генератор»: apply a spec mutation THROUGH the server. The change ' +
      'is validated BEFORE touching disk (form contracts + anchors + conformance); any ' +
      'error-severity finding → refusal with the findings list (fix and retry). A clean ' +
      'change is written atomically and audited. Inside the MCP server the FR-14 watcher ' +
      'refreshes the graph; the next read sees the fresh state. P21-5 optimistic CAS: pass ' +
      'expected_sha (the sha from read_spec_doc) to make the write conditional — CAS_MISMATCH ' +
      'if another session changed the doc; the reply returns the new sha for chaining edits.',
    inputShape: CHANGE_SHAPE,
    handler: async (args) => {
      const slug = slugOf(args.spec);
      const doc = docOf(args.doc);
      const change = toChange(args as Record<string, unknown>);
      if (change === 'ambiguous') {
        logSpecAccess('apply_spec_change', args, 'error');
        return asJsonResult({ ok: false, error: 'AMBIGUOUS_CHANGE', hint: 'Pass EITHER {content} OR {old_string,new_string}, not both.' });
      }
      if (!change) {
        logSpecAccess('apply_spec_change', args, 'error');
        return asJsonResult({ ok: false, error: 'BAD_CHANGE', hint: 'Pass {content} or {old_string,new_string}.' });
      }
      const expectedSha = typeof args.expected_sha === 'string' ? args.expected_sha : null;
      // E-A: hold the short write-lock around casCheck→validate→write so the CAS sha-check and the
      // write are atomic versus another session's concurrent write (different specs interleave; the
      // lock is held only for this critical section). writeDocAtomic re-enters the lock as a no-op.
      try {
        return withWriteLock(process.cwd(), () => {
          // P21-5 optimistic CAS — refuse a write against a stale read (another session changed the
          // doc since `expected_sha` was taken). Opt-in: omitted → unconditional.
          if (expectedSha !== null) {
            const cas = casCheck(process.cwd(), slug, doc, expectedSha);
            if (!cas.ok) {
              logSpecAccess('apply_spec_change', args, 'denied');
              return asJsonResult({
                ok: false, error: 'CAS_MISMATCH', spec: slug, doc, expected_sha: expectedSha, actual_sha: cas.actualSha,
                hint: 'The doc changed since you read it (another session?). Re-read with read_spec_doc for the fresh sha, rebase your change, and retry.',
              });
            }
          }
          const r = validateSpecChange(process.cwd(), slug, doc, change);
          if (!r.ok) {
            logSpecAccess('apply_spec_change', args, 'denied');
            return asJsonResult({
              ok: false,
              error: 'VALIDATION_FAILED',
              spec: slug,
              doc,
              findings: r.findings,
              hint: 'Fix the findings and retry; propose_spec_change is the single-document dry-run. For fresh bootstrap or mutually-dependent FR/Story/Design/AC edits, use propose_patch then apply_proposed_patch, or apply_spec_transaction for one-shot all-or-nothing validation after every document is staged.',
            });
          }
          const abs = writeDocAtomic(process.cwd(), slug, doc, r.next!);
          registryOpts.refreshGraph?.();
          logSpecAccess('apply_spec_change', args, 'ok');
          return asJsonResult({ ok: true, spec: slug, doc, path: abs, bytes: r.next!.length, sha: docSha(r.next!), findings: [] });
        });
      } catch (e) {
        if ((e as WriteLockBusyError).code === 'WRITE_LOCK_BUSY') {
          logSpecAccess('apply_spec_change', args, 'denied');
          const h = (e as WriteLockBusyError).holder;
          return asJsonResult({
            ok: false, error: 'WRITE_LOCK_BUSY', spec: slug, doc, held_by: h ?? null,
            hint: 'Another session is writing a spec RIGHT NOW; this is a brief transient lock — retry in a moment.',
          });
        }
        throw e;
      }
    },
  });

  // ─── 19) FR-60a section ops — stable-heading append/insert (P33-1) ───────
  // Shared driver: address a section by its STABLE heading anchor (no exact
  // old_string), PRESERVE the doc EOL, and run the SAME validation-before-write
  // path apply_spec_change runs (form + anchors + conformance) via applySectionChange.
  // A clean result is written atomically; a non-clean one leaves the doc untouched.
  const runSectionOp = (toolName: string, kind: SectionOpKind, args: Record<string, unknown>): ToolResult => {
    const slug = slugOf(args.spec);
    const doc = docOf(args.doc);
    const op = {
      kind,
      heading: typeof args.heading === 'string' ? (args.heading as string) : undefined,
      text: typeof args.text === 'string' ? (args.text as string) : '',
    };
    const expectedSha = typeof args.expected_sha === 'string' ? (args.expected_sha as string) : null;
    try {
      return withWriteLock(process.cwd(), () => {
        // P21-5 optimistic CAS — refuse a write against a stale read (opt-in).
        if (expectedSha !== null) {
          const cas = casCheck(process.cwd(), slug, doc, expectedSha);
          if (!cas.ok) {
            logSpecAccess(toolName, args, 'denied');
            return asJsonResult({
              ok: false, error: 'CAS_MISMATCH', spec: slug, doc, expected_sha: expectedSha, actual_sha: cas.actualSha,
              hint: 'The doc changed since you read it. Re-read (read_spec_doc read_for_edit:true) for the fresh sha/tokens and retry.',
            });
          }
        }
        const r = applySectionChange(process.cwd(), slug, doc, op);
        if (!r.ok) {
          logSpecAccess(toolName, args, 'denied');
          return asJsonResult({
            ok: false, error: r.error ?? 'SECTION_OP_FAILED', spec: slug, doc,
            eol_style: r.eol_style, resolved: r.resolved, heading_anchor: r.heading_anchor, findings: r.findings,
            hint: r.error === 'HEADING_NOT_FOUND'
              ? 'No heading matched — pass the heading text or its Marksman anchor (read_spec_doc read_for_edit:true lists anchors).'
              : 'Fix the findings and retry; the document was left unchanged.',
          });
        }
        registryOpts.refreshGraph?.();
        logSpecAccess(toolName, args, 'ok');
        return asJsonResult({
          ok: true, spec: slug, doc, kind, eol_style: r.eol_style, resolved: r.resolved,
          heading_anchor: r.heading_anchor, start_line: r.start_line, end_line: r.end_line,
          section_sha: r.section_sha, sha: r.sha, bytes: r.bytes, written: r.written === true,
          preview: r.preview, findings: [],
        });
      });
    } catch (e) {
      if ((e as WriteLockBusyError).code === 'WRITE_LOCK_BUSY') {
        logSpecAccess(toolName, args, 'denied');
        const h = (e as WriteLockBusyError).holder;
        return asJsonResult({ ok: false, error: 'WRITE_LOCK_BUSY', spec: slug, doc, held_by: h ?? null, hint: 'Another session is writing a spec RIGHT NOW — retry in a moment.' });
      }
      throw e;
    }
  };

  const SECTION_OP_SHAPE = {
    spec: z.string(),
    doc: z.string(),
    heading: z.string().optional(),
    text: z.string(),
    expected_sha: z.string().optional(),
  } as const satisfies z.ZodRawShape;

  tools.push({
    name: 'append_to_section',
    description:
      'FR-60a (P33-1): append text to the END of a stable-heading section — address the section by ' +
      'its heading text or Marksman anchor (NO exact old_string). Preserves the document EOL style ' +
      '(CRLF stays CRLF) and runs the SAME form/anchor/conformance validation-before-write as ' +
      'apply_spec_change; a clean result is written atomically. Pass expected_sha (from read_spec_doc ' +
      'read_for_edit:true) for optimistic CAS.',
    inputShape: SECTION_OP_SHAPE,
    handler: async (args) => runSectionOp('append_to_section', 'append_to_section', args as Record<string, unknown>),
  });

  tools.push({
    name: 'insert_after_heading',
    description:
      'FR-60a (P33-1): insert text IMMEDIATELY AFTER a stable heading — address the heading by text or ' +
      "Marksman anchor (NO exact old_string). Preserves the document EOL style and runs the same " +
      'form/anchor/conformance validation-before-write as apply_spec_change. Pass expected_sha (from ' +
      'read_spec_doc read_for_edit:true) for optimistic CAS.',
    inputShape: SECTION_OP_SHAPE,
    handler: async (args) => runSectionOp('insert_after_heading', 'insert_after_heading', args as Record<string, unknown>),
  });

  tools.push({
    name: 'insert_at_eof',
    description:
      'FR-60a (P33-1): append text at END-OF-FILE — no heading needed. Preserves the document EOL style ' +
      'and runs the same form/anchor/conformance validation-before-write as apply_spec_change. Pass ' +
      'expected_sha (from read_spec_doc) for optimistic CAS.',
    inputShape: SECTION_OP_SHAPE,
    handler: async (args) => runSectionOp('insert_at_eof', 'insert_at_eof', args as Record<string, unknown>),
  });

  // ─── 19b) FR-60 P33-2 replace_in_section — EOL-tolerant, anchor-targeted replace ──
  // Address a section by its STABLE heading anchor, replace old_string→new_string within
  // it. On a miss the door diagnoses WHY (eol_only / whitespace_only / multi_match /
  // changed_body / missing_anchor) with a safe next-operation hint instead of a bare
  // "not found". normalize_eol:true accepts a CRLF/LF-only mismatch while the persisted
  // file keeps its original EOL. A stale expected_sha AUTO-REBASES a non-conflicting
  // change (target section intact in the fresh doc) and refuses a real conflict with
  // fresh anchor context (CAS_CONFLICT + fresh sha + section_sha + live anchors).
  const REPLACE_SHAPE = {
    spec: z.string(),
    doc: z.string(),
    heading: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional(),
    normalize_eol: z.boolean().optional(),
    /** Whole-doc CAS token from read_spec_doc — enables auto-rebase on a concurrent edit. */
    expected_sha: z.string().optional(),
    /** Section precondition (section_sha from read_for_edit) — a mismatch ⇒ changed_body. */
    expected_section_sha: z.string().optional(),
  } as const satisfies z.ZodRawShape;

  tools.push({
    name: 'replace_in_section',
    description:
      'FR-60 (P33-2): EOL-tolerant, ANCHOR-TARGETED literal replacement — address the section by its ' +
      'heading text or Marksman anchor, replace old_string→new_string within it, preserving the document ' +
      'EOL style. On a miss the door diagnoses WHY (eol_only / whitespace_only / multi_match / changed_body ' +
      '/ missing_anchor) with a safe next-operation hint, instead of a bare "not found". normalize_eol:true ' +
      'accepts a CRLF/LF-only mismatch while the persisted file keeps its original EOL. Runs the SAME ' +
      'form/anchor/conformance validation-before-write as apply_spec_change. Pass expected_sha (from ' +
      'read_spec_doc) to AUTO-REBASE a non-conflicting change over a concurrent edit; a real conflict refuses ' +
      'with CAS_CONFLICT + fresh anchor context. Pass expected_section_sha (from read_for_edit) as a precondition.',
    inputShape: REPLACE_SHAPE,
    handler: async (args) => {
      const slug = slugOf(args.spec);
      const doc = docOf(args.doc);
      const op = {
        heading: String(args.heading),
        old_string: String(args.old_string),
        new_string: String(args.new_string),
        replace_all: args.replace_all === true,
        normalize_eol: args.normalize_eol === true,
        expected_section_sha: typeof args.expected_section_sha === 'string' ? (args.expected_section_sha as string) : undefined,
      };
      const expectedSha = typeof args.expected_sha === 'string' ? (args.expected_sha as string) : undefined;
      try {
        return withWriteLock(process.cwd(), () => {
          const r = applyReplaceChange(process.cwd(), slug, doc, op, expectedSha);
          if (!r.ok) {
            logSpecAccess('replace_in_section', args, 'denied');
            return asJsonResult({
              ok: false, error: r.error ?? 'REPLACE_FAILED', spec: slug, doc,
              eol_style: r.eol_style, resolved: r.resolved, rebased: r.rebased === true,
              heading_anchor: r.heading_anchor, start_line: r.start_line, end_line: r.end_line,
              section_sha: r.section_sha, sha: r.sha,
              diagnostic: r.diagnostic, available_anchors: r.available_anchors, findings: r.findings,
              hint: r.diagnostic?.hint ?? (r.error === 'CAS_CONFLICT'
                ? 'The doc changed AND the target section conflicts. Re-read (read_spec_doc read_for_edit:true) for the fresh sha/section_sha/anchors, rebase your change, and retry.'
                : 'The replacement was not applied; the document was left unchanged. Act on the diagnostic hint and retry.'),
            });
          }
          registryOpts.refreshGraph?.();
          logSpecAccess('replace_in_section', args, 'ok');
          return asJsonResult({
            ok: true, spec: slug, doc, eol_style: r.eol_style, resolved: r.resolved,
            rebased: r.rebased === true, normalized: r.normalized === true,
            heading_anchor: r.heading_anchor, start_line: r.start_line, end_line: r.end_line,
            section_sha: r.section_sha, sha: r.sha, bytes: r.bytes, written: r.written === true,
            preview: r.preview, findings: [],
          });
        });
      } catch (e) {
        if ((e as WriteLockBusyError).code === 'WRITE_LOCK_BUSY') {
          logSpecAccess('replace_in_section', args, 'denied');
          const h = (e as WriteLockBusyError).holder;
          return asJsonResult({ ok: false, error: 'WRITE_LOCK_BUSY', spec: slug, doc, held_by: h ?? null, hint: 'Another session is writing a spec RIGHT NOW — retry in a moment.' });
        }
        throw e;
      }
    },
  });

  // ─── 19c) FR-60 P33-3 propose_patch / apply_proposed_patch / apply_spec_transaction ──
  // Multi-document authoring transaction: preview the graph impact of a SET of section / replace /
  // content edits across documents (e.g. FR.md + ACCEPTANCE_CRITERIA.md + TASKS.md + the .feature +
  // FILE_CHANGES.md), then apply them ALL-OR-NOTHING with ONE audit event. propose_patch is the free
  // dry-run (mints a proposal_id); apply_proposed_patch replays a stored proposal IF STILL VALID;
  // apply_spec_transaction validates + writes in one shot. Every edit runs the SAME form/anchor/
  // conformance validation-before-write as apply_spec_change — no second validator. Because the preview
  // core writes nothing, a single failed edit leaves EVERY document byte-identical (SPECGEN004_523).
  const PATCH_SECTION_SHAPE = z.object({
    kind: z.enum(['append_to_section', 'insert_after_heading', 'insert_at_eof']),
    heading: z.string().optional(),
    text: z.string(),
  });
  const PATCH_REPLACE_SHAPE = z.object({
    heading: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional(),
    normalize_eol: z.boolean().optional(),
    expected_section_sha: z.string().optional(),
  });
  const PATCH_EDIT_SHAPE = z.object({
    spec: z.string(),
    doc: z.string(),
    section: PATCH_SECTION_SHAPE.optional(),
    replace: PATCH_REPLACE_SHAPE.optional(),
    content: z.string().optional(),
    /** Whole-doc CAS token from read_for_edit — a mismatch fails that edit (strict at txn level). */
    expected_sha: z.string().optional(),
  });
  const PATCH_SHAPE = {
    edits: z.array(PATCH_EDIT_SHAPE).min(1),
    reason: z.string(),
  } as const satisfies z.ZodRawShape;

  const toPatchEdits = (raw: unknown): PatchEdit[] =>
    (raw as Array<Record<string, unknown>>).map((e) => ({
      spec: String(e.spec),
      doc: String(e.doc),
      section: e.section as PatchEdit['section'],
      replace: e.replace as PatchEdit['replace'],
      content: typeof e.content === 'string' ? (e.content as string) : undefined,
      expected_sha: typeof e.expected_sha === 'string' ? (e.expected_sha as string) : undefined,
    }));

  // Map a prepared edit to its PUBLIC preview — strips the full `next` content (the reply carries the
  // diff + resulting sha/tokens instead, keeping a 5-doc proposal compact).
  const publicEditPreview = (p: PatchEditPreview): Record<string, unknown> => ({
    spec: p.spec, doc: p.doc, ok: p.ok, eol_style: p.eol_style,
    heading_anchor: p.heading_anchor, start_line: p.start_line, end_line: p.end_line,
    section_sha: p.section_sha, sha: p.sha, append_token: p.append_token, insert_token: p.insert_token,
    diff: p.diff, findings: p.findings, diagnostic: p.diagnostic, error: p.error,
  });

  // Graph nodes defined IN any target doc — the "affected graph nodes" of the proposal/transaction.
  const affectedNodes = (edits: PatchEdit[]): string[] => {
    const graph = getGraph();
    const targetFiles = new Set(edits.map((e) => `.specs/${slugOf(e.spec)}/${docOf(e.doc)}`));
    const out: string[] = [];
    for (const n of graph.nodes.values()) {
      if (targetFiles.has(String(n.file).replace(/\\/g, '/'))) out.push(n.id);
    }
    return out.sort();
  };

  tools.push({
    name: 'propose_patch',
    description:
      'FR-60 (P33-3): DRY-RUN a MULTI-DOCUMENT spec patch — preview the graph impact of a SET of edits (each ' +
      'a section insert {section:{kind,heading?,text}}, an anchor-targeted replace {replace:{heading,old_string,' +
      'new_string,...}}, or a whole-doc {content}) across documents (e.g. FR.md + ACCEPTANCE_CRITERIA.md + TASKS.md ' +
      '+ the .feature + FILE_CHANGES.md) WITHOUT writing. Returns, per edit: the resolved heading anchor, a line ' +
      'diff, the resulting sha + append/insert section tokens, and the form/anchor/conformance findings — plus the ' +
      'affected graph nodes across all target docs and a `proposal_id`. Pass that id to apply_proposed_patch to apply ' +
      'it if still valid, or call apply_spec_transaction with the same edits for a one-shot all-or-nothing write.',
    inputShape: PATCH_SHAPE,
    handler: async (args) => {
      const edits = toPatchEdits(args.edits);
      const preview = proposePatch(process.cwd(), edits);
      logSpecAccess('propose_patch', { edits: edits.length, reason: args.reason }, preview.ok ? 'ok' : 'denied');
      return asJsonResult({
        ok: preview.ok, dry_run: true, proposal_id: preview.proposal_id,
        affected_nodes: affectedNodes(edits),
        findings: preview.findings,
        edits: preview.edits.map(publicEditPreview),
        hint: preview.ok
          ? 'All edits validate clean — nothing was written (dry run). apply_proposed_patch({proposal_id}) applies this if still valid; apply_spec_transaction re-validates + writes in one shot.'
          : 'At least one edit failed validation — nothing was written. Fix the flagged edits (see per-edit findings) and re-propose.',
      });
    },
  });

  tools.push({
    name: 'apply_proposed_patch',
    description:
      'FR-60 (P33-3): apply a proposal minted by propose_patch — IF STILL VALID. Re-runs every edit against the ' +
      'FRESH on-disk content, re-validates (form/anchor/conformance), and writes ALL-OR-NOTHING with ONE audit event. ' +
      'A proposal that no longer validates (a doc changed, an anchor moved, a CAS precondition broke) is REFUSED with ' +
      'its findings — never applied stale. Consumed on success.',
    inputShape: { proposal_id: z.string(), reason: z.string() } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      try {
        return withWriteLock(process.cwd(), () => {
          const r = applyProposedPatch(process.cwd(), String(args.proposal_id));
          if (!r.ok) {
            logSpecAccess('apply_proposed_patch', { proposal_id: args.proposal_id, reason: args.reason }, 'denied');
            return asJsonResult({
              ok: false, error: r.error ?? 'VALIDATION_FAILED', proposal_id: r.proposal_id,
              findings: r.findings, edits: r.edits.map(publicEditPreview),
              write_error: r.write_error, rollback_failures: r.rollback_failures,
              hint: r.error === 'PROPOSAL_NOT_FOUND'
                ? 'No such proposal_id — propose_patch first (proposals live for the server process and are consumed on apply).'
                : r.error === 'WRITE_FAILED'
                  ? 'A document write failed; every earlier write was restored. Inspect write_error and retry.'
                  : r.error === 'ROLLBACK_FAILED'
                    ? 'CRITICAL: a document write failed and rollback was incomplete. Inspect rollback_failures before any retry.'
                    : 'The proposal is no longer valid against the fresh docs; nothing was written. Re-propose and retry.',
            });
          }
          registryOpts.refreshGraph?.();
          logSpecAccess('apply_proposed_patch', { proposal_id: args.proposal_id, edits: r.edits.length, reason: args.reason }, 'ok');
          return asJsonResult({
            ok: true, written: true, proposal_id: r.proposal_id, shas: r.shas,
            edits: r.edits.map(publicEditPreview), findings: [],
          });
        });
      } catch (e) {
        if ((e as WriteLockBusyError).code === 'WRITE_LOCK_BUSY') {
          logSpecAccess('apply_proposed_patch', { proposal_id: args.proposal_id }, 'denied');
          const h = (e as WriteLockBusyError).holder;
          return asJsonResult({ ok: false, error: 'WRITE_LOCK_BUSY', proposal_id: args.proposal_id, held_by: h ?? null, hint: 'Another session is writing a spec RIGHT NOW — retry in a moment.' });
        }
        throw e;
      }
    },
  });

  tools.push({
    name: 'apply_spec_transaction',
    description:
      'FR-60 (P33-3): validate + atomically write a MULTI-DOCUMENT spec change ALL-OR-NOTHING — one conceptual ' +
      'mutation across FR.md / ACCEPTANCE_CRITERIA.md / TASKS.md / the .feature / FILE_CHANGES.md (any set of docs). ' +
      'Every edit (a section insert {section}, an anchor-targeted replace {replace}, or a whole-doc {content}) runs ' +
      'the SAME form/anchor/conformance validation-before-write as apply_spec_change; if ANY edit fails, NOTHING is ' +
      'written and every doc stays byte-identical. A clean set is written doc-by-doc atomically; a later I/O failure ' +
      'restores earlier docs (or reports ROLLBACK_FAILED honestly), and the transaction is logged as ONE ' +
      'audit event; returns the resulting sha per doc + the affected graph nodes. (propose_patch is the free dry-run.)',
    inputShape: PATCH_SHAPE,
    handler: async (args) => {
      const edits = toPatchEdits(args.edits);
      try {
        return withWriteLock(process.cwd(), () => {
          const r = applySpecTransactionCore(process.cwd(), edits);
          if (!r.ok) {
            logSpecAccess('apply_spec_transaction', { edits: edits.length, reason: args.reason }, 'denied');
            return asJsonResult({
              ok: false, error: r.error ?? 'VALIDATION_FAILED',
              findings: r.findings, edits: r.edits.map(publicEditPreview),
              write_error: r.write_error, rollback_failures: r.rollback_failures,
              hint: r.error === 'WRITE_FAILED'
                ? 'A document write failed; every earlier write was restored. Inspect write_error and retry.'
                : r.error === 'ROLLBACK_FAILED'
                  ? 'CRITICAL: a document write failed and rollback was incomplete. Inspect rollback_failures before any retry.'
                  : 'At least one edit failed validation — NOTHING was written; every document is unchanged. Fix the flagged edits (see per-edit findings) and retry.',
            });
          }
          registryOpts.refreshGraph?.();
          logSpecAccess('apply_spec_transaction', { edits: edits.length, docs: edits.map((e) => `${slugOf(e.spec)}/${docOf(e.doc)}`), reason: args.reason }, 'ok');
          return asJsonResult({
            ok: true, written: true, shas: r.shas, affected_nodes: affectedNodes(edits),
            edits: r.edits.map(publicEditPreview), findings: [],
          });
        });
      } catch (e) {
        if ((e as WriteLockBusyError).code === 'WRITE_LOCK_BUSY') {
          logSpecAccess('apply_spec_transaction', { edits: edits.length }, 'denied');
          const h = (e as WriteLockBusyError).holder;
          return asJsonResult({ ok: false, error: 'WRITE_LOCK_BUSY', held_by: h ?? null, hint: 'Another session is writing a spec RIGHT NOW — retry in a moment.' });
        }
        throw e;
      }
    },
  });

  // ─── 19d) FR-60 P33-4 domain authoring helpers + feature/step-def safety ──────
  // High-level INTENT operations (add_backlog_task / add_phase / amend_requirement /
  // add_acceptance_criterion / register_incident_backlog) that render CANONICAL,
  // TRACEABLE markdown across FR/AC/TASKS/feature/FILE_CHANGES and enforce FEATURE
  // SAFETY: an executable .feature scenario is refused unless every step matches a real
  // step-definition, or the caller explicitly passes tasks_only:true (downgraded to a
  // TASKS-only acceptance pin). Every render goes through the P33-3 transaction core —
  // the SAME form/anchor/conformance validation-before-write + all-or-nothing atomicity
  // (no second validator). Handlers: write-lock + ONE audit event + graph refresh.
  const DOMAIN_FEATURE_SHAPE = z.object({
    scenario_id: z.string(),
    title: z.string(),
    steps: z.array(z.string()).min(1),
  });

  // Shared reply mapper — the domain result IS the MCP reply body (plus spec echo).
  const domainReply = (toolName: string, spec: string, r: DomainAuthoringResult): ToolResult => {
    logSpecAccess(toolName, { spec }, r.ok ? 'ok' : 'denied');
    if (r.ok) registryOpts.refreshGraph?.();
    return asJsonResult({ ...r, spec: slugOf(spec) });
  };

  const runDomainLocked = (toolName: string, args: Record<string, unknown>, fn: () => DomainAuthoringResult): ToolResult => {
    try {
      return withWriteLock(process.cwd(), () => domainReply(toolName, String(args.spec), fn()));
    } catch (e) {
      if ((e as WriteLockBusyError).code === 'WRITE_LOCK_BUSY') {
        logSpecAccess(toolName, args, 'denied');
        const h = (e as WriteLockBusyError).holder;
        return asJsonResult({ ok: false, error: 'WRITE_LOCK_BUSY', held_by: h ?? null, hint: 'Another session is writing a spec RIGHT NOW — retry in a moment.' });
      }
      throw e;
    }
  };

  const toFeature = (raw: unknown): { scenarioId: string; title: string; steps: string[] } | undefined => {
    if (raw === undefined || raw === null) return undefined;
    const f = raw as Record<string, unknown>;
    return { scenarioId: String(f.scenario_id), title: String(f.title), steps: (f.steps as unknown[]).map(String) };
  };

  tools.push({
    name: 'add_backlog_task',
    description:
      'FR-60d (P33-4): add a CANONICAL, FR-TRACED task block under a Phase in TASKS.md — the form contracts ' +
      '(Status/Est/Done-When) + the `_Requirements: [FR-N](FR.md#anchor)_` trace are rendered for you, ids are ' +
      'kept unique, and the write runs the SAME form/anchor/conformance validation-before-write as apply_spec_change ' +
      '(all-or-nothing, EOL preserved). Pass feature:{scenario_id,title,steps} to ALSO plant the scenario in the ' +
      'spec .feature — REFUSED (STEP_DEFS_MISSING) unless every step matches a real step-definition under ' +
      'tests/step_definitions/, or pass tasks_only:true to downgrade to a TASKS-only acceptance pin instead.',
    inputShape: {
      spec: z.string(),
      phase: z.string(),
      title: z.string(),
      id: z.string().optional(),
      est_minutes: z.number().int().positive().optional(),
      depends: z.string().optional(),
      requirements: z.array(z.string()).optional(),
      done_when: z.array(z.string()).optional(),
      feature: DOMAIN_FEATURE_SHAPE.optional(),
      tasks_only: z.boolean().optional(),
      reason: z.string(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) =>
      runDomainLocked('add_backlog_task', args as Record<string, unknown>, () =>
        addBacklogTask(process.cwd(), {
          spec: String(args.spec), phase: String(args.phase), title: String(args.title),
          id: typeof args.id === 'string' ? (args.id as string) : undefined,
          estMinutes: typeof args.est_minutes === 'number' ? (args.est_minutes as number) : undefined,
          depends: typeof args.depends === 'string' ? (args.depends as string) : undefined,
          requirements: Array.isArray(args.requirements) ? (args.requirements as unknown[]).map(String) : undefined,
          doneWhen: Array.isArray(args.done_when) ? (args.done_when as unknown[]).map(String) : undefined,
          feature: toFeature(args.feature),
          tasksOnly: args.tasks_only === true,
        }),
      ),
  });

  tools.push({
    name: 'add_phase',
    description:
      'FR-60d (P33-4): add a canonical `## Phase N — Title (date)` heading at the end of TASKS.md — the number ' +
      'auto-increments past the highest existing phase (or pass it explicitly; duplicates are refused). Runs the ' +
      'SAME form/anchor/conformance validation-before-write as apply_spec_change (EOL preserved, atomic).',
    inputShape: {
      spec: z.string(),
      title: z.string(),
      number: z.number().int().optional(),
      source: z.string().optional(),
      reason: z.string(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) =>
      runDomainLocked('add_phase', args as Record<string, unknown>, () =>
        addPhase(process.cwd(), {
          spec: String(args.spec), title: String(args.title),
          number: typeof args.number === 'number' ? (args.number as number) : undefined,
          source: typeof args.source === 'string' ? (args.source as string) : undefined,
        }),
      ),
  });

  tools.push({
    name: 'amend_requirement',
    description:
      'FR-60d (P33-4): amend an EXISTING FR in FR.md — append body text to its section and/or maintain its ' +
      '`**Связанные AC:**` line with links to existing ACs (created when absent, appended when present). The ' +
      'FR↔AC links use the exact live-heading anchors, so the anchor layer passes; the write runs the SAME ' +
      'form/anchor/conformance validation-before-write as apply_spec_change (EOL preserved, atomic).',
    inputShape: {
      spec: z.string(),
      fr: z.string(),
      text: z.string().optional(),
      related_ac_ids: z.array(z.string()).optional(),
      reason: z.string(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) =>
      runDomainLocked('amend_requirement', args as Record<string, unknown>, () =>
        amendRequirement(process.cwd(), {
          spec: String(args.spec), fr: String(args.fr),
          text: typeof args.text === 'string' ? (args.text as string) : undefined,
          relatedAcIds: Array.isArray(args.related_ac_ids) ? (args.related_ac_ids as unknown[]).map(String) : undefined,
        }),
      ),
  });

  tools.push({
    name: 'add_acceptance_criterion',
    description:
      'FR-60d (P33-4): add a canonical AC to ACCEPTANCE_CRITERIA.md for an EXISTING FR — short-form `## AC-N.M` ' +
      'heading + the `**Требование:** [FR-N](FR.md#anchor)` line (the FR-to-AC covers edge the graph parses), and the ' +
      'FR-side `**Связанные AC:**` link. The id auto-assigns the next free minor of the FR (or pass it explicitly; ' +
      'duplicates are refused). Runs the SAME form/anchor/conformance validation-before-write as apply_spec_change ' +
      '(EOL preserved, atomic).',
    inputShape: {
      spec: z.string(),
      fr: z.string(),
      title: z.string(),
      body: z.string().optional(),
      id: z.string().optional(),
      reason: z.string(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) =>
      runDomainLocked('add_acceptance_criterion', args as Record<string, unknown>, () =>
        addAcceptanceCriterion(process.cwd(), {
          spec: String(args.spec), fr: String(args.fr), title: String(args.title),
          body: typeof args.body === 'string' ? (args.body as string) : undefined,
          id: typeof args.id === 'string' ? (args.id as string) : undefined,
        }),
      ),
  });

  tools.push({
    name: 'register_incident_backlog',
    description:
      'FR-60d (P33-4): capture an incident as a canonical, FR-TRACED task in the `## Backlog` section of TASKS.md ' +
      '(the section is created on demand) — id auto-generated from date+summary (unique), trace + form contracts ' +
      'rendered for you. Pass feature:{scenario_id,title,steps} to ALSO plant a regression scenario — REFUSED ' +
      '(STEP_DEFS_MISSING) unless every step matches a real step-definition under tests/step_definitions/, or pass ' +
      'tasks_only:true to downgrade to a TASKS-only acceptance pin. Runs the SAME validation-before-write as ' +
      'apply_spec_change (EOL preserved, atomic).',
    inputShape: {
      spec: z.string(),
      summary: z.string(),
      date: z.string().optional(),
      requirements: z.array(z.string()).optional(),
      done_when: z.array(z.string()).optional(),
      feature: DOMAIN_FEATURE_SHAPE.optional(),
      tasks_only: z.boolean().optional(),
      reason: z.string(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) =>
      runDomainLocked('register_incident_backlog', args as Record<string, unknown>, () =>
        registerIncidentBacklog(process.cwd(), {
          spec: String(args.spec), summary: String(args.summary),
          date: typeof args.date === 'string' ? (args.date as string) : undefined,
          requirements: Array.isArray(args.requirements) ? (args.requirements as unknown[]).map(String) : undefined,
          doneWhen: Array.isArray(args.done_when) ? (args.done_when as unknown[]).map(String) : undefined,
          feature: toFeature(args.feature),
          tasksOnly: args.tasks_only === true,
        }),
      ),
  });

  // ─── 18b) set_spec_status — explicit SPEC-level backlog marker (no status math) ──
  tools.push({
    name: 'set_spec_status',
    description:
      'Set a SPEC-LEVEL status (active | backlog) EXPLICITLY — not inferred from task states. A ' +
      '`backlog` spec (being built / populated / parked) is EXCLUDED from the task-census, so its ' +
      'open tasks no longer count as "open work" and the claim-evidence Stop-gate (pinator) stops ' +
      'firing on them — you MARK it, the census just reads the marker. `active` (the default) removes ' +
      'the marker. Atomic write of the `.specs/<slug>/.spec-status` sentinel. Takes effect on the next ' +
      'census refresh (any spec edit / door boot).',
    inputShape: {
      spec: z.string(),
      status: z.enum(['active', 'backlog']),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const slug = slugOf(args.spec);
      if (!isSafeSlug(slug)) {
        logSpecAccess('set_spec_status', args, 'error');
        return asJsonResult({ ok: false, error: 'UNSAFE_SPEC', spec: slug, hint: 'slug must stay within .specs/ (no traversal)' });
      }
      try {
        writeSpecStatus(process.cwd(), slug, args.status);
      } catch (e) {
        logSpecAccess('set_spec_status', args, 'error');
        return asJsonResult({ ok: false, error: 'SPEC_NOT_FOUND', spec: slug, hint: String((e as Error).message) });
      }
      registryOpts.refreshGraph?.();
      logSpecAccess('set_spec_status', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, status: args.status });
    },
  });

  // ─── 18a) set_entity_status — FR-48d centralized validated status transition ──
  tools.push({
    name: 'set_entity_status',
    description:
      'FR-48 «жизненный цикл»: transition a task to a new status THROUGH the door. Validates ' +
      'the lifecycle move (todo→ready→in-progress→done + reverse; no skip-to-finish) and, for a ' +
      'WORKING status (ready/in-progress), REFUSES unless the requirement chain is assembled — ' +
      'AC + scenario + design + story (impl tasks); a [spec-phase] task is exempt (anti-deadlock, ' +
      'it authors the legs). On refusal the reply names the missing legs. A valid move flips the ' +
      'Status: marker via the same validated atomic write as apply_spec_change (CAS via expected_sha).',
    inputShape: {
      id: z.string(),
      spec: z.string().optional(),
      to: z.enum(['todo', 'ready', 'in-progress', 'done', 'blocked']),
      expected_sha: z.string().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const ro = readOnlyRefusal('set_entity_status', args);
      if (ro) return ro;
      const res = setEntityStatus(getGraph(), process.cwd(), {
        id: args.id as string,
        spec: typeof args.spec === 'string' ? args.spec : undefined,
        to: args.to as 'todo' | 'ready' | 'in-progress' | 'done' | 'blocked',
        expectedSha: typeof args.expected_sha === 'string' ? args.expected_sha : undefined,
      });
      if (!res.ok) {
        logSpecAccess('set_entity_status', args, 'denied');
        return asJsonResult({
          ok: false,
          error: res.error,
          id: args.id,
          from: res.from,
          to: res.to,
          reason: res.reason,
          missing: res.missing,
          // FR-48e: surface the structured refusal — entity_type + the live computed
          // verdict on a STATUS_DERIVED (derived entities are not hand-set).
          entity_type: res.entityType,
          verdict: res.verdict,
          hint: 'Run /task-status: read the trace, assemble the missing legs, then retry — or mark the task [spec-phase] if it authors them.',
        });
      }
      registryOpts.refreshGraph?.();
      logSpecAccess('set_entity_status', args, 'ok');
      return asJsonResult({ ok: true, id: args.id, from: res.from, to: res.to });
    },
  });

  // ─── 18b) delete_spec_doc — the D of the CRUD door (P19-4, FR-40/FR-43) ──
  // Doc-level ONLY: retiring a WHOLE spec stays FR-43 (human-confirmed archive,
  // auto-retire forbidden). Refuses when the doc's graph nodes have LIVE edges
  // from OTHER files — deleting it would strand dangling references.
  tools.push({
    name: 'delete_spec_doc',
    description:
      'P19-4 (FR-40/FR-43): DELETE one spec document/attachment through the door — the D ' +
      'of the CRUD lifecycle. Containment-checked subpath, mandatory reason, audited. ' +
      'REFUSES: a doc whose graph nodes are referenced by edges from other files ' +
      '(would strand dangling refs), .progress.json/.jira-cache.json (single-writer ' +
      'artifacts), and anything outside .specs/<spec>/. Whole-spec retirement is NOT ' +
      'this tool — FR-43 human-confirmed archive only.',
    inputShape: {
      spec: z.string(),
      doc: z.string(),
      reason: z.string(),
    } as const satisfies z.ZodRawShape,
    handler: async ({ spec, doc, reason }) => {
      const args = { spec, doc, reason };
      const ro = readOnlyRefusal('delete_spec_doc', args);
      if (ro) return ro;
      const slug = slugOf(spec);
      if (!isSafeSlug(slug)) {
        logSpecAccess('delete_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'UNSAFE_SPEC', spec: slug });
      }
      const resolved = resolveSpecDoc(process.cwd(), slug, String(doc));
      if (!resolved.ok) {
        logSpecAccess('delete_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: resolved.reason === 'TRAVERSAL' ? 'DOC_TRAVERSAL' : 'UNSAFE_SPEC', spec: slug, doc: String(doc) });
      }
      const rel = resolved.rel;
      const base = path.basename(rel);
      // Deletable: *.md / *.feature + binary attachments. NOT the single-writer
      // artifacts (.progress.json — spec-status owns it; .jira-cache.json — jira-intake).
      const deletable = /\.(md|feature|png|jpe?g|gif|webp|bmp|pdf|svg)$/i.test(base);
      if (!deletable) {
        logSpecAccess('delete_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'NOT_DELETABLE', spec: slug, doc: rel, hint: 'Only *.md/*.feature and binary attachments are agent-deletable; .progress.json/.jira-cache.json are single-writer artifacts.' });
      }
      if (!fs.existsSync(resolved.abs) || !fs.statSync(resolved.abs).isFile()) {
        logSpecAccess('delete_spec_doc', args, 'not_found');
        return asJsonResult({ ok: false, error: 'DOC_NOT_FOUND', spec: slug, doc: rel });
      }
      // Inbound-edge gate: nodes defined in THIS doc referenced by a REAL node
      // living in ANOTHER file → deletion would strand the reference. Synthetic
      // edge targets (RESULT-*) never resolve to nodes, so runs don't block.
      const graph = getGraph();
      const relFile = `.specs/${slug}/${rel}`;
      const docNodeIds = new Set<string>();
      for (const n of graph.nodes.values()) {
        if (String(n.file).replace(/\\/g, '/') === relFile) docNodeIds.add(n.id);
      }
      const blockers: Array<{ edge: string; from: string; to: string }> = [];
      for (const e of graph.edges) {
        const fromIn = docNodeIds.has(e.from);
        const toIn = docNodeIds.has(e.to);
        if (fromIn === toIn) continue; // internal edge or unrelated
        const outsideId = fromIn ? e.to : e.from;
        const outside = graph.nodes.get(outsideId);
        if (!outside) continue; // synthetic target (RESULT-*) — not a real node
        if (String(outside.file).replace(/\\/g, '/') === relFile) continue;
        if (blockers.length < 10) blockers.push({ edge: e.type, from: e.from, to: e.to });
        else break;
      }
      if (blockers.length > 0) {
        logSpecAccess('delete_spec_doc', args, 'denied');
        return asJsonResult({
          ok: false,
          error: 'LIVE_INBOUND_EDGES',
          spec: slug,
          doc: rel,
          blockers,
          hint: 'Nodes in this doc are referenced from other files — retarget/remove those references first (find_refs shows them), or this deletion strands dangling edges.',
        });
      }
      const bytes = fs.statSync(resolved.abs).size;
      fs.unlinkSync(resolved.abs);
      registryOpts.refreshGraph?.();
      logSpecAccess('delete_spec_doc', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, doc: rel, deleted: true, bytes });
    },
  });

  // ─── 18c) rename_spec_doc — anchors-aware rename/move (P21-5) ─────────────
  // Closes the door's last CRUD gap: rename/move a doc WITHOUT silently
  // stranding inbound markdown links. Default = REFUSE with a Decision block
  // listing inbound `[text](…/FR.md#…)` links from OTHER docs; rewrite_inbound
  // opts into atomic retarget. (delete_spec_doc gates on graph EDGES; this gates
  // on literal markdown anchor links — the layer the Done-When names.)
  tools.push({
    name: 'rename_spec_doc',
    description:
      'P21-5: rename or MOVE a spec document (*.md/*.feature) — within a spec or to another ' +
      'spec (to_spec). Anchors-aware: by DEFAULT refuses with a Decision block listing inbound ' +
      'markdown links (`[text](…/FR.md#…)`) from OTHER docs that the rename would strand; pass ' +
      'rewrite_inbound:true to retarget them atomically. Refuses a destination that already ' +
      'exists (no clobber). Validates the moved doc at its new name (a filename carries parser ' +
      'semantics — FR.md→TASKS.md would mis-parse). Optimistic CAS via expected_sha on the ' +
      'source; atomic write+unlink; audited.',
    inputShape: {
      spec: z.string(),
      doc: z.string(),
      to_doc: z.string(),
      to_spec: z.string().optional(),
      reason: z.string(),
      expected_sha: z.string().optional(),
      rewrite_inbound: z.boolean().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const ro = readOnlyRefusal('rename_spec_doc', args);
      if (ro) return ro;
      const cwd = process.cwd();
      const slug = slugOf(args.spec);
      const toSlug = args.to_spec != null ? slugOf(args.to_spec) : slug;
      const doc = docOf(args.doc);
      const toDoc = docOf(args.to_doc);
      const rewriteInbound = args.rewrite_inbound === true;

      // target gates (safe slug + mutable *.md/*.feature) on BOTH ends.
      const srcBad = validateTarget(slug, doc);
      if (srcBad) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'INVALID_SOURCE', spec: slug, doc, finding: srcBad });
      }
      const dstBad = validateTarget(toSlug, toDoc);
      if (dstBad) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'INVALID_DEST', spec: toSlug, doc: toDoc, finding: dstBad });
      }
      const src = resolveSpecDoc(cwd, slug, doc);
      const dst = resolveSpecDoc(cwd, toSlug, toDoc);
      if (!src.ok || !dst.ok) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'DOC_TRAVERSAL', spec: slug, doc });
      }
      if (src.abs === dst.abs) {
        logSpecAccess('rename_spec_doc', args, 'error');
        return asJsonResult({ ok: false, error: 'NOOP_RENAME', hint: 'source and destination resolve to the same path' });
      }
      if (!fs.existsSync(src.abs) || !fs.statSync(src.abs).isFile()) {
        logSpecAccess('rename_spec_doc', args, 'not_found');
        return asJsonResult({ ok: false, error: 'DOC_NOT_FOUND', spec: slug, doc: src.rel });
      }
      if (fs.existsSync(dst.abs)) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'DEST_EXISTS', spec: toSlug, doc: dst.rel, hint: 'destination already exists — pick a free name or delete it first (no silent clobber)' });
      }

      // P21-5 CAS on the SOURCE — refuse a rename against a stale read.
      const expectedSha = typeof args.expected_sha === 'string' ? args.expected_sha : null;
      if (expectedSha !== null) {
        const cas = casCheck(cwd, slug, src.rel, expectedSha);
        if (!cas.ok) {
          logSpecAccess('rename_spec_doc', args, 'denied');
          return asJsonResult({ ok: false, error: 'CAS_MISMATCH', spec: slug, doc: src.rel, expected_sha: expectedSha, actual_sha: cas.actualSha, hint: 'source changed since you read it (another session?) — re-read for the fresh sha and retry' });
        }
      }

      const content = fs.readFileSync(src.abs, 'utf-8');
      const srcRelFile = `.specs/${slug}/${src.rel}`;
      const dstRelFile = `.specs/${toSlug}/${dst.rel}`;

      // Anchors-aware gate (the Done-When): inbound markdown links from OTHER
      // docs would strand on the rename. Default = refuse with a Decision block.
      const inbound = findInboundLinks(cwd, srcRelFile);
      if (inbound.length > 0 && !rewriteInbound) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({
          ok: false,
          error: 'INBOUND_LINKS_PRESENT',
          spec: slug,
          doc: src.rel,
          inbound_count: inbound.length,
          inbound: inbound.slice(0, 20),
          decision: `Renaming ${srcRelFile} → ${dstRelFile} would strand ${inbound.length} inbound markdown link(s) in other docs. Decide: (a) rewrite_inbound:true to retarget them atomically, (b) fix those links first, or (c) keep the name.`,
          hint: 'Nothing was changed. Pass rewrite_inbound:true to auto-retarget, or update the listed links first.',
        });
      }

      // Validate the moved doc at its NEW name (form + anchor + conformance) — a
      // filename carries parser semantics (FR.md→TASKS.md mis-parses).
      const v = validateSpecChange(cwd, toSlug, dst.rel, { content });
      if (v.specMissing) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'DEST_SPEC_MISSING', spec: toSlug, hint: 'destination spec does not exist — create_spec first' });
      }
      if (!v.ok) {
        logSpecAccess('rename_spec_doc', args, 'denied');
        return asJsonResult({ ok: false, error: 'VALIDATION_FAILED', spec: toSlug, doc: dst.rel, findings: v.findings, hint: 'the doc does not validate at its new name/location — fix or pick another target' });
      }

      // Execute: write dest, retarget inbound links (if opted in), delete source.
      // Inbound edits are arbitrary corpus files (other specs), not (slug,doc)
      // pairs — write them directly; the moved doc itself goes atomic.
      writeDocAtomic(cwd, toSlug, dst.rel, content);
      let rewroteFiles = 0;
      if (rewriteInbound && inbound.length > 0) {
        for (const edit of rewriteInboundLinks(cwd, inbound, dstRelFile)) {
          fs.writeFileSync(path.join(cwd, edit.file), edit.content, 'utf-8');
          rewroteFiles++;
        }
      }
      fs.unlinkSync(src.abs);
      registryOpts.refreshGraph?.();
      logSpecAccess('rename_spec_doc', args, 'ok');
      return asJsonResult({ ok: true, spec: slug, from: src.rel, to_spec: toSlug, to: dst.rel, sha: docSha(content), inbound_count: inbound.length, rewrote_inbound_files: rewroteFiles, findings: [] });
    },
  });

  // ─── 19) create_spec — FR-40a scaffold through MCP (P17-2) ───────────────
  tools.push({
    name: 'create_spec',
    description:
      'FR-40a: create a new spec THROUGH the server — wraps the engine scaffold ' +
      '(templates are born verdict-GREEN). kebab-case slug; refuses an existing spec.',
    inputShape: { slug: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ slug }) => {
      const ro = readOnlyRefusal('create_spec', { slug });
      if (ro) return ro;
      const name = String(slug);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        logSpecAccess('create_spec', { slug: name }, 'error');
        return asJsonResult({ ok: false, error: 'BAD_SLUG', hint: 'kebab-case: [a-z0-9-]' });
      }
      // Windows reserved device names collide with real files even with an
      // extension — refuse as a spec slug (review #10).
      if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) {
        logSpecAccess('create_spec', { slug: name }, 'error');
        return asJsonResult({ ok: false, error: 'RESERVED_SLUG', hint: 'slug collides with a Windows reserved device name' });
      }
      if (fs.existsSync(path.join(process.cwd(), '.specs', name))) {
        logSpecAccess('create_spec', { slug: name }, 'denied');
        return asJsonResult({ ok: false, error: 'SPEC_EXISTS', spec: name });
      }
      const core = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'specs-generator', 'specs-generator-core.mjs');
      const r = spawnSync(process.execPath, [core, 'scaffold-spec', '-Name', name], {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 60_000,
        // Without this the core resolves repoRoot from its SCRIPT location and
        // scaffolds into the ENGINE repo, not the server's corpus (caught by
        // the live probe: newborn-mcp landed in the real .specs/).
        env: { ...process.env, SPECS_GENERATOR_ROOT: process.cwd() },
      });
      if (r.status !== 0) {
        logSpecAccess('create_spec', { slug: name }, 'error');
        return asJsonResult({ ok: false, error: 'SCAFFOLD_FAILED', stderr: (r.stderr ?? '').slice(0, 500) });
      }
      registryOpts.refreshGraph?.();
      logSpecAccess('create_spec', { slug: name }, 'ok');
      const docs = fs.readdirSync(path.join(process.cwd(), '.specs', name)).sort();
      return asJsonResult({ ok: true, spec: name, docs, hint: 'Born verdict-GREEN; fill via apply_spec_change.' });
    },
  });

  // ─── 20+21) archival door (FR-45) — proof + gated move ───────────────────
  const normalizeSlug = (s: string): string =>
    String(s).replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
  // The DECISIVE safety proof: does any LIVE spec still depend on this one?
  // Two carriers — both must be checked or a still-referenced spec is falsely
  // archived (the "наоборот ошибка" case the user named):
  //   (1) GRAPH EDGES (covers/tested-by/implements) — rare cross-spec, but exact.
  //   (2) MARKDOWN/PATH links in prose — `[text](../<slug>/FR.md#…)`, the COMMON
  //       cross-spec reference (intra-spec edges dominate the graph; prose links
  //       carry the real coupling). Scanned across other live, non-archived specs.
  const liveInboundRefs = (graph: SpecGraph, slug: string): Array<{ from: string; to: string; type: string }> => {
    const out: Array<{ from: string; to: string; type: string }> = [];
    const seen = new Set<string>();
    const add = (from: string, to: string, type: string): void => {
      const k = `${from}|${to}|${type}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ from, to, type });
    };
    // (1) graph edges
    for (const e of graph.edges) {
      if (String(e.to).split(':')[0] !== slug) continue;
      const fromSpec = String(e.from).split(':')[0];
      if (fromSpec === slug || isArchivedSlug(fromSpec)) continue;
      add(e.from, e.to, String(e.type));
    }
    // (2) markdown/path links from OTHER live specs into .specs/<slug>/
    const specsDir = path.join(process.cwd(), '.specs');
    if (fs.existsSync(specsDir)) {
      // Match only live SPEC links (`.specs/<slug>/`, `../<slug>/`, markdown `](...<slug>/`).
      // Do NOT match bare `/<slug>/` — that false-positives on runtime dirs like `tools/claim-evidence-gate/`.
      const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linkRe = new RegExp(`(?:\\.specs/${esc}/|\\.\\./${esc}/|\\]\\([^)\\n]*${esc}/)`);
      const walk = (dir: string, otherSlug: string): void => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, ent.name);
          if (ent.isDirectory()) { walk(abs, otherSlug); continue; }
          if (!/\.(md|feature)$/.test(ent.name)) continue;
          let body = '';
          try { body = fs.readFileSync(abs, 'utf-8'); } catch { continue; }
          if (linkRe.test(body)) {
            add(`.specs/${otherSlug}/${path.relative(path.join(specsDir, otherSlug), abs).replace(/\\/g, '/')}`, `.specs/${slug}/`, 'md-link');
          }
        }
      };
      for (const ent of fs.readdirSync(specsDir, { withFileTypes: true })) {
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
        if (ent.name === slug || isArchivedSlug(ent.name)) continue;
        walk(path.join(specsDir, ent.name), ent.name);
      }
    }
    return out;
  };

  tools.push({
    name: 'get_archival_proof',
    description:
      'FR-45a: graph-derived safety proof for archiving ONE spec — every LIVE inbound ' +
      'reference from OTHER specs to its nodes. Verdict: KEEP_FALSE_POSITIVE (live refs → ' +
      'NOT abandoned), ARCHIVE (no live refs → graph-clear), SPEC_NOT_FOUND / ALREADY_ARCHIVED. ' +
      'Supersession is the agent’s legacy-triage signal, layered on this.',
    inputShape: { slug: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ slug }) => {
      const graph = getGraph();
      const s = normalizeSlug(String(slug));
      if (isArchivedSlug(s)) return asJsonResult({ ok: false, error: 'ALREADY_ARCHIVED', slug: s });
      const hasNodes = [...graph.nodes.values()].some((n) => String(n.file).replace(/\\/g, '/').includes(`.specs/${s}/`));
      if (!hasNodes) return asJsonResult({ ok: false, error: 'SPEC_NOT_FOUND', slug: s, hint: 'check list_specs for loaded slugs' });
      const refs = liveInboundRefs(graph, s);
      const verdict = refs.length > 0 ? 'KEEP_FALSE_POSITIVE' : 'ARCHIVE';
      return asJsonResult({
        ok: true,
        slug: s,
        verdict,
        live_inbound_count: refs.length,
        live_inbound_refs: refs.slice(0, 50),
        note: verdict === 'KEEP_FALSE_POSITIVE'
          ? `${refs.length} live spec ref(s) → ${s} is NOT abandoned; archiving would strand them.`
          : `No live spec references ${s} — graph-clear to archive (combine with the agent's supersession signal).`,
      });
    },
  });

  tools.push({
    name: 'archive_spec',
    description:
      'FR-45b: the sanctioned, gated whole-spec move `.specs/<slug>/` → `.specs/archive/<slug>/`. ' +
      'Re-checks live inbound refs → ARCHIVE_BLOCKED if any; refuses a clobber (DEST_EXISTS); ' +
      'appends an audit line. The builder drops archive/ from the live graph; the move is read ' +
      'back via git history (the archive is then SEALED against the mutation door).',
    inputShape: { slug: z.string(), reason: z.string() } as const satisfies z.ZodRawShape,
    handler: async ({ slug, reason }) => {
      const ro = readOnlyRefusal('archive_spec', { slug, reason });
      if (ro) return ro;
      const cwd = process.cwd();
      const s = normalizeSlug(String(slug));
      if (!isSafeSlug(s) || isArchivedSlug(s)) {
        logSpecAccess('archive_spec', { slug: s }, 'denied');
        return asJsonResult({ ok: false, error: 'INVALID_SLUG', slug: s, hint: 'a safe, non-archived slug' });
      }
      const refs = liveInboundRefs(getGraph(), s);
      if (refs.length > 0) {
        logSpecAccess('archive_spec', { slug: s }, 'denied');
        return asJsonResult({ ok: false, error: 'ARCHIVE_BLOCKED', slug: s, live_inbound_count: refs.length, live_inbound_refs: refs.slice(0, 50), hint: 'live specs still reference this — redirect those refs first, or it is a KEEP false positive' });
      }
      const srcAbs = path.join(cwd, '.specs', s);
      const dstAbs = path.join(cwd, '.specs', 'archive', s);
      if (!fs.existsSync(srcAbs) || !fs.statSync(srcAbs).isDirectory()) {
        logSpecAccess('archive_spec', { slug: s }, 'not_found');
        return asJsonResult({ ok: false, error: 'SPEC_NOT_FOUND', slug: s });
      }
      if (fs.existsSync(dstAbs)) {
        logSpecAccess('archive_spec', { slug: s }, 'denied');
        return asJsonResult({ ok: false, error: 'DEST_EXISTS', slug: s, hint: 'already archived (no clobber)' });
      }
      fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
      fs.renameSync(srcAbs, dstAbs);
      try {
        const ledger = path.join(cwd, '.dev-pomogator', 'logs', 'spec-archive.jsonl');
        fs.mkdirSync(path.dirname(ledger), { recursive: true });
        fs.appendFileSync(ledger, JSON.stringify({ ts: new Date().toISOString(), slug: s, reason: String(reason ?? ''), from: `.specs/${s}/`, to: `.specs/archive/${s}/` }) + '\n');
      } catch { /* best-effort */ }
      registryOpts.refreshGraph?.();
      logSpecAccess('archive_spec', { slug: s }, 'ok');
      return asJsonResult({ ok: true, slug: s, from: `.specs/${s}/`, to: `.specs/archive/${s}/`, hint: 'moved out of the live graph; commit the move with git' });
    },
  });

  // ─── FR-84) consolidated validation + bounded remediation ───────────────
  // These wrappers delegate to the canonical spec-verdict/reality analysis and
  // existing proposal store. They do not introduce another writer or verdict.
  const SEMANTIC_FINDING_SHAPE = z.object({
    layer: z.string().optional(),
    code: z.string().min(1),
    severity: z.enum(['error', 'warning', 'info', 'ERROR', 'WARNING', 'INFO']).optional(),
    spec: z.string().optional(),
    doc: z.string().optional(),
    node: z.string().optional(),
    nodeId: z.string().optional(),
    relatedId: z.string().optional(),
    location: z.object({ file: z.string().optional(), line: z.number().int().min(1).optional(), column: z.number().int().min(1).optional() }).optional(),
    message: z.string().min(1),
    details: z.string().optional(),
    repairClass: z.enum(['PROPOSAL_ONLY', 'DECISION_REQUIRED', 'NONE']).optional(),
    source: z.string().optional(),
  });
  const PATCH_EDIT_INPUT_SHAPE = z.object({
    spec: z.string(),
    doc: z.string(),
    section: z.object({
      kind: z.enum(['append_to_section', 'insert_after_heading', 'insert_at_eof']),
      heading: z.string().optional(),
      text: z.string(),
    }).optional(),
    replace: z.object({
      heading: z.string(),
      old_string: z.string(),
      new_string: z.string(),
      replace_all: z.boolean().optional(),
      normalize_eol: z.boolean().optional(),
      expected_section_sha: z.string().optional(),
    }).optional(),
    content: z.string().optional(),
    expected_sha: z.string().optional(),
  });
  const REPAIR_CANDIDATE_SHAPE = z.object({
    id: z.string().optional(),
    source: z.enum(['mechanical', 'sanctioned-form', 'semantic']),
    repairClass: z.enum(['SAFE_MCP_PATCH', 'SANCTIONED_FORM', 'PROPOSAL_ONLY', 'DECISION_REQUIRED', 'NONE']),
    spec: z.string(),
    findingFingerprints: z.array(z.string()).optional(),
    findingCodes: z.array(z.string()).optional(),
    dependencies: z.array(z.string()).optional(),
    reason: z.string().optional(),
    edits: z.array(PATCH_EDIT_INPUT_SHAPE).max(50),
  });
  const remediationRoot = (): string => path.resolve(registryOpts.repoRoot ?? process.cwd());

  tools.push({
    name: 'validate_spec',
    description: 'FR-84: run the consolidated read-only multilayer validation for one spec and return stable findings, snapshot hashes, and the authoritative smart verdict. Writes nothing.',
    inputShape: {
      spec: z.string(),
      semantic_findings: z.array(SEMANTIC_FINDING_SHAPE).max(200).optional(),
      semantic_required: z.boolean().optional(),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const result = await analyzeRemediation({
        repoRoot: remediationRoot(),
        spec: String(args.spec),
        semanticFindings: args.semantic_findings,
        semanticRequired: args.semantic_required === true,
      });
      logSpecAccess('validate_spec', { spec: result.spec, findings: result.findings.length }, 'ok');
      return asJsonResult({ ok: true, ...result });
    },
  });

  tools.push({
    name: 'propose_spec_repairs',
    description: 'FR-84: validate and DRY-RUN bounded deterministic spec repairs. Only mechanical/sanctioned-form candidates may become a proposal; semantic choices are refused. Writes nothing.',
    inputShape: {
      spec: z.string(),
      semantic_findings: z.array(SEMANTIC_FINDING_SHAPE).max(200).optional(),
      semantic_required: z.boolean().optional(),
      repair_candidates: z.array(REPAIR_CANDIDATE_SHAPE).max(50),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      const result = await proposeSpecRepairs({
        repoRoot: remediationRoot(),
        spec: String(args.spec),
        semanticFindings: args.semantic_findings,
        semanticRequired: args.semantic_required === true,
        repairCandidates: args.repair_candidates,
      });
      logSpecAccess('propose_spec_repairs', { spec: result.spec, proposal_id: result.proposalId ?? null }, result.ok ? 'ok' : 'denied');
      return asJsonResult({ ...result, dry_run: true });
    },
  });

  tools.push({
    name: 'apply_spec_repairs',
    description: 'FR-84: apply a proposal minted by propose_spec_repairs only. Reuses fresh MCP proposal validation, CAS, all-or-nothing writes, rollback, and mandatory final multilayer validation.',
    inputShape: {
      proposal_id: z.string().min(1),
      reason: z.string().min(1),
    } as const satisfies z.ZodRawShape,
    handler: async (args) => {
      try {
        const result = await applySpecRepairs(remediationRoot(), String(args.proposal_id));
        if (result.ok) registryOpts.refreshGraph?.();
        logSpecAccess('apply_spec_repairs', { proposal_id: args.proposal_id, reason: args.reason }, result.ok ? 'ok' : 'denied');
        return asJsonResult(result);
      } catch (error) {
        logSpecAccess('apply_spec_repairs', { proposal_id: args.proposal_id, reason: args.reason }, 'denied');
        return asJsonResult({
          ok: false,
          error: error instanceof Error && error.message.startsWith('PROPOSAL_NOT_FOUND') ? 'PROPOSAL_NOT_FOUND' : 'REMEDIATION_FAILED',
          proposal_id: args.proposal_id,
          hint: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  return tools;
}
