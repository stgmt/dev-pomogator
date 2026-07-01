/**
 * Eval fixture (BROKEN impl) — paired with ../good/merge-unique.ts.
 *
 * BUG (intentional): dedups by object IDENTITY (`Set<Item>`) instead of by the
 * business `key`. Two items with the same key but different object instances
 * (the realistic case when the two lists come from different sources) are BOTH
 * kept → duplicate rows. This is the OutSight-AI reconciliation bug and the
 * session-pilot N×M duplicate-worktree bug, distilled.
 *
 * A mutation-resistant test MUST go RED against this variant.
 */
export interface Item {
  key: string;
  val?: unknown;
}

export function mergeUnique(a: Item[], b: Item[]): Item[] {
  const seen = new Set<Item>(); // BUG: identity, not key
  const out: Item[] = [];
  for (const it of [...a, ...b]) {
    if (!seen.has(it)) {
      seen.add(it);
      out.push(it);
    }
  }
  return out;
}
