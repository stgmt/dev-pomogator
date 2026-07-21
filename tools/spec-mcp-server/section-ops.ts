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
