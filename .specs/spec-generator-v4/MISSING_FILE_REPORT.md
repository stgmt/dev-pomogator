# Missing-File Findings Report

Generated: 2026-05-31T17:23:39.508Z
Repo: dev-pomogator
Source: `reconcileLight()` (mechanical light-mode pass, all 28 codes)
Scope: `code === 'impl-drift/missing-file'` only

---

## Executive Summary

- **Total missing-file findings:** 965
- **Source specs (slugs emitting findings):** 34
- **Distinct expected paths:** 293
- **Distinct referencing files:** 199

### Top-3 Source Specs (by finding volume)

| Spec slug | Findings | Share |
| --- | --- | --- |
| [pomogator-doctor](../pomogator-doctor/FR.md) | 137 | 14.2% |
| codex-cli-support | 112 | 11.6% |
| personal-pomogator | 96 | 9.9% |

### Top-3 Target Path Prefixes

| Prefix | Findings | Share |
| --- | --- | --- |
| src/ | 529 | 54.8% |
| tests/ | 401 | 41.6% |
| tools/ | 32 | 3.3% |

### Breakdown by Recommendation

| Recommendation | Findings | Share |
| --- | --- | --- |
| UNCLEAR | 557 | 57.7% |
| RENAME_UPDATE | 158 | 16.4% |
| DELETE_REFERENCE | 143 | 14.8% |
| RECREATE | 99 | 10.3% |
| OUT_OF_SCOPE | 8 | 0.8% |

**Headline take:** the dominant recommendation is **UNCLEAR** at 557 findings (57.7%).

---

## Group Tables

### By Referencing Spec (top 12)

| Spec slug | Findings |
| --- | --- |
| pomogator-doctor | 137 |
| codex-cli-support | 112 |
| personal-pomogator | 96 |
| spec-generator-v4 | 79 |
| [install-diagnostics](../install-diagnostics/FR.md) | 68 |
| [dev-pomogator-canonical-plugin](../dev-pomogator-canonical-plugin/FR.md) | 58 |
| [strong-tests](../strong-tests/FR.md) | 39 |
| [test-statusline](../test-statusline/FR.md) | 35 |
| [extension-beta-flag](../extension-beta-flag/FR.md) | 33 |
| [skill-listing-budget](../skill-listing-budget/FR.md) | 33 |
| onboard-repo-phase0 | 30 |
| [claude-mem-integration](../claude-mem-integration/FR.md) | 29 |


*(22 more specs with smaller counts omitted; full data in tmp report.)*

### By Target Path Prefix

| Prefix | Findings |
| --- | --- |
| src/ | 529 |
| tests/ | 401 |
| tools/ | 32 |
| lib/ | 3 |

### By Target File Kind

| Extension | Findings |
| --- | --- |
| .ts | 685 |
| no-extension | 81 |
| .feature | 47 |
| .md | 44 |
| other | 28 |
| .py | 21 |
| .json | 20 |
| .js | 14 |
| .yaml | 11 |
| .cjs | 9 |
| .tsx | 4 |
| .sh | 1 |

### By Referenced-in File Kind

| Spec file | Findings |
| --- | --- |
| DESIGN.md | 188 |
| TASKS.md | 184 |
| FILE_CHANGES.md | 172 |
| RESEARCH.md | 136 |
| FIXTURES.md | 65 |
| OWNERSHIP_RECOMMENDATION.md | 38 |
| README.md | 37 |
| FR.md | 37 |
| CHANGELOG.md | 31 |
| ACCEPTANCE_CRITERIA.md | 22 |
| USE_CASES.md | 18 |
| USER_STORIES.md | 10 |

### V1-style Path Heuristic

| Pattern | Findings |
| --- | --- |
| has-v1 | 21 |

---

## Per-Recommendation Sections

### RECREATE — 99 findings

Spec explicitly requires a file that does not exist on disk; production code expected. **High risk** — needs human to confirm whether the missing file should be authored or whether the FR/AC was descoped.

**Sample findings (up to 10):**

| referenced_in | expected_path | reason |
| --- | --- | --- |
| `.specs/claude-mem-integration/TASKS.md:38` | `src/installer/index.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:43` | `src/installer/claude.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:53` | `src/installer/memory.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:66` | `src/installer/memory.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:82` | `src/installer/memory.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:96` | `src/installer/index.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:130` | `src/installer/memory.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/codex-cli-support/TASKS.md:46` | `src/config/schema.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/codex-cli-support/TASKS.md:48` | `src/index.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/codex-cli-support/TASKS.md:48` | `src/installer/index.ts` | production-code path expected by active FR/AC/TASK |

### DELETE_REFERENCE — 143 findings

Spec prose references a file that should no longer exist (v1 leftover, historical RESEARCH/CHANGELOG mention, or refactor remnant). Recommend updating/removing the prose line.

**Sample findings (up to 10):**

| referenced_in | expected_path | reason |
| --- | --- | --- |
| `.specs/architecture-decision-builder/RESEARCH.md:79` | `tests/specs-workflow/` | reference in historical doc (RESEARCH/CHANGELOG) |
| `.specs/auto-capture/RESEARCH.md:104` | `src/installer/claude.ts` | reference in historical doc (RESEARCH/CHANGELOG) |
| `.specs/claude-mem-integration/RESEARCH.md:12` | `src/installer/memory.ts` | reference in historical doc (RESEARCH/CHANGELOG) |
| `.specs/claude-mem-integration/RESEARCH.md:68` | `src/installer/index.ts` | reference in historical doc (RESEARCH/CHANGELOG) |
| `.specs/claude-mem-integration/RESEARCH.md:70` | `src/updater/index.ts` | reference in historical doc (RESEARCH/CHANGELOG) |
| `.specs/claude-mem-integration/RESEARCH.md:71` | `src/updater/standalone.ts` | reference in historical doc (RESEARCH/CHANGELOG) |
| `.specs/claude-mem-integration/RESEARCH.md:72` | ~~`tests/e2e/claude-installer.test.ts`~~ | reference in historical doc (RESEARCH/CHANGELOG) |
| `.specs/claude-mem-integration/RESEARCH.md:99` | `src/installer/memory.ts` | reference in historical doc (RESEARCH/CHANGELOG) |
| `.specs/codex-cli-support/RESEARCH.md:157` | `src/config/schema.ts` | reference in historical doc (RESEARCH/CHANGELOG) |
| `.specs/codex-cli-support/RESEARCH.md:157` | `src/index.ts` | reference in historical doc (RESEARCH/CHANGELOG) |

### RENAME_UPDATE — 158 findings

Target file exists under a different path in the repo (same basename). Recommend updating the path string in the spec to the actual location.

**Sample findings (up to 10):**

| referenced_in | expected_path | reason |
| --- | --- | --- |
| `.specs/auto-capture/RESEARCH.md:105` | `src/installer/shared.ts` | basename exists at .claude/skills/[skills-rules-optimizer](../skills-rules-optimizer/FR.md)/scripts/shared.ts → `.claude/skills/skills-rules-optimizer/scripts/shared.ts` |
| `.specs/claude-mem-integration/DESIGN.md:97` | `src/installer/report.ts` | basename exists at .claude/skills/skills-rules-optimizer/scripts/report.ts → `.claude/skills/skills-rules-optimizer/scripts/report.ts` |
| `.specs/claude-mem-integration/DESIGN.md:98` | `src/utils/logger.ts` | basename exists at tools/steps-validator/logger.ts → `tools/steps-validator/logger.ts` |
| `.specs/claude-mem-integration/FILE_CHANGES.md:7` | `src/installer/report.ts` | basename exists at .claude/skills/skills-rules-optimizer/scripts/report.ts → `.claude/skills/skills-rules-optimizer/scripts/report.ts` |
| `.specs/claude-mem-integration/RESEARCH.md:67` | `src/utils/logger.ts` | basename exists at tools/steps-validator/logger.ts → `tools/steps-validator/logger.ts` |
| `.specs/claude-mem-integration/RESEARCH.md:69` | `src/installer/report.ts` | basename exists at .claude/skills/skills-rules-optimizer/scripts/report.ts → `.claude/skills/skills-rules-optimizer/scripts/report.ts` |
| `.specs/claude-mem-integration/TASKS.md:72` | `src/utils/logger.ts` | basename exists at tools/steps-validator/logger.ts → `tools/steps-validator/logger.ts` |
| `.specs/claude-mem-integration/TASKS.md:96` | `src/installer/report.ts` | basename exists at .claude/skills/skills-rules-optimizer/scripts/report.ts → `.claude/skills/skills-rules-optimizer/scripts/report.ts` |
| `.specs/codex-cli-support/DESIGN.md:37` | `src/installer/shared.ts` | basename exists at .claude/skills/skills-rules-optimizer/scripts/shared.ts → `.claude/skills/skills-rules-optimizer/scripts/shared.ts` |
| `.specs/codex-cli-support/DESIGN.md:50` | `src/installer/shared.ts` | basename exists at .claude/skills/skills-rules-optimizer/scripts/shared.ts → `.claude/skills/skills-rules-optimizer/scripts/shared.ts` |

### OUT_OF_SCOPE — 8 findings

Reference is inside a fenced code block, glob pattern, or template placeholder; not a literal expectation. Recommend adding `[OUT_OF_SCOPE]` marker or rewording.

**Sample findings (up to 10):**

| referenced_in | expected_path | reason |
| --- | --- | --- |
| `.specs/onboard-repo-phase0/DESIGN.md:141` | `tests/e2e/onboard-repo/fixtures/*` | glob pattern — likely descriptive, not a literal path |
| `.specs/personal-pomogator/DESIGN.md:67` | `src/installer/*.ts` | glob pattern — likely descriptive, not a literal path |
| `.specs/personal-pomogator/DESIGN.md:67` | `src/scripts/*.cjs` | glob pattern — likely descriptive, not a literal path |
| `.specs/pomogator-doctor/DESIGN.md:15` | `src/doctor/checks/*.ts` | glob pattern — likely descriptive, not a literal path |
| `.specs/spec-generator-v4/CHANGELOG.md:481` | `tools/removed_dir/foo*.ts` | reference inside fenced code block (example) |
| `.specs/spec-generator-v4/FIXTURES.md:19` | `tests/fixtures/v4-self-test/features/*.feature` | glob pattern — likely descriptive, not a literal path |
| `.specs/spec-workflow-feature-steps-validation/USE_CASES.md:8` | `tests/steps/*.ts` | glob pattern — likely descriptive, not a literal path |
| `.specs/worktree-setup/FIXTURES.md:12` | `tests/fixtures/worktree-setup/gh-mock/*.json` | glob pattern — likely descriptive, not a literal path |

### UNCLEAR — 557 findings

No automated heuristic matched. Requires domain-expert review to decide.

**Sample findings (up to 10):**

| referenced_in | expected_path | reason |
| --- | --- | --- |
| `.specs/architecture-decision-builder/DESIGN.md:214` | `tests/specs-workflow/` | no automated heuristic matched |
| `.specs/architecture-decision-builder/TASKS.md:54` | `tests/specs-workflow/` | no automated heuristic matched |
| `.specs/architecture-decision-builder/TASKS.md:57` | `tests/e2e/architecture-decision/architecture-decision-builder.feature` | no automated heuristic matched |
| `.specs/auto-capture/DESIGN.md:355` | `tests/e2e/fixtures/queue-setup.ts` | no automated heuristic matched |
| `.specs/auto-capture/DESIGN.md:356` | `tests/e2e/fixtures/queue-cleanup.ts` | no automated heuristic matched |
| `.specs/auto-capture/OWNERSHIP_RECOMMENDATION.md:7` | `src/installer/claude.ts` | no automated heuristic matched |
| `.specs/auto-capture/OWNERSHIP_RECOMMENDATION.md:18` | `src/installer/claude.ts` | no automated heuristic matched |
| `.specs/auto-capture/TASKS.md:40` | `tests/e2e/fixtures/queue-setup.ts` | no automated heuristic matched |
| `.specs/auto-capture/TASKS.md:43` | `tests/e2e/fixtures/queue-cleanup.ts` | no automated heuristic matched |
| `.specs/claude-mem-integration/DESIGN.md:85` | ~~`tests/e2e/claude-installer.test.ts`~~ | no automated heuristic matched |

---

## Auto-fixer Template Candidates

A group qualifies if it has **≥10 findings** AND the sample set shows the same mechanical pattern (e.g. all are basename-rename targets, or all are `extensions/` v1 leftovers). These are the low-risk groups where a script can rewrite many findings at once.

| Recommendation | Prefix | Kind | Count | Suggested template |
| --- | --- | --- | --- | --- |
| UNCLEAR | src/ | .ts | 194 | (manual: heterogeneous group, no single mechanical rewrite) |
| UNCLEAR | tests/ | .ts | 165 | (manual: heterogeneous group, no single mechanical rewrite) |
| RENAME_UPDATE | src/ | .ts | 97 | lookup basename → unique repo path; rewrite the path string in the spec |
| RECREATE | src/ | .ts | 90 | (manual: heterogeneous group, no single mechanical rewrite) |
| DELETE_REFERENCE | src/ | .ts | 89 | remove the line OR rewrite as prose without backtick-path |
| UNCLEAR | tests/ | .feature | 43 | (manual: heterogeneous group, no single mechanical rewrite) |
| UNCLEAR | tests/ | .md | 41 | (manual: heterogeneous group, no single mechanical rewrite) |
| UNCLEAR | tests/ | no-extension | 39 | (manual: heterogeneous group, no single mechanical rewrite) |
| UNCLEAR | tests/ | other | 22 | (manual: heterogeneous group, no single mechanical rewrite) |
| DELETE_REFERENCE | tests/ | .ts | 19 | remove the line OR rewrite as prose without backtick-path |
| UNCLEAR | tests/ | .json | 15 | (manual: heterogeneous group, no single mechanical rewrite) |
| RENAME_UPDATE | tests/ | .py | 14 | lookup basename → unique repo path; rewrite the path string in the spec |
| UNCLEAR | src/ | no-extension | 13 | (manual: heterogeneous group, no single mechanical rewrite) |
| RENAME_UPDATE | src/ | .js | 13 | lookup basename → unique repo path; rewrite the path string in the spec |
| DELETE_REFERENCE | src/ | no-extension | 12 | remove the line OR rewrite as prose without backtick-path |
| RENAME_UPDATE | tests/ | .yaml | 10 | lookup basename → unique repo path; rewrite the path string in the spec |

---

## Manual Triage List

656 findings need human review (RECREATE: 99, UNCLEAR: 557).

**Rough estimate:** assuming 2 min/finding to decide recreate-vs-descope:
- Best case (most are descopes): ~8 hours
- Worst case (most need recreation + impl): multi-day cleanup pass; consider chunking by spec slug

### Top specs in manual-triage backlog

| Spec | RECREATE | UNCLEAR | Total |
| --- | --- | --- | --- |
| codex-cli-support | 10 | 80 | 90 |
| spec-generator-v4 | 4 | 69 | 73 |
| personal-pomogator | 24 | 45 | 69 |
| pomogator-doctor | 16 | 43 | 59 |
| install-diagnostics | 8 | 42 | 50 |
| strong-tests | 2 | 36 | 38 |
| dev-pomogator-canonical-plugin | 2 | 29 | 31 |
| extension-beta-flag | 4 | 18 | 22 |
| skill-listing-budget | 3 | 19 | 22 |
| specs-management-as-skill | 0 | 20 | 20 |
| test-statusline | 3 | 17 | 20 |
| global-dir-guard | 3 | 16 | 19 |
| onboard-repo-phase0 | 1 | 17 | 18 |
| claude-mem-integration | 7 | 9 | 16 |
| cursor-dead-code-cleanup | 8 | 6 | 14 |

### Sample RECREATE findings (first 15)

| referenced_in | expected_path | reason |
| --- | --- | --- |
| `.specs/claude-mem-integration/TASKS.md:38` | `src/installer/index.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:43` | `src/installer/claude.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:53` | `src/installer/memory.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:66` | `src/installer/memory.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:82` | `src/installer/memory.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:96` | `src/installer/index.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/claude-mem-integration/TASKS.md:130` | `src/installer/memory.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/codex-cli-support/TASKS.md:46` | `src/config/schema.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/codex-cli-support/TASKS.md:48` | `src/index.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/codex-cli-support/TASKS.md:48` | `src/installer/index.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/codex-cli-support/TASKS.md:50` | `src/installer/extensions.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/codex-cli-support/TASKS.md:50` | `src/updater/github.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/codex-cli-support/TASKS.md:64` | `src/installer/codex.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/codex-cli-support/TASKS.md:78` | `src/installer/codex-hook-dispatch.ts` | production-code path expected by active FR/AC/TASK |
| `.specs/codex-cli-support/TASKS.md:110` | `src/installer/memory.ts` | production-code path expected by active FR/AC/TASK |

### Sample UNCLEAR findings (first 15)

| referenced_in | expected_path | reason |
| --- | --- | --- |
| `.specs/architecture-decision-builder/DESIGN.md:214` | `tests/specs-workflow/` | no automated heuristic matched |
| `.specs/architecture-decision-builder/TASKS.md:54` | `tests/specs-workflow/` | no automated heuristic matched |
| `.specs/architecture-decision-builder/TASKS.md:57` | `tests/e2e/architecture-decision/architecture-decision-builder.feature` | no automated heuristic matched |
| `.specs/auto-capture/DESIGN.md:355` | `tests/e2e/fixtures/queue-setup.ts` | no automated heuristic matched |
| `.specs/auto-capture/DESIGN.md:356` | `tests/e2e/fixtures/queue-cleanup.ts` | no automated heuristic matched |
| `.specs/auto-capture/OWNERSHIP_RECOMMENDATION.md:7` | `src/installer/claude.ts` | no automated heuristic matched |
| `.specs/auto-capture/OWNERSHIP_RECOMMENDATION.md:18` | `src/installer/claude.ts` | no automated heuristic matched |
| `.specs/auto-capture/TASKS.md:40` | `tests/e2e/fixtures/queue-setup.ts` | no automated heuristic matched |
| `.specs/auto-capture/TASKS.md:43` | `tests/e2e/fixtures/queue-cleanup.ts` | no automated heuristic matched |
| `.specs/claude-mem-integration/DESIGN.md:85` | ~~`tests/e2e/claude-installer.test.ts`~~ | no automated heuristic matched |
| `.specs/claude-mem-integration/DESIGN.md:96` | `src/installer/claude.ts` | no automated heuristic matched |
| `.specs/claude-mem-integration/FILE_CHANGES.md:5` | `src/installer/index.ts` | no automated heuristic matched |
| `.specs/claude-mem-integration/FILE_CHANGES.md:6` | `src/installer/memory.ts` | no automated heuristic matched |
| `.specs/claude-mem-integration/FILE_CHANGES.md:8` | ~~`tests/e2e/claude-installer.test.ts`~~ | no automated heuristic matched |
| `.specs/claude-mem-integration/OWNERSHIP_RECOMMENDATION.md:7` | `src/installer/index.ts` | no automated heuristic matched |

---

## Methodology Notes

- **Reconcile source:** `.claude/skills/cross-spec-reconcile/scripts/reconcile.ts` → `reconcileLight()` light-mode pass (no LLM, mechanical only).
- **Path-ref regex:** `PATH_REF_RE = /\`(?:src|tools|tests|lib)\/[\w./-]+\*?(?:\.[\w]+)?\`/g` — only matches backtick-quoted paths starting with one of the four known roots.
- **Path resolution:** `pathExistsResolvingDetail()` resolves relative to `repoRoot` (and optional `implRoots`); supports trailing `*` glob. A finding fires when neither literal nor glob-prefix matches.
- **Basename index:** scan of `tools/ src/ tests/ scripts/ .claude/ lib/` (excluding `node_modules / .git / dist`) collecting basename → repo-relative-paths map. Used for `RENAME_UPDATE` hints.
- **Code-fence detection:** per-file ````...```` block tracking; if the referenced line is inside a fence, recommended as `OUT_OF_SCOPE`.
- **Heuristics applied in order:**
  1. In fenced code block → `OUT_OF_SCOPE`
  2. Placeholder/template (`{x}`, `<x>`, `TBD`, `your-slug`) → `OUT_OF_SCOPE`
  3. Unique basename match elsewhere → `RENAME_UPDATE`
  4. `extensions/` prefix → `DELETE_REFERENCE` (v1 leftover)
  5. RESEARCH.md / CHANGELOG.md prose → `DELETE_REFERENCE`
  6. Glob `*` in target → `OUT_OF_SCOPE` (descriptive)
  7. Active FR/AC/TASK pointing at `tools/` or `src/` code → `RECREATE`
  8. Else → `UNCLEAR`
- **Limitations:** heuristics are coarse. The `UNCLEAR` bucket and the `RECREATE` bucket are deliberately conservative — they err on the side of routing to humans rather than auto-rewriting.
---

## Cross-Tab: Recommendation × Spec (top-10 specs)

How the recommendation mix differs per spec. A spec dominated by `RENAME_UPDATE` is a quick automated win; one dominated by `UNCLEAR` needs domain triage.

| Spec | RECREATE | DELETE_REF | RENAME_UPD | OUT_OF_SCOPE | UNCLEAR | Total |
| --- | --- | --- | --- | --- | --- | --- |
| pomogator-doctor | 16 | 12 | 65 | 1 | 43 | 137 |
| codex-cli-support | 10 | 12 | 10 | 0 | 80 | 112 |
| personal-pomogator | 24 | 14 | 11 | 2 | 45 | 96 |
| spec-generator-v4 | 4 | 4 | 0 | 2 | 69 | 79 |
| install-diagnostics | 8 | 18 | 0 | 0 | 42 | 68 |
| dev-pomogator-canonical-plugin | 2 | 20 | 7 | 0 | 29 | 58 |
| strong-tests | 2 | 1 | 0 | 0 | 36 | 39 |
| test-statusline | 3 | 0 | 15 | 0 | 17 | 35 |
| extension-beta-flag | 4 | 11 | 0 | 0 | 18 | 33 |
| skill-listing-budget | 3 | 6 | 5 | 0 | 19 | 33 |

---

## Hottest Missing Targets (most-referenced non-existent paths)

These are the expected paths that appear most frequently across all specs. If a single path appears in 5+ specs, deciding RECREATE vs DELETE for it has outsized leverage.

| Expected path | Ref count | # Specs | Sample specs |
| --- | --- | --- | --- |
| `src/installer/claude.ts` | 50 | 11 | auto-capture, claude-mem-integration, dev-pomogator-canonical-plugin … |
| ~~`tests/e2e/claude-installer.test.ts`~~ | 33 | 6 | claude-mem-integration, codex-cli-support, extension-beta-flag … |
| `src/index.ts` | 31 | 6 | codex-cli-support, dev-pomogator-canonical-plugin, extension-beta-flag … |
| `src/installer/extensions.ts` | 31 | 8 | codex-cli-support, dev-pomogator-canonical-plugin, extension-beta-flag … |
| `src/installer/memory.ts` | 28 | 7 | claude-mem-integration, codex-cli-support, cursor-dead-code-cleanup … |
| `src/updater/index.ts` | 26 | 8 | claude-mem-integration, codex-cli-support, cursor-dead-code-cleanup … |
| `src/installer/index.ts` | 22 | 5 | claude-mem-integration, codex-cli-support, extension-beta-flag … |
| `src/installer/shared.ts` | 20 | 5 | auto-capture, codex-cli-support, global-dir-guard … |
| `src/config/schema.ts` | 18 | 5 | codex-cli-support, dev-pomogator-canonical-plugin, extension-beta-flag … |
| ~~`tests/features/core/CORE003_claude-installer.feature`~~ | 18 | 2 | install-diagnostics, skill-listing-budget |
| `src/updater/hook-migration.ts` | 13 | 3 | dev-pomogator-canonical-plugin, personal-pomogator, skill-rule-customization |
| `src/scripts/tsx-runner.js` | 13 | 4 | personal-pomogator, test-statusline, tui-test-runner … |
| `src/installer/report.ts` | 9 | 2 | claude-mem-integration, skill-listing-budget |
| `src/installer/uninstall-project.ts` | 8 | 2 | dev-pomogator-canonical-plugin, personal-pomogator |
| `src/installer/gitignore.ts` | 8 | 3 | dev-pomogator-canonical-plugin, personal-pomogator, pomogator-doctor |
| `src/utils/atomic-json.ts` | 8 | 2 | personal-pomogator, skill-listing-budget |
| `src/doctor/` | 8 | 1 | pomogator-doctor |
| `src/doctor/reporter.ts` | 8 | 1 | pomogator-doctor |
| ~~`tests/e2e/pomogator-doctor.test.ts`~~ | 8 | 1 | pomogator-doctor |
| `src/installer/skill-budget.ts` | 8 | 1 | skill-listing-budget |
| `tests/e2e/strong-tests-jit.test.ts` | 8 | 1 | strong-tests |
| ~~`tests/e2e/test-statusline.test.ts`~~ | 8 | 2 | test-statusline, tui-statusline-mode |
| `src/updater/github.ts` | 7 | 2 | codex-cli-support, dev-pomogator-canonical-plugin |
| `src/installer/` | 7 | 5 | codex-cli-support, onboard-repo-phase0, personal-pomogator … |
| `src/installer/settings-local.ts` | 7 | 2 | dev-pomogator-canonical-plugin, personal-pomogator |

---

## Recommended Cleanup Roadmap

Suggested order of operations for a human-led cleanup pass, optimised for **lowest-risk-first** so the volume drops quickly before the hard decisions:

1. **Phase A (mechanical) — RENAME_UPDATE batch.** Script reads the report, replaces `src/installer/<file>.ts` → actual repo path (e.g. `.claude/skills/skills-rules-optimizer/scripts/<file>.ts`) across all referencing specs. Per the template table above, the `RENAME_UPDATE | src/ | .ts` group alone covers a large chunk of findings.
2. **Phase B (mechanical) — DELETE_REFERENCE in historical docs.** Strip backtick-path mentions in `RESEARCH.md` / `CHANGELOG.md` of removed code paths (these are historical artefacts; the spec already shipped). Limit auto-rewrite to the `DELETE_REFERENCE | * | *` template-candidate rows.
3. **Phase C (mechanical) — OUT_OF_SCOPE markers.** For glob targets and fenced-code-block examples, append `[OUT_OF_SCOPE: descriptive only]` on the referencing line. Small batch (`OUT_OF_SCOPE` group) but cheap.
4. **Phase D (semi-mechanical) — UNCLEAR sweep per spec.** Work top-down through the Manual Triage spec list. For each spec, batch-read its referencing files, decide whether the missing paths are (a) deliverables that were descoped (→ rewrite spec) or (b) deliverables that should ship (→ RECREATE).
5. **Phase E (high-touch) — RECREATE decisions.** These are FR/AC/TASK-cited paths that the spec actively claims as production code. Each needs a human call: implement, or downgrade FR to OUT_OF_SCOPE.

After Phases A–C the report should shrink by roughly 30–40%, leaving the genuinely-human-judgment surface (UNCLEAR + RECREATE) for Phases D–E.

