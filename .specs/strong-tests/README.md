# Strong Tests

Skill `strong-tests` для dev-pomogator закрывающий разрыв между **написанием** теста (уже покрыто `tests-create-update`) и **доказательством** что тест ловит баги. Использует mutation testing + property-based testing (PBT) + 12-point self-eval checklist для верификации силы тестов после их написания. Эмпирически мотивирован: Schäfer et al. (arXiv 2406.18181) показал что 34.44–61.78% LLM-сгенерированных тестов синтаксически невалидны и 74.99% недетектированных дефектов происходят из-за missing inputs; Meta ACH (engineering.fb.com 2025-09-30) валидировал LLM↔mutation feedback loop на масштабе с 73% test acceptance.

## Current version: v0.5.1 (Phase 10.1)

| Feature | Version | Status |
|---|---|---|
| Greenfield mode (PBT scaffold) | v0.1.0 | ✅ |
| Audit mode (8 anti-patterns) | v0.1.0 | ✅ |
| Mutation-feedback loop (TS + Python dispatch) | v0.1.0 | ✅ |
| JiT auto-trigger PostToolUse hook | v0.2.0 | ✅ |
| §1.5 Behavioural prior + session-pilot integration | v0.2.0 | ✅ |
| C# / .NET detection scope | v0.3.0 | ✅ |
| Go detection scope | v0.4.0 | ✅ |
| Cross-skill composition (simplify + run-tests + create-spec) | v0.4.0 | ✅ |
| .NET fixture project for self-test | v0.5.0 | ✅ |
| **Composition-chain detection** (finally implemented) | v0.5.0 | ✅ |
| **Stryker.NET dispatch** | v0.5.0 | ✅ |
| **Test classification policy** (default Category=Unit) | v0.5.0 | ✅ |
| **ast-grep migration TS branch** | v0.5.0 | ✅ |
| **Hypothesis Ghostwriter integration** | v0.5.0 | ✅ |
| **Framework selection UX** через AskUserQuestion | v0.5.0 | ✅ |
| **LLM-driven survivor analysis full workflow** (batch + merge) | v0.5.1 | ✅ |
| ast-grep migration Python + Go + C# | v0.5.2+ | roadmap |
| Autopilot loop (full automation) | v0.6.0 | roadmap |
| Stryker.NET Dashboard integration | v0.6.0 | roadmap |
| Go mutation testing (go-mutesting dispatch) | v0.7.0 | roadmap |

## Ключевые идеи

- **4 modes + auto-trigger.** Greenfield (новый код → PBT + 12-point self-eval) / Audit (анализ существующих тестов по 8 anti-patterns) / Mutation-feedback (loop пока kill rate ≥ threshold + LLM survivor analysis v0.5.1) / JiT (PostToolUse hook detects collection-returning / nxm-overlap / composition-chain). Соответствует OutSight AI 3-step iteration + Meta JiT pattern.
- **Multi-stack support** (v0.5.0+). TS (vitest + Stryker + fast-check) + Python (pytest + mutmut + Hypothesis Ghostwriter) + C# .NET (xUnit/NUnit + Stryker.NET) + Go (detection only; go-mutesting roadmap). Framework selection через AskUserQuestion (НЕ heavy auto-detect, calling-side picks).
- **Test classification policy** (v0.5.0+). Default skip Integration/E2E через `Category=Unit` filter. Override `--include-integration` / `--include-e2e`. Solves AiPomogator-class blockers (live infra deps).
- **12-point self-eval = primary deliverable.** Каждый item требует concrete evidence (mutation gutcheck #1, self-challenge #12). Compliance report с PASS/FAIL/N_A + remediation pointer per FAIL.
- **Composition-chain detection** (v0.5.0). Function body с ≥2 chained method calls на collection types → kind 'composition-chain' с invariants taxonomy включающим monotonicity.
- **LLM-driven survivor analysis** (v0.5.1). 4-step orchestration: run-mutation.ts --analyze-survivors → survivors-batch-prompt → Agent() per batch с Meta ACH-style prompt → merge-survivor-verdicts. Cost guard $2 budget default.
- **Не дублирует `tests-create-update`.** Write-time prevention (16 anti-patterns) ≠ post-write strength verification (mutation kill rate + PBT).
- **Cross-skill composition** (v0.4.0+). Wired в `simplify-extended.md` (test files in diff trigger) + `run-tests SKILL.md Step 5` (post-test-run hint) + `create-spec/phase3_finalization Step 1c` (test items detection).

## Где лежит реализация

- **Skill:** `.claude/skills/strong-tests/SKILL.md` (workflow + 12-point eval + Quick start §0)
- **Skill references:**
  - `references/anti-patterns.md` (8 anti-patterns catalogue + grep regex)
  - `references/tooling-setup.md` (install + thresholds per 6 stacks)
  - `references/stryker.config.template.mjs` (Stryker TS template)
  - `references/stryker-net.config.template.json` (Stryker.NET template, v0.5.0+)
- **Skill scripts:**
  - `scripts/detect-invariant-candidates.ts` (JiT detector with ast-grep TS branch + regex fallback)
  - `scripts/run-mutation.ts` (Stryker/mutmut/Stryker.NET dispatch + Ghostwriter + --analyze-survivors)
  - `scripts/survivors-batch-prompt.ts` (v0.5.1 — LLM batching with cost guard)
  - `scripts/merge-survivor-verdicts.ts` (v0.5.1 — verdict merge с survivorAnalysis summary)
- **Test fixture:** `tests/fixtures/dotnet-stryker-target/` (Library.Shared + UnitTests + stryker-config.json; Stryker.NET self-test target)
- **Extension manifest:** `extensions/test-quality/extension.json` (skills.strong-tests + skillFiles tracks all 9 files)
- **Tests:** `tests/e2e/strong-tests-jit.test.ts` (9) + `detect-invariant-candidates-unit.test.ts` (47) + `strong-tests-dotnet-stryker.test.ts` (4) + `survivors-batch-and-merge.test.ts` (5) = **65 PASS**
- **HTML report:** `.specs/strong-tests/report.html` (Phase 6 deliverable)
- **Field verification:** `.specs/strong-tests/FIELD_VERIFICATION.md` (lm-saas/AiPomogator install + smoke results)
- **Invariants catalogue:** `.specs/strong-tests/INVARIANTS.md` (≥5 invariants per public function)

## Project Context

| Aspect | Value |
|--------|-------|
| Scope | Project-level (`.claude/skills/strong-tests/` в dev-pomogator repo root, distributed via installer) |
| Host extension | `extensions/test-quality/` (alongside `dedup-tests` + `tests-create-update`) |
| Framework matrix | TS + Python + C# / .NET + Go (v0.5.0 detection scope, Stryker.NET dispatch v0.5.0+); Java / Rust в `references/tooling-setup.md` only |
| Vs `tests-create-update` | Separate parallel skill (write-time prevention vs post-write strength); bidirectional cross-link |
| Empirical foundation | Schäfer 2406.18181, Anthropic Red Team PBT 2026, Meta ACH 2025-09-30, OutSight AI, Ghiringhelli, honnibal catalogues |
| Layout rule | `.claude/rules/extension-layout.md` — source в repo root `.claude/skills/`, manifest в `extensions/test-quality/extension.json` |

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 5 stories (3 P1, 2 P2)
- [USE_CASES.md](USE_CASES.md) — 5 кейсов (Greenfield / Audit / Mutation-feedback / Polyglot / Tool-missing fallback)
- [RESEARCH.md](RESEARCH.md) — Sources + Технические находки + Project Context + Risk Assessment
- [REQUIREMENTS.md](REQUIREMENTS.md) — Traceability matrix FR↔AC↔@featureN + CHK matrix (35 CHKs; 19 Verified, 16 Draft)
- [FR.md](FR.md) — Functional requirements (FR-1..FR-17 + Out of Scope v0.6.0+ markers)
- [NFR.md](NFR.md) — Performance / Security / Reliability / Usability
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — EARS format AC-1..AC-17
- [DESIGN.md](DESIGN.md) — Components + Algorithms + 5 Key Decisions + BDD Test Infrastructure
- [FILE_CHANGES.md](FILE_CHANGES.md) — список всех create/edit файлов
- [TASKS.md](TASKS.md) — TDD-ordered tasks T01..T44 across Phase 0-3 + Phase 4-6 (JiT + .NET + Go) + Phase 10-10.1 (v0.5.0/v0.5.1)
- [strong-tests.feature](strong-tests.feature) — 9 BDD scenarios TESTQUAL001_01..09 (@feature1..@feature5 + @feature7)
- [REVIEW_NOTES.md](REVIEW_NOTES.md) — spec-review skill output (P0=0, P1=0)
- [CHANGELOG.md](CHANGELOG.md) — spec history (Phase 0-10.1)
- [FIELD_VERIFICATION.md](FIELD_VERIFICATION.md) — real-world install + smoke results на lm-saas/AiPomogator + new-api-modified
- [INVARIANTS.md](INVARIANTS.md) — ≥5 invariants per public function (skill §2 item 1 deliverable)
