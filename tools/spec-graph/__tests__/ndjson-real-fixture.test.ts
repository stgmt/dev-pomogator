/**
 * Ground-truth test: parse a REAL captured cucumber-js NDJSON subset (not a
 * hand-built one) and assert the outcomes the tool actually produced.
 *
 * This is the test the synthetic fixtures in `ndjson-ingester.test.ts` must
 * agree with. It pins the two real-output behaviours synthetic fixtures faked:
 * Windows backslash uris normalise to POSIX keys, and a scenario with
 * UNDEFINED/PENDING steps is NOT reported PASSED.
 *
 * @see tests/fixtures/ndjson/README.md
 * @see .claude/rules/testing/verify-against-real-artifact.md
 */
import { describe, it, expect } from 'vitest';
import { parseNdjsonFile } from '../parsers/ndjson.ts';

const FIXTURE = 'tests/fixtures/ndjson/real-cucumber-sample.ndjson';
const FEATURE = '.specs/spec-generator-v4/spec-generator-v4.feature';

describe('parseNdjson — real captured cucumber fixture (ground truth)', () => {
  const patch = parseNdjsonFile(FIXTURE);

  it('parses exactly the 3 captured scenarios', () => {
    expect(patch.byLocation.size).toBe(3);
  });
  it('keys scenarios by POSIX path even though the capture is from Windows', () => {
    expect([...patch.byLocation.keys()].every((k) => !k.includes('\\'))).toBe(true);
  });
  it('SPECGEN004_03 (line 31) is PASSED', () => {
    expect(patch.byLocation.get(`${FEATURE}:31`)?.lastResult).toBe('PASSED');
  });
  it('SPECGEN004_10 (line 86) is PENDING — not collapsed to PASSED', () => {
    expect(patch.byLocation.get(`${FEATURE}:86`)?.lastResult).toBe('PENDING');
  });
  it('SPECGEN004_29 (line 242) is UNDEFINED — not collapsed to PASSED', () => {
    expect(patch.byLocation.get(`${FEATURE}:242`)?.lastResult).toBe('UNDEFINED');
  });
});
