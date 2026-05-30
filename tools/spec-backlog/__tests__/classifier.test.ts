import { describe, it, expect } from 'vitest';
import { classify } from '../classifier.ts';

describe('spec-backlog classifier', () => {
  it('routes concept-overlap to NOISE', () => {
    const v = classify('foo', { code: 'cross-spec/concept-overlap', severity: 'INFO' });
    expect(v.verdict).toBe('NOISE');
  });

  it('routes missing-cross-ref to AUTO_FIX', () => {
    const v = classify('foo', { code: 'cross-spec/missing-cross-ref', severity: 'INFO' });
    expect(v.verdict).toBe('AUTO_FIX');
  });

  it('routes dead-link with sibling-spec target to BACKLOG missing-spec-file', () => {
    const v = classify('foo', {
      code: 'impl-drift/dead-link',
      severity: 'WARNING',
      referenced_in: '.specs/foo/FR.md:10',
      expected_path: 'ACCEPTANCE_CRITERIA.md',
    });
    expect(v.verdict).toBe('BACKLOG');
    expect(v.entry!.category).toBe('missing-spec-file');
    expect(v.entry!.suggested_resolver).toBe('ac-author');
  });

  it('routes dead-link with case-typo target to AUTO_FIX', () => {
    const v = classify('foo', {
      code: 'impl-drift/dead-link',
      severity: 'WARNING',
      expected_path: 'guide.MD',
    });
    expect(v.verdict).toBe('AUTO_FIX');
  });

  it('routes dead-link with multi-segment target to BACKLOG dead-link-typo', () => {
    const v = classify('foo', {
      code: 'impl-drift/dead-link',
      severity: 'WARNING',
      expected_path: 'tools/spec-graph/missing.ts',
    });
    expect(v.verdict).toBe('BACKLOG');
    expect(v.entry!.category).toBe('dead-link-typo');
    expect(v.entry!.suggested_resolver).toBe('link-fixer');
  });

  it('routes missing-test to BACKLOG scenario-writer', () => {
    const v = classify('foo', { code: 'impl-drift/missing-test', severity: 'INFO' });
    expect(v.verdict).toBe('BACKLOG');
    expect(v.entry!.suggested_resolver).toBe('scenario-writer');
  });

  it('routes ownership-conflict to BACKLOG owner-picker (hard)', () => {
    const v = classify('foo', {
      code: 'cross-spec/module-ownership-conflict',
      severity: 'CRITICAL',
      spec_a: '.specs/foo (claims tools/x)',
      spec_b: '.specs/bar (claims tools/x)',
    });
    expect(v.verdict).toBe('BACKLOG');
    expect(v.entry!.difficulty).toBe('hard');
    expect(v.entry!.suggested_resolver).toBe('owner-picker');
  });

  it('routes contradictory-nfr to BACKLOG decision-arbiter', () => {
    const v = classify('foo', {
      code: 'cross-spec/contradictory-nfr',
      severity: 'CRITICAL',
      spec_a: 'A',
      spec_b: 'B',
    });
    expect(v.verdict).toBe('BACKLOG');
    expect(v.entry!.suggested_resolver).toBe('decision-arbiter');
  });

  it('unrecognised codes still go to BACKLOG (no silent loss)', () => {
    const v = classify('foo', { code: 'made-up/code', severity: 'WARNING' });
    expect(v.verdict).toBe('BACKLOG');
    expect(v.entry!.category).toBe('unrecognised');
    expect(v.entry!.suggested_resolver).toBe('human');
  });
});
