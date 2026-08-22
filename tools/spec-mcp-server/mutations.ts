/**
 * FR-40 — the «живой генератор» mutation engine (P17-2).
 *
 * Spec writes go THROUGH the server: the change is applied IN MEMORY, the
 * result is validated by the EXISTING engine (no second validator — the
 * anti-pattern FR-40a forbids), and only a clean result touches the disk
 * (atomic temp+rename). Any newly introduced error, staged warning, or TASKS
 * truth violation → refusal with findings; the agent fixes and retries.
 *
 * Validation layers (all reuse, none re-implemented):
 *   1. form contracts   — spec-form-parsers by doc basename (the same parsers
 *                         the live form-guards run);
 *   2. anchors          — anchor-integrity `checkLinks` over the spec's md
 *                         files with the changed doc swapped in-memory;
 *   3. FR metadata      — the shared graph parser's metadataIssues delta for
 *                         patched FR.md cards, including FR-85 field diagnostics;
 *   4. conformance      — `checkConformance` over a graph built from a TEMP
 *                         CLONE of the spec dir; errors/staged warnings are
 *                         delta-gated, and TASKS writes also gate new truth
 *                         violations. The real tree stays untouched until pass.
 *
 * Graph freshness (FR-40c): inside the running MCP server the FR-14 watcher
 * patches the graph on the write; callers without a watcher (tests, one-shot
 * embedders) pass `refreshGraph` explicitly.
 *
 * @see .specs/spec-generator-v4/FR.md FR-40, NFR.md NFR-Reliability-11
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkLinks } from '../anchor-integrity/check.mjs';
import { buildGraph } from '../spec-graph/builder.ts';
import { parseNdjsonFile, applyTestResults } from '../spec-graph/parsers/ndjson.ts';
import { checkConformance, type Finding } from '../spec-graph/conformance.ts';
import { featureStrengthFindings } from '../spec-graph/feature-strength.ts';
import { computeCoverage, specOf, type ScenarioLike, type TaskLike } from '../spec-graph/coverage.ts';
import type { ScenarioNode, SpecGraph, TaskNode } from '../spec-graph/types.ts';
import { withWriteLock } from './lock-manager.ts';
import {
  parseTaskBlocks,
  parseUserStoryBlocks,
  parseDecisionBlocks,
  parseChkRows,
} from '../specs-validator/spec-form-parsers.ts';

export type SpecChange =
  | { content: string }
  | { old_string: string; new_string: string; replace_all?: boolean };

export interface MutationFinding {
  layer: 'form' | 'anchor' | 'conformance' | 'change' | 'target' | 'strength';
  message: string;
  line?: number;
}

/** Docs the agent may mutate: markdown + gherkin only. The extension MUST be
 *  canonical lowercase `.md`/`.feature` — a mixed-case `FR.MD` would skip the
 *  case-sensitive gates AND overwrite the real `FR.md` on a case-insensitive FS
 *  (review #1, HIGH). .progress.json is DELIBERATELY excluded — "only via
 *  spec-status.ts" (single-writer rule), never an agent write. */
const MUTABLE_DOC_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.(md|feature)$/;
/** Slug: nested dirs allowed (backlog/foo); NO traversal, drive, or abs path,
 *  no empty path segment (`a//b`), no trailing slash. */
const SAFE_SLUG_RE = /^[a-z0-9]([a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*)?$/;

/**
 * Is a spec slug safe to resolve under `.specs/`? The ONE slug gate — shared by
 * the mutation tools (validateTarget) AND the read tools (read_spec_doc /
 * list_spec_docs), so a read can't escape `.specs/` either (a `spec:'../secret'`
 * read leaked an out-of-tree file before this was shared — 2026-06-07 review).
 */
export function isSafeSlug(slug: string): boolean {
  return SAFE_SLUG_RE.test(slug) && !slug.includes('..');
}

/**
 * Is a slug under `.specs/archive/`? Archived specs are RETIRED (FR-43c / the
 * archival lifecycle): the builder skips `archive/` (out of the live graph), so
 * they must be SEALED against the mutation door — no apply_spec_change /
 * delete_spec_doc / rename_spec_doc may touch them. The sanctioned way INTO the
 * archive is `archive_spec` (a whole-dir move), not a per-doc write; the way OUT
 * is a deliberate human `git` op. Reaching content stays read-only via git history.
 */
export function isArchivedSlug(slug: string): boolean {
  return slug === 'archive' || slug.startsWith('archive/');
}

/**
 * Resolve a (slug, doc) reference — where `doc` MAY be a SUBPATH
 * (`ARCHITECTURE/AXIS-1.md`, `attachments/diagram.png`) — to an absolute path
 * GUARANTEED to stay inside `.specs/<slug>/` (P19-6). This REPLACES the old
 * `path.basename(doc)` strip used by the read/write tools: basename silently
 * FLATTENED subpaths (so subdir docs were unreachable) while neutralizing
 * traversal as a side effect. Here we keep subpaths reachable AND keep the
 * traversal door shut with a real containment check — `path.resolve` collapses
 * `..`, then the resolved path must still be a descendant of the spec root, so
 * `../../etc/passwd`, an absolute `/etc/passwd`, or a Windows drive path all land
 * OUTSIDE and are rejected (mirrors the 2026-06-07 leak that motivated isSafeSlug).
 */
export function resolveSpecDoc(
  repoRoot: string,
  slug: string,
  doc: string,
): { ok: true; abs: string; rel: string } | { ok: false; reason: 'UNSAFE_SPEC' | 'BAD_DOC' | 'TRAVERSAL' } {
  if (!isSafeSlug(slug)) return { ok: false, reason: 'UNSAFE_SPEC' };
  const relRaw = String(doc).replace(/\\/g, '/').replace(/^\/+/, '');
  if (relRaw === '' || relRaw.includes('\0')) return { ok: false, reason: 'BAD_DOC' };
  const specRoot = path.resolve(repoRoot, '.specs', slug);
  const abs = path.resolve(specRoot, relRaw);
  const rootWithSep = specRoot.endsWith(path.sep) ? specRoot : specRoot + path.sep;
  // abs must be a STRICT descendant of specRoot (not the dir itself, not outside).
  if (!abs.startsWith(rootWithSep)) return { ok: false, reason: 'TRAVERSAL' };
  return { ok: true, abs, rel: path.relative(specRoot, abs).replace(/\\/g, '/') };
}

/**
 * Reject an unsafe (slug, doc) target BEFORE any fs touch. Closes the edge
 * cases the 2026-06-07 mutation-tools review confirmed:
 *   - slug traversal (`../escape`) → arbitrary write outside .specs/ (HIGH);
 *   - mixed-case extension (`FR.MD`) → skipped all validation gates, then
 *     overwrote the real FR.md on a case-insensitive FS (HIGH);
 *   - non-md/feature docs (`.progress.json`, `*.jsonl`) → wrote unvalidated
 *     garbage through every gate.
 */
export function validateTarget(slug: string, doc: string): MutationFinding | null {
  if (!isSafeSlug(slug)) {
    return { layer: 'target', message: `unsafe spec slug "${slug}" — kebab-case, nested ok, no traversal/abs path` };
  }
  // Seal the archive: retired specs under .specs/archive/ are read-only through
  // the mutation door (FR-43c / archival lifecycle). The message is prefixed
  // ARCHIVE_SEALED so the door + tests recognise this specific denial.
  if (isArchivedSlug(slug)) {
    return { layer: 'target', message: `ARCHIVE_SEALED: "${slug}" is under .specs/archive/ — archived specs are read-only via the mutation door; un-archive with a deliberate git move` };
  }
  // P19-6: doc MAY be a SUBPATH (.architecture-research/1-stage.md). Containment is
  // a pure relative check (no segment may be '', '.', '..'; no drive/abs) — keeps
  // the traversal door shut that the old MUTABLE_DOC_RE (no-slash) closed implicitly.
  const rel = normalizeContainedDoc(doc);
  if (rel === null) {
    return { layer: 'target', message: `doc "${doc}" escapes the spec root — no traversal/abs/drive path` };
  }
  // The EXTENSION gate is on the basename (so a subdir AXIS-1.md passes; FR.MD / .progress.json do not).
  if (!MUTABLE_DOC_RE.test(path.basename(rel))) {
    return {
      layer: 'target',
      message: `doc "${doc}" is not a mutable spec document — only *.md / *.feature (NOT .progress.json: single-writer via spec-status)`,
    };
  }
  return null;
}

/** Pure relative containment: returns the '/'-normalized rel path, or null if it
 *  escapes (absolute, drive, or any `.`/`..`/empty segment). Shared by the write
 *  gate; the read tools use `resolveSpecDoc` (absolute, repoRoot-anchored). */
export function normalizeContainedDoc(doc: string): string | null {
  const rel = String(doc).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.includes('\0') || /^[A-Za-z]:/.test(rel)) return null;
  if (rel.split('/').some((s) => s === '' || s === '.' || s === '..')) return null;
  return rel;
}

/** P21-5 CAS: sha256 of a doc's content — the optimistic-concurrency token. The
 *  agent gets it from read_spec_doc and passes it back as `expected_sha`. */
export function docSha(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * P21-5 optimistic CAS: refuse a write whose `expectedSha` no longer matches the
 * doc on disk — i.e. another session changed it since the caller read it (the
 * last-write-wins hazard the multi-session door, P21-1, surfaced). Returns ok
 * when the doc is byte-identical to what the caller saw; otherwise the actual
 * sha (null = doc absent) so the caller re-reads and retries. A missing
 * `expectedSha` opts OUT (back-compat — unconditional write).
 */
export function casCheck(
  repoRoot: string,
  slug: string,
  doc: string,
  expectedSha: string,
): { ok: true } | { ok: false; actualSha: string | null } {
  const rel = normalizeContainedDoc(doc);
  const abs = rel === null ? null : path.join(repoRoot, '.specs', slug, rel);
  const current = abs && fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null;
  const actualSha = current === null ? null : docSha(current);
  return actualSha === expectedSha ? { ok: true } : { ok: false, actualSha };
}

/** Apply the FR-40a change shape to current content (in memory, never disk). */
export function applyChange(
  current: string | null,
  change: SpecChange,
): { ok: true; next: string } | { ok: false; finding: MutationFinding } {
  if ('content' in change) return { ok: true, next: change.content };
  if (current === null) {
    return {
      ok: false,
      finding: { layer: 'change', message: 'old_string change on a non-existent doc — use {content} to create it' },
    };
  }
  const occurrences = current.split(change.old_string).length - 1;
  if (occurrences === 0) {
    return { ok: false, finding: { layer: 'change', message: 'old_string not found in the document' } };
  }
  if (occurrences > 1 && !change.replace_all) {
    return {
      ok: false,
      finding: {
        layer: 'change',
        message: `old_string is not unique (${occurrences} occurrences) — pass replace_all or a longer anchor`,
      },
    };
  }
  const next = change.replace_all
    ? current.split(change.old_string).join(change.new_string)
    : current.replace(change.old_string, change.new_string);
  return { ok: true, next };
}

const FORM_CONTRACTS: Record<string, string> = {
  'TASKS.md': 'Contract: `- [ ] <title> — id: <id> — Status: TODO|READY|IN_PROGRESS|DONE|BLOCKED | Est: <N>m`, followed by `**Done When:**` and at least one `- [ ]` checkbox; or a standalone `_waived: <reason>_` line.',
  'USER_STORIES.md': 'Contract: `### User Story <N>: <title> (Priority: P1|P2|P3)` with `**Why:**`, `**Independent Test:**`, and `**Acceptance Scenarios:**`. Use `Skill("discovery-forms")` to render it.',
  'DESIGN.md': 'Contract: `### Decision: <title>` with `**Rationale:**`, `**Trade-off:**`, and `**Alternatives considered:**` followed by at least two `- ...` bullets (a table does not count).',
  'REQUIREMENTS.md': 'Contract: a table row `| CHK-FR<n>-<nn> | requirement | FR-N + (AC-N or @featureN or UC-N) | BDD scenario|Unit test|Manual review|Integration test|N/A | Draft|In Progress|Verified|Blocked | notes |`.',
};

/** Layer 1 — the SAME parsers the live form-guards run, by doc basename. */
function formFindings(doc: string, content: string): MutationFinding[] {
  const out: MutationFinding[] = [];
  const base = path.basename(doc);
  const contract = FORM_CONTRACTS[base] ?? '';
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const push = (blocks: Array<{ missingFirst: string | null; lineNumber: number }>, label: string): void => {
    for (const b of blocks) {
      if (b.missingFirst) out.push({ layer: 'form', line: b.lineNumber, message: `${label}: missing ${b.missingFirst}. ${contract}` });
    }
  };
  switch (base) {
    case 'TASKS.md':
      push(parseTaskBlocks(content).filter((b) => !b.waived), 'task');
      break;
    case 'USER_STORIES.md':
      push(parseUserStoryBlocks(content), 'user story');
      lines.forEach((line, index) => {
        if (/^###\s+User Story\b/.test(line) && !/^###\s+User Story\s+\d+\b/.test(line)) {
          out.push({ layer: 'form', line: index + 1, message: `user story: invalid heading (a numeric story id is required). ${contract}` });
        }
      });
      break;
    case 'DESIGN.md':
      push(parseDecisionBlocks(content), 'decision');
      lines.forEach((line, index) => {
        if (/^###\s+Decision\b/.test(line) && !/^###\s+Decision:/.test(line)) {
          out.push({ layer: 'form', line: index + 1, message: `decision: invalid heading (the colon after Decision is required). ${contract}` });
        }
      });
      break;
    case 'REQUIREMENTS.md':
      push(parseChkRows(content) as never, 'CHK row');
      break;
  }
  return out;
}

/**
 * Form validation is monotonic, like the anchor and conformance layers: legacy
 * debt remains visible to audits but cannot wedge an unrelated door mutation.
 * The multiset delta deliberately excludes line numbers so inserting prose
 * above an unchanged malformed block does not make that block look new. Counts
 * still matter: adding a third identical malformed task beside two legacy ones
 * yields one blocking finding.
 */
function formDeltaFindings(doc: string, before: string, after: string): MutationFinding[] {
  return deltaByKey(formFindings(doc, before), formFindings(doc, after), (finding) => finding.message);
}

interface BrokenAnchor {
  file: string;
  line: number;
  brokenAnchor: string;
  targetFile: string;
}

/** Build the spec's md file list, optionally swapping ONE doc's content. */
function specMdFiles(
  repoRoot: string,
  slug: string,
  swapDoc?: string,
  swapContent?: string,
): Array<{ file: string; content: string }> {
  const dir = path.join(repoRoot, '.specs', slug);
  const files: Array<{ file: string; content: string }> = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    files.push({
      file: `.specs/${slug}/${name}`,
      content: name === swapDoc ? swapContent! : fs.readFileSync(path.join(dir, name), 'utf-8'),
    });
  }
  if (swapDoc && swapDoc.endsWith('.md') && !files.some((f) => f.file.endsWith(`/${swapDoc}`))) {
    files.push({ file: `.specs/${slug}/${swapDoc}`, content: swapContent! }); // newly created doc
  }
  return files;
}

// Key WITHOUT line (a localized edit shifts line numbers, so a pre-existing
// break that merely moved must NOT read as new) but WITH targetFile: two links
// sharing a fragment name yet pointing at DIFFERENT files are distinct breaks
// and must not mask one another (2026-06-07 review, medium).
const anchorKey = (b: BrokenAnchor): string => `${b.file}#${b.targetFile}#${b.brokenAnchor}`;

/**
 * Layer 2 — anchors, DELTA-ONLY. A mutation is blamed only for broken anchors
 * it INTRODUCES, never for pre-existing breakage in sibling docs (a fresh
 * scaffold ships placeholder `#uc-N-…` cross-refs; whole-spec strictness would
 * block every unrelated edit — caught live 2026-06-07). Counts by key, not a
 * presence-Set, so ADDING a 2nd broken link with the same key as a pre-existing
 * one is still reported (the after-count exceeds the baseline-count).
 */
function anchorFindings(repoRoot: string, slug: string, doc: string, next: string): MutationFinding[] {
  const remaining = new Map<string, number>();
  for (const b of checkLinks(specMdFiles(repoRoot, slug)) as BrokenAnchor[]) {
    remaining.set(anchorKey(b), (remaining.get(anchorKey(b)) ?? 0) + 1);
  }
  const after = checkLinks(specMdFiles(repoRoot, slug, doc, next)) as BrokenAnchor[];
  const out: MutationFinding[] = [];
  for (const b of after) {
    const k = anchorKey(b);
    const left = remaining.get(k) ?? 0;
    if (left > 0) {
      remaining.set(k, left - 1); // covered by a pre-existing identical break
      continue;
    }
    out.push({
      layer: 'anchor',
      line: b.line,
      message: `broken anchor #${b.brokenAnchor} → ${b.targetFile} (${b.file})`,
    });
  }
  return out;
}

/** Layer 3 — conformance over a TEMP CLONE with the change applied. */
function buildMutationGraph(repoRoot: string, slug: string, doc: string, next: string): SpecGraph {
  const specDir = path.join(repoRoot, '.specs', slug);
  if (!fs.existsSync(specDir)) throw new Error(`spec ${slug} does not exist`);
  fs.mkdirSync(path.dirname(path.join(specDir, doc)), { recursive: true });
  fs.writeFileSync(path.join(specDir, doc), next);
  return buildGraph({
    repoRoot,
    skipNdjson: true,
    mdRoots: [path.join('.specs', slug)],
    featureRoots: [path.join('.specs', slug)],
  });
}
/**
 * FR-85 authoring gate: when an FR document is staged through the mutation door,
 * inspect the patched graph's FR-local metadata with the shared parser and return
 * field-level contract findings before any disk write. This is deliberately a
 * parser reuse, not a second contract schema.
 */
function frMetadataContractFindings(
  repoRoot: string,
  slug: string,
  doc: string,
  next: string,
): MutationFinding[] {
  if (path.basename(doc).toLowerCase() !== 'fr.md') return [];
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-metadata-mutate-'));
  try {
    const srcDir = path.join(repoRoot, '.specs', slug);
    const dstDir = path.join(tmpRoot, '.specs', slug);
    fs.cpSync(srcDir, dstDir, { recursive: true });
    const beforeGraph = buildGraph({
      repoRoot: tmpRoot,
      skipNdjson: true,
      mdRoots: [path.join('.specs', slug)],
      featureRoots: [path.join('.specs', slug)],
    });
    const graph = buildMutationGraph(tmpRoot, slug, doc, next);
    const targetFile = path.posix.join('.specs', slug, doc.replace(/\\/g, '/'));
    const issueKey = (node: { id: string }, issue: { code: string; path: string; message: string }) =>
      `${node.id}|${issue.code}|${issue.path}|${issue.message}`;
    const beforeIssues = new Set(
      [...beforeGraph.nodes.values()].flatMap((node) => (node.type === 'FR' && node.file.replace(/\\/g, '/') === targetFile)
        ? (node.metadataIssues ?? []).map((issue) => issueKey(node, issue))
        : []),
    );
    const findings: MutationFinding[] = [];
    for (const node of graph.nodes.values()) {
      if (node.type !== 'FR' || node.file.replace(/\\/g, '/') !== targetFile) continue;
      for (const issue of node.metadataIssues ?? []) {
        if (beforeIssues.has(issueKey(node, issue))) continue;
        findings.push({
          layer: 'conformance',
          line: node.line,
          message: `${issue.code}: ${issue.path}: ${issue.message}`,
        });
      }
    }
    return findings;
  } catch (error) {
    return [{ layer: 'conformance', message: `FR metadata validation failed: ${error instanceof Error ? error.message : error}` }];
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}


/**
 * Exported for FR-67 (SPECGEN004_592): the BDD scenario drives this SAME delta
 * gate the MCP transaction handlers use internally, with a hand-injected
 * invalid candidate edge — see feature67_edge_contracts.ts. Markdown parsers
 * are endpoint-safe (no parser path can stage an invalid edge), so testing the
 * public propose_patch/apply_spec_transaction surface with a markdown fixture
 * cannot exercise this gate honestly; testing the gate function directly does.
 */
export function deltaByKey<T>(before: T[], after: T[], keyOf: (value: T) => string): T[] {
  const remaining = new Map<string, number>();
  for (const value of before) {
    const key = keyOf(value);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return after.filter((value) => {
    const key = keyOf(value);
    const left = remaining.get(key) ?? 0;
    if (left === 0) return true;
    remaining.set(key, left - 1);
    return false;
  });
}

export function conformanceKey(f: Finding): string {
  return `${f.code}|${f.nodeId ?? ''}|${f.relatedId ?? ''}|${f.location.file}`;
}

function deltaWarningFindings(before: Finding[], after: Finding[]): Finding[] {
  const stagedCodes = new Set(['FR_NO_DESIGN', 'FR_NO_STORY', 'TOOTHLESS_DECISION', 'TOOTHLESS_STORY']);
  const staged = (findings: Finding[]) => findings.filter((f) => f.severity === 'warning' && stagedCodes.has(f.code));
  return deltaByKey(staged(before), staged(after), conformanceKey);
}

interface TaskTruthFinding extends MutationFinding {
  taskId: string;
  code: string;
}

function taskTruthFindings(graph: SpecGraph, targetSpec: string): TaskTruthFinding[] {
  const scenarios: ScenarioLike[] = [];
  const tasks: TaskLike[] = [];
  const taskLines = new Map<string, number>();
  for (const node of graph.nodes.values()) {
    const nodeSpec = specOf((node as { file: string }).file);
    if (node.type === 'Scenario') {
      const scenario = node as ScenarioNode;
      scenarios.push({
        id: scenario.id,
        tags: scenario.tags,
        result: scenario.lastResult,
        stale: scenario.resultStale,
        spec: nodeSpec,
        source: scenario.trace?.source,
        canonicalResult: scenario.canonicalResult,
        canonicalRunAt: scenario.canonicalRunAt,
      });
    } else if (node.type === 'Task' && nodeSpec === targetSpec) {
      const task = node as TaskNode;
      tasks.push({ id: task.id, doneWhen: task.doneWhen ?? '', refs: task.refs, spec: nodeSpec, status: task.status });
      taskLines.set(task.id, task.line);
    }
  }
  const coverage = computeCoverage(tasks, scenarios);
  return Object.entries(coverage.tasks)
    .flatMap(([taskId, entry]) => (entry.truth_issues ?? []).map((issue) => ({ taskId, issue })))
    .map(({ taskId, issue }) => ({
      layer: 'conformance' as const,
      line: taskLines.get(taskId),
      message: `${issue.code}: ${issue.message}`,
      taskId,
      code: issue.code,
    }));
}

type CanonicalEvidencePatch = ReturnType<typeof parseNdjsonFile>;

/**
 * Task truth needs canonical full-run results, but ordinary structural
 * conformance must not rebuild the graph from live evidence. Apply the one
 * canonical patch to already-staged graphs only for the TASKS truth gate.
 */
function applyCanonicalEvidenceForTaskTruth(
  graph: SpecGraph,
  patch: CanonicalEvidencePatch,
): void {
  const scenarios = [...graph.nodes.values()].filter(
    (node): node is ScenarioNode => node.type === 'Scenario',
  );
  applyTestResults(scenarios, patch);
  for (const scenario of scenarios) {
    if (!scenario.lastResult) continue;
    scenario.canonicalResult = scenario.lastResult;
    scenario.canonicalRunAt = scenario.lastRunAt;
  }
}

function conformanceFindings(repoRoot: string, slug: string, doc: string, next: string): MutationFinding[] {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-mutate-'));
  try {
    const srcDir = path.join(repoRoot, '.specs', slug);
    const dstDir = path.join(tmpRoot, '.specs', slug);
    fs.cpSync(srcDir, dstDir, { recursive: true });
    const beforeGraph = buildGraph({
      repoRoot: tmpRoot,
      skipNdjson: true,
      mdRoots: [path.join('.specs', slug)],
      featureRoots: [path.join('.specs', slug)],
    });
    const graph = buildMutationGraph(tmpRoot, slug, doc, next);
    const isTaskMutation = path.basename(doc).toLowerCase() === 'tasks.md';
    let beforeTruthGraph = beforeGraph;
    let afterTruthGraph = graph;
    if (isTaskMutation) {
      // Keep canonical evidence for the task-truth gate, but parse it once and
      // apply it to the already-staged structural graphs. Ordinary conformance
      // never pays the live-evidence cost.
      const evidencePatch = parseNdjsonFile(
        path.join(repoRoot, '.dev-pomogator', '.last-test-run.ndjson'),
      );
      applyCanonicalEvidenceForTaskTruth(beforeTruthGraph, evidencePatch);
      applyCanonicalEvidenceForTaskTruth(afterTruthGraph, evidencePatch);
    }
    const progressPath = path.join(repoRoot, '.specs', slug, '.progress.json');
    let strictContracts = false;
    try {
      strictContracts = JSON.parse(fs.readFileSync(progressPath, 'utf8')).contractPolicy === 'strict-v1';
    } catch {}
    const conformanceOptions = strictContracts ? { strictContracts: true, strictContractSpec: slug } : {};
    const before = checkConformance(beforeGraph, conformanceOptions);
    const after = checkConformance(graph, conformanceOptions);
    const newErrors = deltaByKey(
      before.filter((f) => f.severity === 'error'),
      after.filter((f) => f.severity === 'error'),
      conformanceKey,
    );
    // Task-truth findings gate textual task-status mutations. Applying them to every
    // graph document creates a bootstrap deadlock: adding a new .feature scenario is
    // necessarily NOT_RUN until after the write, so the door would refuse the very
    // scenario needed to establish canonical evidence.
    const newTruthFindings = isTaskMutation
      ? deltaByKey(
          taskTruthFindings(beforeTruthGraph, slug),
          taskTruthFindings(afterTruthGraph, slug),
          (finding) => `${finding.code}|${finding.taskId}`,
        )
      : [];
    return [
      ...newErrors.map((f) => ({
        layer: 'conformance' as const,
        line: f.location.line,
        message: `${f.code}: ${f.message}`,
      })),
      ...deltaWarningFindings(before, after).map((f) => ({
        layer: 'conformance' as const,
        line: f.location.line,
        message: `${f.code}: ${f.message}`,
      })),
      ...newTruthFindings,
    ];
  } catch (e) {
    return [{ layer: 'conformance', message: `conformance validation failed: ${e instanceof Error ? e.message : e}` }];
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

export interface SpecPatchValidationInput {
  slug: string;
  doc: string;
  current: string;
  next: string;
}

export interface SpecPatchValidationResult {
  findings: MutationFinding[];
  byDocument: Map<string, MutationFinding[]>;
}

/**
 * Validate a multi-document patch against ONE fully staged graph. Single-document
 * validation intentionally compares one overlay with the current tree; doing that
 * N times for a transaction creates a cyclic bootstrap deadlock when two new links
 * point at anchors/nodes introduced by sibling edits. This validator preserves the
 * same form, anchor, conformance, strength, and task-truth gates, but computes their
 * delta only after every document in the patch has been staged in a temp clone.
 */
export function validateSpecPatch(repoRoot: string, inputs: SpecPatchValidationInput[]): SpecPatchValidationResult {
  const byDocument = new Map<string, MutationFinding[]>();
  const keyOf = (slug: string, doc: string): string => `${slug}/${doc.replace(/\\/g, '/')}`;
  const add = (key: string, finding: MutationFinding): void => {
    const bucket = byDocument.get(key) ?? [];
    bucket.push(finding);
    byDocument.set(key, bucket);
  };

  for (const input of inputs) {
    const key = keyOf(input.slug, input.doc);
    // Keep destructive full-replace parity with validateSpecChange. Batch callers
    // intentionally defer the single-doc validator while staging the whole graph,
    // so this guard must live in the shared batch validation path too.
    if (input.next.trim() === '' && input.current.trim() !== '') {
      add(key, { layer: 'change', message: 'refusing to replace a non-empty document with empty content' });
    }
    for (const finding of formDeltaFindings(input.doc, input.current, input.next)) add(key, finding);
    if (input.doc.toLowerCase().endsWith('.feature')) {
      for (const finding of featureStrengthFindings(input.current, input.next)) {
        add(key, { layer: 'strength', line: finding.line, message: finding.message });
      }
    }
  }

  const grouped = new Map<string, SpecPatchValidationInput[]>();
  for (const input of inputs) grouped.set(input.slug, [...(grouped.get(input.slug) ?? []), input]);

  for (const [slug, changes] of grouped) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-patch-'));
    try {
      const srcDir = path.join(repoRoot, '.specs', slug);
      const dstDir = path.join(tmpRoot, '.specs', slug);
      fs.cpSync(srcDir, dstDir, { recursive: true });
      const beforeAnchors = checkLinks(specMdFiles(tmpRoot, slug)) as BrokenAnchor[];

      // This is a structural delta check, not an evidence refresh. Never ingest
      // canonical NDJSON, pytest reports, or overlays while building either
      // temporary graph: live evidence is unrelated to the proposed text diff
      // and can be multi-megabyte.
      const beforeGraph = buildGraph({
        repoRoot: tmpRoot,
        skipNdjson: true,
        mdRoots: [path.join('.specs', slug)],
        featureRoots: [path.join('.specs', slug)],
      });

      for (const change of changes) {
        const abs = path.join(dstDir, change.doc);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, change.next);
      }

      const editedKeys = new Set(changes.map((change) => keyOf(slug, change.doc)));
      const fallbackKey = keyOf(slug, changes[0].doc);
      const locationKey = (file: string | undefined): string => {
        if (!file) return fallbackKey;
        const normalized = file.replace(/\\/g, '/');
        const marker = `.specs/${slug}/`;
        const at = normalized.indexOf(marker);
        const candidate = at >= 0 ? keyOf(slug, normalized.slice(at + marker.length)) : fallbackKey;
        return editedKeys.has(candidate) ? candidate : fallbackKey;
      };

      const remainingAnchors = new Map<string, number>();
      for (const broken of beforeAnchors) {
        const key = anchorKey(broken);
        remainingAnchors.set(key, (remainingAnchors.get(key) ?? 0) + 1);
      }
      for (const broken of checkLinks(specMdFiles(tmpRoot, slug)) as BrokenAnchor[]) {
        const anchor = anchorKey(broken);
        const left = remainingAnchors.get(anchor) ?? 0;
        if (left > 0) {
          remainingAnchors.set(anchor, left - 1);
          continue;
        }
        add(locationKey(broken.file), {
          layer: 'anchor',
          line: broken.line,
          message: `broken anchor #${broken.brokenAnchor} → ${broken.targetFile} (${broken.file})`,
        });
      }

      const afterGraph = buildGraph({
        repoRoot: tmpRoot,
        skipNdjson: true,
        mdRoots: [path.join('.specs', slug)],
        featureRoots: [path.join('.specs', slug)],
      });
      const before = checkConformance(beforeGraph);
      const after = checkConformance(afterGraph);
      const conformance = [
        ...deltaByKey(
          before.filter((finding) => finding.severity === 'error'),
          after.filter((finding) => finding.severity === 'error'),
          conformanceKey,
        ),
        ...deltaWarningFindings(before, after),
      ];
      for (const finding of conformance) {
        add(locationKey(finding.location.file), {
          layer: 'conformance',
          line: finding.location.line,
          message: `${finding.code}: ${finding.message}`,
        });
      }

      if (changes.some((change) => path.basename(change.doc).toLowerCase() === 'tasks.md')) {
        const evidencePatch = parseNdjsonFile(
          path.join(repoRoot, '.dev-pomogator', '.last-test-run.ndjson'),
        );
        applyCanonicalEvidenceForTaskTruth(beforeGraph, evidencePatch);
        applyCanonicalEvidenceForTaskTruth(afterGraph, evidencePatch);
        const newTruth = deltaByKey(
          taskTruthFindings(beforeGraph, slug),
          taskTruthFindings(afterGraph, slug),
          (finding) => `${finding.code}|${finding.taskId}`,
        );
        const tasks = changes.find((change) => path.basename(change.doc).toLowerCase() === 'tasks.md')!;
        for (const finding of newTruth) add(keyOf(slug, tasks.doc), finding);
      }
    } catch (error) {
      add(keyOf(slug, changes[0].doc), {
        layer: 'conformance',
        message: `patch validation failed: ${error instanceof Error ? error.message : error}`,
      });
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  return { findings: [...byDocument.values()].flat(), byDocument };
}

export interface ValidateResult {
  ok: boolean;
  next?: string;
  findings: MutationFinding[];
  /** Set when the spec dir is absent — handlers map this to SPEC_NOT_FOUND. */
  specMissing?: boolean;
}

/** The full FR-40b dry-run: apply in memory + all three validation layers. */
export function validateSpecChange(
  repoRoot: string,
  slug: string,
  doc: string,
  change: SpecChange,
): ValidateResult {
  // target guard FIRST — before any fs touch (traversal / casing / doc-type).
  const targetBad = validateTarget(slug, doc);
  if (targetBad) return { ok: false, findings: [targetBad] };
  const rel = normalizeContainedDoc(doc)!; // non-null: validateTarget passed
  doc = rel; // downstream form/anchor/conformance + the write use the normalized rel

  const specDir = path.join(repoRoot, '.specs', slug);
  const abs = path.join(specDir, doc);
  const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null;
  // Spec dir absent → clean SPEC_NOT_FOUND, NOT an uncaught ENOENT later in
  // the conformance clone (the .md path threw before this check was added).
  if (current === null && !fs.existsSync(specDir)) {
    return {
      ok: false,
      specMissing: true,
      findings: [{ layer: 'target', message: `spec "${slug}" does not exist — create_spec first` }],
    };
  }
  const ext = doc.toLowerCase();
  const isMd = ext.endsWith('.md');
  const isFeature = ext.endsWith('.feature');

  const applied = applyChange(current, change);
  if ('finding' in applied) return { ok: false, findings: [applied.finding] };
  const next = applied.next;
  // Empty full-replace silently destroys a doc — refuse (the review's #9).
  if (next.trim() === '' && current !== null && current.trim() !== '') {
    return {
      ok: false,
      findings: [{ layer: 'change', message: 'refusing to replace a non-empty document with empty content' }],
    };
  }
  // P19-6: a SUBDIR doc (.architecture-research/<N>-stage.md) is a non-graph WORKING
  // document — the form/anchor/conformance gates exist for the TOP-LEVEL graph docs
  // (FR/AC/TASKS/feature) and would mis-fire on freeform research prose. Contained +
  // ext-checked + audited is the contract for these; skip the graph gates.
  // BUT only for genuine NON-graph basenames: the builder walks `.specs/` RECURSIVELY
  // and ingests by BASENAME, so a subdir doc named like a graph doc (sub/TASKS.md,
  // sub/FR.md, sub/x.feature) DOES enter the graph — exempting it let a malformed
  // graph doc bypass the conformance floor through the door (confirmed 2026-06-15).
  // Such a subdir graph-doc must still pass the gates.
  const base = path.basename(rel).toLowerCase();
  const isGraphDocName =
    /^(fr|nfr|acceptance_criteria|user_stories|use_cases|design|requirements|tasks|file_changes|research)\.md$/.test(base) ||
    base.endsWith('.feature');
  if (rel.includes('/') && !isGraphDocName) {
    return { ok: true, next, findings: [] };
  }
  const findings = [
    ...(isMd && base === 'fr.md' ? frMetadataContractFindings(repoRoot, slug, doc, next) : []),
    ...formDeltaFindings(doc, current ?? '', next),
    ...(isMd ? anchorFindings(repoRoot, slug, doc, next) : []),
    ...(isMd || isFeature ? conformanceFindings(repoRoot, slug, doc, next) : []),
    // scenario (net-new, doc-scoped — legacy skeletons don't block unrelated edits).
    ...(isFeature
      ? featureStrengthFindings(current, next).map((f) => ({ layer: 'strength' as const, line: f.line, message: f.message }))
      : []),
  ];
  return { ok: findings.length === 0, next, findings };
}

/**
 * P21-5 rename/move — find inbound MARKDOWN links across the WHOLE corpus that
 * point AT `targetRelFile` (a repo-relative `.specs/<slug>/<doc>` path). A link
 * `[text](dest#frag)` references the target when `dest`, resolved relative to
 * the REFERENCING file's directory, lands on the target file. This is the
 * MARKDOWN-anchor layer the Done-When names — distinct from delete_spec_doc's
 * graph-EDGE gate (parsed refs/covers/tested-by): a rename that doesn't retarget
 * these literal links silently breaks every inbound `[text](…/FR.md#fr-7)`.
 *
 * Self-links (a link inside the target doc itself) are EXCLUDED — they travel
 * with the moved content; only links FROM OTHER files strand on a rename.
 */
export interface InboundLink {
  /** Repo-relative POSIX path of the file that holds the link. */
  file: string;
  line: number;
  /** The raw path written in the markdown link (sans #fragment). */
  linkPath: string;
  /** The `#anchor` fragment, if any. */
  fragment: string | null;
}

const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+?)(#[^)\s]*)?\)/g;

export function findInboundLinks(repoRoot: string, targetRelFile: string): InboundLink[] {
  const specsRoot = path.resolve(repoRoot, '.specs');
  const targetAbs = path.resolve(repoRoot, targetRelFile);
  const out: InboundLink[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        walk(abs);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        if (path.resolve(abs) === targetAbs) continue; // skip the target doc's own (self) links
        let content: string;
        try {
          content = fs.readFileSync(abs, 'utf-8');
        } catch {
          continue;
        }
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          for (const m of lines[i].matchAll(MD_LINK_RE)) {
            const rawPath = m[1];
            // Ignore non-file links (http(s), mailto, pure #anchor, [[wiki]]).
            if (/^[a-z][a-z0-9+.-]*:/i.test(rawPath) || rawPath.startsWith('#')) continue;
            const resolved = path.resolve(path.dirname(abs), rawPath);
            if (resolved !== targetAbs) continue;
            out.push({
              file: path.relative(repoRoot, abs).replace(/\\/g, '/'),
              line: i + 1,
              linkPath: rawPath,
              fragment: m[2] ?? null,
            });
          }
        }
      }
    }
  };
  walk(specsRoot);
  return out;
}

/**
 * Plan the link-path rewrites for a rename/move: for each inbound link, compute
 * the NEW relative path from the referencing file to `newTargetRel`, preserving
 * the `#fragment`. Returns the per-file edited content (caller writes atomically),
 * grouped so one file with N inbound links is rewritten once.
 */
export function rewriteInboundLinks(
  repoRoot: string,
  inbound: InboundLink[],
  newTargetRel: string,
): Array<{ file: string; content: string }> {
  const newTargetAbs = path.resolve(repoRoot, newTargetRel);
  const byFile = new Map<string, InboundLink[]>();
  for (const l of inbound) {
    const list = byFile.get(l.file);
    if (list) list.push(l);
    else byFile.set(l.file, [l]);
  }
  const edits: Array<{ file: string; content: string }> = [];
  for (const [file, links] of byFile) {
    const abs = path.resolve(repoRoot, file);
    let content = fs.readFileSync(abs, 'utf-8');
    // New relative path FROM this referencing file's dir TO the moved target.
    let rel = path.relative(path.dirname(abs), newTargetAbs).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    for (const l of links) {
      const oldRef = `](${l.linkPath}${l.fragment ?? ''})`;
      const newRef = `](${rel}${l.fragment ?? ''})`;
      content = content.split(oldRef).join(newRef);
    }
    edits.push({ file, content });
  }
  return edits;
}

/** Atomic write per atomic-config-save: unique temp + rename. On a rename
 *  failure (Windows EPERM/EBUSY when the target is locked by an editor/watcher)
 *  the temp file is unlinked so it never litters .specs/ (review #6). */
export function writeDocAtomic(repoRoot: string, slug: string, doc: string, content: string): string {
  // E-A: serialize the actual file write across sessions via the short write-lock.
  // Re-entrant — when `apply_spec_change` already holds it around casCheck→write, this is a no-op acquire.
  return withWriteLock(repoRoot, () => {
    const dir = path.join(repoRoot, '.specs', slug);
    const abs = path.join(dir, doc);
    // P19-6: doc may be a SUBPATH — create the immediate parent (e.g.
    // .specs/<slug>/.architecture-research/) so the subdir write doesn't ENOENT.
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, content, 'utf-8');
    try {
      fs.renameSync(tmp, abs);
    } catch (e) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* best-effort */
      }
      throw e;
    }
    return abs;
  });
}
