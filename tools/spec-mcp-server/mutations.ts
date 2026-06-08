/**
 * FR-40 — the «живой генератор» mutation engine (P17-2).
 *
 * Spec writes go THROUGH the server: the change is applied IN MEMORY, the
 * result is validated by the EXISTING engine (no second validator — the
 * anti-pattern FR-40a forbids), and only a clean result touches the disk
 * (atomic temp+rename). Any error-severity finding → refusal with the
 * findings list; the agent fixes and retries.
 *
 * Validation layers (all reuse, none re-implemented):
 *   1. form contracts   — spec-form-parsers by doc basename (the same parsers
 *                         the live form-guards run);
 *   2. anchors          — anchor-integrity `checkLinks` over the spec's md
 *                         files with the changed doc swapped in-memory;
 *   3. conformance      — `checkConformance` over a graph built from a TEMP
 *                         CLONE of the spec dir with the change applied
 *                         (error severity only; the real tree is untouched
 *                         until validation passes).
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
import { checkLinks } from '../anchor-integrity/check.mjs';
import { buildGraph } from '../spec-graph/builder.ts';
import { checkConformance } from '../spec-graph/conformance.ts';
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
  layer: 'form' | 'anchor' | 'conformance' | 'change' | 'target';
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
  if (!MUTABLE_DOC_RE.test(doc)) {
    return {
      layer: 'target',
      message: `doc "${doc}" is not a mutable spec document — only *.md / *.feature (NOT .progress.json: single-writer via spec-status)`,
    };
  }
  return null;
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

/** Layer 1 — the SAME parsers the live form-guards run, by doc basename. */
function formFindings(doc: string, content: string): MutationFinding[] {
  const out: MutationFinding[] = [];
  const push = (blocks: Array<{ missingFirst: string | null; lineNumber: number }>, label: string): void => {
    for (const b of blocks) {
      if (b.missingFirst) out.push({ layer: 'form', line: b.lineNumber, message: `${label}: missing ${b.missingFirst}` });
    }
  };
  switch (path.basename(doc)) {
    case 'TASKS.md':
      push(parseTaskBlocks(content).filter((b) => !b.waived), 'task');
      break;
    case 'USER_STORIES.md':
      push(parseUserStoryBlocks(content), 'user story');
      break;
    case 'DESIGN.md':
      push(parseDecisionBlocks(content), 'decision');
      break;
    case 'REQUIREMENTS.md':
      push(parseChkRows(content) as never, 'CHK row');
      break;
  }
  return out;
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

// Key WITHOUT line: a localized edit shifts line numbers, and a pre-existing
// broken anchor that merely moved must NOT read as "introduced by this change".
const anchorKey = (b: BrokenAnchor): string => `${b.file}#${b.brokenAnchor}`;

/**
 * Layer 2 — anchors, DELTA-ONLY. A mutation is blamed only for broken anchors
 * it INTRODUCES, never for pre-existing breakage in sibling docs (a fresh
 * scaffold ships placeholder `#uc-N-…` cross-refs; whole-spec strictness would
 * block every unrelated edit — caught live 2026-06-07). Baseline = the spec as
 * it is on disk now; report only anchors present AFTER the change but not before.
 */
function anchorFindings(repoRoot: string, slug: string, doc: string, next: string): MutationFinding[] {
  const baseline = new Set(
    (checkLinks(specMdFiles(repoRoot, slug)) as BrokenAnchor[]).map(anchorKey),
  );
  const after = checkLinks(specMdFiles(repoRoot, slug, doc, next)) as BrokenAnchor[];
  return after
    .filter((b) => !baseline.has(anchorKey(b)))
    .map((b) => ({
      layer: 'anchor' as const,
      line: b.line,
      message: `broken anchor #${b.brokenAnchor} → ${b.targetFile} (${b.file})`,
    }),
  );
}

/** Layer 3 — conformance over a TEMP CLONE with the change applied. */
function conformanceFindings(repoRoot: string, slug: string, doc: string, next: string): MutationFinding[] {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-mutate-'));
  try {
    const srcDir = path.join(repoRoot, '.specs', slug);
    const dstDir = path.join(tmpRoot, '.specs', slug);
    fs.cpSync(srcDir, dstDir, { recursive: true });
    fs.writeFileSync(path.join(dstDir, doc), next);
    const graph = buildGraph({ repoRoot: tmpRoot, skipNdjson: true });
    return checkConformance(graph)
      .filter((f) => f.severity === 'error')
      .map((f) => ({
        layer: 'conformance' as const,
        line: f.location.line,
        message: `${f.code}: ${f.message}`,
      }));
  } catch (e) {
    return [{ layer: 'conformance', message: `conformance validation failed: ${e instanceof Error ? e.message : e}` }];
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
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
  if (!applied.ok) return { ok: false, findings: [applied.finding] };
  const next = applied.next;
  // Empty full-replace silently destroys a doc — refuse (the review's #9).
  if (next.trim() === '' && current !== null && current.trim() !== '') {
    return {
      ok: false,
      findings: [{ layer: 'change', message: 'refusing to replace a non-empty document with empty content' }],
    };
  }
  const findings = [
    ...formFindings(doc, next),
    ...(isMd ? anchorFindings(repoRoot, slug, doc, next) : []),
    ...(isMd || isFeature ? conformanceFindings(repoRoot, slug, doc, next) : []),
  ];
  return { ok: findings.length === 0, next, findings };
}

/** Atomic write per atomic-config-save: unique temp + rename. On a rename
 *  failure (Windows EPERM/EBUSY when the target is locked by an editor/watcher)
 *  the temp file is unlinked so it never litters .specs/ (review #6). */
export function writeDocAtomic(repoRoot: string, slug: string, doc: string, content: string): string {
  const dir = path.join(repoRoot, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, doc);
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
}
