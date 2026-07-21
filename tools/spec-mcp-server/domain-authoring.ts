/**
 * FR-60d — domain-level authoring helpers (P33-4).
 *
 * `apply_spec_change` / the P33-1..3 section / replace / transaction ops address
 * RAW text (headings, old_string, edit sets). A real authoring INTENT — "register
 * this incident as backlog", "add an acceptance criterion" — spans FR.md +
 * ACCEPTANCE_CRITERIA.md + TASKS.md + the .feature + FILE_CHANGES.md, each with its
 * own CANONICAL FORM (the form-guards' contracts) and its own TRACEABILITY links
 * (FR↔AC↔TASK). Hand-rolling that across documents is exactly the mini-version-
 * control tax FR-60 removes. This module raises the surface to DOMAIN OPERATIONS:
 *
 *   add_backlog_task          — a canonical TASKS.md task block under a phase,
 *                               FR-traced, optionally with a SAFE .feature scenario;
 *   add_phase                 — a canonical `## Phase N — Title (date)` heading;
 *   amend_requirement         — append to an FR block + maintain its Связанные AC line;
 *   add_acceptance_criterion  — a canonical short-form AC block + the FR-side link
 *                               (the graph's FR→AC covers edge comes from the AC block);
 *   register_incident_backlog — an incident-driven task in the `## Backlog` section
 *                               (created on demand), FR-traced when requirements given.
 *
 * Two invariants SPECGEN004_525 pins:
 *   1. CANONICAL + TRACEABLE — rendered blocks satisfy the REAL form contracts
 *      (parseTaskBlocks) and the REAL parsers (parseMarkdown / parseTasks) yield the
 *      FR→AC covers edge + task refs; links use the exact Marksman slug of the live
 *      heading (marksmanSlug, the single source of truth), so the anchor layer passes.
 *   2. FEATURE SAFETY — an executable .feature scenario is REFUSED unless every step
 *      matches a real step-definition (RegExp or cucumber-expression) collected from
 *      tests/step_definitions/, or the caller EXPLICITLY passes tasks_only:true, which
 *      DOWNGRADES to a TASKS-only acceptance pin (no scenario written). No orphans:
 *      the door never plants a scenario the suite cannot execute.
 *
 * Reuse, not re-implementation:
 *   - validation-before-write + atomicity go through the P33-3 transaction core
 *     (preparePatch / applySpecTransactionCore → validateSpecChange form + anchors +
 *     conformance, writeDocAtomic) — NO second validator, NO second version-control
 *     layer;
 *   - structure reading uses the REAL graph parsers (parseMarkdown / parseTasks);
 *   - EOL preservation comes from applySectionOpToContent (the P33-1 pure transform).
 *
 * @see .specs/spec-generator-v4/FR.md FR-60 (FR-60d domain-level authoring commands)
 * @see .specs/spec-generator-v4/TASKS.md p33-domain-authoring-helpers (Phase 33, P33-4)
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_525
 * @see ./section-ops.ts (applySectionOpToContent / preparePatch / applySpecTransactionCore — reused)
 * @see ./mutations.ts (validateSpecChange / resolveSpecDoc / validateTarget — reused)
 */
import fs from 'node:fs';
import path from 'node:path';
import { marksmanSlug } from '../anchor-integrity/marksman-slug.mjs';
import { parseMarkdown } from '../spec-graph/parsers/md.ts';
import { parseTasks } from '../spec-graph/parsers/tasks.ts';
import type { AcNode, FrNode } from '../spec-graph/types.ts';
import { resolveSpecDoc, validateTarget, type MutationFinding } from './mutations.ts';
import {
  applySectionOpToContent,
  applySpecTransactionCore,
  detectEol,
  findHeading,
  locateSection,
  type PatchEdit,
  type PatchEditPreview,
} from './section-ops.ts';

// ─── canonical renderers (pure; the form contracts they satisfy are the REAL ones) ───

/** A markdown ATX heading line: `##  Title  ` (same shape the section ops use). */
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Split into logical lines, dropping the EOL so we can re-join with a chosen style. */
const splitLogical = (s: string): string[] => s.split(/\r\n|\n/);

/** A canonical TASKS.md task block — satisfies parseTaskBlocks (Status + Est + Done When). */
export interface TaskDraft {
  title: string;
  id: string;
  /** Task status enum (the form-gate's values). Default TODO. */
  status?: 'TODO' | 'READY' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
  /** Estimate in minutes (the form-gate wants `Est: <N>m`). Default 60. */
  estMinutes?: number;
  /** Task id this one depends on (rendered as `_depends: <id>_`). */
  depends?: string;
  /** FR ids → the exact Marksman anchor of each FR's live heading (FR.md links). */
  requirements?: Array<{ fr: string; anchor: string }>;
  /** Done-When checkboxes (at least one — the form-gate counts them). */
  doneWhen: string[];
}

/**
 * Render the CANONICAL task block the live form-guards parse (`- [ ] <title> — id: <id> —
 * Status: S | Est: Nm` + `_depends:_` + `_Requirements: [FR-N](FR.md#anchor)_` +
 * `**Done When:**` + ≥1 checkbox). LF-joined; the transaction's section op re-joins it to
 * the target document's EOL.
 */
export function renderTaskBlock(d: TaskDraft): string {
  const lines: string[] = [
    `- [ ] ${d.title} — id: ${d.id} — Status: ${d.status ?? 'TODO'} | Est: ${Math.max(1, Math.round(d.estMinutes ?? 60))}m`,
  ];
  if (d.depends) lines.push(`  _depends: ${d.depends}_`);
  if (d.requirements && d.requirements.length > 0) {
    const links = d.requirements.map((r) => `[${r.fr}](FR.md#${r.anchor})`).join(', ');
    lines.push(`  _Requirements: ${links}_`);
  }
  lines.push('  **Done When:**');
  for (const item of d.doneWhen.length > 0 ? d.doneWhen : [`${d.title} implemented and verified`]) {
    lines.push(`  - [ ] ${item}`);
  }
  return lines.join('\n');
}

/** A canonical short-form AC block: `## AC-N.M` + the `**Требование:** [FR-K]` line (the graph's covers edge). */
export function renderAcBlock(acId: string, fr: string, frAnchor: string, body: string): string {
  return [`## ${acId}`, '', `**Требование:** [${fr}](FR.md#${frAnchor})`, '', body].join('\n');
}

/** A canonical .feature scenario block — real steps only (the strength gate refuses placeholders). */
export function renderScenarioBlock(featureTag: string, scenarioId: string, title: string, steps: string[]): string {
  const keywords = ['Given', 'When', 'Then', 'And', 'But'];
  const stepLines = steps.map((s, i) => {
    const trimmed = s.trim();
    const hasKeyword = /^(Given|When|Then|And|But)\s+/.test(trimmed);
    const keyword = hasKeyword ? '' : `${i === 0 ? 'Given' : keywords[Math.min(i, 2)]} `;
    return `    ${keyword}${hasKeyword ? trimmed : trimmed}`;
  });
  return ['', `  ${featureTag}`, `  Scenario: ${scenarioId} ${title}`, ...stepLines].join('\n');
}

// ─── structure readers (the REAL graph parsers — no second parser) ─────────────

/** One spec's authoring-relevant docs, loaded through the door's containment gate. */
interface SpecContext {
  slug: string;
  docs: Map<string, string>; // doc name → current content (only docs that exist)
  frs: Array<{ id: string; anchor: string; headingLine: number }>;
  acs: Array<{ id: string; parentFr: string }>;
  taskIds: string[];
  phases: string[]; // phase heading TEXTS (e.g. "Phase 1: Demo")
  phaseNumbers: number[];
}

const unqualify = (id: string): string => id.replace(/^[^:]+:/, '');

/** Read one contained doc; null when absent (or the spec dir lacks it). */
function readContained(repoRoot: string, slug: string, doc: string): string | null {
  if (validateTarget(slug, doc)) return null;
  const resolved = resolveSpecDoc(repoRoot, slug, doc);
  if (!resolved.ok) return null;
  if (!fs.existsSync(resolved.abs) || !fs.statSync(resolved.abs).isFile()) return null;
  return fs.readFileSync(resolved.abs, 'utf-8');
}

/** Marksman anchor of a heading given its 1-based line in `content`. */
function anchorAt(content: string, line: number): string {
  const text = (splitLogical(content)[line - 1] ?? '').replace(HEADING_RE, '$2');
  return marksmanSlug(text);
}

/** Load the authoring context for a spec — the docs + the FR/AC/task/phase structure. */
function loadContext(repoRoot: string, slug: string): SpecContext | { error: 'TARGET' } {
  if (validateTarget(slug, 'FR.md')) return { error: 'TARGET' };
  const docs = new Map<string, string>();
  for (const name of ['FR.md', 'ACCEPTANCE_CRITERIA.md', 'TASKS.md', 'FILE_CHANGES.md', `${slug}.feature`]) {
    const content = readContained(repoRoot, slug, name);
    if (content !== null) docs.set(name, content);
  }
  const frs: SpecContext['frs'] = [];
  const acs: SpecContext['acs'] = [];
  const frContent = docs.get('FR.md');
  if (frContent) {
    for (const node of parseMarkdown(frContent, `.specs/${slug}/FR.md`).nodes) {
      if (node.type === 'FR') frs.push({ id: unqualify(node.id), anchor: anchorAt(frContent, (node as FrNode).line), headingLine: (node as FrNode).line });
    }
  }
  const acContent = docs.get('ACCEPTANCE_CRITERIA.md');
  if (acContent) {
    for (const node of parseMarkdown(acContent, `.specs/${slug}/ACCEPTANCE_CRITERIA.md`).nodes) {
      if (node.type === 'AC') acs.push({ id: unqualify(node.id), parentFr: (node as AcNode).parentFr });
    }
  }
  const taskIds: string[] = [];
  const phases: string[] = [];
  const phaseNumbers: number[] = [];
  const tasksContent = docs.get('TASKS.md');
  if (tasksContent) {
    for (const t of parseTasks(tasksContent, `.specs/${slug}/TASKS.md`)) taskIds.push(t.id);
    for (const line of splitLogical(tasksContent)) {
      const m = HEADING_RE.exec(line);
      if (m && /^Phase\s/i.test(m[2])) {
        phases.push(m[2]);
        const num = m[2].match(/^Phase\s+(-?\d+)/i);
        if (num) phaseNumbers.push(Number(num[1]));
      }
    }
  }
  return { slug, docs, frs, acs, taskIds, phases, phaseNumbers };
}

// ─── feature/step-def safety ────────────────────────────────────────────────────

/** One collected step-definition pattern (a RegExp literal or a cucumber-expression string). */
interface StepPattern {
  file: string;
  re: RegExp;
}

/** Compile a cucumber-expression string to an anchored RegExp (params `{…}`, optional `(…)`). */
function cucumberExpressionToRegExp(expr: string): RegExp {
  let out = '';
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '{') {
      const close = expr.indexOf('}', i);
      if (close > i) {
        out += '(.+)'; // {int} / {string} / {word} — a parameter captures
        i = close + 1;
        continue;
      }
    }
    if (ch === '(') {
      // Optional text group — match with OR without the inner text.
      let depth = 1;
      let j = i + 1;
      for (; j < expr.length && depth > 0; j++) {
        if (expr[j] === '(') depth++;
        else if (expr[j] === ')') depth--;
      }
      const inner = expr.slice(i + 1, j - 1);
      out += `(?:${inner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?`;
      i = j;
      continue;
    }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i++;
  }
  return new RegExp(`^${out}$`);
}

/** Recursively collect `*.ts` files under a directory (absent dir → []). */
function walkTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsFiles(abs));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(abs);
  }
  return out;
}

/**
 * Collect every cucumber step pattern (Given/When/Then/And/But) from the step-def trees —
 * RegExp literals compiled as-is (unanchored ones get wrapped), cucumber-expression strings
 * compiled through the parameter/optional-group semantics.
 */
export function collectStepPatterns(repoRoot: string, roots?: string[]): StepPattern[] {
  const dirs = roots ?? [path.join(repoRoot, 'tests', 'step_definitions')];
  const patterns: StepPattern[] = [];
  const callRe = /\b(?:Given|When|Then|And|But)\s*\(\s*(\/(?:\\.|[^/\n])+\/[a-z]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*')/g;
  for (const dir of dirs) {
    for (const file of walkTsFiles(dir)) {
      const src = fs.readFileSync(file, 'utf-8');
      for (const m of src.matchAll(callRe)) {
        const raw = m[1];
        try {
          if (raw.startsWith('/')) {
            const end = raw.lastIndexOf('/');
            const source = raw.slice(1, end);
            const flags = raw.slice(end + 1).replace('g', '');
            const anchored = source.startsWith('^') || source.endsWith('$') ? source : `^(?:${source})$`;
            patterns.push({ file, re: new RegExp(anchored, flags) });
          } else {
            patterns.push({ file, re: cucumberExpressionToRegExp(raw.slice(1, -1)) });
          }
        } catch {
          // An unparseable pattern contributes nothing — never crash the safety check.
        }
      }
    }
  }
  return patterns;
}

/** Result of the feature-safety check: which steps have NO matching real step-definition. */
export interface StepSafetyResult {
  ok: boolean;
  missing: string[];
  /** step text → the step-def files that define it (only for matched steps). */
  matched: Record<string, string[]>;
}

/** Check that EVERY scenario step matches a collected step-definition (the feature-safety gate). */
export function checkStepSafety(repoRoot: string, steps: string[], roots?: string[]): StepSafetyResult {
  const patterns = collectStepPatterns(repoRoot, roots);
  const missing: string[] = [];
  const matched: Record<string, string[]> = {};
  for (const raw of steps) {
    const text = raw.trim().replace(/^(Given|When|Then|And|But)\s+/, '');
    const hits = patterns.filter((p) => p.re.test(text)).map((p) => p.file);
    if (hits.length > 0) matched[raw] = [...new Set(hits)];
    else missing.push(raw);
  }
  return { ok: missing.length === 0, missing, matched };
}

// ─── shared result + helpers ────────────────────────────────────────────────────

/** Outcome of a domain authoring helper (the MCP reply body). */
export interface DomainAuthoringResult {
  ok: boolean;
  error?:
    | 'TARGET'
    | 'SPEC_NOT_FOUND'
    | 'DOC_NOT_FOUND'
    | 'BAD_ARGS'
    | 'FR_NOT_FOUND'
    | 'AC_NOT_FOUND'
    | 'PHASE_NOT_FOUND'
    | 'PHASE_EXISTS'
    | 'DUPLICATE_ID'
    | 'STEP_DEFS_MISSING'
    | 'VALIDATION_FAILED';
  hint?: string;
  /** Per-doc rendered blocks the helper produced (TASKS/FR/AC/feature/FILE_CHANGES). */
  rendered?: Record<string, string>;
  /** Set when feature steps lacked step-defs and the caller chose tasks_only (acceptance pin). */
  downgraded?: 'tasks_only';
  /** Steps with no matching step-definition (on STEP_DEFS_MISSING). */
  missing_steps?: string[];
  /** The created ids (task id / AC id) — the traceability handles. */
  ids?: string[];
  edits?: PatchEditPreview[];
  findings?: MutationFinding[];
  written?: boolean;
  shas?: Record<string, string>;
}

/** A unique id: `base`, else `base-2`, `base-3`, … against `taken`. */
function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!taken.has(cand)) return cand;
  }
}

/** FR-id → anchor map for a set of requirements; null lists the missing FRs. */
function resolveRequirements(ctx: SpecContext, frs: string[]): { anchors: Array<{ fr: string; anchor: string }> } | { missing: string[] } {
  const anchors: Array<{ fr: string; anchor: string }> = [];
  const missing: string[] = [];
  for (const fr of frs) {
    const found = ctx.frs.find((f) => f.id === fr);
    if (found) anchors.push({ fr, anchor: found.anchor });
    else missing.push(fr);
  }
  return missing.length > 0 ? { missing } : { anchors };
}

/** Run the composed edit set through the P33-3 transaction core (validate + all-or-nothing write). */
function commit(repoRoot: string, edits: PatchEdit[], rendered: Record<string, string>, extra: Partial<DomainAuthoringResult> = {}): DomainAuthoringResult {
  const result = applySpecTransactionCore(repoRoot, edits);
  if (!result.ok) {
    return { ok: false, error: 'VALIDATION_FAILED', rendered, edits: result.edits, findings: result.findings, hint: 'The rendered change failed the form/anchor/conformance gate — nothing was written. Fix the findings and retry.', ...extra };
  }
  return { ok: true, rendered, edits: result.edits, findings: [], written: true, shas: result.shas, ...extra };
}

/** Upsert the `**Связанные AC:**` line in an FR section, appending `links` (creates the line when absent). */
function withRelatedAcLine(content: string, frHeading: string, links: string[]): string | null {
  const eol = detectEol(content);
  const nl = eol === 'crlf' ? '\r\n' : '\n';
  const lines = splitLogical(content);
  const loc = locateSection(lines, frHeading);
  if (!loc.found || loc.startLine === null || loc.endLine === null) return null;
  const lineRe = /^\*\*(?:Связанные AC|Related AC):\*\*/;
  for (let i = loc.startLine; i < loc.endLine; i++) {
    if (lineRe.test(lines[i])) {
      const existing = lines[i];
      const additions = links.filter((l) => !existing.includes(l));
      if (additions.length > 0) lines[i] = `${existing}, ${additions.join(', ')}`;
      return lines.join(nl);
    }
  }
  // Absent — insert at the end of the section body.
  lines.splice(loc.endLine, 0, '', `**Связанные AC:** ${links.join(', ')}`);
  return lines.join(nl);
}

/** The next free `AC-<frN>.<minor>` for an FR (1 when the FR has no AC yet). */
function nextAcId(ctx: SpecContext, fr: string): string {
  const frNum = fr.match(/^FR-(\d+)$/)?.[1] ?? '0';
  let maxMinor = 0;
  for (const ac of ctx.acs) {
    const m = ac.id.match(new RegExp(`^AC-${frNum}\\.(\\d+)$`));
    if (m && ac.parentFr === fr) maxMinor = Math.max(maxMinor, Number(m[1]));
  }
  return `AC-${frNum}.${maxMinor + 1}`;
}

/** FILE_CHANGES entry edit (skipped when the spec has no FILE_CHANGES.md). */
function fileChangesEdit(ctx: SpecContext, slug: string, line: string): PatchEdit[] {
  if (!ctx.docs.has('FILE_CHANGES.md')) return [];
  return [{ spec: slug, doc: 'FILE_CHANGES.md', section: { kind: 'insert_at_eof', text: `\n${line}` } }];
}

/** Feature-scenario handling shared by add_backlog_task / register_incident_backlog. */
function resolveFeature(
  repoRoot: string,
  ctx: SpecContext,
  fr: string | undefined,
  feature: { scenarioId: string; title: string; steps: string[] } | undefined,
  tasksOnly: boolean,
  stepDefsRoots: string[] | undefined,
): { error?: DomainAuthoringResult; scenarioBlock?: string; pin?: string; downgraded?: 'tasks_only' } {
  if (!feature) return {};
  if (tasksOnly) {
    return { pin: `acceptance pin: ${feature.scenarioId} — TASKS-only (step-defs pending)`, downgraded: 'tasks_only' };
  }
  const safety = checkStepSafety(repoRoot, feature.steps, stepDefsRoots);
  if (!safety.ok) {
    return {
      error: {
        ok: false,
        error: 'STEP_DEFS_MISSING',
        missing_steps: safety.missing,
        hint:
          'Refusing to plant an executable scenario whose steps have no real step-definition — the suite would run an UNDEFINED scenario. ' +
          'Author REGEX step-defs under tests/step_definitions/ matching the missing steps, or pass tasks_only:true to downgrade to a TASKS-only acceptance pin.',
      },
    };
  }
  const frNum = (fr ?? 'FR-0').match(/^FR-(\d+)$/)?.[1] ?? '0';
  return { scenarioBlock: renderScenarioBlock(`@feature${frNum}`, feature.scenarioId, feature.title, feature.steps) };
}

// ─── the five domain helpers ────────────────────────────────────────────────────

/** add_backlog_task input. */
export interface AddBacklogTaskInput {
  spec: string;
  /** Phase heading TEXT or its Marksman anchor the task goes under. */
  phase: string;
  title: string;
  /** Explicit task id; auto-derived from the title when omitted (uniqueness enforced). */
  id?: string;
  estMinutes?: number;
  depends?: string;
  /** FR ids the task traces to (each must exist in FR.md). */
  requirements?: string[];
  doneWhen?: string[];
  /** Optional executable scenario — refused unless its steps match real step-defs. */
  feature?: { scenarioId: string; title: string; steps: string[] };
  /** Explicit TASKS-only acceptance pin (skip the .feature, plant a Done-When pin). */
  tasksOnly?: boolean;
  stepDefsRoots?: string[];
}

/** FR-60d `add_backlog_task` — a canonical, FR-traced task under a phase, with optional feature safety. */
export function addBacklogTask(repoRoot: string, input: AddBacklogTaskInput): DomainAuthoringResult {
  const loaded = loadContext(repoRoot, input.spec);
  if ('error' in loaded) return { ok: false, error: 'TARGET', hint: 'spec must stay within .specs/ (no traversal).' };
  const ctx = loaded;
  if (!ctx.docs.has('TASKS.md')) return { ok: false, error: 'DOC_NOT_FOUND', hint: 'TASKS.md does not exist in this spec — scaffold it first.' };
  if (!input.title.trim()) return { ok: false, error: 'BAD_ARGS', hint: 'title must be non-empty.' };
  const reqs = input.requirements ?? [];
  const resolved = resolveRequirements(ctx, reqs);
  if ('missing' in resolved) {
    return { ok: false, error: 'FR_NOT_FOUND', hint: `requirements reference FR ids that do not exist in FR.md: ${resolved.missing.join(', ')} — amend or create the FR first.` };
  }
  const taken = new Set(ctx.taskIds);
  const id = input.id ? input.id : uniqueId(`task-${marksmanSlug(input.title) || 'backlog'}`, taken);
  if (taken.has(id)) {
    return { ok: false, error: 'DUPLICATE_ID', hint: `task id "${id}" already exists in TASKS.md — task ids must be unique; pick a fresh id or omit it for auto-generation.` };
  }
  const featureReq = reqs[0];
  const feat = resolveFeature(repoRoot, ctx, featureReq, input.feature, input.tasksOnly === true, input.stepDefsRoots);
  if (feat.error) return feat.error;

  const doneWhen = [...(input.doneWhen ?? [])];
  if (feat.pin) doneWhen.push(feat.pin);
  const block = renderTaskBlock({
    title: input.title, id, estMinutes: input.estMinutes, depends: input.depends,
    requirements: resolved.anchors, doneWhen,
  });
  const loc = findHeading(splitLogical(ctx.docs.get('TASKS.md')!), input.phase);
  if (!loc.found) {
    return { ok: false, error: 'PHASE_NOT_FOUND', hint: `no phase heading matched "${input.phase}". Available phases: ${ctx.phases.length > 0 ? ctx.phases.join(', ') : '(none — add_phase first)'}.` };
  }
  const edits: PatchEdit[] = [
    { spec: ctx.slug, doc: 'TASKS.md', section: { kind: 'append_to_section', heading: input.phase, text: block } },
    ...fileChangesEdit(ctx, ctx.slug, `- TASKS.md: add backlog task \`${id}\` (${reqs.join(', ') || 'untraced'})`),
  ];
  if (feat.scenarioBlock && ctx.docs.has(`${ctx.slug}.feature`)) {
    edits.push({ spec: ctx.slug, doc: `${ctx.slug}.feature`, section: { kind: 'insert_at_eof', text: feat.scenarioBlock } });
  }
  return commit(repoRoot, edits, { 'TASKS.md': block }, { ids: [id], downgraded: feat.downgraded });
}

/** add_phase input. */
export interface AddPhaseInput {
  spec: string;
  title: string;
  /** Phase number; auto = max existing + 1 when omitted. */
  number?: number;
  /** Optional one-line source/rationale rendered under the heading. */
  source?: string;
}

/** FR-60d `add_phase` — a canonical `## Phase N — Title (date)` heading at the end of TASKS.md. */
export function addPhase(repoRoot: string, input: AddPhaseInput): DomainAuthoringResult {
  const loaded = loadContext(repoRoot, input.spec);
  if ('error' in loaded) return { ok: false, error: 'TARGET', hint: 'spec must stay within .specs/ (no traversal).' };
  const ctx = loaded;
  if (!ctx.docs.has('TASKS.md')) return { ok: false, error: 'DOC_NOT_FOUND', hint: 'TASKS.md does not exist in this spec — scaffold it first.' };
  if (!input.title.trim()) return { ok: false, error: 'BAD_ARGS', hint: 'title must be non-empty.' };
  const number = input.number ?? (ctx.phaseNumbers.length > 0 ? Math.max(...ctx.phaseNumbers) + 1 : 1);
  if (ctx.phaseNumbers.includes(number)) {
    return { ok: false, error: 'PHASE_EXISTS', hint: `Phase ${number} already exists — phases must be numbered uniquely; omit number for auto-assignment.` };
  }
  const date = new Date().toISOString().slice(0, 10);
  const heading = `## Phase ${number} — ${input.title} (${date})`;
  const text = `${heading}\n${input.source ? `\nИсточник: ${input.source}\n` : ''}`;
  const edits: PatchEdit[] = [
    { spec: ctx.slug, doc: 'TASKS.md', section: { kind: 'insert_at_eof', text: `\n${text}` } },
    ...fileChangesEdit(ctx, ctx.slug, `- TASKS.md: add Phase ${number} — ${input.title}`),
  ];
  return commit(repoRoot, edits, { 'TASKS.md': text.trimEnd() }, { ids: [`phase-${number}`] });
}

/** amend_requirement input. */
export interface AmendRequirementInput {
  spec: string;
  /** The FR id to amend (must exist in FR.md). */
  fr: string;
  /** Body text appended to the FR section. */
  text?: string;
  /** AC ids to link from the FR's `**Связанные AC:**` line (each must exist). */
  relatedAcIds?: string[];
}

/** FR-60d `amend_requirement` — append to an FR block + maintain its Связанные AC line (one composed FR.md edit). */
export function amendRequirement(repoRoot: string, input: AmendRequirementInput): DomainAuthoringResult {
  const loaded = loadContext(repoRoot, input.spec);
  if ('error' in loaded) return { ok: false, error: 'TARGET', hint: 'spec must stay within .specs/ (no traversal).' };
  const ctx = loaded;
  const frCurrent = ctx.docs.get('FR.md');
  if (frCurrent === undefined) return { ok: false, error: 'DOC_NOT_FOUND', hint: 'FR.md does not exist in this spec — scaffold it first.' };
  const fr = ctx.frs.find((f) => f.id === input.fr);
  if (!fr) return { ok: false, error: 'FR_NOT_FOUND', hint: `no ${input.fr} heading in FR.md — known FRs: ${ctx.frs.map((f) => f.id).join(', ') || '(none)'}.` };
  if (!input.text && !(input.relatedAcIds && input.relatedAcIds.length > 0)) {
    return { ok: false, error: 'BAD_ARGS', hint: 'pass text and/or relatedAcIds to amend the requirement.' };
  }
  const acLinks: string[] = [];
  for (const acId of input.relatedAcIds ?? []) {
    const known = ctx.acs.find((a) => a.id === acId);
    if (!known) return { ok: false, error: 'AC_NOT_FOUND', hint: `${acId} does not exist in ACCEPTANCE_CRITERIA.md — add_acceptance_criterion first.` };
    acLinks.push(`[${acId}](ACCEPTANCE_CRITERIA.md#${marksmanSlug(acId)})`);
  }
  // Compose ONE FR.md edit: append the body text, then upsert the Связанные AC line.
  let next = frCurrent;
  const rendered: Record<string, string> = {};
  if (input.text) {
    const lines = splitLogical(input.text);
    const heading = splitLogical(frCurrent)[fr.headingLine - 1].replace(HEADING_RE, '$2');
    const t = applySectionOpToContent(next, { kind: 'append_to_section', heading, text: lines.join('\n') });
    if (!t.ok || t.next === undefined) return { ok: false, error: 'PHASE_NOT_FOUND', hint: `the ${input.fr} heading no longer resolves for the append.` };
    next = t.next;
    rendered['FR.md'] = input.text;
  }
  if (acLinks.length > 0) {
    const heading = splitLogical(next)[fr.headingLine - 1].replace(HEADING_RE, '$2');
    const updated = withRelatedAcLine(next, heading, acLinks);
    if (updated === null) return { ok: false, error: 'FR_NOT_FOUND', hint: `the ${input.fr} section no longer resolves for the Связанные AC upsert.` };
    next = updated;
    rendered['FR.md'] = `${rendered['FR.md'] ?? ''}\n**Связанные AC:** ${acLinks.join(', ')}`.trim();
  }
  const edits: PatchEdit[] = [
    { spec: ctx.slug, doc: 'FR.md', content: next },
    ...fileChangesEdit(ctx, ctx.slug, `- FR.md: amend ${input.fr}${acLinks.length > 0 ? ` (+${acLinks.length} AC link(s))` : ''}`),
  ];
  return commit(repoRoot, edits, rendered, { ids: [input.fr] });
}

/** add_acceptance_criterion input. */
export interface AddAcceptanceCriterionInput {
  spec: string;
  /** Parent FR id (must exist in FR.md). */
  fr: string;
  /** AC title (the short-form heading carries the id; the body carries the prose). */
  title: string;
  /** AC body prose; defaults to the title. */
  body?: string;
  /** Explicit AC id (`AC-N.M`); auto = next free minor of the FR when omitted. */
  id?: string;
}

/** FR-60d `add_acceptance_criterion` — a canonical AC block + the FR-side Связанные AC link. */
export function addAcceptanceCriterion(repoRoot: string, input: AddAcceptanceCriterionInput): DomainAuthoringResult {
  const loaded = loadContext(repoRoot, input.spec);
  if ('error' in loaded) return { ok: false, error: 'TARGET', hint: 'spec must stay within .specs/ (no traversal).' };
  const ctx = loaded;
  if (!ctx.docs.has('ACCEPTANCE_CRITERIA.md')) return { ok: false, error: 'DOC_NOT_FOUND', hint: 'ACCEPTANCE_CRITERIA.md does not exist in this spec — scaffold it first.' };
  const fr = ctx.frs.find((f) => f.id === input.fr);
  if (!fr) return { ok: false, error: 'FR_NOT_FOUND', hint: `no ${input.fr} heading in FR.md — known FRs: ${ctx.frs.map((f) => f.id).join(', ') || '(none)'}.` };
  const acId = input.id ?? nextAcId(ctx, input.fr);
  if (!/^AC-\d+(?:\.\d+)?$/.test(acId)) return { ok: false, error: 'BAD_ARGS', hint: `AC id must look like AC-N.M (got "${acId}").` };
  if (ctx.acs.some((a) => a.id === acId)) {
    return { ok: false, error: 'DUPLICATE_ID', hint: `${acId} already exists in ACCEPTANCE_CRITERIA.md — AC ids must be unique; omit id for auto-assignment.` };
  }
  const block = renderAcBlock(acId, input.fr, fr.anchor, input.body?.trim() || input.title);
  // TWO-PHASE commit — the FR-side `Связанные AC` link points at the AC heading this same
  // mutation CREATES, and the anchor layer validates each doc against the OTHER docs as they
  // are ON DISK: in one transaction the FR link would read as broken (AC.md not yet written).
  // Phase 1 writes the AC block (+ FILE_CHANGES); phase 2 adds the FR link against the FRESH
  // disk where the AC heading resolves. Both phases run the same validation-before-write door.
  const phase1 = commit(
    repoRoot,
    [
      { spec: ctx.slug, doc: 'ACCEPTANCE_CRITERIA.md', section: { kind: 'insert_at_eof', text: `\n${block}\n` } },
      ...fileChangesEdit(ctx, ctx.slug, `- ACCEPTANCE_CRITERIA.md: add ${acId} (${input.fr})`),
    ],
    { 'ACCEPTANCE_CRITERIA.md': block },
    { ids: [acId] },
  );
  if (!phase1.ok) return phase1;
  const frCurrent = ctx.docs.get('FR.md');
  if (frCurrent !== undefined) {
    const frHeading = splitLogical(frCurrent)[fr.headingLine - 1].replace(HEADING_RE, '$2');
    const acLink = `[${acId}](ACCEPTANCE_CRITERIA.md#${marksmanSlug(acId)})`;
    const frNext = withRelatedAcLine(frCurrent, frHeading, [acLink]);
    if (frNext !== null && frNext !== frCurrent) {
      const phase2 = commit(repoRoot, [{ spec: ctx.slug, doc: 'FR.md', content: frNext }], {
        'ACCEPTANCE_CRITERIA.md': block,
        'FR.md': `**Связанные AC:** ${acLink}`,
      }, { ids: [acId] });
      if (!phase2.ok) {
        return {
          ...phase2,
          hint: `${acId} was written to ACCEPTANCE_CRITERIA.md, but the FR-side Связанные AC link failed validation (${phase2.error}) — retry amend_requirement({fr, related_ac_ids:["${acId}"]}) to add the link.`,
        };
      }
      return { ...phase2, ids: [acId] };
    }
  }
  return phase1;
}

/** register_incident_backlog input. */
export interface RegisterIncidentBacklogInput {
  spec: string;
  /** One-line incident summary (becomes the task title). */
  summary: string;
  /** Incident date (YYYY-MM-DD); defaults to today. */
  date?: string;
  requirements?: string[];
  doneWhen?: string[];
  feature?: { scenarioId: string; title: string; steps: string[] };
  tasksOnly?: boolean;
  stepDefsRoots?: string[];
}

/**
 * FR-60d `register_incident_backlog` — capture an incident as a canonical, FR-traced task in
 * the `## Backlog` section (created on demand), with the same feature-safety gate as
 * add_backlog_task.
 */
export function registerIncidentBacklog(repoRoot: string, input: RegisterIncidentBacklogInput): DomainAuthoringResult {
  const loaded = loadContext(repoRoot, input.spec);
  if ('error' in loaded) return { ok: false, error: 'TARGET', hint: 'spec must stay within .specs/ (no traversal).' };
  const ctx = loaded;
  if (!ctx.docs.has('TASKS.md')) return { ok: false, error: 'DOC_NOT_FOUND', hint: 'TASKS.md does not exist in this spec — scaffold it first.' };
  if (!input.summary.trim()) return { ok: false, error: 'BAD_ARGS', hint: 'summary must be non-empty.' };
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const reqs = input.requirements ?? [];
  const resolved = resolveRequirements(ctx, reqs);
  if ('missing' in resolved) {
    return { ok: false, error: 'FR_NOT_FOUND', hint: `requirements reference FR ids that do not exist in FR.md: ${resolved.missing.join(', ')} — amend or create the FR first.` };
  }
  const feat = resolveFeature(repoRoot, ctx, reqs[0], input.feature, input.tasksOnly === true, input.stepDefsRoots);
  if (feat.error) return feat.error;
  const taken = new Set(ctx.taskIds);
  const id = uniqueId(`incident-${date}-${marksmanSlug(input.summary).slice(0, 40) || 'backlog'}`, taken);
  const doneWhen = [...(input.doneWhen ?? [`incident reproduced and root cause captured (${date})`])];
  if (feat.pin) doneWhen.push(feat.pin);
  const block = renderTaskBlock({
    title: `Incident ${date}: ${input.summary}`, id, estMinutes: 120, requirements: resolved.anchors, doneWhen,
  });
  // One TASKS.md edit: append under `## Backlog` when it exists, else create the section + block.
  const hasBacklog = findHeading(splitLogical(ctx.docs.get('TASKS.md')!), 'Backlog').found;
  const tasksEdit: PatchEdit = hasBacklog
    ? { spec: ctx.slug, doc: 'TASKS.md', section: { kind: 'append_to_section', heading: 'Backlog', text: block } }
    : { spec: ctx.slug, doc: 'TASKS.md', section: { kind: 'insert_at_eof', text: `\n## Backlog\n\n${block}` } };
  const edits: PatchEdit[] = [
    tasksEdit,
    ...fileChangesEdit(ctx, ctx.slug, `- TASKS.md: register incident \`${id}\` (${reqs.join(', ') || 'untraced'})`),
  ];
  if (feat.scenarioBlock && ctx.docs.has(`${ctx.slug}.feature`)) {
    edits.push({ spec: ctx.slug, doc: `${ctx.slug}.feature`, section: { kind: 'insert_at_eof', text: feat.scenarioBlock } });
  }
  return commit(repoRoot, edits, { 'TASKS.md': block }, { ids: [id], downgraded: feat.downgraded });
}
