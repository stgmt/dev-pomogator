/**
 * Regression for the jargon detector — the block/no-block oracle the answer-simple
 * Stop hook gates on. Drives the SAME deterministic fixtures as the standalone bench
 * (`evals/detector-bench.ts`), so CI fails if the detector regresses to missing real
 * jargon (the 2026-06-11 incident: FR-43c / SUPERSEDED / HITL / P18-1 / not_run all
 * slipped through) OR starts over-blocking clean prose.
 */
import { describe, it, expect } from 'vitest';
import { detectJargon } from '../jargon_detector.ts';
import { FIXTURES } from '../evals/detector-bench.ts';

describe('jargon detector — deterministic block oracle', () => {
  for (const f of FIXTURES) {
    it(`${f.expectBlock ? 'BLOCKS' : 'passes'}: ${f.name}`, () => {
      const r = detectJargon(f.message);
      expect(r.block, `${f.name}: ${f.why} | codes=[${r.stats.codes.join(', ')}]`).toBe(f.expectBlock);
    });
  }

  it('catches the exact tokens that slipped through before the fix', () => {
    // Each of these is a class the OLD detector missed; assert each is now caught.
    const cases: Array<[string, string]> = [
      ['FR-43c', 'letter-suffixed requirement id'],
      ['P18-1', 'phase-task id'],
      ['SUPERSEDED', 'shouted single-word status code'],
      ['HITL', 'project acronym (not a universal one)'],
      ['not_run', 'lowercase snake_case identifier'],
      ['SPECGEN003', 'SPECGEN id without underscore'],
    ];
    for (const [token, kind] of cases) {
      const padded = 'обычная фраза '.repeat(20) + token; // long prose so length never hard-OUTs
      const r = detectJargon(padded);
      expect(r.stats.codes, `${token} (${kind}) must be detected`).toContain(token.toLowerCase());
    }
  });

  it('does NOT flag universal acronyms (JSON / API / HTTP / GREEN) as jargon', () => {
    const r = detectJargon('обычная фраза '.repeat(20) + 'JSON API HTTP GREEN OK DONE');
    expect(r.stats.codes).toEqual([]);
  });
});
