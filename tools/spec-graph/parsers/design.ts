/**
 * DESIGN.md parser slice for the SpecGraph builder (FR-29).
 *
 * Scans a `DESIGN.md` for the canonical "Где лежит реализация" /
 * "Где код" / "App-код" sections and extracts every backticked file path
 * found inside those sections. Each extracted path is associated with the
 * FR ids cited in the same section context (FR ids appearing anywhere
 * between the section heading and the next heading or section end).
 *
 * Why two layers (section-scope + FR-scope):
 *   - Section-scope keeps us from harvesting paths from unrelated sections
 *     (e.g. "Risks" mentioning a file).
 *   - FR-scope produces the (FR, path) pairs the builder needs for
 *     `implements` edge emission per AC-29.2.
 *
 * Headings recognised (case-insensitive, regex match against the heading
 * text after stripping the `#` markers):
 *   • "Где лежит реализация"
 *   • "Где код"
 *   • "App-код"
 *
 * Sub-bullets like `- App-код:` are *also* recognised — when a parent
 * section doesn't match but contains a bullet whose label matches one of
 * the heading patterns (e.g. inside "Где лежит реализация"), the bullet's
 * payload becomes the search scope. This handles the common DESIGN.md
 * pattern where a single H2 section contains multiple labelled bullets.
 *
 * @see .specs/spec-generator-v4/FR.md FR-29
 * @see .specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md AC-29.2
 * @see ../builder.ts (consumer)
 */

import fs from 'node:fs';

/** A path extracted from DESIGN.md with the FR ids that share its scope. */
export interface DesignFileRef {
  file_path: string;
  frs: string[];
}

const SECTION_HEADING_RE =
  /^(?:где\s+лежит\s+реализаци[яи]|где\s+код|app[-\s]?код)\s*:?\s*$/i;

const BULLET_LABEL_RE = /^[-*+]\s+(?:\*\*)?([^:*]+?)(?:\*\*)?:\s*(.*)$/;

// Markdown inline code with backticks — capture group 1 is the literal path.
const BACKTICK_PATH_RE = /`([^`\n]+)`/g;

// Repo-relative path heuristic: must contain at least one `/` or `.`, and
// should look like a path (not a shell command, prose, etc.). Accept things
// like `src/foo.ts`, `tools/spec-graph/builder.ts`, `package.json`,
// `.dev-pomogator/x`. Reject things containing spaces or shell metacharacters.
function looksLikePath(s: string): boolean {
  if (!s || s.length > 256) return false;
  if (/\s/.test(s)) return false;
  if (/[<>|;&$()]/.test(s)) return false;
  // Require either a slash (relative path) OR a known file extension hint.
  if (!/[/.]/.test(s)) return false;
  // Reject pure URLs (FR-X anchors etc.).
  if (/^https?:/.test(s)) return false;
  if (s.startsWith('#')) return false;
  return true;
}

function isGlob(p: string): boolean {
  return /[*?\[]/.test(p);
}

const FR_CITATION_RE = /\bFR-\d+\b/g;

/**
 * Parse `DESIGN.md` source and return file refs scoped to recognised
 * code-location sections.
 *
 * @param mdSource     raw markdown text
 * @param relativePath repository-relative POSIX path (for diagnostics; currently unused)
 */
export function parseDesign(mdSource: string, _relativePath?: string): DesignFileRef[] {
  const lines = mdSource.split(/\r?\n/);

  // Pass 1 — locate the byte ranges of every relevant scope (full section
  // OR bullet payload). A scope is a half-open [startLine, endLine) range.
  const scopes: Array<{ start: number; end: number; bulletExtras?: string[] }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (headingMatch) {
      const headingText = headingMatch[2].replace(/[#*`]/g, '').trim();
      if (SECTION_HEADING_RE.test(headingText)) {
        // Section runs until the next heading of equal/higher level.
        const level = headingMatch[1].length;
        let end = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j].match(/^(#{1,6})\s+/);
          if (next && next[1].length <= level) {
            end = j;
            break;
          }
        }
        scopes.push({ start: i, end });
        continue;
      }
    }
    // Bullet-label scope — `- App-код: ...rest...` style. The bullet line
    // itself + any wrap-around content on the same logical bullet is the
    // scope. We capture only the line for simplicity (DESIGN.md authors
    // typically put the full content on a single line).
    const bulletMatch = line.match(BULLET_LABEL_RE);
    if (bulletMatch) {
      const label = bulletMatch[1].trim();
      if (SECTION_HEADING_RE.test(label + ':') || SECTION_HEADING_RE.test(label)) {
        scopes.push({ start: i, end: i + 1, bulletExtras: [bulletMatch[2]] });
      }
    }
  }

  if (scopes.length === 0) return [];

  // Pass 2 — for every scope, harvest backticked paths and FR-N citations
  // present in that scope.
  const refsByPath = new Map<string, Set<string>>();

  for (const scope of scopes) {
    const slice = lines.slice(scope.start, scope.end).join('\n');

    const frsInScope = new Set<string>();
    for (const m of slice.match(FR_CITATION_RE) ?? []) {
      frsInScope.add(m);
    }

    const harvest = (text: string): void => {
      BACKTICK_PATH_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = BACKTICK_PATH_RE.exec(text)) !== null) {
        const candidate = m[1].trim();
        if (!looksLikePath(candidate)) continue;
        if (isGlob(candidate)) continue;
        let set = refsByPath.get(candidate);
        if (!set) {
          set = new Set<string>();
          refsByPath.set(candidate, set);
        }
        for (const fr of frsInScope) set.add(fr);
      }
    };

    harvest(slice);
    if (scope.bulletExtras) {
      for (const extra of scope.bulletExtras) harvest(extra);
    }
  }

  const result: DesignFileRef[] = [];
  for (const [file_path, frSet] of refsByPath) {
    result.push({ file_path, frs: Array.from(frSet) });
  }
  return result;
}

/** Convenience: read a `DESIGN.md` file from disk and parse it. */
export function parseDesignFile(absPath: string, repoRoot?: string): DesignFileRef[] {
  let source: string;
  try {
    source = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return [];
  }
  return parseDesign(source, repoRoot);
}
