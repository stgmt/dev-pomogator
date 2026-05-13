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
- Phase 10.2 v0.5.2 — Test classification scanner (2026-05-13):
  - **FR-13 expanded** — beyond policy (default Category=Unit filter) added automated scanner. Closes documented-but-not-implemented gap from v0.5.0.
  - **New script** `scripts/classify-tests.ts` — heuristic-based per-file Unit/Integration/E2E classification scanner. Per-language regex patterns:
    - **E2E signals**: Docker, Testcontainers, raw HttpClient(), WebApplicationFactory, Process.Start, Npgsql, Selenium/Playwright, BaseAddress localhost
    - **Integration signals**: Moq/Mock/FakeItEasy/NSubstitute, IClassFixture, UseInMemoryDatabase, unittest.mock, vi.mock/jest.mock, gomock
    - **Unit**: zero E2E + zero Integration signals + no live infra imports
    - **Mixed signals**: conservative Integration with low confidence + manual review note
  - **Output formats**: JSON (default) с classifications array + per-file evidence + current_marker detection; markdown с sections per category + Stryker.NET integration hint.
  - **Real-world validation**: scanner на lm-saas/AiPomogator.Tests 79 test files → 52 Unit / 8 Integration / 19 E2E classified в seconds. Actionable insight для test infrastructure debt remediation (out of 79 untagged tests, 52 ready для Stryker.NET immediately).
  - **SKILL.md §3** documents scanner workflow + heuristics table + real-world example + anti-gaming guard (output is suggestion, manual review required before applying [Trait] markers).
  - **vitest TESTQUAL001_17..23** — 7 new tests covering pure Unit C#, Integration with Moq+IClassFixture, E2E with WebApplicationFactory+Process+Docker, existing marker detection, Python pytest mock, markdown format output, empty directory.
  - **Spec entries**: CHK-FR13-02/03 → Verified; Summary Counts: 35→37 (Verified 19→21).

- Phase 10.1 v0.5.1 — LLM-driven survivor analysis full workflow (2026-05-13):
  - **FR-15 finalized** — moved from stub (v0.5.0) to full workflow. Added 2 new helper scripts: `survivors-batch-prompt.ts` (Meta ACH-style prompt batching + cost guard $2/budget) + `merge-survivor-verdicts.ts` (verdict merge back into MutationReport.gaps[] with survivorAnalysis summary).
  - Workflow documented в SKILL.md §6.3 with 4-step orchestration: run-mutation.ts --analyze-survivors → batch-prompt → Agent() per batch → merge-verdicts. AI agent invokes Agent(subagent_type="general-purpose") with Meta ACH prompt (0.95 precision target per engineering.fb.com 2025-09-30).
  - vitest TESTQUAL001_12..16 (5 new tests): batching into chunks of 50, budget guard abort, verdict merge with equivalentSuspect+confidence+rationale, unmatched verdicts warning, gaps[] preference over raw survivors[].
  - Anti-gaming guard §8 hard-NO #6 preserved: LLM verdicts are suggestions not assertions; reviewer spot-check required для equivalentSuspect:true flags.
  - CHK-FR15-01/02 → Verified; +CHK-FR15-03 new. Summary Counts: 34→35 (Verified 16→19, Draft 18→16).

- Phase 10 v0.5.0 — composition-chain + Stryker.NET + ast-grep + LLM survivor + Ghostwriter + fixture (2026-05-13):
  - **FR-11 Composition-chain detection** finally implemented в `detect-invariant-candidates.ts` scan() — declared с v0.1.0 в TypeScript types + SKILL.md §6.4 но 0 строк implementation. Added CHAIN_TS / CHAIN_CS / CHAIN_PY / CHAIN_GO regex constants + chainRegexFor() + chainCount() helpers. Detection priority: nxm-overlap → composition-chain → collection-returning fallback. Smoke verified: TS `.filter().map().reduce()` → composition-chain; C# LINQ `.Where().Select().OrderBy().ToList()` → composition-chain.
  - **FR-12 Stryker.NET dispatch** добавлен в `run-mutation.ts` как `runStrykerNet()` parallel к existing runStryker (TS) / runMutmut (Python). Pre-flight: dotnet-stryker --help check + stryker-config.json existence. Parallel JSON template `references/stryker-net.config.template.json` с {{TODO}} placeholders.
  - **FR-13 Test classification policy** — default skip Integration/E2E через Category=Unit filter. Override flags `--include-integration` / `--include-e2e`. Solves AiPomogator-class blockers (live DB/auth/HTTP deps). Documented в SKILL.md §3 Test classification policy + framework selection UX section.
  - **FR-14 ast-grep migration** для TypeScript branch — `@ast-grep/napi` library integration в detect-invariant-candidates.ts с cached `getTsFunctionsViaAstGrep()`. Regex fallback if NAPI load fails. Python/Go/C# branches остаются regex-based в v0.5.0; full migration roadmap v0.5.1.
  - **FR-15 LLM-driven survivor analysis** stub — `--analyze-survivors` CLI flag invokes `annotateSurvivorsForLlmReview()` с reconstructedContext (±3 lines around mutation). Production invocation pattern: AI orchestrator spawns `Agent(subagent_type="general-purpose")` batches of 50; verdicts merged into MutationReport.gaps[].equivalentSuspect.
  - **FR-16 Hypothesis Ghostwriter** integration в Python Greenfield mode — `runGhostwriter()` function spawns `hypothesis write <module.function>` subprocess, parses STDOUT scaffold starting at `from hypothesis import` line.
  - **FR-17 Framework selection UX** — НЕ auto-detect; skill exposes enumerated 6-framework list via AskUserQuestion pattern (matching 9 established dev-pomogator skills). Documented в SKILL.md §3.
  - **.NET fixture project** created at `tests/fixtures/dotnet-stryker-target/` — pure-unit C# с xUnit + FsCheck.Xunit. Library.Shared (PricingCalculator + CollectionPipeline + CartesianProduct) + UnitTests с Category=Unit Trait. Used by `tests/e2e/strong-tests-dotnet-stryker.test.ts` (TESTQUAL001_11 / 11b / 11c / 11d).
  - **Autopilot loop (E)** explained в SKILL.md §6.3 autopilot sub-section с pseudo-code + OutSight AI case study reference + v0.6.0 roadmap deferral note.
  - **Stryker Dashboard** documented as explicit Out of Scope с v0.6.0+ marker в FR.md.
  - vitest: 47 unit + 9 integration + 4 new dotnet-stryker = 60 tests total зелёные.

- Phase 9 v0.4.0 Field verification + Go support + cross-skill composition (2026-05-12):
  - Field verification on lm-saas/AiPomogator (.NET 10, xUnit + Reqnroll) + lm-saas/new-api-modified (Go). Installer успешно работает в real production repo: detector detection scope теперь TS + Python + C# + Go (4 стэка). Установлен один set artifacts на lm-saas/ root, покрывает оба subdirs.
  - Go support: `detect-invariant-candidates.ts` расширен COLLECTION_GO + FUNCTION_GO + SUPPRESS_GO constants. Detector parses Go function signatures с pointer receiver `func (s *Service) Method()`, slice `[]T` / map `map[K]V` / channel `chan T` return types, nested for-range + C-style for + bare-for loops. `posttool-jit.ts` PRODUCTION_INCLUDE +`.go` + TEST_EXCLUDE +`_test.go`. 6 new unit tests + TESTQUAL001_10 integration test = 47 unit + 9 integration = 56 tests total зелёные.
  - Cross-skill composition wired в 3 точках: `.claude/rules/auto-simplify/simplify-extended.md` (test files in diff trigger), `.claude/skills/run-tests/SKILL.md` Step 5 (post-test-run hint via git diff), `.claude/skills/create-spec/references/phase3_finalization.md` Step 1c (post-task-board-forms recommendation для test items).
  - Manifest fix: `extensions/test-quality/extension.json skillFiles.strong-tests` — добавлен пропущенный `references/stryker.config.template.mjs` file для SHA-256 tracking integrity.
  - Stryker.NET baseline на AiPomogator.Library.Shared.csproj — running в background. Field verification report: `.specs/strong-tests/FIELD_VERIFICATION.md`.

- Phase 8 v0.3.0 .NET / C# expansion (2026-05-12): FR-7 detection scope расширен с TS+Python на TS+Python+C# / .NET. Detector `.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts` получает три новые regex константы (COLLECTION_CS / FUNCTION_CS / SUPPRESS_CS) + ветка `'csharp'` в detectStack / scan / nestedLoopCount + расширение type union на `'ts' | 'python' | 'csharp'`. Поддерживаемые collection types: List<T>, IList<T>, IEnumerable<T>, IReadOnly* варианты, ICollection<T>, Dictionary<K,V>, IDictionary<K,V>, HashSet<T>, ISet<T>, Queue<T>, Stack<T>, T[] + async Task<...> / ValueTask<...> wrappers. Nested loop detection считает оба `for (...)` и `foreach (...)`. PostToolUse hook `posttool-jit.ts` обновляет PRODUCTION_INCLUDE с `.cs` extension и TEST_EXCLUDE с C# test patterns (Steps.cs Reqnroll, Tests.cs xUnit, Test.cs NUnit, _test.cs, capital Tests/ folder). Suppression comment `// strong-tests:skip <reason>` (identical TS syntax) с reason length validation. Spec: AC-7 +3 EARS scenarios (C# production detection / test exclusion / suppression), CHK-FR7-07 row, SCHEMA stack enum +csharp + C# grammar section, strong-tests.feature +TESTQUAL001_09 scenario, TASKS Phase 5 (T25-T28), README scenario count 8→9. Smoke testing проверил end-to-end: production `.cs` → additionalContext emitted; Tests/ folder → excluded; Steps.cs → excluded. Known limitations документированы в Out of Scope (multi-line signatures, expression-bodied properties, LINQ chains).

- Phase 7 v3 research integration (2026-05-11): RESEARCH.md §v3 "auto-trigger architecture + JiT testing" with 5 industry sources (Meta JiT engineering.fb.com 2026-02 + arXiv 2601.22832 / Anthropic PBT 2026 verbatim quote / Hypothesis Ghostwriter CLI / Claude Code PostToolUse+ast-grep pattern / Skill semantic matching) + 5 findings F1-F5 mapping to SKILL.md changes; cross-link to dev-pomogator-session-pilot/.specs/session-pilot/POSTMORTEM-test-discipline.md (3 anti-patterns A/B/C "доложил без проверки" / "happy-path fixture" / "реактивная дисциплина", 2 verbatim пинка, главный вывод "знание правила ≠ применение правила"). SKILL.md §1.5 behavioural prior (reactive-vs-proactive workflow side-by-side, 3 anti-patterns inline, sample dialogue snippets cross-link, дословные пинки таблицей). SKILL.md §6.4 JiT auto-trigger mode (PostToolUse hook на production code Write|Edit + ast-grep detector для Collection-returning / N×M / composition + Python ghostwriter cold-start step + suppression comment `// strong-tests:skip <reason>` + audit log `.claude/logs/strong-tests-skips.jsonl`). SKILL.md §8 5th hard-NO "доклад без визуальной проверки в реальной среде". Section §6 заголовок Three → Four execution modes.

### Changed
- N/A

### Fixed
- N/A

## [0.1.0] - TBD

### Added
- Initial spec workflow phases 1-3 complete; implementation phases 4-6 in progress.
