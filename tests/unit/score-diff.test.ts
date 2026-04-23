import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  scoreDiff,
  isDocsOrTestsOnly,
  parseFilesFromDiff,
} from '../../extensions/_shared/scope-gate-score-diff.ts';

const FIXTURES_DIR = path.resolve('tests/fixtures/scope-gate');

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

describe('SCOPEGATE001: scoreDiff pure heuristic', () => {
  // @feature1
  it('SCOPEGATE001_10: empty diff returns score 0', () => {
    expect(scoreDiff('').score).toBe(0);
    expect(scoreDiff('   ').score).toBe(0);
  });

  // @feature1
  it('SCOPEGATE001_11: malformed diff returns score 0', () => {
    expect(scoreDiff('this is not a diff').score).toBe(0);
  });

  // @feature1
  it('SCOPEGATE001_12: stocktaking fixture scores >= 4 (regression pin)', () => {
    const diff = readFixture('stocktaking-diff.patch');
    const { score, reasons } = scoreDiff(diff);
    expect(score).toBeGreaterThanOrEqual(4);
    expect(reasons.join('\n')).toMatch(/filename:.*Service\.ts/);
    expect(reasons.join('\n')).toMatch(/enum-item/);
  });

  // @feature1
  it('SCOPEGATE001_13: switch-case fixture scores >= 3', () => {
    const diff = readFixture('switch-case-diff.patch');
    const { score, reasons } = scoreDiff(diff);
    expect(score).toBeGreaterThanOrEqual(3);
    expect(reasons.join('\n')).toMatch(/switch-case|case/);
  });

  // @feature4
  it('SCOPEGATE001_20: non-guard enum file scores 2 (borderline, acceptable FP)', () => {
    const diff = readFixture('non-guard-enum-diff.patch');
    const { score } = scoreDiff(diff);
    // Two string items added in non-guard file → only +2 from enum rule, no filename bonus
    expect(score).toBeGreaterThanOrEqual(2);
    expect(score).toBeLessThanOrEqual(4);
  });

  // @feature4
  it('SCOPEGATE001_21: docs dampening subtracts 2 per .md file', () => {
    const diff = readFixture('stocktaking-diff.patch');
    const baseline = scoreDiff(diff).score;
    const dampened = scoreDiff(diff, {
      dampenFiles: ['README.md'],
    }).score;
    expect(dampened).toBe(baseline - 2);
  });

  // @feature4
  it('SCOPEGATE001_22: tests path dampening subtracts 1 per file', () => {
    const diff = readFixture('stocktaking-diff.patch');
    const baseline = scoreDiff(diff).score;
    const dampened = scoreDiff(diff, {
      dampenFiles: ['tests/foo.test.ts'],
    }).score;
    expect(dampened).toBe(baseline - 1);
  });

  // @feature4
  it('SCOPEGATE001_23: isDocsOrTestsOnly returns true for md/txt-only file list', () => {
    expect(isDocsOrTestsOnly('README.md\ndocs/CHANGES.md')).toBe(true);
    expect(isDocsOrTestsOnly('tests/foo.test.ts\ntests/bar.test.ts')).toBe(true);
    expect(isDocsOrTestsOnly('docs/a.rst')).toBe(true);
  });

  // @feature4
  it('SCOPEGATE001_24: isDocsOrTestsOnly returns false when any code file present', () => {
    expect(isDocsOrTestsOnly('README.md\nsrc/index.ts')).toBe(false);
    expect(isDocsOrTestsOnly('src/a.ts')).toBe(false);
  });

  // @feature4
  it('SCOPEGATE001_25: isDocsOrTestsOnly returns false for empty input', () => {
    expect(isDocsOrTestsOnly('')).toBe(false);
    expect(isDocsOrTestsOnly('   \n  ')).toBe(false);
  });

  // @feature1
  it('SCOPEGATE001_30: parseFilesFromDiff handles multi-file diff', () => {
    const diff = readFixture('docs-only-diff.patch');
    const files = parseFilesFromDiff(diff);
    expect(files.map(f => f.path)).toEqual(['README.md', 'docs/CHANGES.md']);
  });

  // @feature1
  it('SCOPEGATE001_31: reasons array reports each contributing rule', () => {
    const diff = readFixture('stocktaking-diff.patch');
    const { reasons } = scoreDiff(diff);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.every(r => /^[+-]\d+ /.test(r))).toBe(true);
  });

  // @feature4
  it('SCOPEGATE001_40: docs-only diff scores 0 (no guard patterns)', () => {
    const diff = readFixture('docs-only-diff.patch');
    const { score } = scoreDiff(diff);
    expect(score).toBe(0);
  });
});
