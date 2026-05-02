# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Initial spec scaffolded для feature skills-rules-optimizer (расширение rules-optimizer на `.claude/skills/*/SKILL.md`)
- 9 FRs (FR-1 — FR-9) + 2 OUT_OF_SCOPE (FR-10 embeddings, FR-11 auto-apply)
- 8 EARS Acceptance Criteria (AC-1 — AC-8)
- 24 CHK traceability rows (FR + AC + @feature/UC links)
- Risk Assessment с 5 рисками (H1-H5: sub-agent malformed output, ratchet false-positive, rename breakage, Jaccard FP, hot reload)
- Research grounding: 5 OSS implementations (jkitchin/skillz, L-Qun/EvoClaude, connorblack/skill-tools, darwin-skill, claude-skills-linter) + CASCADE paper (arxiv:2512.23880)
- Architectural decisions (3 в DESIGN.md): sub-agent envelope pattern, triple-axis Jaccard pre-filter, ratchet mandatory

### Changed
- N/A — initial spec creation

### Fixed
- N/A — initial spec creation

## [0.1.0] - TBD

### Added
- Atomic git mv `rules-optimizer` → `skills-rules-optimizer` (preserves history)
- New scripts: `audit-skills.ts`, `detect-overlap.ts`, `merge-skills.ts`, `verify-merge.ts`
- New references: `merge-prompt-template.md` (jkitchin/skillz attribution), `ratchet-scoring.md`, `skill-overlap-detection.md`
- Extended `shared.ts` с `Asset` interface + `parseFrontmatterFlexible()`
- Extended `audit.ts` как dispatcher (rules + skills routing)
- Extended `check-antipatterns.ts` со skill antipatterns (transitive references, oversize, missing TOC)
- Extended `report.ts` с aggregated rules + skills findings
- Wire-up `/suggest-rules` Phase 6: skill audit step + aggregate report
- 6 test fixtures + 4 test files (skills-rules-optimizer-{audit,overlap,merge,rules-compat}.test.ts)
- 8 BDD scenarios (@feature1-8)

### Changed
- `extensions/suggest-rules/extension.json` version bump 1.9.0 → 1.10.0
- `CLAUDE.md` глоссарий: rules-optimizer mentions → skills-rules-optimizer

### Fixed
- Codifies existing `skill-allowed-tools-audit.md` rule into automated check (FR-3)
- Closes detection gap: cross-skill overlap previously invisible до manual review
