// FR-11 + FR-3: v3 → v4 heading converter.
//
// Pure: takes a markdown body, returns the converted body + a per-file
// diff structure for the CLI to render before writing. The actual file
// I/O + interactive prompts live in `./cli.ts` so this stays trivially
// unit-testable.
//
// Conversion rules:
//   • `### Requirement: FR-N <title>`    → `### FR-N: <title>`
//   • `## Requirement: FR-N <title>`     → `## FR-N: <title>`
//   • `#### Requirement: FR-N <title>`   → `#### FR-N: <title>`
// All other headings + body content stay byte-stable. Inline Jira trace
// lines (`_Jira: JIRA-123_`) are preserved unchanged.

export interface HeadingChange {
  line: number;       // 1-based source line
  before: string;     // original heading line, full text incl. `#` prefix
  after: string;      // converted heading line
  frId: string;       // e.g. "FR-001"
}

export interface ConversionResult {
  changed: boolean;
  newSource: string;
  changes: HeadingChange[];
}

const LEGACY_HEADING_RE =
  /^(#{1,6})\s+Requirement:\s*FR-(\d+)\s+(.+?)\s*$/;

export function convertSource(source: string): ConversionResult {
  const lines = source.split(/\r?\n/);
  const changes: HeadingChange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(LEGACY_HEADING_RE);
    if (!m) continue;
    const hashes = m[1];
    const num = m[2];
    const title = m[3];
    const after = `${hashes} FR-${num}: ${title}`;
    changes.push({
      line: i + 1,
      before: lines[i],
      after,
      frId: `FR-${num}`,
    });
    lines[i] = after;
  }
  return {
    changed: changes.length > 0,
    newSource: lines.join('\n'),
    changes,
  };
}

/** Render a unified-diff-like summary of the conversion for stdout. */
export function renderDiff(filePath: string, result: ConversionResult): string {
  if (!result.changed) return '';
  const lines: string[] = [];
  lines.push(`--- ${filePath} (v3)`);
  lines.push(`+++ ${filePath} (v4)`);
  for (const c of result.changes) {
    lines.push(`@@ line ${c.line} (${c.frId}) @@`);
    lines.push(`- ${c.before}`);
    lines.push(`+ ${c.after}`);
  }
  return lines.join('\n') + '\n';
}
