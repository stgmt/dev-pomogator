// spec-backlog classifier — given a cross-spec-reconcile finding, decide
// AUTO_FIX (mechanical rule already covers it) / BACKLOG (creative work
// needed, queue for specialist) / NOISE (suspected detector FP).
//
// Per BACKLOG_DESIGN.md categories → resolvers mapping.

import type { ClassificationResult } from './types.ts';

export interface InputFinding {
  code: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  referenced_in?: string;
  expected_path?: string;
  spec_a?: string;
  spec_b?: string;
  suggested_fix?: string;
}

export function classify(slug: string, finding: InputFinding): ClassificationResult {
  const code = finding.code;

  // 1. NOISE class — INFO findings on the corpus that have no
  // realistic resolver. We keep them in the report but don't backlog.
  if (code === 'cross-spec/concept-overlap') {
    return {
      verdict: 'NOISE',
      noiseReason:
        'Documentation-quality signal. Action requires editorial judgment per spec pair.',
    };
  }
  if (code === 'cross-spec/missing-cross-ref') {
    return {
      verdict: 'AUTO_FIX',
      autoFixRule: 'add-markdown-link-on-first-mention',
    };
  }

  // 2. AUTO_FIX class — high-confidence mechanical rule
  if (code === 'impl-drift/dead-link') {
    // We already learned: bare unwrap is dangerous when the target is a
    // genuinely missing spec file. Route by target shape.
    const target = finding.expected_path ?? '';
    const isObviousTypo =
      /\.MD$|\.JSON$/.test(target) || /\.md\.md$/.test(target);
    if (isObviousTypo) {
      return { verdict: 'AUTO_FIX', autoFixRule: 'fix-case-extension' };
    }
    // Heuristic: target is a sibling spec file (no `/` separator) — likely
    // a spec-completeness gap.
    if (target && !target.includes('/') && !target.includes('\\')) {
      return {
        verdict: 'BACKLOG',
        entry: {
          slug,
          code,
          category: 'missing-spec-file',
          evidence: {
            file: finding.referenced_in,
            target,
            occurrence_count: 1,
            label_samples: [],
          },
          suggested_resolver: 'ac-author',
          difficulty: target === 'ACCEPTANCE_CRITERIA.md' ? 'medium' : 'hard',
        },
      };
    }
    // Otherwise — typo-class: link-fixer agent
    return {
      verdict: 'BACKLOG',
      entry: {
        slug,
        code,
        category: 'dead-link-typo',
        evidence: { file: finding.referenced_in, target },
        suggested_resolver: 'link-fixer',
        difficulty: 'easy',
      },
    };
  }

  // 3. BACKLOG class — needs specialist resolver
  if (code === 'impl-drift/missing-test') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug,
        code,
        category: 'missing-test',
        evidence: {
          file: finding.referenced_in,
        },
        suggested_resolver: 'scenario-writer',
        difficulty: 'medium',
      },
    };
  }
  if (code === 'cross-spec/module-ownership-conflict') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug,
        code,
        category: 'ownership-conflict',
        evidence: {
          spec_a: finding.spec_a,
          spec_b: finding.spec_b,
        },
        suggested_resolver: 'owner-picker',
        difficulty: 'hard',
      },
    };
  }
  if (code === 'cross-spec/contradictory-nfr') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug,
        code,
        category: 'contradictory-nfr',
        evidence: { spec_a: finding.spec_a, spec_b: finding.spec_b },
        suggested_resolver: 'decision-arbiter',
        difficulty: 'hard',
      },
    };
  }
  if (code === 'spec-only/missing-fr-section') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug,
        code,
        category: 'missing-fr-section',
        evidence: { file: finding.referenced_in },
        suggested_resolver: 'fr-author',
        difficulty: 'medium',
      },
    };
  }

  // Extended routes (added after dogfood pass-2 surfaced 974 unrecognised).
  if (code === 'impl-drift/missing-file') {
    // Same family as dead-link — sibling spec file claimed but missing.
    // Route to ac-author for AC.md targets, fr-author for FR.md, link-fixer otherwise.
    const target = finding.expected_path ?? '';
    if (/ACCEPTANCE_CRITERIA\.md|^AC\.md/.test(target)) {
      return {
        verdict: 'BACKLOG',
        entry: {
          slug, code,
          category: 'missing-spec-file',
          evidence: { file: finding.referenced_in, target },
          suggested_resolver: 'ac-author',
          difficulty: 'medium',
        },
      };
    }
    return {
      verdict: 'BACKLOG',
      entry: {
        slug, code,
        category: 'dead-link-typo',
        evidence: { file: finding.referenced_in, target },
        suggested_resolver: 'link-fixer',
        difficulty: 'easy',
      },
    };
  }
  if (code === 'spec-only/unreachable-task' || code === 'impl-drift/test-result-stale') {
    // Both are INFO/WARNING signals where action is intentional design or
    // CI-environment-dependent — no resolver can mechanically fix.
    return {
      verdict: 'NOISE',
      noiseReason: code === 'spec-only/unreachable-task'
        ? 'Tasks targeting future phases ARE intentionally flagged per design — advance phase_index manually.'
        : 'Git clone resets mtimes — false positive in CI / fresh checkouts.',
    };
  }
  if (code === 'spec-only/orphan-task') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug, code,
        category: 'missing-fr-section',
        evidence: { file: finding.referenced_in },
        suggested_resolver: 'fr-author',
        difficulty: 'medium',
      },
    };
  }
  if (code === 'spec-only/uncovered-AC' || code === 'spec-only/orphan-FR' || code === 'impl-drift/test-without-fr') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug, code,
        category: 'missing-test',
        evidence: { file: finding.referenced_in },
        suggested_resolver: 'scenario-writer',
        difficulty: 'medium',
      },
    };
  }
  if (code === 'spec-only/duplicate-fr-id') {
    // Cannot safely auto-rename — needs human decision which FR keeps the id.
    return {
      verdict: 'BACKLOG',
      entry: {
        slug, code,
        category: 'unrecognised',
        evidence: { file: finding.referenced_in },
        suggested_resolver: 'human',
        difficulty: 'hard',
      },
    };
  }

  // Batch-16 (eval-coverage workflow w0w45s96f): the 11 cross-spec codes
  // below were silently falling to 'unrecognised'. Route them explicitly.
  if (
    code === 'cross-spec/runtime-identifier-drift' ||
    code === 'cross-spec/url-shape-drift' ||
    code === 'cross-spec/cli-flag-drift' ||
    code === 'cross-spec/enum-divergence' ||
    code === 'cross-spec/schema-mismatch'
  ) {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug, code,
        category: 'contradictory-nfr',
        evidence: { spec_a: finding.spec_a, spec_b: finding.spec_b },
        suggested_resolver: 'decision-arbiter',
        difficulty: 'hard',
      },
    };
  }
  if (code === 'cross-spec/decision-locked-but-reality-diverges') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug, code,
        category: 'contradictory-nfr',
        evidence: { file: finding.referenced_in, target: finding.expected_path },
        suggested_resolver: 'decision-arbiter',
        difficulty: 'hard',
      },
    };
  }
  if (code === 'impl-drift/missing-symbol') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug, code,
        category: 'dead-link-typo',
        evidence: { file: finding.referenced_in, target: finding.expected_path },
        suggested_resolver: 'link-fixer',
        difficulty: 'medium',
      },
    };
  }
  if (code === 'spec-only/missing-acceptance') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug, code,
        category: 'missing-spec-file',
        evidence: { file: finding.referenced_in, target: 'ACCEPTANCE_CRITERIA.md' },
        suggested_resolver: 'ac-author',
        difficulty: 'medium',
      },
    };
  }
  if (code === 'spec-only/orphan-AC') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug, code,
        category: 'missing-fr-section',
        evidence: { file: finding.referenced_in },
        suggested_resolver: 'fr-author',
        difficulty: 'medium',
      },
    };
  }
  if (code === 'schema-drift/missing-feature-heading') {
    // Mechanical fix: add `Feature: <slug>` line at top of .feature file.
    return {
      verdict: 'AUTO_FIX',
      autoFixRule: 'add-feature-heading-line',
    };
  }
  if (code === 'schema-drift/invalid-frontmatter') {
    return {
      verdict: 'NOISE',
      noiseReason:
        'Gherkin parsers accept missing trailing newline / language directive in practice — pedantic.',
    };
  }
  if (code === 'cross-spec/contradictory-fr') {
    // Only fires in shared-namespace mode — same-FR with divergent prose.
    return {
      verdict: 'BACKLOG',
      entry: {
        slug, code,
        category: 'unrecognised',
        evidence: { spec_a: finding.spec_a, spec_b: finding.spec_b },
        suggested_resolver: 'human',
        difficulty: 'hard',
      },
    };
  }

  // Unrecognised — bucket into backlog with a generic resolver so nothing
  // is silently dropped. Specialist may take over later.
  return {
    verdict: 'BACKLOG',
    entry: {
      slug,
      code,
      category: 'unrecognised',
      evidence: {
        file: finding.referenced_in,
        spec_a: finding.spec_a,
        spec_b: finding.spec_b,
      },
      suggested_resolver: 'human',
      difficulty: 'medium',
    },
  };
}
