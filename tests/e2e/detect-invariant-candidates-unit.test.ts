// @feature7
// Module-import unit tests for detect-invariant-candidates.ts — required by Stryker
// (vitest --related needs import chain; spawnSync-only tests are integration-first per
// integration-tests-first rule, but Stryker mutation tool cannot trace mutations through
// subprocess boundaries. These unit tests give Stryker a callable module surface.)
import { describe, it, expect } from 'vitest';
import {
  detectStack,
  scan,
  suggestInvariants,
  nestedLoopCount,
} from '../../.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts';
import type { Stack } from '../../.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts';

describe('TESTQUAL001_UNIT: detect-invariant-candidates module API', () => {
  describe('detectStack', () => {
    it('returns "ts" for .ts files (FAILS if extension matcher misses TypeScript)', () => {
      expect(detectStack('/foo/bar.ts')).toBe('ts');
    });
    it('returns "ts" for .tsx files (FAILS if tsx not recognized)', () => {
      expect(detectStack('/foo/bar.tsx')).toBe('ts');
    });
    it('returns "python" for .py files (FAILS if Python branch removed)', () => {
      expect(detectStack('/foo/bar.py')).toBe('python');
    });
    it('returns "csharp" for .cs files (FAILS if .cs branch removed — primary C# regression guard)', () => {
      expect(detectStack('/foo/Indexer.cs')).toBe('csharp');
    });
    it('returns "go" for .go files (FAILS if .go branch removed — primary Go regression guard)', () => {
      expect(detectStack('/foo/indexer.go')).toBe('go');
    });
    it('returns null for unknown extensions (FAILS if stack fallback returns wrong value)', () => {
      expect(detectStack('/foo/bar.rs')).toBe(null);
      expect(detectStack('/foo/bar.java')).toBe(null);
      expect(detectStack('/foo/bar.txt')).toBe(null);
    });
    it('is case-insensitive on extensions (FAILS if toLowerCase removed)', () => {
      expect(detectStack('/foo/BAR.CS')).toBe('csharp');
      expect(detectStack('/foo/BAR.TS')).toBe('ts');
    });
    it('returns null for empty filename (FAILS if guard removed)', () => {
      expect(detectStack('')).toBe(null);
    });
  });

  describe('nestedLoopCount', () => {
    it('counts `for (...)` for TS stack (FAILS if regex broken)', () => {
      const body = 'for (let i=0;i<n;i++) {\n  for (let j=0;j<m;j++) {} }';
      expect(nestedLoopCount(body, 'ts')).toBe(2);
    });
    it('counts ONLY `for X in Y:` for Python (FAILS if Python regex matches C-style for)', () => {
      const body = '    for x in items:\n        for y in cols:\n            pass';
      expect(nestedLoopCount(body, 'python')).toBe(2);
    });
    it('Python regex does NOT match `for (` C-style (FAILS if Python regex too loose)', () => {
      expect(nestedLoopCount('for (int i=0; i<n; i++) {}', 'python')).toBe(0);
    });
    it('counts both `for (` AND `foreach (` for C# (FAILS if csharp branch missing foreach)', () => {
      const body = 'for (int i=0;i<n;i++) {\n  foreach (var x in items) {} }';
      expect(nestedLoopCount(body, 'csharp')).toBe(2);
    });
    it('csharp counts foreach-only (FAILS if foreach token missing)', () => {
      expect(nestedLoopCount('foreach (var x in a) { foreach (var y in b) {} }', 'csharp')).toBe(2);
    });
    it('go counts for-range (FAILS if Go for-range regex broken)', () => {
      const body = '\tfor _, r := range repos {\n\t\tfor _, w := range wts {\n\t\t}\n\t}';
      expect(nestedLoopCount(body, 'go')).toBe(2);
    });
    it('go counts C-style for with semicolons (FAILS if Go semicolon regex broken)', () => {
      const body = '\tfor i := 0; i < n; i++ {\n\t\tfor j := 0; j < m; j++ {\n\t\t}\n\t}';
      expect(nestedLoopCount(body, 'go')).toBe(2);
    });
    it('go counts infinite for (FAILS if bare-for not matched)', () => {
      const body = '\tfor {\n\t\tfor x := range ch {\n\t\t}\n\t}';
      expect(nestedLoopCount(body, 'go')).toBe(2);
    });
    it('returns 0 for empty body (FAILS if regex matches empty)', () => {
      for (const s of ['ts', 'python', 'csharp'] as Stack[]) {
        expect(nestedLoopCount('', s), `stack=${s}`).toBe(0);
      }
    });
    it('does not count `for` substring inside identifier (FAILS if regex unanchored)', () => {
      expect(nestedLoopCount('const informer = 42;', 'ts')).toBe(0);
    });
  });

  describe('suggestInvariants', () => {
    it('always includes cardinality + uniqueness (FAILS if base set changed)', () => {
      const out = suggestInvariants('collection-returning', 'List<int>');
      expect(out).toContain('cardinality');
      expect(out).toContain('uniqueness');
    });
    it('adds conservation for nxm-overlap (FAILS if mapping changed)', () => {
      expect(suggestInvariants('nxm-overlap', 'T[]')).toEqual([
        'cardinality',
        'uniqueness',
        'conservation',
      ]);
    });
    it('adds conservation+monotonicity for composition-chain (FAILS if mapping changed)', () => {
      expect(suggestInvariants('composition-chain', 'List<X>')).toEqual([
        'cardinality',
        'uniqueness',
        'conservation',
        'monotonicity',
      ]);
    });
    it('adds coverage+no-leak for Dictionary/Map return types (FAILS if dict branch removed)', () => {
      expect(suggestInvariants('collection-returning', 'Dictionary<K,V>')).toEqual([
        'cardinality',
        'uniqueness',
        'coverage',
        'no-leak',
      ]);
      expect(suggestInvariants('collection-returning', 'Map<K,V>')).toEqual([
        'cardinality',
        'uniqueness',
        'coverage',
        'no-leak',
      ]);
    });
    it('adds idempotence+monotonicity for Iterator/Iterable types (FAILS if iter branch removed)', () => {
      expect(suggestInvariants('collection-returning', 'Iterator<T>')).toEqual([
        'cardinality',
        'uniqueness',
        'idempotence',
        'monotonicity',
      ]);
    });
    it('falls back to cardinality+uniqueness+conservation for generic list types (FAILS if default branch wrong)', () => {
      expect(suggestInvariants('collection-returning', 'List<X>')).toEqual([
        'cardinality',
        'uniqueness',
        'conservation',
      ]);
    });
  });

  describe('scan', () => {
    it('returns empty candidates/suppressed for empty content (FAILS if scan crashes on empty)', () => {
      const r = scan('', 'ts');
      expect(r.candidates).toEqual([]);
      expect(r.suppressed).toEqual([]);
    });
    it('detects TS function returning Array<T> (FAILS if TS collection regex broken)', () => {
      const src = `export function getItems(): Array<string> {\n  return [];\n}`;
      const r = scan(src, 'ts');
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0].function).toBe('getItems');
      expect(r.candidates[0].returnType).toBe('Array<string>');
      expect(r.candidates[0].kind).toBe('collection-returning');
    });
    it('flags TS nested-for as nxm-overlap (FAILS if loop counting/threshold broken)', () => {
      const src = `function build(): string[] {
  const out: string[] = [];
  for (let i=0;i<n;i++) {
    for (let j=0;j<m;j++) {
      out.push("x");
    }
  }
  return out;
}`;
      const r = scan(src, 'ts');
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0].kind).toBe('nxm-overlap');
    });
    it('detects C# method returning List<T> with nested for+foreach (FAILS if csharp dispatch broken)', () => {
      const src = `public List<int> Build()
{
    var out = new List<int>();
    for (int i = 0; i < n; i++)
        foreach (var x in items)
            out.Add(x);
    return out;
}`;
      const r = scan(src, 'csharp');
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0].function).toBe('Build');
      expect(r.candidates[0].returnType).toBe('List<int>');
      expect(r.candidates[0].kind).toBe('nxm-overlap');
    });
    it('parses Python suppression with reason ≥8 chars (FAILS if suppression parse broken)', () => {
      const src = `# strong-tests:skip pure-leaf reducer for testing
def tally(items: list[int]) -> int:
    return len(items)`;
      const r = scan(src, 'python');
      expect(r.suppressed.length).toBe(1);
      expect(r.suppressed[0].reasonWarning).toBe(null);
      expect(r.suppressed[0].reason).toContain('pure-leaf');
    });
    it('flags reason <8 chars as REASON_TOO_SHORT (FAILS if boundary check removed)', () => {
      const src = `# strong-tests:skip ok
def f(items: list[int]) -> int:
    return len(items)`;
      const r = scan(src, 'python');
      expect(r.suppressed.length).toBe(1);
      expect(r.suppressed[0].reasonWarning).toBe('REASON_TOO_SHORT');
    });
    it('reason boundary: exactly 8 chars → no warning (FAILS if off-by-one)', () => {
      const src = `# strong-tests:skip ab cd ef
def f(items: list[int]) -> int:
    return 0`;
      const r = scan(src, 'python');
      expect(r.suppressed[0].reason).toBe('ab cd ef');
      expect(r.suppressed[0].reasonLength).toBe(8);
      expect(r.suppressed[0].reasonWarning).toBe(null);
    });
    it('reason boundary: exactly 7 chars → REASON_TOO_SHORT (FAILS if off-by-one)', () => {
      const src = `# strong-tests:skip abc def
def f(items: list[int]) -> int:
    return 0`;
      const r = scan(src, 'python');
      expect(r.suppressed[0].reasonLength).toBe(7);
      expect(r.suppressed[0].reasonWarning).toBe('REASON_TOO_SHORT');
    });
    it('TS arrow function const detected via m[2] capture (FAILS if m[1] || m[2] fallback broken)', () => {
      const src = `export const buildList = (): Array<number> => {
  return [];
};`;
      const r = scan(src, 'ts');
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0].function).toBe('buildList');
    });

    it('suppression lookahead bounded to i+4 lines — function 5+ lines below NOT attached (FAILS if Math.min→Math.max)', () => {
      const src = `// strong-tests:skip orphan suppression — function too far below
const padding1 = 1;
const padding2 = 2;
const padding3 = 3;
const padding4 = 4;
function tooFar(): number[] {
  return [];
}`;
      const r = scan(src, 'ts');
      expect(r.suppressed.length, 'function 5 lines below comment must NOT be attached').toBe(0);
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0].function).toBe('tooFar');
    });

    it('orphan suppression comment without function below produces empty suppressed (FAILS if target-null guard removed)', () => {
      const src = `// strong-tests:skip dangling reason no function follows
const justData = 42;`;
      const r = scan(src, 'ts');
      expect(r.suppressed).toEqual([]);
    });

    it('suppressed.function string format = name:1-indexed-line (FAILS if +1 → -1 off-by-one)', () => {
      const src = `function pre(): void {}
// strong-tests:skip pure-leaf reducer no composition
function leaf(): number[] {
  return [1, 2, 3];
}`;
      const r = scan(src, 'ts');
      expect(r.suppressed.length).toBe(1);
      // leaf is on line 3 (0-indexed 2), 1-indexed = 3
      expect(r.suppressed[0].line).toBe(3);
      expect(r.suppressed[0].function).toBe('leaf:3');
    });

    it('candidate.line = 1-indexed function declaration line (FAILS if +1 → -1)', () => {
      const src = `const header = 1;
function builder(): Array<string> {
  return [];
}`;
      const r = scan(src, 'ts');
      expect(r.candidates.length).toBe(1);
      // builder on 0-indexed line 1, 1-indexed = 2
      expect(r.candidates[0].line).toBe(2);
    });

    it('return type window bounded to next 5 lines — distant return type does NOT cross-attach (FAILS if i+5 → larger)', () => {
      const src = `function a() {
  let x = 1;
  let y = 2;
  let z = 3;
  let w = 4;
}
function b(): Array<number> {
  return [];
}`;
      const r = scan(src, 'ts');
      // ONLY function b should be detected; function a return type "void" not in window
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0].function).toBe('b');
    });

    it('endLine bounded to 40 lines from function start (FAILS if 40 → larger)', () => {
      const src = `function compact(): Array<string> {
  return [];
}`;
      const r = scan(src, 'ts');
      expect(r.candidates.length).toBe(1);
      // 0-indexed body ends at line 2, +1 = 3
      expect(r.candidates[0].endLine).toBe(3);
    });

    it('nested loops outside function body do NOT cross-attach (FAILS if endLine slice unbounded)', () => {
      const lines = ['function simple(): Array<number> {'];
      lines.push('  return [];');
      lines.push('}');
      for (let i = 0; i < 50; i++) lines.push(`const x${i} = ${i};`);
      lines.push('function later(): void {');
      lines.push('  for (let i = 0; i < 1; i++) for (let j = 0; j < 1; j++) {}');
      lines.push('}');
      const r = scan(lines.join('\n'), 'ts');
      const simpleCand = r.candidates.find((c) => c.function === 'simple');
      expect(simpleCand, 'simple candidate should exist').toBeDefined();
      // 'simple' has no nested loops in its 3-line body — must NOT be nxm-overlap
      expect(simpleCand!.kind).toBe('collection-returning');
    });

    it('reason string preserved verbatim including punctuation (FAILS if .trim() removes content / regex captures too greedy)', () => {
      const src = `// strong-tests:skip pure-leaf reducer — type system enforces correctness
function leaf(): number[] {
  return [];
}`;
      const r = scan(src, 'ts');
      expect(r.suppressed[0].reason).toBe('pure-leaf reducer — type system enforces correctness');
    });

    it('detects Go function returning []T with nested for-range (FAILS if Go dispatch broken)', () => {
      const src = `package main

func BuildIndex(repos []string, wts []string) []string {
	out := []string{}
	for _, r := range repos {
		for _, w := range wts {
			out = append(out, r+w)
		}
	}
	return out
}`;
      const r = scan(src, 'go');
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0].function).toBe('BuildIndex');
      expect(r.candidates[0].returnType).toBe('[]string');
      expect(r.candidates[0].kind).toBe('nxm-overlap');
      expect(r.candidates[0].suggestedInvariants).toContain('conservation');
    });

    it('Go map return triggers coverage+no-leak invariants (FAILS if map branch missing)', () => {
      const src = `package main

func Tally(source []string) map[string]int {
	dict := map[string]int{}
	return dict
}`;
      const r = scan(src, 'go');
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0].function).toBe('Tally');
      expect(r.candidates[0].returnType).toContain('map[string]int');
      expect(r.candidates[0].suggestedInvariants).toContain('coverage');
      expect(r.candidates[0].suggestedInvariants).toContain('no-leak');
    });

    it('Go suppression comment parses (FAILS if SUPPRESS_GO regex broken)', () => {
      const src = `package main

// strong-tests:skip pure-leaf reducer no composition possible
func LeafReducer(items []int) int {
	return len(items)
}`;
      const r = scan(src, 'go');
      expect(r.suppressed.length).toBe(1);
      expect(r.suppressed[0].reason).toContain('pure-leaf');
      expect(r.suppressed[0].reasonWarning).toBe(null);
    });

    it('Go method with pointer receiver detected (FAILS if receiver regex breaks function match)', () => {
      const src = `package main

type Service struct{}

func (s *Service) GetItems(ids []int) []string {
	return []string{}
}`;
      const r = scan(src, 'go');
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0].function).toBe('GetItems');
      expect(r.candidates[0].returnType).toBe('[]string');
    });

    it('suppression same-line form on function declaration line attaches correctly (FAILS if same-line path broken)', () => {
      const src = `function quick(): number[] { return []; } // strong-tests:skip same-line reducer pure
function other(): string[] {
  return [];
}`;
      const r = scan(src, 'ts');
      expect(r.suppressed.length).toBe(1);
      expect(r.suppressed[0].function).toBe('quick:1');
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0].function).toBe('other');
    });

    it('suppressed function NOT in candidates (FAILS if suppressedLines exclusion broken)', () => {
      const src = `// strong-tests:skip pure-leaf reducer no composition
function leaf(): number[] {
  return [1, 2, 3];
}
function normal(): number[] {
  return [4, 5, 6];
}`;
      const r = scan(src, 'ts');
      expect(r.suppressed.length).toBe(1);
      expect(r.candidates.length).toBe(1);
      expect(r.candidates[0].function).toBe('normal');
      expect(r.suppressed[0].function).toMatch(/^leaf:/);
    });
  });
});
