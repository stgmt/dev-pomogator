/**
 * Candidate test — FAKE-GREEN (expected verdict: FAKE-POSITIVE-RISK).
 *
 * Looks like a test, passes on the good impl — but only asserts a tautology
 * (output is non-empty / length is a number). It NEVER exercises the dedup
 * invariant, so it ALSO passes on the broken impl. The eval must catch this and
 * refuse to call it a real test. This is the failure mode strong-tests exists
 * to kill (100% coverage / 4% mutation score).
 */
import type { Item } from '../good/merge-unique.ts';

type MergeFn = (a: Item[], b: Item[]) => Item[];

export const name = 'fake-green: only asserts the output is non-empty';

export function run(merge: MergeFn): boolean {
  const out = merge([{ key: 'a' }], [{ key: 'b' }]);
  // Tautological: any non-throwing impl satisfies this, broken or not.
  return Array.isArray(out) && out.length >= 0;
}
