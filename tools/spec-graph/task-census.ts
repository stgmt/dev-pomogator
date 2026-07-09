/**
 * P21-6 honest task census — PER-SPEC "what is NOT finished", graph-only.
 *
 * Motivated by a real challenge (2026-06-10): "I don't believe all tasks are
 * done, there's no hook for the unfinished ones, and it must cover ALL specs."
 * A checkbox counter would just reprint the self-reported state. This derives
 * three signals that don't trust the `- [x]`, PER SPEC:
 *
 *   - open       — status todo/in-progress/blocked (author-admitted not-done).
 *   - doneRed    — status DONE but ≥1 mapped scenario in a HARD-NEGATIVE bucket
 *                  (failed/undefined/ambiguous). `not_run` is EXCLUDED so a
 *                  filtered/stale cucumber run can't false-flag (the "partial
 *                  cucumber poisons NDJSON" hazard) — a stale run turns a
 *                  scenario into not_run, never failed.
 *   - doneUnrun  — status DONE but NOT all scenarios passed and NOT red, i.e.
 *                  ≥1 not_run OR no scenario at all → "claimed done, can't
 *                  confirm". This is the "не запускался — тоже писать" signal:
 *                  surfaced, not hidden.
 *
 * Only the STRICT task format (parsed into Task nodes by the graph) is tracked;
 * loose-checkbox specs contribute nothing (a deliberate scope decision — they
 * get reworked to the strict format, not silently half-counted).
 *
 * GRAPH-ONLY (no NDJSON dependency for correctness): doneRed needs results but
 * excludes not_run, so it is right even on a skipNdjson build (→ 0). Reuses
 * mapTasksToScenarios + bucketScenarios + specOf — the SAME machinery
 * get_coverage uses — so the census never diverges from the verdict.
 *
 * Produced on every on-disk spec change by the MCP server's watcher (lifecycle,
 * the enforce-mode path) AND by spec-conformance-push (raw Write|Edit), cached
 * to `.dev-pomogator/.task-census.json` (+ `.prev` rotation for the history
 * line); read by the per-prompt banner — the graph is NEVER built on the hot
 * UserPromptSubmit path (NFR-Performance-6).
 *
 * @see ./coverage.ts (mapTasksToScenarios / bucketScenarios / specOf)
 * @see tools/spec-mcp-server/lifecycle.ts + tools/spec-conformance-push (producers)
 * @see tools/specs-validator/conformance-summary.ts (consumer — the banner)
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SpecGraph, TaskNode, ScenarioNode } from './types.ts';
import {
  mapTasksToScenarios,
  bucketScenarios,
  specOf,
  type Bucket,
  type ScenarioLike,
  type TaskLike,
} from './coverage.ts';

/** Per-spec unfinished-work counts. */
export interface SpecCensus {
  slug: string;
  open: number;
  doneRed: number;
  doneUnrun: number;
  /**
   * FR-49a: the first OPEN task (todo/in-progress/blocked) in this spec — the
   * concrete «next step» the per-prompt banner names so «what's next» rides the
   * standing signal, not just counts. Undefined when the spec has no open task
   * (only doneRed/doneUnrun unfinished).
   */
  nextOpen?: { id: string; title: string };
}

export interface TaskCensus {
  /** Corpus totals across every tracked spec. */
  total: { open: number; doneRed: number; doneUnrun: number };
  /** Specs WITH unfinished work, sorted by (open+doneRed+doneUnrun) desc. */
  specs: SpecCensus[];
}

const HARD_NEGATIVE = new Set<Bucket>(['failed', 'undefined', 'ambiguous']);

/**
 * Compute the per-spec honest census over a built graph. Pure — the caller
 * stamps the timestamp and writes the cache.
 */
export function computeTaskCensus(
  graph: SpecGraph,
  opts: { backlogSpecs?: Set<string> } = {},
): TaskCensus {
  const scenarios: ScenarioLike[] = [];
  const tasks: TaskLike[] = [];
  const taskEntries: Array<{ node: TaskNode; slug: string }> = [];
  for (const node of graph.nodes.values()) {
    const nodeSpec = specOf((node as { file: string }).file);
    if (node.type === 'Scenario') {
      const s = node as ScenarioNode;
      scenarios.push({ id: s.id, tags: s.tags, result: s.lastResult, spec: nodeSpec });
    } else if (node.type === 'Task') {
      const t = node as TaskNode;
      tasks.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: nodeSpec });
      taskEntries.push({ node: t, slug: nodeSpec ?? '(no-spec)' });
    }
  }
  const map = mapTasksToScenarios(tasks, scenarios);
  const buckets = bucketScenarios(scenarios);
  const bucketById = new Map<string, Bucket>();
  for (const b of Object.keys(buckets) as Bucket[]) for (const id of buckets[b]) bucketById.set(id, b);

  const per = new Map<string, SpecCensus>();
  const row = (slug: string): SpecCensus => {
    let r = per.get(slug);
    if (!r) { r = { slug, open: 0, doneRed: 0, doneUnrun: 0 }; per.set(slug, r); }
    return r;
  };
  for (const { node: t, slug } of taskEntries) {
    // Explicit backlog (set via the `set_spec_status` door tool) — the spec is being built /
    // parked, so its open tasks are NOT "open work to finish now": skip it entirely. The Stop-gate
    // (pinator) reads this census, so a backlog spec's tasks no longer arm it. No status math — a
    // human marked it. See tools/spec-graph/spec-status-store.ts.
    if (opts.backlogSpecs?.has(slug)) continue;
    if (t.status === 'todo' || t.status === 'in-progress' || t.status === 'blocked') {
      const r = row(slug);
      r.open++;
      // FR-49a: capture the FIRST open task (document order) as the spec's «next step».
      if (!r.nextOpen) r.nextOpen = { id: t.id, title: t.title ?? t.id };
    } else if (t.status === 'done') {
      const sids = map.get(t.id) ?? [];
      const hasRed = sids.some((id) => HARD_NEGATIVE.has(bucketById.get(id) ?? 'not_run'));
      const allPassed = sids.length > 0 && sids.every((id) => bucketById.get(id) === 'passed');
      if (hasRed) row(slug).doneRed++;
      else if (!allPassed) row(slug).doneUnrun++; // ≥1 not_run OR no scenario → can't confirm
      // allPassed → genuinely confirmed → not surfaced
    }
  }

  const specs = [...per.values()]
    .filter((s) => s.open + s.doneRed + s.doneUnrun > 0)
    .sort((a, b) => (b.open + b.doneRed + b.doneUnrun) - (a.open + a.doneRed + a.doneUnrun));
  const total = specs.reduce(
    (acc, s) => ({ open: acc.open + s.open, doneRed: acc.doneRed + s.doneRed, doneUnrun: acc.doneUnrun + s.doneUnrun }),
    { open: 0, doneRed: 0, doneUnrun: 0 },
  );
  return { total, specs };
}

/** FR-49d: an in-progress task whose evidence says it is likely already DONE. */
export interface StaleMarker {
  id: string;
  title: string;
  spec: string;
  /** The mapped scenario ids that all PASSED — the evidence the work is done. */
  scenarios: string[];
}

/**
 * FR-49d stale-marker reconciler: tasks the author left `in-progress` whose mapped
 * scenarios ALL PASSED — evidence that the work is done but the marker drifted (the
 * exact class this session hit: FR-17's cluster). FLAG-ONLY by contract — never
 * auto-close (false-green guard); the human/agent confirms + closes via
 * set_entity_status. A task with NO mapped scenario is NOT flagged (no positive
 * evidence of doneness — could be genuinely partial, like the FR-15 CLI was).
 * Reuses the SAME mapTasksToScenarios + bucketScenarios as the census, so a flag
 * and the census never disagree.
 */
export function findStaleInProgress(graph: SpecGraph): StaleMarker[] {
  const scenarios: ScenarioLike[] = [];
  const tasks: TaskLike[] = [];
  const taskEntries: Array<{ node: TaskNode; slug: string }> = [];
  for (const node of graph.nodes.values()) {
    const nodeSpec = specOf((node as { file: string }).file);
    if (node.type === 'Scenario') {
      const s = node as ScenarioNode;
      scenarios.push({ id: s.id, tags: s.tags, result: s.lastResult, spec: nodeSpec });
    } else if (node.type === 'Task') {
      const t = node as TaskNode;
      tasks.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: nodeSpec });
      taskEntries.push({ node: t, slug: nodeSpec ?? '(no-spec)' });
    }
  }
  const map = mapTasksToScenarios(tasks, scenarios);
  const buckets = bucketScenarios(scenarios);
  const bucketById = new Map<string, Bucket>();
  for (const b of Object.keys(buckets) as Bucket[]) for (const id of buckets[b]) bucketById.set(id, b);

  const out: StaleMarker[] = [];
  for (const { node: t, slug } of taskEntries) {
    if (t.status !== 'in-progress') continue;
    // FR-46/49d precision guard: flag ONLY a task that cites its OWN scenario (a SPECGEN id in
    // Done-When — the same signal conformance TASK_NO_OWN_SCENARIO uses). A task that maps to
    // scenarios SOLELY via its FR-ref rides the requirement's OTHER scenarios at large (the FR-32
    // over-map): those passing is NOT evidence THIS task is done. Without this guard the reconciler
    // itself emits false-green — it flagged 3 v4 umbrella/in-flight tasks (ws-f-remaining,
    // p16-form-skill-evals, p16-audit-split-doc) as "all scenarios pass → close" though their own
    // deliverables were unfinished. Scanning the whole Done-When (which includes the header line's
    // @featureN title tag) is why we key on the explicit SPECGEN id, not @featureN.
    if (!/s[pc]e[cn]gen004[_-]\d+/i.test(t.doneWhen ?? '')) continue;
    const sids = map.get(t.id) ?? [];
    if (sids.length === 0) continue; // no scenario → no positive doneness evidence → don't flag
    if (sids.every((id) => bucketById.get(id) === 'passed')) {
      out.push({ id: t.id, title: t.title ?? t.id, spec: slug, scenarios: sids });
    }
  }
  return out;
}

/** On-disk cache the producer writes and the per-prompt banner reads. */
export interface TaskCensusCache extends TaskCensus {
  /** ISO timestamp of the producing build — shown so a stale census is visible. */
  ts: string;
}

const CACHE_REL = path.join('.dev-pomogator', '.task-census.json');
const PREV_REL = path.join('.dev-pomogator', '.task-census.prev.json');

export function taskCensusCachePath(repoRoot: string): string {
  return path.join(repoRoot, CACHE_REL);
}
export function taskCensusPrevPath(repoRoot: string): string {
  return path.join(repoRoot, PREV_REL);
}

/**
 * Atomically persist the census (temp + rename, per atomic-config-save), AND
 * rotate the current cache into `.prev` first so the banner can show a
 * было→стало history line. Best-effort — never crash a soft-tier hook.
 */
export function writeTaskCensusCache(repoRoot: string, census: TaskCensus, ts: string): void {
  const file = taskCensusCachePath(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Rotate current → prev (only when the totals actually changed, so a no-op
  // rebuild doesn't erase a meaningful previous snapshot).
  try {
    const cur = readTaskCensusCache(repoRoot);
    if (cur && sumTotal(cur) !== sumTotal(census)) {
      fs.copyFileSync(file, taskCensusPrevPath(repoRoot));
    }
  } catch {
    /* no prior cache / unreadable — first write, no prev */
  }
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...census, ts } satisfies TaskCensusCache, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
}

/** Sum of all unfinished counts — the single number the history line compares. */
export function sumTotal(c: TaskCensus): number {
  return c.total.open + c.total.doneRed + c.total.doneUnrun;
}

// ── FR-9 (pinator decision 2a+C1, 2026-06-18): SESSION-scoped census ──────────────
// The claim-evidence gate's "unfinished work remains" precondition (and the per-prompt
// banner) used the GLOBAL corpus total — so in any non-empty repo it was permanently
// true and the gate could never go quiet. FR-9 scopes it to the specs THIS session
// actually WROTE to, derived from the transcript (agent-independent: the harness records
// every tool_use). ONE source, used by BOTH the gate and the banner.

/** Filter a census to only the given spec slugs, recomputing the total. */
export function scopeCensusToSlugs<T extends TaskCensus>(census: T, slugs: Set<string>): TaskCensus {
  const specs = census.specs.filter((s) => slugs.has(s.slug));
  const total = specs.reduce(
    (acc, s) => ({ open: acc.open + s.open, doneRed: acc.doneRed + s.doneRed, doneUnrun: acc.doneUnrun + s.doneUnrun }),
    { open: 0, doneRed: 0, doneUnrun: 0 },
  );
  return { total, specs };
}

/**
 * FR-19 (2026-06-25): a lightweight, fail-open count of OPEN tasks for session-edited slugs the
 * task-census CACHE does NOT know about (a freshly-created / just-edited spec the snapshot predates).
 * The cache lagged → `openWork=0` falsely → the gate's judge precondition never fired (the no-kick
 * incident). Bounded to the session's edited slugs (1–3 files, NO graph build — see the hot-path caveat):
 * reads `.specs/<slug>/TASKS.md` and counts TOP-LEVEL open checkboxes `- [ ]`, EXCLUDING template
 * placeholders (`{…}`) and indented «Done When» sub-items (only column-0 lines). Conservative: a
 * missing/unreadable file → 0. The judge still decides block/approve, so a small mis-count only shifts how
 * often the judge is consulted, never forces a block. FR-17 (the «Дальше:» arming) remains load-bearing.
 */
export function liveOpenForUncensusedSlugs(
  repoRoot: string,
  editedSlugs: Set<string>,
  census: { specs: ReadonlyArray<{ slug: string }> } | null,
): number {
  const known = new Set((census?.specs ?? []).map((s) => s.slug));
  let open = 0;
  for (const slug of editedSlugs) {
    if (known.has(slug)) continue; // the cache already counts this spec
    try {
      const txt = fs.readFileSync(path.join(repoRoot, '.specs', slug, 'TASKS.md'), 'utf-8');
      for (const line of txt.split('\n')) {
        if (/^- \[ \]/.test(line) && !line.includes('{')) open++;
      }
    } catch {
      /* fail-open: missing/unreadable TASKS.md → contributes 0 */
    }
  }
  return open;
}

const SPEC_PATH_RE = /\.specs[/\\]([a-z0-9][a-z0-9._-]*)[/\\]/i;
const RAW_WRITE_TOOL_RE = /^(edit|write|multiedit|notebookedit)$/i;
const DOOR_WRITE_TOOL_RE =
  /(?:^|__)(apply_spec_change|create_spec|delete_spec_doc|rename_spec_doc|set_entity_status|archive_spec)$/i;

/**
 * FR-9: the set of spec slugs THIS session MUTATED, parsed from its transcript.
 * Only WRITES scope a session — raw Edit/Write/MultiEdit whose `file_path` is under
 * `.specs/<slug>/`, and door mutations (apply_spec_change / create_spec / … — NOT the
 * read-only `propose_spec_change` dry-run / read_spec_doc) whose `spec`/`slug` arg names it.
 * Agent-independent (the harness writes tool_use records). Fail-open → empty set
 * (→ a pure-analysis session scopes to ZERO specs → the gate does not arm).
 */
export function sessionEditedSpecSlugs(transcriptPath: string): Set<string> {
  const slugs = new Set<string>();
  let raw: string;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf-8');
  } catch {
    return slugs;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.includes('"tool_use"') || line.length > 2_000_000) continue;
    let entry: { message?: { content?: unknown } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content as Array<Record<string, unknown>>) {
      if (b?.type !== 'tool_use') continue;
      const name = String(b.name ?? '');
      const input = (b.input ?? {}) as Record<string, unknown>;
      if (DOOR_WRITE_TOOL_RE.test(name)) {
        // FR-9 refinement (dogfood 2026-06-19): a TEST-AUTHORING edit (a `.feature` doc) does NOT take
        // ownership of the spec's open IMPLEMENTATION backlog — only FR/TASKS/impl-doc edits scope a spec.
        // Else adding ONE scenario to a 25-task spec armed its whole backlog and the gate over-fired on a
        // DONE session (the over-firing token-burn this gate exists to prevent, turned on its own author).
        if (typeof input.doc === 'string' && input.doc.endsWith('.feature')) continue;
        if (typeof input.spec === 'string') slugs.add(input.spec);
        else if (typeof input.slug === 'string') slugs.add(input.slug);
        continue;
      }
      if (RAW_WRITE_TOOL_RE.test(name) && typeof input.file_path === 'string') {
        if (input.file_path.endsWith('.feature')) continue; // test authoring, not impl-task ownership
        const m = input.file_path.match(SPEC_PATH_RE);
        if (m) slugs.add(m[1]);
      }
    }
  }
  return slugs;
}

/**
 * FR-22 (2026-06-25, owner «агент должен выбирать из того что пинатор предлагает, чтоб не делать
 * рандомные задачи»): the slug of the spec this session edited MOST RECENTLY (last write in transcript
 * order) — so the gate offers the NEXT OPEN TASK of the spec you are CURRENTLY on, not an arbitrary
 * `specs[0]`. Same edit-detection as sessionEditedSpecSlugs (door mutations + raw Edit/Write under
 * `.specs/<slug>/`, skipping `.feature` test-authoring). Fail-open → null.
 */
export function lastEditedSpecSlug(transcriptPath: string): string | null {
  let last: string | null = null;
  let raw: string;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf-8');
  } catch {
    return null;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.includes('"tool_use"') || line.length > 2_000_000) continue;
    let entry: { message?: { content?: unknown } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content as Array<Record<string, unknown>>) {
      if (b?.type !== 'tool_use') continue;
      const name = String(b.name ?? '');
      const input = (b.input ?? {}) as Record<string, unknown>;
      if (DOOR_WRITE_TOOL_RE.test(name)) {
        if (typeof input.doc === 'string' && input.doc.endsWith('.feature')) continue;
        if (typeof input.spec === 'string') last = input.spec;
        else if (typeof input.slug === 'string') last = input.slug;
        continue;
      }
      if (RAW_WRITE_TOOL_RE.test(name) && typeof input.file_path === 'string') {
        if (input.file_path.endsWith('.feature')) continue;
        const m = input.file_path.match(SPEC_PATH_RE);
        if (m) last = m[1];
      }
    }
  }
  return last;
}

/**
 * K3 (2026-06-21): the count of the agent's OWN still-open declared work — its Task / TodoWrite list,
 * reconstructed from the transcript's tool_use records. This is the ground truth for work that ISN'T
 * spec tasks: a session editing only `tools/` (or doing NEW work on a census-complete spec) has 0
 * SPEC-scope open, yet may have pending todos the agent itself declared. Counting them arms the gate on
 * an announce-and-stop even with zero spec scope — the non-spec under-fire the owner hit live («при чём
 * тут спеки если агент явный анонс делал что дальше нужно делать»). Session-scoped BY CONSTRUCTION
 * (these are THIS session's declared todos, parsed from THIS transcript — not the global 210-task
 * backlog), so it does NOT reintroduce the over-fire FR-9 fixed.
 *
 * Two task systems, both handled (MAX of the two → never under-count, which is the safe direction here):
 *   - TodoWrite: the LATEST call carries the whole list → count status ∈ {pending,in_progress}.
 *   - TaskCreate/TaskUpdate: replay — each TaskCreate appends a task (1-based sequential id, status
 *     'pending'); each TaskUpdate sets that id's status ('completed'/'deleted' close it). Count final
 *     status ∈ {pending,in_progress}.
 * Fail-open → 0 (a parse error must never falsely arm the gate).
 */
const OPEN_TODO_STATUS = new Set(['pending', 'in_progress']);
const CLOSED_TODO_STATUS = new Set(['completed', 'deleted']);

export interface AgentTodo {
  /** Real visible Task tool id when known (`Task #72`), otherwise a synthetic create key. */
  id?: string;
  subject: string;
  status: string;
  /** Monotonic transcript event order; used to reconcile stale duplicates. */
  seq: number;
  /** 1-based JSONL line where the selected state came from. */
  line?: number;
  /** Why this canonical task survived duplicate reconciliation. */
  reconciliation?: string;
  /** Duplicate cluster could not be proven safe; route should demote it below async/current-spec. */
  ambiguous?: boolean;
}

function blockText(b: Record<string, unknown>): string {
  const c = b.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map((x) => (typeof x === 'string' ? x : typeof (x as { text?: unknown }).text === 'string' ? (x as { text: string }).text : JSON.stringify(x))).join('\n');
  }
  return c == null ? '' : JSON.stringify(c);
}

function taskIdFromText(text: string): string | null {
  const m = text.match(/Task\s+#(\d+)/i);
  return m ? m[1] : null;
}

const TASK_UPDATE_NOT_FOUND_RE = /Task not found/i;

function normalizeTodoSubject(subject: string): string {
  return subject.trim().toLowerCase().replace(/\s+/g, ' ');
}

function mergeTaskState(target: AgentTodo, incoming: AgentTodo): AgentTodo {
  const newer = incoming.seq >= target.seq ? incoming : target;
  const older = newer === incoming ? target : incoming;
  return {
    ...newer,
    id: target.id ?? incoming.id,
    subject: newer.subject || older.subject,
    reconciliation: newer.reconciliation ?? older.reconciliation,
  };
}

function canonicalizeTaskReplay(tasks: AgentTodo[]): AgentTodo[] {
  const bySubject = new Map<string, AgentTodo[]>();
  for (const task of tasks) {
    const key = normalizeTodoSubject(task.subject) || `id:${task.id ?? task.seq}`;
    const bucket = bySubject.get(key) ?? [];
    bucket.push(task);
    bySubject.set(key, bucket);
  }

  const canonical: AgentTodo[] = [];
  for (const group of bySubject.values()) {
    if (group.length === 1) {
      canonical.push({ ...group[0], reconciliation: group[0].reconciliation ?? 'unique' });
      continue;
    }

    const sorted = [...group].sort((a, b) => b.seq - a.seq);
    const newest = sorted[0];
    const newestOpen = OPEN_TODO_STATUS.has(newest.status);
    const openCount = sorted.filter((t) => OPEN_TODO_STATUS.has(t.status)).length;
    const newestClosed = CLOSED_TODO_STATUS.has(newest.status) || !newestOpen;

    if (newestClosed) {
      canonical.push({
        ...newest,
        reconciliation: `duplicate-subject:${group.length}:newest-closed`,
      });
      continue;
    }

    canonical.push({
      ...newest,
      ambiguous: openCount > 1 && !sorted.some((t) => CLOSED_TODO_STATUS.has(t.status)),
      reconciliation: openCount > 1
        ? `duplicate-subject:${group.length}:ambiguous-open-demote`
        : `duplicate-subject:${group.length}:newest-open`,
    });
  }

  return canonical.sort((a, b) => a.seq - b.seq);
}

/** Reconstruct the agent's current task list from the transcript. Returns whichever of the two task
 * systems carries MORE open work (Task-replay vs latest TodoWrite) — never under-count. Fail-open → []. */
export function parseAgentTodos(transcriptPath: string): AgentTodo[] {
  let raw: string;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf-8');
  } catch {
    return [];
  }
  const tasks = new Map<string, AgentTodo>();
  const useToTaskKey = new Map<string, string>();
  const updateRollback = new Map<string, { key: string; previous: AgentTodo | null }>();
  let createSeq = 0;
  let seq = 0;
  let latestTodoWrite: AgentTodo[] | null = null; // latest TodoWrite carries the whole list

  const upsertTask = (key: string, incoming: AgentTodo): void => {
    const prev = tasks.get(key);
    tasks.set(key, prev ? mergeTaskState(prev, incoming) : incoming);
  };
  const rekeyTask = (oldKey: string, realId: string, line: number): void => {
    const existing = tasks.get(oldKey);
    if (!existing) return;
    tasks.delete(oldKey);
    upsertTask(realId, { ...existing, id: realId, line, reconciliation: `real-id:${realId}` });
    for (const [useId, key] of useToTaskKey.entries()) if (key === oldKey) useToTaskKey.set(useId, realId);
  };

  const lines = raw.split(/\r?\n/);
  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo];
    if ((!line.includes('"tool_use"') && !line.includes('"tool_result"')) || line.length > 2_000_000) continue;
    let entry: { message?: { content?: unknown } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content as Array<Record<string, unknown>>) {
      const type = String(b?.type ?? '');
      if (type === 'tool_result') {
        const toolUseId = String(b.tool_use_id ?? '');
        const contentText = blockText(b);
        const realId = taskIdFromText(contentText);
        const oldKey = toolUseId ? useToTaskKey.get(toolUseId) : undefined;
        if (oldKey && realId) rekeyTask(oldKey, realId, lineNo + 1);
        if (toolUseId && TASK_UPDATE_NOT_FOUND_RE.test(contentText)) {
          const rollback = updateRollback.get(toolUseId);
          if (rollback) {
            if (rollback.previous) tasks.set(rollback.key, rollback.previous);
            else tasks.delete(rollback.key);
          } else if (oldKey) {
            tasks.delete(oldKey);
          }
        }
        continue;
      }
      if (type !== 'tool_use') continue;
      const name = String(b.name ?? '');
      const input = (b.input ?? {}) as Record<string, unknown>;
      if (name === 'TodoWrite' && Array.isArray(input.todos)) {
        latestTodoWrite = (input.todos as Array<Record<string, unknown>>).map((t, i) => ({
          id: typeof t?.id === 'string' ? t.id : undefined,
          subject: String(t?.content ?? t?.subject ?? ''),
          status: String(t?.status ?? ''),
          seq: ++seq,
          line: lineNo + 1,
          reconciliation: `todowrite:${i}`,
        }));
      } else if (name === 'TaskCreate') {
        const explicitId = typeof input.taskId === 'string' || typeof input.taskId === 'number' ? String(input.taskId) : null;
        // Real Claude transcripts carry a tool_use id and a later tool_result with
        // "Task #N", which rekeys the placeholder below. Unit/BDD fixtures often omit
        // tool_result records, so give those result-less creates the same sequential ids
        // the Task tool allocates; otherwise TaskUpdate({ taskId: "1" }) cannot close
        // the first created task and the gate over-counts stale open work.
        const syntheticId = !explicitId && !b.id ? String(++createSeq) : null;
        const key = explicitId ?? syntheticId ?? `create:${String(b.id)}`;
        if (!explicitId && b.id) useToTaskKey.set(String(b.id), key);
        upsertTask(key, {
          id: explicitId ?? syntheticId ?? undefined,
          subject: String(input.subject ?? ''),
          status: 'pending',
          seq: ++seq,
          line: lineNo + 1,
        });
      } else if (name === 'TaskUpdate') {
        const id = String(input.taskId ?? input.id ?? '').trim();
        if (!id) continue;
        const key = tasks.has(id) ? id : `update:${String(b.id ?? id)}:${id}`;
        if (b.id) {
          useToTaskKey.set(String(b.id), key);
          updateRollback.set(String(b.id), { key, previous: tasks.get(key) ?? null });
        }
        const status = typeof input.status === 'string' ? input.status : undefined;
        const subject = typeof input.subject === 'string' ? input.subject : '';
        upsertTask(key, {
          id,
          subject: subject || tasks.get(key)?.subject || tasks.get(id)?.subject || '',
          status: status ?? tasks.get(key)?.status ?? tasks.get(id)?.status ?? 'pending',
          seq: ++seq,
          line: lineNo + 1,
          reconciliation: `task-update:${id}`,
        });
      }
    }
  }
  const taskReplay = canonicalizeTaskReplay([...tasks.values()]);
  const taskOpen = taskReplay.filter((t) => OPEN_TODO_STATUS.has(t.status)).length;
  const todoOpen = latestTodoWrite ? latestTodoWrite.filter((t) => OPEN_TODO_STATUS.has(t.status)).length : 0;
  return latestTodoWrite && todoOpen > taskOpen ? latestTodoWrite : taskReplay;
}

/**
 * K3 (2026-06-21): the count of the agent's OWN still-open declared work — its Task / TodoWrite list,
 * reconstructed from the transcript. Ground truth for work that ISN'T spec tasks: a session editing only
 * `tools/` (or doing NEW work on a census-complete spec) has 0 SPEC-scope open, yet may have pending
 * todos the agent itself declared. Counting them arms the gate on an announce-and-stop even with zero
 * spec scope — the non-spec under-fire the owner hit live («при чём тут спеки если агент явный анонс
 * делал»). Session-scoped BY CONSTRUCTION (this transcript's todos, not the global backlog) → does NOT
 * reintroduce the FR-9 over-fire. Fail-open → 0.
 */
export function agentOpenTodoCount(transcriptPath: string): number {
  return parseAgentTodos(transcriptPath).filter((t) => OPEN_TODO_STATUS.has(t.status) && !t.ambiguous).length;
}

/** The FIRST actionable still-open agent todo. Ambiguous duplicate-open clusters are deliberately
 * skipped here so they cannot dominate async/current-spec routing as a guessed stale next step. */
export function agentNextOpenTodoDetail(transcriptPath: string): AgentTodo | null {
  const next = parseAgentTodos(transcriptPath).find((t) => OPEN_TODO_STATUS.has(t.status) && !t.ambiguous);
  return next?.subject?.trim() ? next : null;
}

/** The subject of the FIRST actionable still-open agent todo, for legacy callers. */
export function agentNextOpenTodo(transcriptPath: string): string | null {
  const next = agentNextOpenTodoDetail(transcriptPath);
  const s = next?.subject?.trim();
  return s ? s : null;
}

export type NextStepSource = 'agent-todo' | 'active-async' | 'current-spec';

export interface NextStepRoute {
  source: NextStepSource;
  title: string;
  id?: string;
  spec?: string;
  line?: number;
  reconciliation?: string;
}

export interface NextStepRouteOptions {
  /** Transcript to reconstruct the agent's own open Task/TodoWrite list from. */
  transcriptPath?: string | null;
  /** Already-scoped census. Pass a session/current-spec slice, not the global corpus, for Stop-gate use. */
  census?: TaskCensus | null;
  /** The single current spec, e.g. last edited spec in this session. */
  currentSpecSlug?: string | null;
  /** Active/current spec candidates. A single candidate is actionable; multiple candidates are a real choice. */
  currentSpecSlugs?: Set<string> | string[] | null;
  /** True when an observable background job is still in flight. */
  awaitingAsync?: boolean;
  /** Optional replacement for the generic async route title. */
  asyncTitle?: string;
}

function currentSlugCandidates(slugs: NextStepRouteOptions['currentSpecSlugs']): string[] {
  if (!slugs) return [];
  return [...(Array.isArray(slugs) ? slugs : slugs.values())].filter((s) => typeof s === 'string' && s.trim());
}

/**
 * FR-49a shared next-step selector. It is intentionally STRICT about spec routing:
 * it may name a spec task only when the caller gives a current spec (or exactly one
 * active spec). It never falls back to the corpus' busiest `specs[0]`, because that
 * is the leak that sent dev-pomogator/spec-generator WS-F backlog into unrelated
 * sessions/repos. Priority is: agent's own todo → active async → current spec → none.
 */
export function selectNextStepRoute(opts: NextStepRouteOptions = {}): NextStepRoute | null {
  if (opts.transcriptPath) {
    const todo = agentNextOpenTodoDetail(opts.transcriptPath);
    if (todo) return { source: 'agent-todo', title: todo.subject, id: todo.id, line: todo.line, reconciliation: todo.reconciliation };
  }

  if (opts.awaitingAsync) {
    return {
      source: 'active-async',
      title: opts.asyncTitle ?? 'дождаться активной фоновой задачи и обработать результат',
    };
  }

  return selectCurrentSpecNextOpen(opts.census ?? null, opts);
}

/** Select a next open task from the CURRENT spec only; never from global corpus order. */
export function selectCurrentSpecNextOpen(
  census: TaskCensus | null,
  opts: Pick<NextStepRouteOptions, 'currentSpecSlug' | 'currentSpecSlugs'> = {},
): NextStepRoute | null {
  if (!census) return null;
  const bySlug = (slug: string | null | undefined): NextStepRoute | null => {
    if (!slug) return null;
    const spec = census.specs.find((s) => s.slug === slug);
    return spec?.nextOpen ? { source: 'current-spec', spec: spec.slug, ...spec.nextOpen } : null;
  };

  const explicit = bySlug(opts.currentSpecSlug);
  if (explicit) return explicit;

  const candidates = currentSlugCandidates(opts.currentSpecSlugs);
  if (candidates.length === 1) return bySlug(candidates[0]);
  return null;
}

function readCacheFile(p: string): TaskCensusCache | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!parsed?.total || typeof parsed.total.open !== 'number') return null;
    return parsed as TaskCensusCache;
  } catch {
    return null;
  }
}

/** Read the current cached census. Null on missing / torn / malformed. */
export function readTaskCensusCache(repoRoot: string): TaskCensusCache | null {
  return readCacheFile(taskCensusCachePath(repoRoot));
}
/** Read the previous snapshot (for the было→стало line). Null if none. */
export function readTaskCensusPrev(repoRoot: string): TaskCensusCache | null {
  return readCacheFile(taskCensusPrevPath(repoRoot));
}
