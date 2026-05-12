# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Phase 1 Discovery: 5 user stories (3 P1 + 2 P2), 5 use cases, RESEARCH.md with empirical citations (Schäfer arXiv 2406.18181, Anthropic Red Team PBT 2026, Meta ACH engineering.fb.com 2025-09-30, OutSight AI medium, Ghiringhelli dev.to, honnibal claude-skills mutation+hypothesis), Risk Assessment with 7 risks
- Phase 2 Requirements: 5 FRs (Greenfield PBT, Audit 8-pattern catalogue, Mutation-feedback loop, Multi-stack auto-detect, 12-point self-eval gate), NFR sections (P1-P3, S1-S3, R1-R4, U1-U4), 8 EARS acceptance criteria, DESIGN.md with 5 Key Decisions (Mutation chosen / PBT primary / Threshold 70% / TS+Python primary / Separate skill from tests-create-update), CHK traceability matrix with 15 CHKs, REVIEW_NOTES.md mid-phase spec-review smoke test (P0=0 P1=0 P2=2 logged)
- Phase 3 Finalization: TASKS.md with 17 atomic tasks across Phase 0-3 (Red-Green-Refactor), FILE_CHANGES.md with 10 file paths, strong-tests.feature with 5 (extended to 8 in Phase 7) BDD scenarios TESTQUAL001_01..05 (+ 06..08) mapping 1:1 to vitest tests
- Phase 4 Implementation (planned): skill body at .claude/skills/strong-tests/ — SKILL.md (8 sections), references/anti-patterns.md, references/tooling-setup.md, scripts/run-mutation.ts
- Phase 5 Verification (planned): extension.json wiring, layout-validate, skills-rules-optimizer audit, bidirectional cross-link with tests-create-update
- Phase 6 Report (planned): .specs/strong-tests/report.html (8 sections, semantic HTML5, light/dark CSS, no JS, no emojis)
- Phase 8 v0.3.0 .NET / C# expansion (2026-05-12): FR-7 detection scope расширен с TS+Python на TS+Python+C# / .NET. Detector `.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts` получает три новые regex константы (COLLECTION_CS / FUNCTION_CS / SUPPRESS_CS) + ветка `'csharp'` в detectStack / scan / nestedLoopCount + расширение type union на `'ts' | 'python' | 'csharp'`. Поддерживаемые collection types: List<T>, IList<T>, IEnumerable<T>, IReadOnly* варианты, ICollection<T>, Dictionary<K,V>, IDictionary<K,V>, HashSet<T>, ISet<T>, Queue<T>, Stack<T>, T[] + async Task<...> / ValueTask<...> wrappers. Nested loop detection считает оба `for (...)` и `foreach (...)`. PostToolUse hook `posttool-jit.ts` обновляет PRODUCTION_INCLUDE с `.cs` extension и TEST_EXCLUDE с C# test patterns (Steps.cs Reqnroll, Tests.cs xUnit, Test.cs NUnit, _test.cs, capital Tests/ folder). Suppression comment `// strong-tests:skip <reason>` (identical TS syntax) с reason length validation. Spec: AC-7 +3 EARS scenarios (C# production detection / test exclusion / suppression), CHK-FR7-07 row, SCHEMA stack enum +csharp + C# grammar section, strong-tests.feature +TESTQUAL001_09 scenario, TASKS Phase 5 (T25-T28), README scenario count 8→9. Smoke testing проверил end-to-end: production `.cs` → additionalContext emitted; Tests/ folder → excluded; Steps.cs → excluded. Known limitations документированы в Out of Scope (multi-line signatures, expression-bodied properties, LINQ chains).

- Phase 7 v3 research integration (2026-05-11): RESEARCH.md §v3 "auto-trigger architecture + JiT testing" with 5 industry sources (Meta JiT engineering.fb.com 2026-02 + arXiv 2601.22832 / Anthropic PBT 2026 verbatim quote / Hypothesis Ghostwriter CLI / Claude Code PostToolUse+ast-grep pattern / Skill semantic matching) + 5 findings F1-F5 mapping to SKILL.md changes; cross-link to dev-pomogator-session-pilot/.specs/session-pilot/POSTMORTEM-test-discipline.md (3 anti-patterns A/B/C "доложил без проверки" / "happy-path fixture" / "реактивная дисциплина", 2 verbatim пинка, главный вывод "знание правила ≠ применение правила"). SKILL.md §1.5 behavioural prior (reactive-vs-proactive workflow side-by-side, 3 anti-patterns inline, sample dialogue snippets cross-link, дословные пинки таблицей). SKILL.md §6.4 JiT auto-trigger mode (PostToolUse hook на production code Write|Edit + ast-grep detector для Collection-returning / N×M / composition + Python ghostwriter cold-start step + suppression comment `// strong-tests:skip <reason>` + audit log `.claude/logs/strong-tests-skips.jsonl`). SKILL.md §8 5th hard-NO "доклад без визуальной проверки в реальной среде". Section §6 заголовок Three → Four execution modes.

### Changed
- N/A

### Fixed
- N/A

## [0.1.0] - TBD

### Added
- Initial spec workflow phases 1-3 complete; implementation phases 4-6 in progress.
