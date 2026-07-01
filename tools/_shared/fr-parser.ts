// Shared FR-N heading parser for FR.md files.
//
// Extracts `## FR-N` / `### FR-N` headings (with optional `Requirement:` prefix
// and optional `: title` suffix) from FR.md body text. Used by spec-backlog
// resolvers (fr-author, scenario-writer) and any other tool that needs to
// enumerate FR identifiers from a spec's FR.md.
//
// Shape:
//   - id: e.g. "FR-3"
//   - title: trimmed title text after colon, or "" if absent
//   - line: 1-based line number where the heading starts
//
// The exported `FR_HEADING_RE` is the canonical regex — callers should NOT
// re-define it locally (drift risk). Use `parseFrHeadings(body)` for the
// structured output, or `FR_HEADING_RE` directly if you only need raw matches.

export interface FrHeading {
  id: string; // e.g. "FR-3"
  title: string; // trimmed title text after colon, or "" if absent
  line: number; // 1-based line number where the heading starts
}

export const FR_HEADING_RE =
  /^#{2,3}\s+(?:Requirement:\s+)?(FR-\d+)(?::?\s+([^\n]+))?/gm;

export function parseFrHeadings(body: string): FrHeading[] {
  const out: FrHeading[] = [];
  // Re-instantiate to avoid lastIndex state bleed across calls — the module-level
  // FR_HEADING_RE is exported as the canonical pattern, but every parse uses a
  // fresh RegExp so concurrent / repeated calls don't interfere with each other.
  const re = new RegExp(FR_HEADING_RE.source, FR_HEADING_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const upto = body.slice(0, m.index);
    const line = upto.split('\n').length;
    out.push({ id: m[1], title: (m[2] ?? '').trim(), line });
  }
  return out;
}
