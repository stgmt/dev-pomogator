/**
 * FR-36 / SPECGEN004_95 — raw PRE-MAP node dump: parse every slice and count
 * composite-id collisions BEFORE the builder's map dedup hides them. The
 * parsers self-qualify since P13-2 — no extra rewrite step here.
 * Run: node --import tsx tools/spec-graph/collision-probe.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdownFile } from './parsers/md.ts';
import { parseGherkinFile } from './parsers/gherkin.ts';
import { parseTasksFile } from './parsers/tasks.ts';

const root = process.cwd();

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
    collide(parseMarkdownFile(a, root));
    if (path.basename(a) === 'TASKS.md') {
      collide(parseTasksFile(a, root));
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
    collide(parseGherkinFile(a, root));
  } catch {
    /* fail-soft */
  }
}
console.log(`raw pre-map nodes: ${total} | unique: ${seen.size} | collisions: ${collisions}`);
process.exit(collisions === 0 ? 0 : 1);
