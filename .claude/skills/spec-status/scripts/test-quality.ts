/**
 * Test body quality classifier (honest-status-command FR-6).
 *
 * Deterministic, dependency-free classifier the spec-status skill uses to flag
 * weak / fake-positive test bodies. The sub-agent reuses these same rules; this
 * module is the testable core (no LLM) so the WEAK/STRONG/FAKE-POSITIVE-RISK
 * verdicts are reproducible and unit-tested against tests/fixtures/spec-status/.
 *
 * Classification per `it()`/`test()` block:
 *   FAKE-POSITIVE-RISK — tautology assertion (expect(<lit>).toBe(<same lit>)) OR
 *                        the block relies on a file-level mock of a production path.
 *   WEAK              — only presence assertions (toBeDefined/toBeTruthy/...) and
 *                        no value-level assertion.
 *   STRONG            — has a value-level assertion (toEqual/toMatchObject/
 *                        toBe(<value>)/toContain/toThrow/...).
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

/** A mock path that points at non-test production code (src/, or ../ outside tests). */
function isProductionMockPath(p: string): boolean {
  if (/(?:^|\/)(?:tests?|__tests__|fixtures?|mocks?|__mocks__)\//.test(p)) return false;
  return /(?:^|\/)src\//.test(p) || /\.\.\//.test(p);
}

interface RawBlock {
  line: number;
  name: string;
  body: string;
}

/** Extract it()/test() blocks with their body text (brace-balanced from the callback). */
function extractBlocks(source: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  const re = /\b(?:it|test)(?:\.\w+)?\s*\(\s*(['"`])(.*?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const name = m[2];
    const line = source.slice(0, m.index).split('\n').length;
    // Body = from the match to the matching close of the it(...) call (brace depth).
    const rest = source.slice(m.index);
    const braceStart = rest.indexOf('{');
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
    blocks.push({ line, name, body: body || rest.slice(0, 400) });
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

  const blocks: BlockVerdict[] = extractBlocks(source).map((b) => {
    if (TAUTOLOGY.test(b.body)) {
      return { line: b.line, name: b.name, classification: 'FAKE-POSITIVE-RISK', reason: 'Tautology assertion — passes regardless of code under test' };
    }
    if (fileRisks.length > 0 && !VALUE_LEVEL.test(b.body) && !TO_BE_VALUE.test(b.body)) {
      return { line: b.line, name: b.name, classification: 'FAKE-POSITIVE-RISK', reason: `Relies on file-level mock of a production path (${fileRisks[0].detail})` };
    }
    if (VALUE_LEVEL.test(b.body) || TO_BE_VALUE.test(b.body)) {
      return { line: b.line, name: b.name, classification: 'STRONG', reason: 'Value-level assertion with expected structure' };
    }
    if (PRESENCE_ONLY.test(b.body)) {
      return { line: b.line, name: b.name, classification: 'WEAK', reason: 'Assertion is presence-only, not value-level' };
    }
    return { line: b.line, name: b.name, classification: 'WEAK', reason: 'No value-level assertion found' };
  });

  const summary = {
    strong: blocks.filter((b) => b.classification === 'STRONG').length,
    weak: blocks.filter((b) => b.classification === 'WEAK').length,
    fakePositiveRisk: blocks.filter((b) => b.classification === 'FAKE-POSITIVE-RISK').length,
    total: blocks.length,
  };
  return { fileRisks, blocks, summary };
}
