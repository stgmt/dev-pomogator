/**
 * FR-60a/e — section-targeted authoring operations (P33-1).
 *
 * The mutation door (`apply_spec_change`) addresses a change by an EXACT
 * `old_string` — the dogfood pain FR-60 names: agents hand-roll mini-version-
 * control over sha reads + exact-match + CRLF/LF uncertainty. This module raises
 * the surface to STABLE HEADINGS: `append_to_section` / `insert_after_heading` /
 * `insert_at_eof` address a section by its Marksman anchor (or heading text),
 * never by exact trailing text.
 *
 * Two invariants the RED scenario SPECGEN004_520 pins:
 *   1. EOL PRESERVATION — the operation detects the document's EOL style
 *      (CRLF vs LF) and re-joins the result with that SAME style, so a CRLF doc
 *      stays fully CRLF (no bare `\n` smuggled in by the inserted text).
 *   2. VALIDATION BEFORE WRITE — the produced `next` content is run through the
 *      EXISTING `validateSpecChange` (form contracts + anchors + conformance,
 *      the very layers `apply_spec_change` runs); only a clean result is written,
 *      atomically, by `writeDocAtomic`. A section op introduces NO second
 *      validator (the FR-40a anti-pattern).
 *
 * FR-60e read-for-edit metadata (`readForEdit`) returns `eol_style`,
 * `heading_anchor`, `section_sha`, `start_line/end_line`, and stable
 * append/insert tokens. Tokens carry the HEADING ANCHOR (not a line number), so
 * a follow-up insert re-targets the SAME section even when unrelated text shifts
 * the line numbers elsewhere in the doc.
 *
 * @see .specs/spec-generator-v4/FR.md FR-60 (FR-60a anchor/section ops, FR-60e read-for-edit)
 * @see .specs/spec-generator-v4/TASKS.md p33-anchor-section-ops (Phase 33, P33-1)
 * @see ./mutations.ts (validateSpecChange / writeDocAtomic / resolveSpecDoc / docSha — all reused, none re-implemented)
 */
import fs from 'node:fs';
import { marksmanSlug } from '../anchor-integrity/marksman-slug.mjs';
import {
  validateSpecChange,
  writeDocAtomic,
  validateTarget,
  resolveSpecDoc,
  docSha,
  casCheck,
  type MutationFinding,
} from './mutations.ts';

/** The document's end-of-line style — detected, preserved on write. */
export type EolStyle = 'crlf' | 'lf';

/** The three stable-heading operations FR-60a exposes. */
export type SectionOpKind = 'append_to_section' | 'insert_after_heading' | 'insert_at_eof';

/** A section operation: address a section by anchor/heading, insert `text`. */
export interface SectionOp {
  kind: SectionOpKind;
  /** Heading TEXT or its Marksman anchor; ignored for `insert_at_eof`. */
  heading?: string;
  /** Text to insert. May use any EOL internally — it is re-joined to the doc EOL. */
  text: string;
}

/** Where a heading/section sits in a document (1-based lines; null when not found). */
export interface SectionLocator {
  found: boolean;
  /** `#` count of the heading (1-6), or null when not found. */
  headingLevel: number | null;
  /** Exact heading text as written in the doc. */
  headingText: string | null;
  /** Marksman/GLFM slug of the heading — the stable anchor. */
  headingAnchor: string | null;
  /** 1-based line of the heading itself. */
  startLine: number | null;
  /** 1-based last body line of the section (the heading line when the section is empty). */
  endLine: number | null;
}

/** A markdown ATX heading: `##  Title  ` (optional closing hashes tolerated). */
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Detect a document's EOL style: any CRLF present ⇒ the doc is CRLF. */
export function detectEol(content: string): EolStyle {
  return content.includes('\r\n') ? 'crlf' : 'lf';
}

/** Split into logical lines, dropping the EOL so we can re-join with a chosen style. */
function splitLogical(content: string): string[] {
  return content.split(/\r\n|\n/);
}

/**
 * Find a heading by EXACT text OR by Marksman anchor. Matching on the slug (not
 * just the literal text) is what makes the anchor STABLE: the caller can pass the
 * anchor `phase-1-demo` and still hit `## Phase 1 — Demo`. Returns a locator with
 * `found:false` when nothing matches.
 */
export function findHeading(lines: string[], heading: string): SectionLocator {
  const notFound: SectionLocator = {
    found: false,
    headingLevel: null,
    headingText: null,
    headingAnchor: null,
    startLine: null,
    endLine: null,
  };
  const wantSlug = marksmanSlug(heading);
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const text = m[2];
    const slug = marksmanSlug(text);
    if (text === heading || slug === wantSlug || slug === heading) {
      return {
        found: true,
        headingLevel: m[1].length,
        headingText: text,
        headingAnchor: slug,
        startLine: i + 1,
        endLine: i + 1,
      };
    }
  }
  return notFound;
}

/**
 * Locate a whole SECTION: the heading plus its body, ending at the line before
 * the next heading of the SAME OR HIGHER level (or EOF). `endLine` is the last
 * body line, so appending at `endLine` lands content at the very end of the
 * section without crossing into the next one.
 */
export function locateSection(lines: string[], heading: string): SectionLocator {
  const h = findHeading(lines, heading);
  if (!h.found) return h;
  const level = h.headingLevel as number;
  const startIdx = (h.startLine as number) - 1;
  let endIdx = lines.length - 1;
  for (let j = startIdx + 1; j < lines.length; j++) {
    const m = HEADING_RE.exec(lines[j]);
    if (m && m[1].length <= level) {
      endIdx = j - 1;
      break;
    }
  }
  return { ...h, endLine: endIdx + 1 };
}

/** Result of applying a section op to in-memory content (no disk, no validation). */
export interface SectionTransform {
  ok: boolean;
  /** The full would-be document content, EOL preserved. */
  next?: string;
  eol: EolStyle;
  locator: SectionLocator;
  error?: 'HEADING_REQUIRED' | 'HEADING_NOT_FOUND';
}

/**
 * Apply a section op to `content`, PRESERVING its EOL style. Pure — never touches
 * disk. The inserted text is split on any EOL and re-joined with the document's
 * detected EOL, so a CRLF document yields a result with NO bare `\n`.
 */
export function applySectionOpToContent(content: string, op: SectionOp): SectionTransform {
  const eol = detectEol(content);
  const nl = eol === 'crlf' ? '\r\n' : '\n';
  const lines = splitLogical(content);
  const insertLines = op.text.split(/\r\n|\n/);

  if (op.kind === 'insert_at_eof') {
    // Append at end-of-file. Keep a trailing newline if the doc had one (the
    // split leaves a final '' element we insert BEFORE).
    const trailingEmpty = lines.length > 0 && lines[lines.length - 1] === '';
    const insertIdx = trailingEmpty ? lines.length - 1 : lines.length;
    lines.splice(insertIdx, 0, ...insertLines);
    return {
      ok: true,
      next: lines.join(nl),
      eol,
      locator: { found: true, headingLevel: null, headingText: null, headingAnchor: null, startLine: null, endLine: null },
    };
  }

  // append_to_section / insert_after_heading both need a heading.
  if (op.heading === undefined || op.heading === '') {
    return { ok: false, eol, locator: { found: false, headingLevel: null, headingText: null, headingAnchor: null, startLine: null, endLine: null }, error: 'HEADING_REQUIRED' };
  }

  if (op.kind === 'insert_after_heading') {
    const h = findHeading(lines, op.heading);
    if (!h.found) {
      return { ok: false, eol, locator: h, error: 'HEADING_NOT_FOUND' };
    }
    const headingIdx = (h.startLine as number) - 1;
    lines.splice(headingIdx + 1, 0, ...insertLines);
    return { ok: true, next: lines.join(nl), eol, locator: h };
  }

  // append_to_section — insert at the END of the located section body.
  const loc = locateSection(lines, op.heading);
  if (!loc.found) {
    return { ok: false, eol, locator: loc, error: 'HEADING_NOT_FOUND' };
  }
  const insertIdx = loc.endLine as number; // 1-based endLine == 0-based index just past the body
  lines.splice(insertIdx, 0, ...insertLines);
  return { ok: true, next: lines.join(nl), eol, locator: loc };
}

/**
 * EOL-independent sha of a section's logical lines — stable across CRLF/LF, so a
 * read-for-edit token stays valid even if a formatter flips the file's EOL.
 */
export function sectionSha(content: string, locator: SectionLocator): string | null {
  if (!locator.found || locator.startLine === null || locator.endLine === null) return null;
  const lines = splitLogical(content);
  const span = lines.slice(locator.startLine - 1, locator.endLine);
  return docSha(span.join('\n'));
}

/** A parsed section token — see `sectionTokens`. */
export interface SectionToken {
  kind: 'append' | 'insert';
  /** The stable heading anchor the token re-targets (`$eof` for end-of-file). */
  heading: string;
}

const EOF_TOKEN = '$eof';

/**
 * Stable append/insert tokens for a read-for-edit response. A token carries the
 * HEADING ANCHOR (not a line number) so a follow-up op re-targets the same
 * section even when unrelated edits shift line numbers elsewhere in the doc.
 */
export function sectionTokens(locator: SectionLocator): { appendToken: string; insertToken: string } {
  const anchor = locator.found && locator.headingAnchor ? locator.headingAnchor : EOF_TOKEN;
  return { appendToken: `append:${anchor}`, insertToken: `insert:${anchor}` };
}

/** Parse a token from `sectionTokens` back into a kind + stable heading anchor. */
export function parseSectionToken(token: string): SectionToken | null {
  const m = /^(append|insert):(.+)$/.exec(token);
  if (!m) return null;
  return { kind: m[1] as 'append' | 'insert', heading: m[2] };
}

/** FR-60e read-for-edit metadata for a whole doc or one section. */
export interface ReadForEditResult {
  ok: boolean;
  eol_style?: EolStyle;
  heading_anchor?: string | null;
  section_sha?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  append_token?: string;
  insert_token?: string;
  /** Whole-doc CAS token (sha of the full content) — pass back as expected_sha. */
  sha?: string;
  total_lines?: number;
  total_bytes?: number;
  error?: 'TARGET' | 'DOC_NOT_FOUND';
  hint?: string;
}

/** Read the doc bytes safely through the SAME containment gate the read door uses. */
function readDoc(
  repoRoot: string,
  slug: string,
  doc: string,
): { ok: true; abs: string; rel: string; current: string } | { ok: false; error: 'TARGET' | 'DOC_NOT_FOUND' } {
  const targetBad = validateTarget(slug, doc);
  if (targetBad) return { ok: false, error: 'TARGET' };
  const resolved = resolveSpecDoc(repoRoot, slug, doc);
  if (!resolved.ok) return { ok: false, error: 'TARGET' };
  if (!fs.existsSync(resolved.abs) || !fs.statSync(resolved.abs).isFile()) {
    return { ok: false, error: 'DOC_NOT_FOUND' };
  }
  return { ok: true, abs: resolved.abs, rel: resolved.rel, current: fs.readFileSync(resolved.abs, 'utf-8') };
}

/**
 * FR-60e: metadata an agent needs to edit a section safely — EOL style, the
 * stable heading anchor, the section sha, its line span, and append/insert
 * tokens. Without `heading` the metadata describes the WHOLE document.
 */
export function readForEdit(repoRoot: string, slug: string, doc: string, heading?: string): ReadForEditResult {
  const read = readDoc(repoRoot, slug, doc);
  if (!read.ok) {
    return {
      ok: false,
      error: read.error,
      hint: read.error === 'DOC_NOT_FOUND' ? 'Call list_spec_docs({spec}) for the valid inventory.' : 'spec/doc must stay within .specs/ (no traversal).',
    };
  }
  const { current } = read;
  const eol = detectEol(current);
  const lines = splitLogical(current);
  const locator = heading ? locateSection(lines, heading) : { found: true, headingLevel: null, headingText: null, headingAnchor: null, startLine: 1, endLine: lines.length };
  const tokens = sectionTokens(locator);
  return {
    ok: true,
    eol_style: eol,
    heading_anchor: locator.headingAnchor,
    section_sha: heading ? sectionSha(current, locator) : docSha(current),
    start_line: locator.startLine,
    end_line: locator.endLine,
    append_token: tokens.appendToken,
    insert_token: tokens.insertToken,
    sha: docSha(current),
    total_lines: lines.length,
    total_bytes: current.length,
  };
}

/** Outcome of a section op run through the validation-before-write door. */
export interface SectionOutcome {
  ok: boolean;
  /** The full would-be / written content (EOL preserved). Absent on early refusal. */
  preview?: string;
  eol_style: EolStyle;
  /** True once the heading anchor resolved (i.e. no exact old_string was needed). */
  resolved: boolean;
  heading_anchor: string | null;
  start_line: number | null;
  end_line: number | null;
  section_sha: string | null;
  findings: MutationFinding[];
  /** Set once the clean result was written atomically. */
  written?: boolean;
  sha?: string;
  bytes?: number;
  error?: 'TARGET' | 'DOC_NOT_FOUND' | 'HEADING_REQUIRED' | 'HEADING_NOT_FOUND' | 'VALIDATION_FAILED';
}

/**
 * Resolve + transform + VALIDATE a section op WITHOUT writing — the free preview.
 * Runs the produced content through `validateSpecChange` (form + anchors +
 * conformance), the same layers `apply_spec_change` runs, so the preview tells
 * the caller exactly what a write would do.
 */
export function proposeSectionChange(repoRoot: string, slug: string, doc: string, op: SectionOp): SectionOutcome {
  const read = readDoc(repoRoot, slug, doc);
  if (!read.ok) {
    return {
      ok: false,
      eol_style: 'lf',
      resolved: false,
      heading_anchor: null,
      start_line: null,
      end_line: null,
      section_sha: null,
      findings: [],
      error: read.error,
    };
  }
  const { current } = read;
  const transform = applySectionOpToContent(current, op);
  if (!transform.ok || transform.next === undefined) {
    return {
      ok: false,
      eol_style: transform.eol,
      resolved: false,
      heading_anchor: transform.locator.headingAnchor,
      start_line: transform.locator.startLine,
      end_line: transform.locator.endLine,
      section_sha: null,
      findings: [],
      error: transform.error ?? 'HEADING_NOT_FOUND',
    };
  }
  // FR-60a: run the SAME validation-before-write path apply_spec_change uses —
  // no second validator. `validateSpecChange` re-reads the on-disk current and
  // applies `{content: next}` (a no-op replace) before running form/anchor/
  // conformance, so the findings are exactly what a write would gate on.
  const validation = validateSpecChange(repoRoot, slug, doc, { content: transform.next });
  return {
    ok: validation.ok,
    preview: transform.next,
    eol_style: transform.eol,
    resolved: true,
    heading_anchor: transform.locator.headingAnchor,
    start_line: transform.locator.startLine,
    end_line: transform.locator.endLine,
    section_sha: sectionSha(current, transform.locator),
    findings: validation.findings,
    error: validation.ok ? undefined : 'VALIDATION_FAILED',
  };
}

/**
 * Propose + (only when clean) atomically WRITE a section op. The write goes
 * through `writeDocAtomic` (temp + rename, write-locked) — the same atomic path
 * `apply_spec_change` uses. A non-clean proposal leaves the doc untouched.
 */
export function applySectionChange(repoRoot: string, slug: string, doc: string, op: SectionOp): SectionOutcome {
  const proposed = proposeSectionChange(repoRoot, slug, doc, op);
  if (!proposed.ok || proposed.preview === undefined) return proposed;
  const abs = writeDocAtomic(repoRoot, slug, doc, proposed.preview);
  void abs;
  return { ...proposed, written: true, sha: docSha(proposed.preview), bytes: proposed.preview.length };
}

// ─── FR-60 P33-2 — EOL-tolerant replace + remediation diagnostics + CAS auto-rebase ───
//
// `apply_spec_change` addresses a change by an EXACT `old_string`; when that literal
// misses, the agent only learns "not found" and must hand-roll the forensics (was it
// CRLF? trailing whitespace? did the section move?). P33-2 raises that surface: an
// ANCHOR-TARGETED replacement (`replace_in_section`) that, on a miss, classifies WHY
// into one of five ACTIONABLE diagnostics — eol_only / whitespace_only / multi_match /
// changed_body / missing_anchor — each with a safe next-operation hint. Two more
// invariants the RED scenarios pin:
//   * normalize_eol:true accepts a CRLF/LF-ONLY mismatch while the persisted file keeps
//     its ORIGINAL EOL (the replacement is done in LF space and re-joined to the doc EOL);
//   * a stale whole-doc CAS sha (another session wrote the doc) AUTO-REBASES an anchor-
//     targeted change when it is NON-CONFLICTING (the target section still accepts the
//     replacement in the FRESH content) and REFUSES a real conflict with fresh anchor
//     context (fresh sha + section_sha + the live anchor list). Reuses docSha/casCheck
//     from mutations.ts — no second version-control layer.
//
// @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_522 / SPECGEN004_524
// @see .specs/spec-generator-v4/TASKS.md p33-replace-diagnostics-rebase (Phase 33, P33-2)

/** The five classes a failed anchor-targeted replacement is diagnosed as. */
export type ReplaceMissKind = 'eol_only' | 'whitespace_only' | 'multi_match' | 'changed_body' | 'missing_anchor';

/** An actionable diagnosis of WHY a literal replacement missed (not a generic error). */
export interface ReplaceDiagnostic {
  kind: ReplaceMissKind;
  message: string;
  /** A safe next-operation hint the caller can act on without re-deriving the cause. */
  hint: string;
  /** Present for `multi_match`: how many occurrences within the section. */
  occurrences?: number;
}

/** An anchor-targeted literal replacement within a section. */
export interface ReplaceOp {
  /** Heading TEXT or its Marksman anchor — the stable address of the target section. */
  heading: string;
  old_string: string;
  new_string: string;
  /** Replace every occurrence within the section (default: require a unique match). */
  replace_all?: boolean;
  /** Accept a CRLF/LF-ONLY mismatch; the persisted file keeps its original EOL. */
  normalize_eol?: boolean;
  /** Optional precondition: the `section_sha` the caller read. A mismatch ⇒ changed_body. */
  expected_section_sha?: string;
}

/** Pure result of applying a replace to in-memory content (no disk, no validation). */
export interface ReplaceResult {
  ok: boolean;
  /** The full would-be document content, EOL preserved. Absent on a diagnosed miss. */
  next?: string;
  eol: EolStyle;
  locator: SectionLocator;
  /** Fresh sha of the target section (for re-targeting context; null when not found). */
  section_sha: string | null;
  /** True when normalize_eol bridged an EOL-only mismatch. */
  normalized?: boolean;
  diagnostic?: ReplaceDiagnostic;
  error?: 'HEADING_REQUIRED' | 'REPLACE_FAILED';
}

const NOT_FOUND_LOCATOR: SectionLocator = {
  found: false, headingLevel: null, headingText: null, headingAnchor: null, startLine: null, endLine: null,
};

/** Count non-overlapping occurrences of `needle` in `haystack` (empty needle ⇒ 0). */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  return haystack.split(needle).length - 1;
}

/** Every heading anchor in a document — the fresh re-target context on a missing/conflicted anchor. */
export function listHeadingAnchors(content: string): string[] {
  const out: string[] = [];
  for (const line of splitLogical(content)) {
    const m = HEADING_RE.exec(line);
    if (m) out.push(marksmanSlug(m[2]));
  }
  return out;
}

/**
 * Apply an anchor-targeted replacement to `content`, PRESERVING its EOL style. Pure —
 * never touches disk. The replacement is performed in LF space (the section body and
 * `old_string`/`new_string` are EOL-normalized) and the result is re-joined with the
 * document's detected EOL, so a CRLF document yields a result with NO bare `\n`.
 *
 * On a miss it returns a DIAGNOSTIC classifying the cause instead of a generic error:
 *   missing_anchor → the heading no longer resolves;
 *   changed_body   → the anchor resolves but `old_string` is gone (or the pinned
 *                    `expected_section_sha` no longer matches) — the body moved;
 *   multi_match    → `old_string` is not unique within the section (and !replace_all);
 *   eol_only       → matches only after EOL normalization (needs normalize_eol to accept);
 *   whitespace_only→ matches only after whitespace normalization (spacing differs).
 */
export function replaceInSectionContent(content: string, op: ReplaceOp): ReplaceResult {
  const eol = detectEol(content);
  const nl = eol === 'crlf' ? '\r\n' : '\n';
  const lines = splitLogical(content);

  if (op.heading === '') {
    return {
      ok: false, eol, locator: NOT_FOUND_LOCATOR, section_sha: null, error: 'HEADING_REQUIRED',
      diagnostic: { kind: 'missing_anchor', message: 'no heading supplied to target the replacement', hint: 'Pass heading — the section heading text or its Marksman anchor.' },
    };
  }

  const loc = locateSection(lines, op.heading);
  if (!loc.found) {
    const anchors = listHeadingAnchors(content);
    return {
      ok: false, eol, locator: loc, section_sha: null, error: 'REPLACE_FAILED',
      diagnostic: {
        kind: 'missing_anchor',
        message: `no heading matched "${op.heading}" — the anchor is gone or misspelled`,
        hint: `Re-target with read_spec_doc(read_for_edit:true). Available anchors: ${anchors.length > 0 ? anchors.join(', ') : '(none)'}.`,
      },
    };
  }

  const freshSha = sectionSha(content, loc);

  // Precondition: the caller pinned the exact section body they read (the section_sha
  // from read_for_edit). If it moved, that is a "changed body under the same anchor" —
  // refuse even if old_string still happens to be present (the caller's view is stale).
  if (op.expected_section_sha !== undefined && op.expected_section_sha !== freshSha) {
    return {
      ok: false, eol, locator: loc, section_sha: freshSha, error: 'REPLACE_FAILED',
      diagnostic: {
        kind: 'changed_body',
        message: `the section under anchor "${op.heading}" changed since you read it (section_sha mismatch)`,
        hint: 'Re-read the section (read_spec_doc read_for_edit:true) for the fresh body + section_sha, then retry.',
      },
    };
  }

  // Body span (0-based): the lines AFTER the heading through the section's last body line.
  const bodyStartIdx = loc.startLine as number; // heading is startLine-1; body starts at startLine
  const bodyEndIdx = (loc.endLine as number) - 1;
  const bodyLines = lines.slice(bodyStartIdx, bodyEndIdx + 1);
  const rawBody = bodyLines.join(nl); // original EOL
  const normBody = bodyLines.join('\n'); // EOL-normalized (LF)
  const wantRaw = op.old_string;
  const wantNorm = op.old_string.replace(/\r\n/g, '\n');
  const exactCount = countOccurrences(rawBody, wantRaw);
  const normCount = countOccurrences(normBody, wantNorm);

  const applyNormalized = (replaceAll: boolean): string => {
    const newNorm = op.new_string.replace(/\r\n/g, '\n');
    const replaced = replaceAll ? normBody.split(wantNorm).join(newNorm) : normBody.replace(wantNorm, newNorm);
    const newBodyLines = replaced.split('\n');
    return [...lines.slice(0, bodyStartIdx), ...newBodyLines, ...lines.slice(bodyEndIdx + 1)].join(nl);
  };

  // multi_match: not unique within the section (and the caller did not ask for replace_all).
  if (normCount > 1 && op.replace_all !== true) {
    return {
      ok: false, eol, locator: loc, section_sha: freshSha, error: 'REPLACE_FAILED',
      diagnostic: {
        kind: 'multi_match', occurrences: normCount,
        message: `old_string is not unique — ${normCount} occurrences within the section`,
        hint: 'Pass replace_all:true to replace every occurrence, or a longer old_string that is unique within the section.',
      },
    };
  }

  if (normCount >= 1) {
    // Applies (EOL-tolerant). Distinguish a clean exact match from an EOL-only miss.
    const normalized = exactCount === 0; // matched only once EOL was normalized
    if (normalized && op.normalize_eol !== true) {
      return {
        ok: false, eol, locator: loc, section_sha: freshSha, error: 'REPLACE_FAILED',
        diagnostic: {
          kind: 'eol_only',
          message: `old_string matches only after EOL normalization (document is ${eol.toUpperCase()}, old_string uses ${eol === 'crlf' ? 'LF' : 'CRLF'})`,
          hint: `Pass normalize_eol:true to accept this CRLF/LF-only mismatch — the persisted file keeps its ${eol.toUpperCase()} EOL.`,
        },
      };
    }
    return { ok: true, next: applyNormalized(op.replace_all === true), eol, locator: loc, section_sha: freshSha, normalized };
  }

  // normCount === 0 — absent even after EOL normalization. Is it a whitespace-only miss?
  const wsBody = normBody.replace(/\s+/g, ' ').trim();
  const wsWant = wantNorm.replace(/\s+/g, ' ').trim();
  if (wsWant !== '' && countOccurrences(wsBody, wsWant) >= 1) {
    return {
      ok: false, eol, locator: loc, section_sha: freshSha, error: 'REPLACE_FAILED',
      diagnostic: {
        kind: 'whitespace_only',
        message: 'old_string matches only after whitespace normalization (spacing/indentation differs)',
        hint: 'Copy the exact current text from read_spec_doc(read_for_edit:true) — its whitespace differs from your old_string.',
      },
    };
  }

  // Anchor resolves but the expected text is gone — the body changed under the anchor.
  return {
    ok: false, eol, locator: loc, section_sha: freshSha, error: 'REPLACE_FAILED',
    diagnostic: {
      kind: 'changed_body',
      message: `the section under anchor "${op.heading}" no longer contains old_string — the body changed under the same anchor`,
      hint: 'Re-read the section (read_spec_doc read_for_edit:true) for the fresh body + section_sha, then retry.',
    },
  };
}

/** Outcome of an anchor-targeted replace run through validation-before-write + CAS. */
export interface ReplaceOutcome {
  ok: boolean;
  /** The full would-be / written content (EOL preserved). Absent on a diagnosed miss. */
  preview?: string;
  eol_style: EolStyle;
  /** True once the heading anchor resolved. */
  resolved: boolean;
  /** True when a stale CAS sha was auto-rebased over a concurrent (non-conflicting) edit. */
  rebased?: boolean;
  /** True when normalize_eol bridged an EOL-only mismatch. */
  normalized?: boolean;
  heading_anchor: string | null;
  start_line: number | null;
  end_line: number | null;
  /** Fresh sha of the target section (post-write on success; current on a miss). */
  section_sha: string | null;
  /** Fresh whole-doc sha — the new CAS token (post-write on success; the conflicting sha on CAS_CONFLICT). */
  sha?: string;
  diagnostic?: ReplaceDiagnostic;
  /** Live heading anchors for re-targeting (on missing_anchor / CAS_CONFLICT). */
  available_anchors?: string[];
  findings: MutationFinding[];
  written?: boolean;
  bytes?: number;
  error?: 'TARGET' | 'DOC_NOT_FOUND' | 'HEADING_REQUIRED' | 'REPLACE_FAILED' | 'CAS_CONFLICT' | 'VALIDATION_FAILED';
}

/**
 * Resolve + (EOL-tolerant) replace + VALIDATE + atomically WRITE an anchor-targeted
 * change — with FR-60 P33-2 CAS AUTO-REBASE. When `expectedSha` is supplied and no
 * longer matches the doc (another session wrote it since the caller read it):
 *   - NON-CONFLICTING (the target section still accepts the replacement in the FRESH
 *     content) → rebase: validate + write against the fresh doc, `rebased:true`;
 *   - CONFLICT (the anchor is gone or its body/precondition changed) → refuse with
 *     `CAS_CONFLICT` + fresh anchor context (fresh sha, section_sha, live anchors).
 * The produced content runs through the SAME `validateSpecChange` (form + anchors +
 * conformance) `apply_spec_change` runs; only a clean result is written, atomically.
 */
export function applyReplaceChange(
  repoRoot: string,
  slug: string,
  doc: string,
  op: ReplaceOp,
  expectedSha?: string,
): ReplaceOutcome {
  const read = readDoc(repoRoot, slug, doc);
  if (!read.ok) {
    return { ok: false, eol_style: 'lf', resolved: false, heading_anchor: null, start_line: null, end_line: null, section_sha: null, findings: [], error: read.error };
  }
  const current = read.current;
  const eol = detectEol(current);
  // `current` is the FRESH on-disk content — so `result` already reflects any concurrent
  // edit, which is exactly what the auto-rebase decision needs.
  const result = replaceInSectionContent(current, op);

  const failTransform = (error: ReplaceOutcome['error'], extra: Partial<ReplaceOutcome> = {}): ReplaceOutcome => ({
    ok: false,
    eol_style: eol,
    resolved: result.locator.found,
    heading_anchor: result.locator.headingAnchor,
    start_line: result.locator.startLine,
    end_line: result.locator.endLine,
    section_sha: result.section_sha,
    diagnostic: result.diagnostic,
    findings: [],
    error,
    available_anchors: result.diagnostic?.kind === 'missing_anchor' ? listHeadingAnchors(current) : undefined,
    ...extra,
  });

  const finalizeWrite = (extra: Partial<ReplaceOutcome> = {}): ReplaceOutcome => {
    const next = result.next as string;
    const validation = validateSpecChange(repoRoot, slug, doc, { content: next });
    if (!validation.ok) {
      return {
        ok: false, preview: next, eol_style: eol, resolved: true,
        heading_anchor: result.locator.headingAnchor, start_line: result.locator.startLine, end_line: result.locator.endLine,
        section_sha: result.section_sha, findings: validation.findings, error: 'VALIDATION_FAILED',
      };
    }
    writeDocAtomic(repoRoot, slug, doc, next);
    const newLoc = locateSection(splitLogical(next), op.heading);
    return {
      ok: true, preview: next, eol_style: eol, resolved: true,
      heading_anchor: newLoc.headingAnchor ?? result.locator.headingAnchor,
      start_line: newLoc.startLine, end_line: newLoc.endLine,
      section_sha: sectionSha(next, newLoc), findings: [], written: true, bytes: next.length, sha: docSha(next),
      ...extra,
    };
  };

  // P21-5 optimistic CAS, reused — with the P33-2 auto-rebase on top.
  if (expectedSha !== undefined) {
    const cas = casCheck(repoRoot, slug, doc, expectedSha);
    if (!cas.ok) {
      if (result.ok && result.next !== undefined) {
        // Non-conflicting: the target section is intact in the fresh doc → rebase + apply.
        return finalizeWrite({ rebased: true, normalized: result.normalized === true });
      }
      // Real conflict: refuse with fresh anchor context for the caller.
      return failTransform('CAS_CONFLICT', { sha: cas.actualSha ?? undefined, available_anchors: listHeadingAnchors(current) });
    }
  }

  if (!result.ok || result.next === undefined) {
    return failTransform(result.error === 'HEADING_REQUIRED' ? 'HEADING_REQUIRED' : 'REPLACE_FAILED');
  }
  return finalizeWrite({ normalized: result.normalized === true });
}
