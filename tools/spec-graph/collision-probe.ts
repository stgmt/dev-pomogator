/**
 * FR-36 / SPECGEN004_95 — raw PRE-MAP node dump: parse every slice, qualify,
 * and count composite-id collisions BEFORE the builder's map dedup hides them.
 * Run: node --import tsx tools/spec-graph/collision-probe.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { qualifySlice } from './builder.ts';
import { parseMarkdownFile } from './parsers/md.ts';
import { parseGherkinFile } from './parsers/gherkin.ts';
import { parseTasksFile } from './parsers/tasks.ts';
import { specOf } from './coverage.ts';

const root = process.cwd();
const rel = (a: string): string => path.relative(root, a).split(path.sep).join('/');

function walk(dir: string, sufs: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const c = stack.pop()!;
    let es: fs.Dirent[];
    try {
      es = fs.readdirSync(c, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of es) {
      const a = path.join(c, e.name);
      if (e.isDirectory()) {
        if (!['node_modules', '.git', 'dist'].includes(e.name)) stack.push(a);
      } else if (sufs.some((s) => e.name.endsWith(s))) out.push(a);
    }
  }
  return out;
}

const seen = new Map<string, string>();
let total = 0;
let collisions = 0;
const collide = (slice: { nodes: Array<{ id: string; file: string }> }): void => {
  for (const n of slice.nodes) {
    total++;
    if (seen.has(n.id)) {
      collisions++;
      if (collisions <= 10) console.log('COLLISION:', n.id, seen.get(n.id), '<->', n.file);
    } else seen.set(n.id, n.file);
  }
};

for (const a of walk(path.join(root, '.specs'), ['.md'])) {
  try {
    const s = parseMarkdownFile(a, root);
    qualifySlice(s, specOf(rel(a)));
    collide(s);
    if (path.basename(a) === 'TASKS.md') {
      const t = parseTasksFile(a, root);
      qualifySlice({ nodes: t.nodes, edges: [] }, specOf(rel(a)));
      collide(t);
    }
  } catch {
    /* per-file fail-soft, same as builder */
  }
}
for (const a of [
  ...walk(path.join(root, '.specs'), ['.feature']),
  ...walk(path.join(root, 'tests/features'), ['.feature']),
]) {
  try {
    const s = parseGherkinFile(a, root);
    qualifySlice(s, specOf(rel(a)));
    collide(s);
  } catch {
    /* fail-soft */
  }
}
console.log(`raw pre-map nodes: ${total} | unique: ${seen.size} | collisions: ${collisions}`);
process.exit(collisions === 0 ? 0 : 1);
