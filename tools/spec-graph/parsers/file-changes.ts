/**
 * FILE_CHANGES.md parser slice for the SpecGraph builder (FR-29).
 *
 * Walks a `FILE_CHANGES.md` document — one or more markdown tables with the
 * canonical columns `Path | Action | Reason` — and extracts every row into a
 * structured `FileChangeRow`. Each row exposes:
 *   • the literal `Path` cell, with surrounding backticks stripped;
 *   • the parsed `Action` verb (`create` / `edit` / `delete` / ...);
 *   • every `FR-N` citation found in `Reason` (regex `\bFR-\d+\b`).
 *
 * Glob patterns in `Path` (cells containing `*`, `?`, or `[`) are skipped — a
 * single `warn-once` `console.warn` per build (gated by `warnOnce` flag) is
 * emitted so a noisy spec corpus doesn't drown the log.
 *
 * The parser is intentionally tolerant: it ignores rows whose `Path` cell is
 * empty, whose `Action` cell doesn't match a known verb, or whose `Reason`
 * cites no FR. Sub-headings between tables (e.g. `## Phase 0 — ...`) are
 * ignored — the parser treats every table row uniformly regardless of which
 * phase it belongs to.
 *
 * @see .specs/spec-generator-v4/FR.md FR-29 (builder wires implements edges)
 * @see .specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md AC-29.1, AC-29.3
 * @see ../builder.ts (consumer)
 */

import fs from 'node:fs';

/** One parsed row from a FILE_CHANGES.md table. */
export interface FileChangeRow {
  /** Repo-relative POSIX path, backticks stripped, leading/trailing whitespace trimmed. */
  file_path: string;
  /** Action verb in lowercase (`create` / `edit` / `delete` / ...). */
  action: string;
  /** All FR ids cited in the Reason column, deduplicated, in source order. */
  frs: string[];
}

/** Parser options. */
export interface FileChangesParseOptions {
  /**
   * Mutable flag shared across all parser invocations within a single build —
   * the builder passes the same `{ warned: false }` object to every spec so
   * the first glob row in the entire corpus triggers exactly one warning.
   */
  warnOnceState?: { warned: boolean };
}

const ALLOWED_ACTIONS = new Set([
  'create',
  'edit',
  'delete',
  'rename',
  'move',
  'replace',
]);

const FR_CITATION_RE = /\bFR-\d+\b/g;

/** A `Path` cell is considered a glob when it contains `*`, `?`, or `[`. */
function isGlob(p: string): boolean {
  return /[*?\[]/.test(p);
}

/** Strip surrounding backticks and trim a markdown table cell. */
function cleanCell(cell: string): string {
  const trimmed = cell.trim();
  // Strip a single pair of surrounding backticks (markdown `code` cells).
  if (trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Parse a `FILE_CHANGES.md` document. Returns one row per recognised data
 * row across all tables in the file. Non-table content is ignored.
 *
 * @param mdSource raw markdown text
 * @param opts     parser options (warn-once state shared across the build)
 */
export function parseFileChanges(
  mdSource: string,
  opts: FileChangesParseOptions = {},
): FileChangeRow[] {
  const rows: FileChangeRow[] = [];
  const lines = mdSource.split(/\r?\n/);

  let inTable = false;
  // Column index of Path / Action / Reason in the current table (or -1).
  let pathIdx = -1;
  let actionIdx = -1;
  let reasonIdx = -1;

  const parseRow = (raw: string): string[] => {
    // Strip leading/trailing `|` then split. Markdown table syntax doesn't
    // support escaped `|`, so naive split is correct for our corpus.
    let trimmed = raw.trim();
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
    if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
    return trimmed.split('|');
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();

    // Blank line or non-pipe line ends the current table.
    if (!stripped.startsWith('|')) {
      inTable = false;
      pathIdx = actionIdx = reasonIdx = -1;
      continue;
    }

    // Pipe-row. Decide whether it's a header / separator / data row.
    const cells = parseRow(line);

    // Separator row: every cell matches `-+` (optionally with leading `:`).
    const isSeparator = cells.every((c) => /^\s*:?-+:?\s*$/.test(c));
    if (isSeparator) {
      // The previous row must have been a header; if header indices already
      // located the 3 canonical columns, we are now officially "in table".
      if (pathIdx >= 0 && actionIdx >= 0 && reasonIdx >= 0) {
        inTable = true;
      }
      continue;
    }

    // Header row candidate — look for `path` / `action` / `reason` (case-insensitive).
    if (!inTable) {
      const headers = cells.map((c) => c.trim().toLowerCase());
      const pi = headers.indexOf('path');
      const ai = headers.indexOf('action');
      const ri = headers.indexOf('reason');
      if (pi >= 0 && ai >= 0 && ri >= 0) {
        pathIdx = pi;
        actionIdx = ai;
        reasonIdx = ri;
        // Header recognised; the next separator row will flip inTable=true.
      } else {
        // Not a header we recognise; reset.
        pathIdx = actionIdx = reasonIdx = -1;
      }
      continue;
    }

    // Data row within a recognised table.
    if (cells.length <= Math.max(pathIdx, actionIdx, reasonIdx)) continue;

    const rawPath = cleanCell(cells[pathIdx]);
    const rawAction = cleanCell(cells[actionIdx]).toLowerCase();
    const rawReason = cells[reasonIdx]; // keep markdown intact for FR-N extraction

    if (!rawPath) continue;

    if (isGlob(rawPath)) {
      if (opts.warnOnceState && !opts.warnOnceState.warned) {
        console.warn(
          `[spec-graph] FILE_CHANGES.md contains glob path(s); implements edges skipped (first: ${rawPath})`,
        );
        opts.warnOnceState.warned = true;
      }
      continue;
    }

    if (!ALLOWED_ACTIONS.has(rawAction)) continue;

    // Extract FR citations. Dedup while preserving source order.
    const frMatches = rawReason.match(FR_CITATION_RE) ?? [];
    const seen = new Set<string>();
    const frs: string[] = [];
    for (const m of frMatches) {
      if (!seen.has(m)) {
        seen.add(m);
        frs.push(m);
      }
    }

    rows.push({ file_path: rawPath, action: rawAction, frs });
  }

  return rows;
}

/** Convenience: read a `FILE_CHANGES.md` file from disk and parse it. */
export function parseFileChangesFile(
  absPath: string,
  opts: FileChangesParseOptions = {},
): FileChangeRow[] {
  let source: string;
  try {
    source = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return [];
  }
  return parseFileChanges(source, opts);
}
