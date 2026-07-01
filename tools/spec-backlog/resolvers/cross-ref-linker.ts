// cross-ref-linker resolver — given a backlog entry for cross-spec/missing-cross-ref,
// wraps the first plain-text mention of `spec_b` slug in the referencing markdown
// file with a relative markdown link to `.specs/<spec_b>/FR.md`.
//
// Mechanical — no LLM call. Uses word-boundary regex.
//
// Idempotent: if any link to `.specs/<spec_b>/...` already exists in the file,
// returns no-op with reason 'already-linked'.
//
// Bail patterns:
//   - missing-evidence       — file/spec_a/spec_b not in entry.evidence
//   - source-file-missing    — `referenced_in` path doesn't exist on disk
//   - target-spec-missing    — `.specs/<spec_b>/FR.md` doesn't exist
//   - slug-not-found         — spec_b slug not found in prose of file
//   - inside-code-fence      — only matches were inside ``` fences / `inline`
//   - already-linked         — file already contains markdown link to spec_b
//   - ambiguous-mention      — >1 candidate mention; can't pick deterministically

import fs from 'node:fs';
import path from 'node:path';
import type { Resolver, ResolverResult } from './types.ts';
import type { BacklogEntry } from '../types.ts';
import { normalizeEvidence } from './normalize-evidence.ts';

/** Escape a string for safe embedding in a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalize a path to forward slashes (cross-platform link-target safe). */
function relPosix(from: string, to: string): string {
  return path.relative(from, to).replace(/\\/g, '/');
}

/**
 * Compute byte ranges of fenced code blocks (``` ... ```) and inline
 * backtick spans (`...`) in `text`. Any character index that falls into
 * one of these ranges is considered "inside code" and must be skipped.
 */
function codeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  // Fenced blocks first (greedy, line-anchored)
  const fenceRe = /^```[\s\S]*?^```/gm;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  // Inline backticks — naive but adequate: single-backtick spans without
  // line breaks. Skip matches that fall inside a fenced block.
  const inlineRe = /`[^`\n]+`/g;
  while ((m = inlineRe.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (ranges.some(([a, b]) => start >= a && end <= b)) continue;
    ranges.push([start, end]);
  }
  return ranges;
}

/** True if `pos` falls inside any of the given ranges (half-open). */
function isInRanges(pos: number, ranges: Array<[number, number]>): boolean {
  for (const [a, b] of ranges) if (pos >= a && pos < b) return true;
  return false;
}

/**
 * Compute the maximal extent of an existing markdown link `[label](target)`
 * span that *contains* `pos`. Returns null if `pos` is not inside any link.
 */
function inMarkdownLink(text: string, pos: number): boolean {
  const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (pos >= start && pos < end) return true;
    if (start > pos) break; // regex matches left-to-right
  }
  return false;
}

export const crossRefLinker: Resolver = {
  name: 'cross-ref-linker',
  description:
    'Wraps the first plain-text mention of a referenced spec slug with a relative markdown link to .specs/<slug>/FR.md — fixes missing cross-refs deterministically.',

  async resolve(opts): Promise<ResolverResult> {
    return crossRefLinkerImpl(opts.repoRoot, normalizeEvidence(opts.entry));
  },
};

function crossRefLinkerImpl(repoRoot: string, entry: BacklogEntry): ResolverResult {
  const file = entry.evidence.file;
  const specA = entry.evidence.spec_a as string | undefined;
  const specB = entry.evidence.spec_b as string | undefined;

  if (!file || !specA || !specB) {
    return {
      confidence: 0,
      files_changed: [],
      notes: 'evidence.file, evidence.spec_a, or evidence.spec_b missing — cannot link cross-ref.',
      bailed_out: { reason: 'missing-evidence' },
    };
  }

  // `referenced_in` is `<path>:<line>` (relPosix from repoRoot). Strip line
  // suffix and normalise separators.
  const cleanFile = file.replace(/:\d+$/, '').replace(/\\/g, '/');
  const filePath = path.isAbsolute(cleanFile)
    ? cleanFile
    : path.join(repoRoot, cleanFile);

  if (!fs.existsSync(filePath)) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Source file ${cleanFile} not found on disk.`,
      bailed_out: { reason: 'source-file-missing' },
    };
  }

  const targetFr = path.join(repoRoot, '.specs', specB, 'FR.md');
  if (!fs.existsSync(targetFr)) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Target spec .specs/${specB}/FR.md does not exist — cannot create link to non-existent file.`,
      bailed_out: { reason: 'target-spec-missing' },
    };
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Idempotency: if any markdown link target references the spec_b spec
  // directory as a path segment, bail. Accepts BOTH forms:
  //   • absolute-from-repo: `[..](.specs/<specB>/FR.md)`
  //   • sibling-style:       `[..](../<specB>/FR.md)` or `[..](<specB>/FR.md)`
  // The detector's regex is narrower (requires `.specs/` literally), so
  // sibling-style links still surface as findings — but at resolver level
  // we treat any path-segment match as "already linked" to avoid re-wrap.
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  let alreadyLinked = false;
  for (let m; (m = linkPattern.exec(content)) !== null; ) {
    const target = m[1];
    // Match `<specB>/` as a path segment: either at start, or after `/` or `\`.
    const segRe = new RegExp(`(?:^|[\\/\\\\])${escapeRegex(specB)}[\\/\\\\]`);
    if (segRe.test(target)) {
      alreadyLinked = true;
      break;
    }
  }
  if (alreadyLinked) {
    return {
      confidence: 1,
      files_changed: [],
      notes: `File already contains markdown link to .specs/${specB}/ — no rewrite needed.`,
      bailed_out: { reason: 'already-linked' },
    };
  }

  // Find all candidate mentions of specB as a word-boundary plain-text token.
  const mentionRe = new RegExp(`\\b${escapeRegex(specB)}\\b`, 'g');
  const blocked = codeRanges(content);

  const candidates: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = mentionRe.exec(content)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (isInRanges(start, blocked)) continue; // inside code
    if (inMarkdownLink(content, start)) continue; // already inside [..](..)
    candidates.push({ start, end });
  }

  if (candidates.length === 0) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Slug "${specB}" not found as plain-text mention in ${cleanFile} (only inside code fences / backticks / existing links).`,
      bailed_out: { reason: 'inside-code-fence' },
    };
  }

  // Pick the FIRST candidate deterministically — this is "first plain-text
  // mention" semantics. Multiple candidates are NOT ambiguous for the first-
  // mention rule; downstream mentions stay plain (intentional — readers don't
  // want every occurrence linked, just the first).
  const pick = candidates[0];

  // Compute relative path from the source file's directory to the target FR.md.
  const sourceDir = path.dirname(filePath);
  const linkTarget = relPosix(sourceDir, targetFr);

  const before = content.slice(0, pick.start);
  const after = content.slice(pick.end);
  const replacement = `[${specB}](${linkTarget})`;
  const newContent = before + replacement + after;

  fs.writeFileSync(filePath, newContent, 'utf8');

  return {
    confidence: 0.9,
    files_changed: [relPosix(repoRoot, filePath)],
    notes:
      `Wrapped first plain-text mention of "${specB}" at offset ${pick.start} ` +
      `with markdown link to ${linkTarget} in ${relPosix(repoRoot, filePath)}. ` +
      `${candidates.length - 1} additional mention(s) left as plain text (intentional).`,
  };
}

// Export internals for unit tests.
export const __test__ = { codeRanges, inMarkdownLink, escapeRegex, relPosix };
