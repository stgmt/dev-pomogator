import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { scoreDiff } from '../../extensions/_shared/scope-gate-score-diff.ts';

/**
 * Regression pin: stocktaking diff from webapp MR !100 must always score >= 4.
 *
 * This test defends against accidental heuristic tuning that loses incident detection.
 * If this test fails: EITHER the heuristic regressed AND must be fixed, OR the incident
 * pattern legitimately changed and this test must be updated WITH A COMMENT citing why.
 *
 * Do NOT relax score expectation without documenting root cause.
 */
describe('REGRESSION: PRODUCTS-20218 stocktaking incident pin', () => {
  it('stocktaking-diff.patch must score >= 4 via weighted heuristic', () => {
    const diff = readFileSync(
      path.resolve('tests/fixtures/scope-gate/stocktaking-diff.patch'),
      'utf-8',
    );
    const { score, reasons } = scoreDiff(diff);

    expect(
      score,
      `Regression: stocktaking fixture should score >= 4 (filename+enum+predicate), got ${score}. Reasons: ${reasons.join(', ')}`,
    ).toBeGreaterThanOrEqual(4);

    // Sanity: specific rules fired
    const reasonsText = reasons.join('\n');
    expect(reasonsText).toMatch(/filename:.*StockValidationService\.ts/);
    expect(reasonsText).toMatch(/enum-item:.*StockValidationService\.ts/);
  });
});
