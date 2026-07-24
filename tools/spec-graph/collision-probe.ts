/**
 * FR-36 / SPECGEN004_95 — raw PRE-MAP node dump: parse every slice and count
 * composite-id collisions BEFORE the builder's map dedup hides them. The
 * parsers self-qualify since P13-2 — no extra rewrite step here.
 *
 * Run: node --import tsx tools/spec-graph/collision-probe.ts   (exit 0 ⇔ 0 collisions)
 * Import: `rawCollisionScan(root)` — reused by corpus-health (P14-5).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdownFile } from './parsers/md.ts';
import { parseGherkinFile } from './parsers/gherkin.ts';
import { parseTasksFile } from './parsers/tasks.ts';
import { classifyIdentityCollision, identityCollisionKey, localIdOf } from './identity.ts';
import type { IdentityCollision } from './types.ts';

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

export interface CollisionScan {
  totalRawNodes: number;
  uniqueIds: number;
  collisions: Array<{ id: string; firstFile: string; secondFile: string }>;
  normalizationCollisions: IdentityCollision[];
}

/** Parse every slice under `<root>/.specs` (+ `<root>/tests/features`) raw — pre-map. */
export function rawCollisionScan(root: string): CollisionScan {
  const seen = new Map<string, string>();
  const normalizedSeen = new Map<string, { id: string; file: string }>();
  let total = 0;
  const collisions: CollisionScan['collisions'] = [];
  const normalizationCollisions: IdentityCollision[] = [];
  const collide = (slice: { nodes: Array<{ id: string; spec?: string; file: string }> }): void => {
    for (const n of slice.nodes) {
      total++;
      const first = seen.get(n.id);
      if (first !== undefined) {
        collisions.push({ id: n.id, firstFile: first, secondFile: n.file });
      } else {
        seen.set(n.id, n.file);
      }
      const normalizedKey = identityCollisionKey({ namespace: n.spec, localId: localIdOf(n.id) });
      const normalizedFirst = normalizedSeen.get(normalizedKey);
      const kind = normalizedFirst ? classifyIdentityCollision(normalizedFirst.id, n.id) : null;
      if (normalizedFirst && kind && kind !== 'EXACT') {
        normalizationCollisions.push({
          kind,
          normalizedKey,
          firstId: normalizedFirst.id,
          secondId: n.id,
          firstFile: normalizedFirst.file,
          secondFile: n.file,
        });
      } else if (!normalizedFirst) {
        normalizedSeen.set(normalizedKey, { id: n.id, file: n.file });
      }
    }
  };
  for (const a of walk(path.join(root, '.specs'), ['.md'])) {
    try {
      collide(parseMarkdownFile(a, root));
      if (path.basename(a) === 'TASKS.md') collide(parseTasksFile(a, root));
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
  return { totalRawNodes: total, uniqueIds: seen.size, collisions, normalizationCollisions };
}

const isDirectRun =
  process.argv[1]?.endsWith('collision-probe.ts') || process.argv[1]?.endsWith('collision-probe.js');
if (isDirectRun) {
  const scan = rawCollisionScan(process.cwd());
  for (const c of scan.collisions.slice(0, 10)) {
    console.log('COLLISION:', c.id, c.firstFile, '<->', c.secondFile);
  }
  for (const c of scan.normalizationCollisions.slice(0, 10)) {
    console.log('NORM-COLLISION:', c.kind, c.firstId, c.firstFile, '<->', c.secondId, c.secondFile);
  }
  console.log(
    `raw pre-map nodes: ${scan.totalRawNodes} | unique: ${scan.uniqueIds} | collisions: ${scan.collisions.length} | normalization collisions: ${scan.normalizationCollisions.length}`,
  );
  process.exit(scan.collisions.length === 0 && scan.normalizationCollisions.length === 0 ? 0 : 1);
}
