/**
 * TASKS.md → Task nodes for the SpecGraph (FR-2 follow-up, enabling FR-32).
 *
 * The Gherkin/MD parsers don't produce Task nodes; this parser reads each
 * `TASKS.md` task block (`- [ ] <title> — id: <id> — Status: <S>` + its
 * Done-When body) into a `TaskNode` carrying `id`, hand-set `status`, FR/NFR
 * `refs`, and the full block text as `doneWhen`. `doneWhen` is what lets
 * coverage.ts map a task to its scenarios identically for both get_coverage and
 * spec-status (single source — no divergent mappers).
 *
 * The auto-generated `## Task Summary Table` rows (lines starting with `|`) are
 * NOT task blocks and are ignored — only `- [ ]` / `- [x]` blocks are parsed.
 *
 * @see .specs/spec-generator-v4/FR.md FR-32
 * @see ../coverage.ts (consumes {id, doneWhen, refs})
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ParserOutput, TaskNode } from '../types.ts';
import { specOf, qualifySlice } from '../coverage.ts';

const STATUS_MAP: Record<string, TaskNode['status']> = {
  TODO: 'todo',
  READY: 'ready',
  IN_PROGRESS: 'in-progress',
  DONE: 'done',
  BLOCKED: 'blocked',
};

/** Recognise a task-block header line and pull its id + hand-set status. */
function headerOf(line: string): { id: string; status: string } | null {
  if (!/^\s*-\s*\[[ xX~]\]/.test(line)) return null;
  const id = line.match(/\bid:\s*([\w.\-]+)/);
  const status = line.match(/\bStatus:\s*(TODO|READY|IN_PROGRESS|DONE|BLOCKED)\b/);
  if (!id || !status) return null;
  return { id: id[1], status: status[1] };
}

/** Parse TASKS.md content into Task nodes. */
export function parseTasks(content: string, file: string): TaskNode[] {
  const lines = content.split(/\r?\n/);
  const out: TaskNode[] = [];
  let cur: { node: TaskNode; body: string[] } | null = null;
  let curPhase: string | undefined;

  const flush = (): void => {
    if (!cur) return;
    cur.node.doneWhen = cur.body.join('\n').trim() || undefined;
    out.push(cur.node);
    cur = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Track the enclosing `## Phase …` heading so each task carries its phase
    // (list_phase_tasks queries TaskNode.phase; without this it was always empty).
    const ph = line.match(/^#{2,3}\s+(Phase\s.*?)\s*$/);
    if (ph) {
      curPhase = ph[1];
      flush();
      continue;
    }
    const h = headerOf(line);
    if (h) {
      flush();
      const title = line.match(/\[[ xX~]\]\s+(.*?)\s+—\s*id:/);
      cur = {
        node: {
          id: h.id,
          type: 'Task',
          file,
          line: i + 1,
          status: STATUS_MAP[h.status] ?? 'todo',
          refs: [],
          title: title ? title[1] : undefined,
          phase: curPhase,
        },
        body: [line],
      };
      continue;
    }
    if (!cur) continue;
    // A heading / hr / marker ends the current task block.
    if (/^#{1,6}\s/.test(line) || /^---\s*$/.test(line) || /^\s*<!--/.test(line)) {
      flush();
      continue;
    }
    cur.body.push(line);
    // Inline code spans are EXAMPLES (`FR-001`), not requirement refs —
    // harvesting them produced ORPHAN_TASK noise off evidence prose (FR-36).
    const noCode = line.replace(/`[^`]*`/g, '');
    for (const m of noCode.matchAll(/\b(?:FR|NFR)-\d+\b/g)) {
      if (!cur.node.refs.includes(m[0])) cur.node.refs.push(m[0]);
    }
  }
  flush();
  return out;
}

/** Read a TASKS.md file and return its Task nodes as a parser slice. */
export function parseTasksFile(abs: string, repoRoot: string): ParserOutput {
  const content = fs.readFileSync(abs, 'utf8');
  const file = path.relative(repoRoot, abs).replace(/\\/g, '/');
  // FR-36a (P13-2): self-qualify — Task ids + refs become `<slug>:<localId>`.
  const slice = { nodes: parseTasks(content, file), edges: [] as ParserOutput['edges'] };
  qualifySlice(slice, specOf(file));
  return { nodes: slice.nodes, edges: [], anchors: [] };
}
