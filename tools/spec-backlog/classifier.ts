// spec-backlog classifier — given a cross-spec-reconcile finding, decide
// AUTO_FIX (mechanical rule already covers it) / BACKLOG (creative work
// needed, queue for specialist) / NOISE (suspected detector FP).
//
// Per BACKLOG_DESIGN.md categories → resolvers mapping.

import path from 'node:path';
import { globSync } from 'glob';
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

// Mirror link-fixer.ts exclude list — same ignore globs + same post-filter
// regex (node_modules, .git, dist, .next, build, .cache).
const GLOB_IGNORE = ['node_modules/**', '.git/**', 'dist/**', '.next/**', 'build/**'];
const POST_EXCLUDE_RE = /node_modules|\.git|\.next|dist|build|\.cache/;

/**
 * Count basename matches for a dead-link target in the repo, using the
 * same exclude list link-fixer uses. Returns -1 when repoRoot is not
 * supplied (callers that don't have repo context skip the pre-flight
 * check and fall back to the previous routing).
 */
function countBasenameMatches(repoRoot: string | undefined, target: string): number {
  if (!repoRoot || !target) return -1;
  const basename = path.basename(target);
  if (!basename) return -1;
  try {
    const matches = globSync(`**/${basename}`, {
      cwd: repoRoot,
      absolute: true,
      ignore: GLOB_IGNORE,
    }).filter((m) => !path.relative(repoRoot, m).match(POST_EXCLUDE_RE));
    return matches.length;
  } catch {
    // Glob error — fall back to pre-existing routing (no pre-flight).
    return -1;
  }
}

export function classify(
  slug: string,
  finding: InputFinding,
  repoRoot?: string,
): ClassificationResult {
  // Batch-17 hardening (workflow wljjmhkm9 fuzz analyzer): defensive
  // input handling. Type-guard + trim + lowercase normalize so the
  // same finding routed via different surfaces (CLI / hook / test) maps
  // to the same verdict regardless of whitespace / case noise.
  const rawCode: unknown = finding.code;
  if (typeof rawCode !== 'string' || rawCode.trim() === '') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug,
        code: typeof rawCode === 'string' ? rawCode : String(rawCode ?? 'null-or-invalid'),
        category: 'unrecognised',
        evidence: { file: finding.referenced_in },
        suggested_resolver: 'human',
        difficulty: 'easy',
      },
    };
  }
  // Trim only (NOT lowercase): existing comparisons use canonical
  // case literals like `'spec-only/orphan-AC'` where the AC stays
  // uppercase. Detector emits codes in canonical case; whitespace
  // trim is the realistic defensive measure.
  const code = rawCode.trim();

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
    // Strip `.specs/` prefix from spec_a/spec_b so resolver gets bare slugs.
    // Detector emits `.specs/<slug>` form (see reconcile.ts:1223-1224); the
    // cross-ref-linker resolver expects raw slugs to compute relative paths.
    const stripSpecsPrefix = (s: string | undefined): string | undefined =>
      s ? s.replace(/^\.?[\/\\]?\.specs[\/\\]/, '') : s;
    return {
      verdict: 'BACKLOG',
      entry: {
        slug,
        code,
        category: 'missing-cross-ref',
        evidence: {
          file: finding.referenced_in,
          spec_a: stripSpecsPrefix(finding.spec_a),
          spec_b: stripSpecsPrefix(finding.spec_b),
        },
        suggested_resolver: 'cross-ref-linker',
        difficulty: 'easy',
      },
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
    // PATH C pre-flight: run the same basename glob link-fixer would
    // run, BEFORE queueing the entry. 0 matches → no typo candidate
    // exists, link-fixer would deterministically bail with `no-match`.
    // Route to NOISE: keeps signal in the report without dispatching
    // futile resolver work. 1 match → existing dead-link-typo route
    // (link-fixer will succeed). 2+ matches → backlog as
    // `ambiguous-link` so a future disambiguator (or human) handles it.
    // Mirrors what impl-drift/missing-file does below.
    const matchCount = countBasenameMatches(repoRoot, target);
    if (matchCount === 0) {
      return {
        verdict: 'NOISE',
        noiseReason:
          'Markdown link target does not exist anywhere in repo — no typo candidate to repair. Fix by creating the file, marking OUT_OF_SCOPE, or removing the link.',
      };
    }
    if (matchCount >= 2) {
      return {
        verdict: 'BACKLOG',
        entry: {
          slug,
          code,
          category: 'ambiguous-link',
          evidence: { file: finding.referenced_in, target, occurrence_count: matchCount },
          suggested_resolver: 'human',
          difficulty: 'medium',
        },
      };
    }
    // matchCount === 1 OR repoRoot unavailable (matchCount === -1): typo-class for link-fixer
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

  // Deprecated-ref route — fired when a finding explicitly carries an
  // evidence.version field (signal that the target path was REMOVED in a
  // newer plugin/feature version with no canonical replacement). The
  // heuristic for AUTO-deciding wrap vs delete is complex (requires
  // knowing if an alternative exists), so this branch is intentionally
  // narrow: only routes when both the finding.code matches AND
  // evidence.version is present. Operators can also invoke manually via
  // `spec-backlog resolve --category deprecated-ref`.
  if (code === 'impl-drift/deprecated-ref') {
    return {
      verdict: 'BACKLOG',
      entry: {
        slug,
        code,
        category: 'deprecated-ref',
        evidence: {
          file: finding.referenced_in,
          referenced_in: finding.referenced_in,
          target_path: finding.expected_path,
          target: finding.expected_path,
          // The detector emits version via a non-standard channel — pass
          // through whatever the finding carries. resolver bails with
          // missing-evidence if version is absent.
          version: (finding as InputFinding & { version?: string }).version,
        },
        suggested_resolver: 'wrap-deprecated-ref',
        difficulty: 'easy',
      },
    };
  }

  // Extended routes (added after dogfood pass-2 surfaced 974 unrecognised).
  if (code === 'impl-drift/missing-file') {
    // Detector emits this for backtick-wrapped path references in spec prose
    // (e.g. `tools/foo.ts`), NOT markdown link syntax. See
    // .claude/skills/cross-spec-reconcile/scripts/reconcile.ts PATH_REF_RE
    // and findMissingFileReferences. link-fixer only handles [label](target)
    // syntax and bails 100% on backtick refs, so route there is wrong.
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
    // No mechanical resolver can fix this — needs human creative work
    // (create the file, mark FR as OUT_OF_SCOPE, or remove the reference).
    // Routing to NOISE keeps the signal in the report but stops polluting
    // the BACKLOG with entries that will deterministically bail.
    return {
      verdict: 'NOISE',
      noiseReason:
        'Spec references a path in backticks that does not exist on disk. No mechanical resolver applies — fix by adding the impl, marking OUT_OF_SCOPE, or removing the reference.',
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
