import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../classifier.ts';

// Resolve repo root from the test file: __tests__/ -> spec-backlog/ -> tools/ -> <root>
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

describe('spec-backlog classifier', () => {
  it('routes concept-overlap to NOISE', () => {
    const v = classify('foo', { code: 'cross-spec/concept-overlap', severity: 'INFO' });
    expect(v.verdict).toBe('NOISE');
  });

  it('routes missing-cross-ref to BACKLOG/cross-ref-linker', () => {
    const v = classify('foo', {
      code: 'cross-spec/missing-cross-ref',
      severity: 'INFO',
      referenced_in: '.specs/foo/FR.md:10',
      spec_a: '.specs/foo',
      spec_b: '.specs/bar',
    });
    expect(v.verdict).toBe('BACKLOG');
    expect(v.entry!.category).toBe('missing-cross-ref');
    expect(v.entry!.suggested_resolver).toBe('cross-ref-linker');
    // Classifier strips `.specs/` prefix so resolver gets bare slug.
    expect(v.entry!.evidence.spec_a).toBe('foo');
    expect(v.entry!.evidence.spec_b).toBe('bar');
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

  describe('dead-link basename-glob pre-flight (PATH C)', () => {
    it('routes dead-link with NO basename match to NOISE (filters out futile resolver work)', () => {
      const v = classify(
        'foo',
        {
          code: 'impl-drift/dead-link',
          severity: 'WARNING',
          referenced_in: '.specs/foo/FR.md:10',
          // Multi-segment path so the sibling-spec heuristic doesn't catch it;
          // basename guaranteed unique-to-not-exist.
          expected_path: 'tools/no-such-dir/no-such-file-xyz-zzz-12345.ts',
        },
        REPO_ROOT,
      );
      expect(v.verdict).toBe('NOISE');
      expect(v.noiseReason).toMatch(/does not exist anywhere in repo/);
    });

    it('routes dead-link with EXACTLY one basename match to BACKLOG dead-link-typo (existing route)', () => {
      const v = classify(
        'foo',
        {
          code: 'impl-drift/dead-link',
          severity: 'WARNING',
          referenced_in: '.specs/foo/FR.md:10',
          // classifier.ts has exactly one occurrence in the repo
          expected_path: 'tools/spec-backlog/classifier.ts',
        },
        REPO_ROOT,
      );
      expect(v.verdict).toBe('BACKLOG');
      expect(v.entry!.category).toBe('dead-link-typo');
      expect(v.entry!.suggested_resolver).toBe('link-fixer');
    });

    it('falls back to dead-link-typo when no repoRoot is supplied (backward compat)', () => {
      // Without repoRoot, the basename pre-flight is skipped — preserves
      // pre-PATH-C behaviour for callers that don't have repo context
      // (e.g. existing tests, MCP shim, dry-run mode).
      const v = classify('foo', {
        code: 'impl-drift/dead-link',
        severity: 'WARNING',
        expected_path: 'tools/something/that-may-or-may-not-exist.ts',
      });
      expect(v.verdict).toBe('BACKLOG');
      expect(v.entry!.category).toBe('dead-link-typo');
    });
  });
});
