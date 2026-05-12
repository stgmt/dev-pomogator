# Strong Tests

Skill `strong-tests` для dev-pomogator закрывающий разрыв между **написанием** теста (уже покрыто `tests-create-update`) и **доказательством** что тест ловит баги. Использует mutation testing + property-based testing (PBT) + 12-point self-eval checklist для верификации силы тестов после их написания. Эмпирически мотивирован: Schäfer et al. (arXiv 2406.18181) показал что 34.44–61.78% LLM-сгенерированных тестов синтаксически невалидны и 74.99% недетектированных дефектов происходят из-за missing inputs; Meta ACH (engineering.fb.com 2025-09-30) валидировал LLM↔mutation feedback loop на масштабе с 73% test acceptance.

## Ключевые идеи

- **3 mode workflow.** Greenfield (новый код → PBT + 12-point self-eval) / Audit (анализ существующих тестов по 8 anti-patterns) / Mutation-feedback (loop пока kill rate ≥ threshold). Соответствует OutSight AI 3-step iteration (5min generate / 15min mutate / 10min feed back).
- **Multi-stack auto-detect.** TS (vitest + Stryker + fast-check) + Python (pytest + mutmut + Hypothesis) — primary в SKILL.md body. Java/C#/Go/Rust — в `references/tooling-setup.md` (progressive disclosure). Авто-детект из package.json / pyproject.toml / pom.xml / Cargo.toml / go.mod аналогично `run-tests` skill.
- **12-point self-eval = primary deliverable.** Каждый item требует concrete evidence (mutation gutcheck #1, self-challenge #12). Compliance report с PASS/FAIL/N_A + remediation pointer per FAIL. Финальная Kill-rate-readiness: HIGH/MEDIUM/LOW.
- **Не дублирует `tests-create-update`.** Write-time prevention (16 anti-patterns) ≠ post-write strength verification (mutation kill rate + PBT). Cross-link оба skill direction. Trigger phrases distinct: "create/update test" vs "weak/fake-positive/mutation/strengthen".
- **Mutation-tool fallback.** Если Stryker/mutmut не установлены — auto-detect → 2 пути: (a) install proposal, (b) AI-driven manual mutation per honnibal-style 8-category catalogue (delete side-effect / negate condition / change boundary / etc.) через Edit + git checkout.
- **TDD-first BDD.** 9 scenarios в `strong-tests.feature` (TESTQUAL001_01..05 v0.1.0 + TESTQUAL001_06..08 v0.2.0 JiT auto-trigger + TESTQUAL001_09 v0.3.0 C# detection) mapping 1:1 на vitest test cases per `extension-test-quality` rule.

## Где лежит реализация

- **Skill:** `.claude/skills/strong-tests/SKILL.md` (main workflow, 8 sections, под 8K-token soft cap)
- **Skill references:** `.claude/skills/strong-tests/references/anti-patterns.md` + `references/tooling-setup.md` (on-demand load)
- **Skill scripts:** `.claude/skills/strong-tests/scripts/run-mutation.ts` (auto-detect stack + dispatch mutation tool)
- **Extension manifest:** `extensions/test-quality/extension.json` (edited — добавить `skills.strong-tests` + `skillFiles.strong-tests`)
- **Tests:** `tests/e2e/strong-tests.test.ts` (1:1 с strong-tests.feature TESTQUAL001_01..05)
- **HTML report:** `.specs/strong-tests/report.html` (Phase 6 deliverable)

## Project Context

| Aspect | Value |
|--------|-------|
| Scope | Project-level (`.claude/skills/strong-tests/` в dev-pomogator repo root, distributed via installer) |
| Host extension | `extensions/test-quality/` (alongside `dedup-tests` + `tests-create-update`) |
| Framework matrix | TS + Python + C# / .NET (v0.3.0 JiT detection scope); Java / Go / Rust в `references/tooling-setup.md` only |
| Vs `tests-create-update` | Separate parallel skill (write-time prevention vs post-write strength); bidirectional cross-link |
| Empirical foundation | Schäfer 2406.18181, Anthropic Red Team PBT 2026, Meta ACH 2025-09-30, OutSight AI, Ghiringhelli, honnibal catalogues |
| Layout rule | `.claude/rules/extension-layout.md` — source в repo root `.claude/skills/`, manifest в `extensions/test-quality/extension.json` |

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 5 stories (3 P1, 2 P2)
- [USE_CASES.md](USE_CASES.md) — 5 кейсов (Greenfield / Audit / Mutation-feedback / Polyglot / Tool-missing fallback)
- [RESEARCH.md](RESEARCH.md) — Sources + Технические находки + Project Context + Risk Assessment
- [REQUIREMENTS.md](REQUIREMENTS.md) — Traceability matrix FR↔AC↔@featureN + CHK matrix (15 CHKs)
- [FR.md](FR.md) — Functional requirements (FR-1..FR-5 + FR-N OUT_OF_SCOPE)
- [NFR.md](NFR.md) — Performance / Security / Reliability / Usability
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — EARS format AC-1..AC-5
- [DESIGN.md](DESIGN.md) — Components + Algorithms + 5 Key Decisions + BDD Test Infrastructure
- [FILE_CHANGES.md](FILE_CHANGES.md) — список всех create/edit файлов
- [TASKS.md](TASKS.md) — TDD-ordered tasks T01..T17 across Phase 0-3
- [strong-tests.feature](strong-tests.feature) — 9 BDD scenarios TESTQUAL001_01..05 + TESTQUAL001_06..09 (@feature1..@feature5 + @feature7, latter covering JiT + behavioural prior + C# detection)
- [REVIEW_NOTES.md](REVIEW_NOTES.md) — spec-review skill output (P0=0, P1=0)
- [CHANGELOG.md](CHANGELOG.md) — spec history
