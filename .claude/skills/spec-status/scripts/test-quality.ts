/**
 * Test body quality classifier (honest-status-command FR-6).
 *
 * Deterministic, dependency-free classifier the spec-status skill uses to flag
 * weak / fake-positive test bodies. The sub-agent reuses these same rules; this
 * module is the testable core (no LLM) so the WEAK/STRONG/FAKE-POSITIVE-RISK
 * verdicts are reproducible and unit-tested against tests/fixtures/spec-status/.
 *
 * Classification per `it()`/`test()` block — OR per BDD step block
 * (`Given()`/`When()`/`Then()`/`And()` from a cucumber step-def, classified by
 * its `node:assert` assertions exactly as `it()` blocks are by `expect`):
 *   FAKE-POSITIVE-RISK — tautology assertion (expect(<lit>).toBe(<same lit>) OR
 *                        assert(true)/assert.ok(true)/assert.equal(1,1)) OR the
 *                        block relies on a file-level mock of a production path.
 *   WEAK              — only presence assertions (toBeDefined/toBeTruthy/... OR a
 *                        bare assert.ok(<expr>)) and no value-level assertion.
 *   STRONG            — has a value-level assertion (toEqual/toThrow/... OR
 *                        assert.deepEqual/assert.equal(<x>,<value>)/assert.match/...).
 *
 * A BDD step that carries NO assertion at all (a pure `Given`/`When` setup step) is
 * NOT a quality signal and is SKIPPED — only assertion-bearing steps (`Then`/`And`
 * with an assert, or any `it()`) are graded. This lets a step-def whose only graded
 * step is a strong `Then` read "all STRONG" the way a vitest file does.
 *
 * File-level: a vi.mock()/jest.mock() of a non-test path (src/, ../ into
 * production) is reported as a fileRisk and taints blocks that have no STRONG
 * assertion of their own (a mocked production path makes a passing test suspect).
 */

export type Classification = 'STRONG' | 'WEAK' | 'FAKE-POSITIVE-RISK';

export interface BlockVerdict {
  line: number;
  name: string;
  classification: Classification;
  reason: string;
}

export interface FileRisk {
  line: number;
  kind: 'mock-production-path';
  detail: string;
}

export interface TestQualityReport {
  fileRisks: FileRisk[];
  blocks: BlockVerdict[];
  summary: { strong: number; weak: number; fakePositiveRisk: number; total: number };
}

const PRESENCE_ONLY = /\.(toBeDefined|toBeTruthy|toBeFalsy|toBeNull|toBeUndefined|toBeNaN)\s*\(/;
const VALUE_LEVEL =
  /\.(toEqual|toStrictEqual|toMatchObject|toMatchSnapshot|toContain|toContainEqual|toThrow|toThrowError|toHaveLength|toHaveProperty|toBeGreaterThan|toBeLessThan|toBeCloseTo|toMatch)\s*\(/;
// toBe(<non-trivial value>) counts as value-level, but a tautology toBe is caught first.
const TO_BE_VALUE = /\.toBe\s*\(\s*(?!true\s*\)|false\s*\)|null\s*\)|undefined\s*\))[^)]+\)/;
// Tautology: expect(<literal>)...toBe(<same literal>) — always passes regardless of code.
const TAUTOLOGY =
  /expect\s*\(\s*(true|false|1|0|''|""|null)\s*\)\s*\.(toBe|toEqual)\s*\(\s*\1\s*\)/;
const MOCK_CALL = /\b(?:vi|jest)\.mock\s*\(\s*['"]([^'"]+)['"]/g;

// ── node:assert equivalents (BDD step-defs assert with `assert.*`, not `expect`) ──
// assert(true) / assert.ok(true) / assert.ok(1) — a constant-truthy tautology.
const ASSERT_TAUTOLOGY_LIT = /\bassert(?:\.ok)?\s*\(\s*(?:true|1)\s*[,)]/;
// assert.equal(1, 1) / assert.strictEqual('x','x') — same literal both sides.
const ASSERT_TAUTOLOGY_EQ = /\bassert\.(?:equal|strictEqual|deepEqual|deepStrictEqual)\s*\(\s*(true|false|1|0|''|"")\s*,\s*\1\s*[,)]/;
// Structural / value-level asserts (the strong forms).
const ASSERT_VALUE =
  /\bassert\.(?:deepEqual|deepStrictEqual|notDeepEqual|notDeepStrictEqual|match|doesNotMatch|throws|rejects|doesNotThrow|notEqual|notStrictEqual)\s*\(/;
// assert.equal(<expr>, <non-trivial value>) — a real expected value, not a bare boolean/null.
const ASSERT_EQ_VALUE = /\bassert\.(?:equal|strictEqual)\s*\(\s*[^,]+,\s*(?!true\s*[,)]|false\s*[,)]|null\s*[,)]|undefined\s*[,)])[^)]+\)/;
// A bare presence assert: assert(<expr>) / assert.ok(<expr>) with no value comparison.
const ASSERT_PRESENCE = /\bassert(?:\.ok)?\s*\(/;
// Does the block assert anything at all? (else a cucumber setup step is skipped.)
const HAS_ASSERTION = /\bexpect\s*\(|\bassert\b/;

/** A mock path that points at non-test production code (src/, or ../ outside tests). */
function isProductionMockPath(p: string): boolean {
  if (/(?:^|\/)(?:tests?|__tests__|fixtures?|mocks?|__mocks__)\//.test(p)) return false;
  return /(?:^|\/)src\//.test(p) || /\.\.\//.test(p);
}

interface RawBlock {
  line: number;
  name: string;
  body: string;
  /** True for a cucumber step block (Given/When/Then/And) vs an it()/test() block. */
  isStep: boolean;
}

/**
 * Extract it()/test() AND cucumber step (Given/When/Then/And) blocks with their body
 * text (brace-balanced from the callback). The step name is the regex/cucumber pattern.
 */
function extractBlocks(source: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  // it/test('name', …)  OR  Given/When/Then/And(/regex/ | 'expr', function/arrow …)
  const re = /\b(it|test|Given|When|Then|And)(?:\.\w+)?\s*\(\s*(['"`/])(.*?)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const keyword = m[1];
    const isStep = keyword !== 'it' && keyword !== 'test';
    const name = m[3];
    const line = source.slice(0, m.index).split('\n').length;
    // Body = from the match to the matching close of the it(...) call (brace depth).
    const rest = source.slice(m.index);
    // The function BODY brace is the first `{` preceded (mod whitespace) by `)` or `>`
    // (params close / arrow) — NOT a `this: {Type}` annotation (`:`) or a `({destructure})`
    // param (`(`/`,`). This keeps a step-def's inline-typed signature from being mis-read.
    let braceStart = -1;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] !== '{') continue;
      let j = i - 1;
      while (j >= 0 && /\s/.test(rest[j])) j--;
      if (j >= 0 && (rest[j] === ')' || rest[j] === '>')) { braceStart = i; break; }
    }
    let body = '';
    if (braceStart !== -1) {
      let depth = 0;
      for (let i = braceStart; i < rest.length; i++) {
        const ch = rest[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            body = rest.slice(braceStart, i + 1);
            break;
          }
        }
      }
    }
    blocks.push({ line, name, body: body || rest.slice(0, 400), isStep });
  }
  return blocks;
}

export function classifyTestFile(source: string): TestQualityReport {
  const fileRisks: FileRisk[] = [];
  let mm: RegExpExecArray | null;
  MOCK_CALL.lastIndex = 0;
  while ((mm = MOCK_CALL.exec(source)) !== null) {
    const target = mm[1];
    if (isProductionMockPath(target)) {
      fileRisks.push({
        line: source.slice(0, mm.index).split('\n').length,
        kind: 'mock-production-path',
        detail: `Mocks production path ${target}`,
      });
    }
  }

  const isTautology = (s: string): boolean => TAUTOLOGY.test(s) || ASSERT_TAUTOLOGY_LIT.test(s) || ASSERT_TAUTOLOGY_EQ.test(s);
  const isValueLevel = (s: string): boolean => VALUE_LEVEL.test(s) || TO_BE_VALUE.test(s) || ASSERT_VALUE.test(s) || ASSERT_EQ_VALUE.test(s);
  const isPresenceOnly = (s: string): boolean => PRESENCE_ONLY.test(s) || ASSERT_PRESENCE.test(s);

  const blocks: BlockVerdict[] = extractBlocks(source)
    .map((b): BlockVerdict | null => {
      // A pure cucumber setup step (Given/When with no assertion) is not a quality
      // signal — skip it so a step-def reads by its assertion-bearing steps alone.
      if (b.isStep && !HAS_ASSERTION.test(b.body)) return null;
      if (isTautology(b.body)) {
        return { line: b.line, name: b.name, classification: 'FAKE-POSITIVE-RISK', reason: 'Tautology assertion — passes regardless of code under test' };
      }
      if (fileRisks.length > 0 && !isValueLevel(b.body)) {
        return { line: b.line, name: b.name, classification: 'FAKE-POSITIVE-RISK', reason: `Relies on file-level mock of a production path (${fileRisks[0].detail})` };
      }
      if (isValueLevel(b.body)) {
        return { line: b.line, name: b.name, classification: 'STRONG', reason: 'Value-level assertion with expected structure' };
      }
      if (isPresenceOnly(b.body)) {
        return { line: b.line, name: b.name, classification: 'WEAK', reason: 'Assertion is presence-only, not value-level' };
      }
      return { line: b.line, name: b.name, classification: 'WEAK', reason: 'No value-level assertion found' };
    })
    .filter((b): b is BlockVerdict => b !== null);

  const summary = {
    strong: blocks.filter((b) => b.classification === 'STRONG').length,
    weak: blocks.filter((b) => b.classification === 'WEAK').length,
    fakePositiveRisk: blocks.filter((b) => b.classification === 'FAKE-POSITIVE-RISK').length,
    total: blocks.length,
  };
  return { fileRisks, blocks, summary };
}
