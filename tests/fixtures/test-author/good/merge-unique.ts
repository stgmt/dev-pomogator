/**
 * Eval fixture (GOOD impl) for the test-author / strong-tests mutation-resistance eval.
 *
 * `mergeUnique` merges two lists of keyed items, deduping by BUSINESS KEY.
 * This is the correct behaviour: overlapping keys collapse to one entry.
 *
 * The paired broken variant (../broken/merge-unique.ts) dedups by object
 * IDENTITY instead — the exact OutSight-AI / session-pilot duplicate-rows bug
 * class (see .claude/rules/testing/output-invariants-first.md). A STRONG test
 * passes here and FAILS on the broken variant; a fake-green test passes on both.
 */
export interface Item {
  key: string;
  val?: unknown;
}

export function mergeUnique(a: Item[], b: Item[]): Item[] {
  const byKey = new Map<string, Item>();
  for (const it of [...a, ...b]) byKey.set(it.key, it);
  return [...byKey.values()];
}
