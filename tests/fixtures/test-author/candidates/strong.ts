/**
 * Candidate test — STRONG (expected verdict: STRONG).
 *
 * Asserts the CARDINALITY invariant on overlapping keys: merging two lists that
 * share a key (via DIFFERENT object instances) must yield exactly the union of
 * distinct keys, not a per-instance count. This is the assertion a fake-green
 * test omits — and it is exactly what distinguishes the good impl (dedups by
 * key → 3) from the broken impl (dedups by identity → 4).
 */
import type { Item } from '../good/merge-unique.ts';

type MergeFn = (a: Item[], b: Item[]) => Item[];

export const name = 'strong: cardinality invariant on key-overlapping inputs';

export function run(merge: MergeFn): boolean {
  // 'a' overlaps by key across the two lists, but they are DIFFERENT objects —
  // the realistic shape (two sources). Key-dedup → {a,b,c}; identity-dedup → 4.
  const left: Item[] = [{ key: 'a', val: 1 }, { key: 'b', val: 2 }];
  const right: Item[] = [{ key: 'a', val: 3 }, { key: 'c', val: 4 }];
  const out = merge(left, right);

  if (out.length !== 3) return false; // conservation/cardinality
  const keys = out.map((i) => i.key).sort().join(',');
  if (keys !== 'a,b,c') return false; // uniqueness by key
  return true;
}
