// wrap-deprecated-ref resolver — given a backlog entry for a production
// path/ref that has been REMOVED in a newer version with NO canonical
// replacement, wraps the first bare mention of the target_path in the
// referencing markdown file with strikethrough + a "removed in vN — no
// canonical replacement" annotation.
//
// Examples of transformations applied to the FIRST plain-text mention:
//   `path/to/old.ts`        → ~~`path/to/old.ts`~~ (removed in v2 — no canonical replacement)
//   path/to/old.ts          → ~~`path/to/old.ts`~~ (removed in v2 — no canonical replacement)
//
// Mechanical — no LLM call. Uses literal substring match on target_path.
//
// IDEMPOTENT: if the file already contains `~~\`<target_path>\`~~` anywhere,
// returns no-op with reason 'target-already-wrapped'.
//
// NOTE on AUTO-routing: the heuristic deciding wrap-deprecated-ref vs
// delete-ref (i.e. "is there a canonical replacement?") is complex —
// classifier routing for this resolver is intentionally minimal. Use
// `spec-backlog resolve --category deprecated-ref` for manual invocation,
// or extend the classifier when a heuristic is available.
//
// Bail patterns:
//   - missing-evidence       — entry.evidence is missing referenced_in / target_path / version
//   - source-file-missing    — `referenced_in` path doesn't exist on disk
//   - target-already-wrapped — file already contains `~~\`<target_path>\`~~` (idempotent)
//   - ambiguous-mention      — >1 bare mention found and we cannot pick deterministically
//                              (resolver picks first; this bail reserved for future tightening)
//   - inside-code-fence      — only matches were inside ``` fences (we do allow plain-text
//                              mentions to live inside a single backtick — those ARE wrappable)
//   - no-bare-mention        — target_path not found at all (or only inside fenced blocks)

import fs from 'node:fs';
import path from 'node:path';
import type { Resolver, ResolverResult } from './types.ts';
import type { BacklogEntry } from '../types.ts';

/** Escape a string for safe embedding in a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalize a path to forward slashes (cross-platform safe). */
function relPosix(from: string, to: string): string {
  return path.relative(from, to).replace(/\\/g, '/');
}

/**
 * Byte ranges of fenced code blocks (``` ... ```) only — single-backtick
 * inline spans are NOT excluded here, because we WANT to wrap a backtick-
 * quoted mention like `path/to/old.ts` into ~~`path/to/old.ts`~~. The
 * distinction vs cross-ref-linker: cross-ref-linker targets bare slug
 * tokens (no surrounding code formatting), so it excludes inline backticks
 * to avoid corrupting unrelated identifiers. wrap-deprecated-ref MUST
 * accept the backtick form because it's the dominant form for path refs
 * in markdown prose.
 */
function fencedCodeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fenceRe = /^```[\s\S]*?^```/gm;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

/** True if `pos` falls inside any of the given ranges (half-open). */
function isInRanges(pos: number, ranges: Array<[number, number]>): boolean {
  for (const [a, b] of ranges) if (pos >= a && pos < b) return true;
  return false;
}

/**
 * Find all bare mentions of `target_path` in `text`. A "bare mention" is
 * the literal target_path substring NOT preceded by `~~` and NOT followed
 * by `~~` (i.e. not inside a strikethrough wrapper). We also classify
 * whether the mention is backtick-wrapped (so the rewrite knows whether
 * to add backticks).
 */
function findBareMentions(
  text: string,
  targetPath: string,
): Array<{ start: number; end: number; backtickWrapped: boolean }> {
  const out: Array<{ start: number; end: number; backtickWrapped: boolean }> = [];
  const re = new RegExp(escapeRegex(targetPath), 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;

    // Already inside a strikethrough wrapper? Detect via local context.
    // Check the 3 chars immediately before for `~~\`` or `~~` and the 3 chars
    // immediately after for `\`~~` or `~~`. The wrapper we produce is
    // `~~\`<path>\`~~` so we look for backtick neighbours first.
    const leftSlice = text.slice(Math.max(0, start - 3), start);
    const rightSlice = text.slice(end, Math.min(text.length, end + 3));
    const leftIsStrike =
      leftSlice.endsWith('~~`') || leftSlice.endsWith('~~');
    const rightIsStrike =
      rightSlice.startsWith('`~~') || rightSlice.startsWith('~~');
    if (leftIsStrike && rightIsStrike) {
      continue; // already wrapped
    }

    const backtickWrapped =
      text[start - 1] === '`' && text[end] === '`';

    out.push({ start, end, backtickWrapped });
  }
  return out;
}

export const wrapDeprecatedRef: Resolver = {
  name: 'wrap-deprecated-ref',
  description:
    'Wraps the first plain-text mention of a removed-in-vN production path with ~~strikethrough~~ + "removed in vN — no canonical replacement" annotation — preserves historical context without misleading current readers.',

  async resolve(opts): Promise<ResolverResult> {
    return wrapDeprecatedRefImpl(opts.repoRoot, opts.entry);
  },
};

function wrapDeprecatedRefImpl(repoRoot: string, entry: BacklogEntry): ResolverResult {
  const referencedIn = (entry.evidence.referenced_in ?? entry.evidence.file) as
    | string
    | undefined;
  const targetPath = (entry.evidence.target_path ?? entry.evidence.target) as
    | string
    | undefined;
  const version = entry.evidence.version as string | undefined;

  if (!referencedIn || !targetPath || !version) {
    return {
      confidence: 0,
      files_changed: [],
      notes:
        'evidence.referenced_in, evidence.target_path, or evidence.version missing — cannot wrap deprecated ref.',
      bailed_out: { reason: 'missing-evidence' },
    };
  }

  // `referenced_in` may be `<path>:<line>` (relPosix from repoRoot). Strip
  // line suffix and normalise separators.
  const cleanFile = referencedIn.replace(/:\d+$/, '').replace(/\\/g, '/');
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

  const content = fs.readFileSync(filePath, 'utf8');

  // IDEMPOTENCY: if the file already contains a strikethrough-wrapped
  // mention of this target_path, bail. This matches both the backtick form
  // `~~\`<path>\`~~` AND the bare form `~~<path>~~`.
  const wrappedBacktickRe = new RegExp(
    `~~\\\`${escapeRegex(targetPath)}\\\`~~`,
  );
  const wrappedBareRe = new RegExp(`~~${escapeRegex(targetPath)}~~`);
  if (wrappedBacktickRe.test(content) || wrappedBareRe.test(content)) {
    return {
      confidence: 1,
      files_changed: [],
      notes: `File already contains strikethrough-wrapped mention of "${targetPath}" — no rewrite needed.`,
      bailed_out: { reason: 'target-already-wrapped' },
    };
  }

  const blockedRanges = fencedCodeRanges(content);
  const mentions = findBareMentions(content, targetPath);

  // Filter out mentions that fall inside fenced code blocks.
  const candidates = mentions.filter((m) => !isInRanges(m.start, blockedRanges));

  if (candidates.length === 0) {
    // Distinguish "not present at all" vs "only inside code fence" for
    // operator clarity.
    if (mentions.length > 0) {
      return {
        confidence: 0,
        files_changed: [],
        notes: `Mentions of "${targetPath}" found only inside fenced code blocks — not wrapping (code blocks render literally).`,
        bailed_out: { reason: 'inside-code-fence' },
      };
    }
    return {
      confidence: 0,
      files_changed: [],
      notes: `Target path "${targetPath}" not found as bare mention in ${cleanFile}.`,
      bailed_out: { reason: 'no-bare-mention' },
    };
  }

  // First-mention semantics. Multiple subsequent mentions stay untouched
  // (reader gets the deprecation note once; repeated strikethrough hurts
  // readability and the historical context anchors to the first instance).
  const pick = candidates[0];

  const annotation = ` (removed in ${version} — no canonical replacement)`;

  let replacement: string;
  let replaceStart: number;
  let replaceEnd: number;

  if (pick.backtickWrapped) {
    // Expand selection to include surrounding backticks, then wrap whole
    // `<path>` token with ~~...~~ + annotation.
    replaceStart = pick.start - 1; // include leading `
    replaceEnd = pick.end + 1; // include trailing `
    replacement = `~~\`${targetPath}\`~~${annotation}`;
  } else {
    // Bare prose — add backticks for monospace + strikethrough.
    replaceStart = pick.start;
    replaceEnd = pick.end;
    replacement = `~~\`${targetPath}\`~~${annotation}`;
  }

  const before = content.slice(0, replaceStart);
  const after = content.slice(replaceEnd);
  const newContent = before + replacement + after;

  fs.writeFileSync(filePath, newContent, 'utf8');

  const skipped = candidates.length - 1;
  return {
    confidence: 0.9,
    files_changed: [relPosix(repoRoot, filePath)],
    notes:
      `Wrapped first bare mention of "${targetPath}" at offset ${pick.start} with ` +
      `~~\`${targetPath}\`~~${annotation} in ${relPosix(repoRoot, filePath)}. ` +
      `${skipped} additional mention(s) left untouched (first-mention semantics).`,
  };
}

// Export internals for unit tests.
export const __test__ = { fencedCodeRanges, findBareMentions, escapeRegex, relPosix };
