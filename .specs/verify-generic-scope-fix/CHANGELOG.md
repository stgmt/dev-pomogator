# Changelog

All notable changes to this feature will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-05-23

> Shipped via `extensions/scope-gate/` (PreToolUse hook `scope-gate-guard.ts` matched on Bash commits, plus `analyze-diff.ts` for skill-driven scope analysis). Shared utilities `scoreDiff` + marker-store live in `extensions/_shared/` (architecture deviation from the flat layout originally planned in this spec — cleaner: cross-extension primitives belong in `_shared/`).
>
> Skill `.claude/skills/verify-generic-scope-fix/SKILL.md` + rules `.claude/rules/scope-gate/{when-to-verify,escape-hatch-audit}.md` enforce the workflow. Tests: 5 files (`score-diff.test.ts`, `marker-store.test.ts`, `scope-gate.test.ts`, `stocktaking-incident.test.ts`, `plan-gate-scope-advisory.test.ts`) — all GREEN. Stocktaking-incident regression pin is the canonical reproducer that motivated this spec.
>
> Audit-spec on this spec: 0 ERRORS, 1 WARNING (meta-recursive — audit complains that this spec's own FR-1 is polymorphic across "variants" but lacks a Decision Table; the spec is itself ABOUT generic scope verification, so the warning is self-referential and non-blocking).

## [Unreleased]

### Added
- Initial spec authored (2026-04-23). 13 обязательных файлов + FIXTURES.md + scope-gate_SCHEMA.md + .feature.
- RESEARCH.md содержит полный incident timeline MR !100 PRODUCTS-20218 + H1-H8 root cause taxonomy + 5 missed code-signals + rejected alternatives (domain glossary, only-rule, only-hook).
- DESIGN.md documents **новый pattern для dev-pomogator**: `disable-model-invocation: true` skill frontmatter field (первый precedent).
- 12 BDD scenarios VSGF001_10..VSGF001_60 covering happy path / docs-only short-circuit / stale marker / escape hatch with audit / false-positive escapable / SKILL+extension.json integrity / non-git Bash pass-through.

### Reference
- Spec authored в ответ на reviewer (evolkov) feedback на webapp MR !100 + user request для "skill чтобы больше такого не было проеба никогда".
- Memory cross-references: `reference_stocktaking-incident-products-20218.md`, `feedback_code-evidence-trumps-domain-sense.md`, `feedback_single-incident-rules-over-generalize.md` (dev-pomogator auto-memory store).

## [0.1.0] - TBD

### Added
- Initial implementation — skill `verify-generic-scope-fix` + PreToolUse hook `scope-gate-guard` + 2 rules (when-to-verify, escape-hatch-audit)
- Extension `extensions/scope-gate/` with full manifest
- Unit tests for pure `scoreDiff()` + `marker-store` I/O
- E2E tests 1:1 с VSGF001_NN BDD scenarios
- Regression pin `tests/regressions/stocktaking-incident.test.ts` asserts `scoreDiff(stocktaking-diff) >= 4`
- Hyper-V scenario HV-scope-gate-01 for clean-Win regression
- CLAUDE.md glossary rows for `scope-gate/when-to-verify` + `scope-gate/escape-hatch-audit`
- `.claude/rules/plan-pomogator/cross-scope-coverage.md` "See also" cross-link
