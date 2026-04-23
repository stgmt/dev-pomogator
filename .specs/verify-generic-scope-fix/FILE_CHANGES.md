# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи после одобрения spec-а. См. также: [README.md](README.md), [DESIGN.md](DESIGN.md), [TASKS.md](TASKS.md).

## Extension artifacts (scope-gate)

| Path | Action | Reason |
|------|--------|--------|
| `extensions/scope-gate/extension.json` | create | [FR-9](FR.md#fr-9-integration-with-dev-pomogator-extension-system) — manifest с registration |
| `extensions/scope-gate/skills/verify-generic-scope-fix/SKILL.md` | create | [FR-1](FR.md#fr-1-skill-workflow--mechanical-reach-analysis-per-variant), [FR-8](FR.md#fr-8-skill-frontmatter--disable-model-invocation-pattern) — skill instructions + disable-model-invocation frontmatter |
| `extensions/scope-gate/tools/scope-gate/analyze-diff.ts` | create | [FR-1](FR.md#fr-1-skill-workflow--mechanical-reach-analysis-per-variant) — deterministic helper для skill: parseAddedVariants + reach analysis orchestration. Invoked via `npx tsx .dev-pomogator/tools/scope-gate/analyze-diff.ts` |
| `extensions/scope-gate/tools/scope-gate/scope-gate-guard.ts` | create | [FR-2](FR.md#fr-2-pretooluse-hook--block-commit-without-fresh-verification), [FR-3](FR.md#fr-3-escape-hatch-with-audit-trail), [FR-5](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl) — the PreToolUse hook |
| `extensions/_shared/scope-gate-score-diff.ts` | create | [FR-6](FR.md#fr-6-weighted-suspicionscore-heuristic), [FR-4](FR.md#fr-4-docstest-dampening--anti-over-application) — pure `scoreDiff()` + `isGuardFile()` + `detectGuardFiles()`. **Shared** между scope-gate / plan-pomogator / specs-workflow |
| `extensions/_shared/scope-gate-marker-store.ts` | create | [FR-5](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl) — atomic marker I/O + TTL + GC. **Shared** |
| `extensions/_shared/index.ts` | edit | Re-export scope-gate primitives через public API shared module |
| `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts` | edit | Phase 5 advisory: parse File Changes table, detect guard files via `detectGuardFiles()`, emit non-blocking stderr recommendation |
| `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` | edit | New check `SCOPE_GATE_CANDIDATE` in audit-spec: scans FILE_CHANGES.md paths, emits INFO finding if guard-file patterns detected |
| `extensions/scope-gate/rules/when-to-verify.md` | create | [FR-4](FR.md#fr-4-docstest-dampening--anti-over-application) counter to H1 — when to invoke skill / hard-OUT signals |
| `extensions/scope-gate/rules/escape-hatch-audit.md` | create | [FR-3](FR.md#fr-3-escape-hatch-with-audit-trail) — audit docs + anti-gaming guidance |

## Tests

| Path | Action | Reason |
|------|--------|--------|
| `tests/unit/score-diff.test.ts` | create | [FR-6](FR.md#fr-6-weighted-suspicionscore-heuristic) + [FR-4](FR.md#fr-4-docstest-dampening--anti-over-application) unit coverage; pure function; fast (<50ms) |
| `tests/unit/marker-store.test.ts` | create | [FR-5](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl) atomic write, TTL, diff-hash mismatch, session scoping, GC |
| `tests/e2e/scope-gate.test.ts` | create | 1:1 mapping to VSGF001_10..VSGF001_60 scenarios via `@feature1..@feature5` tags per `extension-test-quality.md` |
| `tests/e2e/scope-gate-helpers.ts` | create | `createTmpRepoWithDiff()`, `writeMarkerFile()`, `spawnHook()` per DESIGN.md BDD Test Infrastructure |
| `tests/regressions/stocktaking-incident.test.ts` | create | Regression pin — asserts `scoreDiff(F-1)` >= 4 forever. Defends against accidental weight changes losing the incident |
| `tests/fixtures/scope-gate/stocktaking-diff.patch` | create | F-1 fixture per [FIXTURES.md](FIXTURES.md#f-1-stocktaking-diffpatch) |
| `tests/fixtures/scope-gate/docs-only-diff.patch` | create | F-2 fixture |
| `tests/fixtures/scope-gate/fresh-marker.json.tpl` | create | F-3 fixture template |
| `tests/fixtures/scope-gate/stale-marker.json.tpl` | create | F-4 fixture template |
| `tests/fixtures/scope-gate/escape-hatch-msg.txt` | create | F-5 fixture |
| `tests/fixtures/scope-gate/switch-case-diff.patch` | create | F-6 fixture |
| `tests/fixtures/scope-gate/non-guard-enum-diff.patch` | create | F-7 fixture |

## Hyper-V scenario

| Path | Action | Reason |
|------|--------|--------|
| `tests/hyperv-scenarios/HV-scope-gate-01.yaml` | create | Clean Win VM regression: install dev-pomogator + scope-gate, drop stocktaking diff, verify deny message shown; per `hyperv-test-runner` skill convention |

## Documentation & rule glossary

| Path | Action | Reason |
|------|--------|--------|
| `CLAUDE.md` | edit | Add 2 rows в Rules > Triggered table: `scope-gate/when-to-verify` + `scope-gate/escape-hatch-audit` — per `claude-md-glossary.md` rule |
| `.claude/rules/plan-pomogator/cross-scope-coverage.md` | edit | Add `## See also` line linking to `scope-gate/when-to-verify.md` (adjacent rule cross-reference) |

## Spec itself (already present in this commit)

> Note: this spec's own files (`.specs/verify-generic-scope-fix/*`) already exist from scaffold-spec.ts. Listed here для полноты и для audit traceability.

| Path | Action | Reason |
|------|--------|--------|
| `.specs/verify-generic-scope-fix/README.md` | create | Scaffolded + to-be-finalized in Finalization phase |
| `.specs/verify-generic-scope-fix/USER_STORIES.md` | create | Filled in Discovery |
| `.specs/verify-generic-scope-fix/USE_CASES.md` | create | Filled in Discovery |
| `.specs/verify-generic-scope-fix/RESEARCH.md` | create | Filled in Discovery + Context |
| `.specs/verify-generic-scope-fix/REQUIREMENTS.md` | create | Traceability index |
| `.specs/verify-generic-scope-fix/FR.md` | create | 9 FRs |
| `.specs/verify-generic-scope-fix/NFR.md` | create | Performance/Security/Reliability/Usability + Assumptions/Risks/OutOfScope |
| `.specs/verify-generic-scope-fix/ACCEPTANCE_CRITERIA.md` | create | EARS per FR |
| `.specs/verify-generic-scope-fix/DESIGN.md` | create | Architecture + algorithms + BDD Test Infrastructure + Reuse Plan |
| `.specs/verify-generic-scope-fix/FIXTURES.md` | create | 7 fixtures F-1..F-7 inventory |
| `.specs/verify-generic-scope-fix/verify-generic-scope-fix_SCHEMA.md` | create | Marker JSON + hook I/O + extension.json schemas |
| `.specs/verify-generic-scope-fix/FILE_CHANGES.md` | create | This file |
| `.specs/verify-generic-scope-fix/TASKS.md` | create | To be filled в Finalization |
| `.specs/verify-generic-scope-fix/CHANGELOG.md` | create | v0.1.0 initial |
| `.specs/verify-generic-scope-fix/verify-generic-scope-fix.feature` | create | 11 VSGF001_NN scenarios |
| `.specs/verify-generic-scope-fix/AUDIT_REPORT.md` | create | Will be created в Phase 3+ Audit |
| `.specs/verify-generic-scope-fix/.progress.json` | create | Managed by spec-status.ts |

## Out of Scope

Следующие files НЕ создаются в рамках этой спеки (deferred для future task):

- Memory refinement в webapp-specific memory store (`feedback_jira_literal_scope.md` nuance-section) — это target-project task, не dev-pomogator scope-gate
- Install scripts / onboarding docs для scope-gate extension adoption в webapp или other projects
- AST-based reach analysis (tree-sitter integration) — future enhancement past v0.1.0
- Automatic CLAUDE.md injection в target projects — glossary row добавляется в dev-pomogator CLAUDE.md, targets обновляются maintainer-ом при adoption
