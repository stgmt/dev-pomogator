/**
 * Rework helper (P21-6 dogfood): make a loose TASKS.md trackable by the SpecGraph
 * task parser, which requires BOTH `Status:` AND an explicit `— id: <slug>` on a
 * task header (tools/spec-graph/parsers/tasks.ts `headerOf`). Many older specs
 * (session-pilot, …) use a `Tnn:` title prefix and a `— Status:` field but no
 * `— id:`, so their tasks are silently skipped. This inserts `— id: t<nn>` before
 * `— Status:` on each such header, derived from the `Tnn` prefix (deduped).
 *
 * It is DELIBERATELY status-preserving and child-safe: it only touches lines that
 * are task HEADERS (have `— Status:`), never Done-When child checkboxes (which
 * have no `Status:`). Honesty is NOT faked — the census independently re-checks
 * each task against its scenarios; a DONE task whose scenarios don't pass/run
 * still surfaces as 🔴/⏸. Idempotent: a header that already has `id:` is left as-is.
 *
 *   node --import tsx scripts/add-task-ids.ts <in.json {content}> <out.txt>
 *
 * @see tools/spec-graph/parsers/tasks.ts (the strict format this conforms to)
 */
import fs from 'node:fs';

// Multiline, RAW-content regex: `[^\r\n]*?` never crosses a line, so the
// replace touches ONLY matched header lines and leaves every other byte —
// including CRLF endings — untouched (no split/join EOL reflow).
const HEADER = /^([ \t]*-\s*\[[ xX~]\]\s+T(\d+):[^\r\n]*?)(\s+—\s*Status:\s*(?:TODO|IN_PROGRESS|DONE|BLOCKED)\b)/gm;

export interface AddIdResult {
  content: string;
  added: number;
  skipped: number; // already had id
}

/** Add `— id: t<nn>` to every `Tnn:`-prefixed task header missing an id.
 *  Byte-preserving except for the inserted ids (CRLF-safe, idempotent). */
export function addTaskIds(content: string): AddIdResult {
  const used = new Set<string>();
  let added = 0;
  let skipped = 0;
  const next = content.replace(HEADER, (m, head: string, nn: string, statusPart: string) => {
    if (/\bid:\s*\S/.test(head)) { skipped++; return m; } // already has id → idempotent
    let id = `t${nn.padStart(2, '0')}`;
    if (used.has(id)) { let n = 1; while (used.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
    used.add(id);
    added++;
    return `${head} — id: ${id}${statusPart}`;
  });
  return { content: next, added, skipped };
}

// CLI: read {content} JSON envelope (spec-door read output) → write transformed text.
const isCli = process.argv[1]?.endsWith('add-task-ids.ts');
if (isCli) {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) { process.stderr.write('usage: add-task-ids.ts <in.json> <out.txt>\n'); process.exit(2); }
  const env = JSON.parse(fs.readFileSync(inPath, 'utf-8')) as { content: string };
  const r = addTaskIds(env.content);
  fs.writeFileSync(outPath, r.content, 'utf-8');
  process.stdout.write(`added ${r.added} ids, skipped ${r.skipped} (already had id)\n`);
}
