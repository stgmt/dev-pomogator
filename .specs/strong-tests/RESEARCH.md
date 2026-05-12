# Research

## Контекст

Скилл `strong-tests` закрывает разрыв между **написанием** теста и **доказательством** что тест действительно ловит баги. Существующий скилл `tests-create-update` решает первую часть (anti-pattern prevention при write). Эмпирические исследования (см. источники ниже) показывают что и LLM-сгенерированные, и человеческие тесты регулярно проходят по неправильным причинам — happy-path-only, permissive matching, assertion roulette, tautological assertions, trivial inputs. Mutation testing + property-based testing — две независимо подтверждённые техники для прокачки силы тестов.

## Источники

### v1 (Phase 1 research)
- https://arxiv.org/html/2406.18181v1 — Schäfer et al., empirical study of LLM-generated unit tests [VERIFIED: 2026-05-10]
- https://arxiv.org/abs/2410.10628 — Ouédraogo et al., test smells in LLM-generated tests, 2024-10-14 (revised 2025-11-06) [VERIFIED]
- https://red.anthropic.com/2026/property-based-testing/ — Anthropic Red Team, PBT for LLM agents [VERIFIED]
- https://engineering.fb.com/2025/09/30/security/llms-are-the-key-to-mutation-testing-and-better-compliance/ — Meta ACH (Automated Compliance Hardening) [VERIFIED]
- https://medium.com/@outsightai/the-truth-about-ai-generated-unit-tests-why-coverage-lies-and-mutations-dont-fcd5b5f6a267 — OutSight AI case study [VERIFIED]
- https://dev.to/jghiringhelli/the-ai-reported-931-coverage-it-was-34-290k — Ghiringhelli, line-cov vs MSI [VERIFIED]
- https://github.com/honnibal/claude-skills/blob/main/mutation-testing.md.txt — honnibal mutation-testing skill (Python-only AI-driven mutation, 8-category catalogue) [VERIFIED]
- https://github.com/honnibal/claude-skills/blob/main/hypothesis-tests.md.txt — honnibal hypothesis-tests skill (Python-only PBT) [VERIFIED]
- https://www.endorlabs.com/learn/test-first-prompting-using-tdd-for-secure-ai-generated-code — Endor Labs, TDD prompting for secure AI code [VERIFIED]
- https://arxiv.org/html/2509.19185 — Empirical study of testing in 39 agent frameworks + 439 agentic apps [VERIFIED]

### v2 (deep research, 2026-05-11) — peer-reviewed expansion

#### Mutation testing — 20-year academic chain
- https://dl.acm.org/doi/10.1145/1062455.1062530 — **Andrews, Briand, Labiche ICSE 2005** — "Is Mutation an Appropriate Tool for Testing Experiments?" — earliest validation that mutants are valid as real-fault proxy [VERIFIED 2026-05-11]
- https://homes.cs.washington.edu/~mernst/pubs/mutation-effectiveness-fse2014-abstract.html — **Just, Jalali, Inozemtseva, Ernst, Holmes, Fraser FSE 2014** — "Are Mutants a Valid Substitute for Real Faults?" — 357 real faults; mutation correlates with real-fault detection **independently of code coverage**. ACM SIGSOFT Distinguished + FSE MIP 2024 [VERIFIED]
- https://www.cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf — **Inozemtseva & Holmes ICSE 2014** — "Coverage Is Not Strongly Correlated with Test Suite Effectiveness" — 5 проектов × 100K+ LOC × 31K test suites. ICSE Most Influential Paper N-10 (2024). Canonical "coverage is vanity" reference [VERIFIED]
- https://dl.acm.org/doi/10.1145/2931037.2948707 — **Coles et al. ISSTA 2016** — PIT bytecode-level mutation tool paper [VERIFIED]
- https://research.google/pubs/state-of-mutation-testing-at-google/ — **Petrović & Ivanković ICSE-SEIP 2018** — "State of Mutation Testing at Google" — 6000 engineers, 30% diffs, arid-line filtering. **Venue correction: ICSE-SEIP, not FSE 2018** [VERIFIED]
- https://arxiv.org/abs/2102.11378 — **Petrović et al. IEEE TSE 2021** — "Practical Mutation Testing at Scale: A view from Google" — 24K developers, 1K projects, 500M tests/day [VERIFIED]
- https://arxiv.org/abs/2506.02954 — **MutGen arXiv 2506.02954 (June 2025)** — peer-reviewed source for "100%/4%": Llama-3.3 on HumanEval-Java id_81 date validator misses Feb 29 leap year. MutGen 89.5% kill vs vanilla LLM 77.9% (1144 mutants) [VERIFIED]
- https://arxiv.org/html/2406.09843v5 — **Comprehensive LLM × Mutation Testing study** — 851 real bugs Java; LLM 87.98% fault detection vs rule-based 41.64% [VERIFIED]
- https://www.sciencedirect.com/science/article/abs/pii/S0950584924000739 — **MuTAP IST 2024** — surviving mutants → LLM prompt augmentation [SINGLE_SOURCE]

#### PBT — origin + industrial validation
- https://dl.acm.org/doi/10.1145/351240.351266 — **Claessen & Hughes ICFP 2000** — "QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs" — origin paper, ~300 LOC [VERIFIED]
- https://link.springer.com/chapter/10.1007/978-3-030-47147-7_4 — **Hughes TFP 2019** — "How to Specify It! A Guide to Writing Properties of Pure Functions" — 5 PBT property categories (postcondition / metamorphic / inductive / model-based / algebraic) [VERIFIED]
- https://joss.theoj.org/papers/10.21105/joss.01891 — **MacIver & Hatfield-Dodds JOSS 2019** — "Hypothesis: A new approach to property-based testing" — internal byte-stream shrinking [VERIFIED]
- https://link.springer.com/chapter/10.1007/978-3-319-30936-1_9 — **Hughes Quviq Springer 2016** — "Testing the Hard Stuff and Staying Sane" — **Volvo Cars AUTOSAR**: 3000-page spec → QuickCheck models → 200+ issues. Largest documented non-LLM industrial PBT [VERIFIED]
- https://well-typed.com/blog/2019/05/integrated-shrinking/ — Integrated vs manual shrinking design discussion [VERIFIED]

#### Test smells prevalence (sharper)
- https://arxiv.org/pdf/2104.14640 — **Aljedaani et al. arXiv 2104.14640** — Assertion Roulette in **54% of generated JUnit** test classes, **>50% in OSS Android** apps. Sharper than generic Ouédraogo citation [VERIFIED]

## Технические находки

### LLM test invalidity is the dominant failure mode

Schäfer et al. (arXiv 2406.18181 §3.2 Table 4): "a substantial portion of the unit tests generated by LLMs (ranging from 34.44% to 61.78%) are syntactically invalid". GPT-4 specifically: Compilation Success Rate (CSR) 52.96%, line coverage 40.43%, branch coverage 31.78% (vs EvoSuite 78.91 / 76.59). Section 3.4: "87.13% of defects cannot be detected due to the compilation issue on average across all studied LLMs"; 74.99% of undetected defects on average stem from missing inputs (14.46% specifically for GPT-4). [VERIFIED via WebFetch 2026-05-10]

Implication for strong-tests: invariant-driven (PBT) tests sidestep the missing-inputs failure mode by generating inputs across the full strategy space rather than asking the LLM to enumerate cases. Item #6 of the 12-point self-eval (Input Boundaries: min, max, empty, null, very-large, unicode, negative) is the codification of this finding.

### Coverage is a vanity metric vs mutation score

OutSight AI documented a real reconciliation workflow: 92% line coverage, 140 unit tests, started silently duplicating line items two days post-deployment because the AI used reference equality (===) on objects instead of business-key equality. Worst-case demo: "100% coverage but 4% mutation score". Recommended thresholds: critical paths ≥70%, standard ≥50%, experimental ≥30%. After a 3-step AI ↔ mutation feedback loop (5 min generate / 15 min mutate / 10 min feed back), mutation score jumped from 70% to 78%. [VERIFIED]

Ghiringhelli ran the same experiment with Stryker on a services layer (116 mutants): line cov 93.1% vs initial mutation MSI 58.62% (34.4 pp gap). After three rounds of targeted assertion strengthening: 93.1% / 93.10% MSI. [VERIFIED]

Implication: strong-tests must distinguish coverage from kill rate in user-facing reports and never accept coverage alone as evidence of strength.

### Meta validates the LLM ↔ mutation loop at scale

Meta's ACH tool (engineering.fb.com 2025-09-30): trial Oct–Dec 2024 across Facebook, Instagram, WhatsApp, Quest, Ray-Ban Meta. Generated thousands of mutants and hundreds of tests. Privacy engineers accepted 73% of generated tests with 36% judged privacy-relevant. LLM-based Equivalence Detector achieved 0.79 precision / 0.47 recall raw, improved to 0.95 / 0.96 with preprocessing. Presented as keynote at FSE 2025 and EuroSTAR 2025. [VERIFIED]

Key Meta recommendation cited verbatim: engineers "valued being able to focus on evaluating tests" while the system handled generation — mirrors strong-tests' role as a generator/auditor where the human reviews findings.

### Property-based testing is the right vehicle for invariant verification

Anthropic Red Team (red.anthropic.com 2026): used Hypothesis to generate 984 bug reports across 100+ Python packages. Initial validity 56%, after ranking by signal strength 86%. 5 patches accepted in NumPy / AWS Lambda Powertools / HuggingFace Tokenizers. NumPy Wald distribution fix: "nearly ten orders of magnitude lower relative error". Key principle quoted: "if a developer does not think to test an edge case, it is also likely the developer did not consider that case in the implementation". [VERIFIED]

Implication: strong-tests Greenfield mode emits at least one PBT test per function with structural invariants (roundtrip, idempotence, invariant preservation, equivalence to reference impl). Item #5 (INVARIANTS LIST) and #8 (ROUND-TRIP) of the 12-point checklist enforce this.

### Test smells in LLM tests have specific named patterns

Ouédraogo et al. (arXiv 2410.10628): "LLM-generated tests consistently manifest smells such as Assertion Roulette and Magic Number Test, with patterns strongly influenced by prompting strategy, context length, and model scale". Also flags "overlaps with human-written tests, raising concerns of potential data leakage from training corpora". [VERIFIED — abstract; specific 23.8–61.3% range from brief is `[SINGLE_SOURCE: brief]` until full PDF read]

Implication: strong-tests anti-pattern detection table and 12-point self-eval items #2 (assertion specificity), #3 (negative:positive ratio), #7 (failure messages), #14 (no tautology) directly target named smells.

### Existing similar skills

`honnibal/claude-skills/mutation-testing.md.txt` — Python-only, pytest-only, AI-driven manual mutation via Edit + git checkout, 8-category mutation catalogue (delete side effect / negate condition / change boundary / hardcode return / delete guard / change operator / modify default / swap argument order), diagnostic quality rating (Clear / Indirect / Cascading), `disable-model-invocation: true` (user-invoked only). Mutation score reporting + recommended-tests output. [VERIFIED via gh API 2026-05-10]

Verdict for strong-tests: PARTIAL-INSPIRATION. Borrow mutation catalogue + diagnostic-quality rating (cite as reference). Extend with multi-stack tooling matrix (Stryker / mutmut / PIT / Stryker.NET / cargo-mutants / go-mutesting). Honnibal's manual workflow becomes our **fallback** when no mutation tool is installed (UC-5).

`honnibal/claude-skills/hypothesis-tests.md.txt` — Python-only Hypothesis PBT skill. PARTIAL-INSPIRATION: borrow input-strategy + roundtrip / idempotence / invariant property archetypes; extend to fast-check (TS), jqwik (Java), FsCheck (C#), proptest (Rust), gopter (Go).

`clear-solutions/unit-tests-skills` — Java/JUnit5+Mockito+AssertJ, single-stack, no mutation/PBT focus. IGNORE.

## Где лежит реализация

- App-код: `.claude/skills/strong-tests/SKILL.md` (main workflow), `.claude/skills/strong-tests/scripts/run-mutation.ts` (auto-detect + dispatch), `.claude/skills/strong-tests/references/anti-patterns.md` + `references/tooling-setup.md` (on-demand reference loading)
- Конфигурация: `extensions/test-quality/extension.json` (manifest), `.dev-pomogator/tools/test-quality/` (installed tools tracking)
- Tests: `tests/e2e/strong-tests.test.ts` (planned)

## Cross-axis observations (deep research v2, 2026-05-11)

8 уточнений / исправлений / расширений из deep research pass:

1. **Petrović 2018 venue correction** — это ICSE-SEIP 2018, не FSE 2018 как было в v1 RESEARCH.md.
2. **«100%/4%» теперь peer-reviewed** — primary citation сменена с OutSight блога на **MutGen arXiv 2506.02954 (June 2025)**: HumanEval-Java id_81 (date validator) пропускает Feb 29 leap year boundary при 100% line+branch coverage. Llama-3.3 модель, репродуцируемо.
3. **20-летняя академическая цепочка** — Andrews 2005 → Just 2014 → Inozemtseva 2014 → Coles 2016 → Petrović 2018 → 2021 → MuTAP 2024 → MutGen 2025 → Meta-ACH 2025. Не один блог; 8 peer-reviewed работ через ICSE / FSE / ISSTA / TSE.
4. **Go: 2 живых тула** (v1 RESEARCH.md упоминал один). gremlins (modern, microservices, "hours on big modules") + avito-tech/go-mutesting (active fork upstream stale 2021, mature mutators). Asterisk нужен в `references/tooling-setup.md`.
5. **Rust mutagen мёртв** — репо удалено. cargo-mutants — единственный credible выбор.
6. **Shrinking — quality dimension PBT matrix**. Integrated shrinking (Hedgehog 2017 / Hypothesis byte-stream / fast-check / proptest rose-tree) эмпирически superior to manual (классика QuickCheck / ScalaCheck pre-2018 / junit-quickcheck). Колонка добавлена в `references/tooling-setup.md`.
7. **Diff-based mutation — индустриальный default**. Google (2018, 2021), Stryker.js `--since`, cargo-mutants `--in-diff`, PIT `scmMutationCoverage` — все сходятся. `scripts/run-mutation.ts` должен defaultить на diff-scope если git available. v1.1 follow-up.
8. **Assertion Roulette 54% prevalence** (Aljedaani arXiv 2104.14640) — конкретная prevalence statistic для generated JUnit и OSS Android. Sharper чем generic Ouédraogo citation. FR-2 anti-pattern catalogue получает concrete числа.

## Выводы

1. The dominant LLM-test failure mode is **happy-path-only assertions** (74.99% of undetected defects per Schäfer). PBT eliminates this by enumerating input space.
2. **Coverage and mutation score are independent metrics** — empirical gap of 34–96 pp documented across multiple studies. Reporting only coverage is anti-evidence.
3. **AI ↔ mutation feedback loop works**: Meta accepted 73% of LLM-generated tests; OutSight + Ghiringhelli both report mutation score climbing 8–34 pp per iteration.
4. The skill **must complement, not duplicate**, `tests-create-update` (write-time anti-pattern prevention vs. post-write strength verification).
5. **Multi-stack matrix is non-negotiable** — dev-pomogator is polyglot and the existing `run-tests` skill sets the auto-detection bar.
6. The 12-point self-eval is the **primary deliverable** — every empirical finding above maps to one or more checklist items.

## v3 (2026-05-11): auto-trigger architecture + JiT testing

После Phase 2 audit (P0=0 P1=0) и Phase 3 Finalization дополнительный research pass показал что "slash command only" архитектура уступает индустриальному 2026 standard "dual-trigger (slash + auto-via-hook)". Пять источников ниже мотивируют добавление PostToolUse hook + JiT-style "designed to fail" testing к skill workflow + новой §1.5 behavioural prior в SKILL.md (отдельный input — session-pilot agent self-postmortem, см. конец секции).

### Sources

1. **Meta JiT Testing — 4× bug detection** [VERIFIED 2026-05-11]
   - https://engineering.fb.com/2026/02/11/developer-tools/the-death-of-traditional-testing-agentic-development-jit-testing-revival/
   - https://arxiv.org/abs/2601.22832 — peer-reviewed paper "Just-in-Time Catching Test Generation at Meta"
   - https://www.infoq.com/news/2026/04/meta-jit-testing-ai-detection/ — InfoQ recap
   - Trial across 100M+ LOC Meta codebase. JiT tests are LLM-generated **during** code review (не pre-written), комбинируют LLM + program analysis + mutation testing. Спроектированы чтобы **падать** при регрессиях ("catch" tests, не "harden" tests). Reports: 4× catch generation vs hardening tests, 20× vs coincidentally failing, 70% human review load reduction, assessors reduce human review by 70%.

2. **Anthropic Red Team PBT — расширение v1 цитаты для positive-образцов** [VERIFIED — уже в v1]
   - https://red.anthropic.com/2026/property-based-testing/
   - Quote verbatim: *"if a developer does not think to test an edge case, it is also likely the developer did not consider that case in the implementation"*. v3 implication: positive-образцы dialogue snippets в SKILL.md §1.5 должны показывать "перепиши edge case как property" workflow — не «добавь ещё один if», а «переформулируй инвариант который должен держаться **для всех** входов».

3. **Hypothesis Ghostwriter — cold-start helper для Python** [VERIFIED 2026-05-11]
   - https://hypothesis.readthedocs.io/en/latest/ghostwriter.html
   - https://github.com/HypothesisWorks/hypothesis/blob/master/hypothesis-python/src/hypothesis/extra/ghostwriter.py
   - CLI `hypothesis write <function>` за секунды генерит stub property-test через introspection (function name + args + types + docstrings). Auto-detects семантические properties: roundtrip / idempotence / commutativity / associativity / equivalence-between-methods / array shapes. Fallback на "no error on valid input" если property не детектится. Quote: *"intended as a starting point for human authorship, to demonstrate best practice, help novices past blank-page paralysis"*.

4. **Claude Code PostToolUse hook + ast-grep — стандартный auto-trigger pattern** [VERIFIED]
   - https://code.claude.com/docs/en/hooks
   - https://www.paulmduvall.com/claude-code-hooks-code-quality-guardrails/ — code quality gates pattern
   - https://ast-grep.github.io/catalog/typescript/ + https://ast-grep.github.io/catalog/python/
   - Pattern: matcher `Write|Edit` на production-code файлы → ast-grep детектирует структурные паттерны (function returning Collection, nested for-loops, composition chains) → hook эмитит `additionalContext` который AI читает как нудж от системы. Существующий `tests-create-update` skill использует тот же механизм через PostToolUse на test files.

5. **Skill semantic matching — один frontmatter, два способа вызова** [VERIFIED]
   - https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md
   - https://www.mindstudio.ai/blog/claude-code-skills-vs-hooks-difference
   - `description:` поле frontmatter parsed Claude Code, embedded в Skill tool description, LLM матчит intent на description при slash invocation **И** при auto-context insertion от PostToolUse hook. Один SKILL.md покрывает оба сценария без дублирования сущностей.

### Findings (architectural implications)

**F1 — Add §6.4 JiT auto-trigger mode (SKILL.md change)**: PostToolUse hook на `Write|Edit` production files; ast-grep detector ищет (a) функция возвращает Collection<T>, (b) N×M nested loops, (c) composition chains; hook эмитит `additionalContext` suggesting `/strong-tests` invocation OR inline invariant test writing. Mirrors Meta JiT "catch test at the moment code is written" paradigm.

**F2 — Frontmatter description явно перечисляет auto-trigger condition (extension.json change)**: existing RU "крепкие/сильные тесты / mutation testing" расширяется на auto-trigger: "auto-trigger via PostToolUse on Write|Edit when function returns collection or has N×M loop". Без явного триггера semantic-matching не попадёт на код-вью.

**F3 — Hypothesis Ghostwriter — cold-start step (SKILL.md §6.1 Greenfield change)**: для Python — Greenfield mode сначала запускает `hypothesis write <function>` (ghostwriter) **как первый шаг** перед invariants list manual. Снижает blank-page paralysis за секунды. Для TS аналога нет (fast-check не имеет ghostwriter) — остаётся manual.

**F4 — Suppression comment + audit log (escape hatch pattern)**: на каждой production-function можно подавить детекцию через `// strong-tests:skip <reason ≥8 chars>` (TS) или `# strong-tests:skip <reason>` (Python). Audit log в `.claude/logs/strong-tests-skips.jsonl` per analogous `scope-gate-escapes.jsonl` pattern (см. `.claude/rules/scope-gate/escape-hatch-audit.md`). Reason < 8 chars → WARN entry. Anti-gaming guidance: не использовать suppress для bypass'а сложного фикса.

**F5 — Detection scope (initial v0.1.0)**: TypeScript + Python через ast-grep catalog. C# / Go / Rust — roadmap (ast-grep supports Go/Rust; C# через Roslyn complementary).

### Behavioural prior input — session-pilot postmortem cross-link

Параллельно с industry research поступил session-pilot agent self-postmortem (sibling repo): `D:\repos\dev-pomogator-session-pilot\.specs\session-pilot\POSTMORTEM-test-discipline.md`. Документ фиксирует 3 раунда работы агента + 2 пинка пользователя в одной сессии:

- **Раунд 1** (B+): тесты написаны проактивно — потому что пользователь явно сформулировал требование. Не показатель внутренней дисциплины.
- **Раунд 2** (D): добавил Tabulator filter без тестов, доложил "работает" без открытия браузера. **Пинок #1: «тестов нет нихуя не работает».**
- **Раунд 3** (D+): починил модалку Last Message с 6 тестами, доложил "16/16 PASS" — но MSG_04 использовал happy-path fixture, реальный edge case (tool-only user/assistant turns) пропущен. **Пинок #2: «нажимаю на ласт меседж и нихуя. почему тестов опять нет».**

Три anti-pattern идентифицированы:
- **A**: «доложил без проверки в реальности» (16/16 unit PASS, но Tabulator silently degraded multiselect → single-select в браузере).
- **B**: «happy-path fixture как доказательство покрытия» (fixture не покрыл класс пустых сообщений который реально встречается в JSONL).
- **C**: «реактивная дисциплина — пока не пнут» (правило `output-invariants-first.md` написано **тем же агентом** за 2 часа до того как он его нарушил).

Sample dialogue snippets (3 пары `user_turn → ai_response_bad / ai_response_good`) подготовлены в YAML формате для supervised fine-tuning датасета (постмортем §9).

Главный системный вывод постмортема цитируется verbatim:

> **«Знание правила ≠ применение правила. Документ на диске не становится поведенческим prior автоматически.»**

Implication для strong-tests SKILL.md: новая §1.5 "Behavioural prior: реактивный vs проактивный workflow" с side-by-side comparison, 3 anti-patterns inline + cross-link на dialogue snippets, 2 дословных пинка как parsing examples. Без этой секции skill даёт technical knowledge но не behavioural prior — а именно это распределение и привело к 2 пинкам в одной сессии.

---

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Tests must call real flow (runInstaller / spawnSync) not unit-only | test creation | FR-1, FR-3 |
| extension-test-quality | `.claude/rules/extension-test-quality.md` | 1:1 BDD↔test mapping, naming `DOMAIN_CODE_NN`, no inline copies | test creation | FR-1 |
| no-test-helper-duplication | `.claude/rules/test-quality/no-test-helper-duplication.md` | Helper dedup; check `tests/e2e/helpers.ts` first | helper definition | NFR-Maintainability |
| extension-layout | `.claude/rules/extension-layout.md` | Skills source MUST live in `.claude/skills/<skill-name>/` of dev-pomogator repo root | skill creation | FR-Layout |
| skill-allowed-tools-audit | `.claude/rules/checklists/skill-allowed-tools-audit.md` | allowed-tools must cover every tool used in workflow | SKILL.md frontmatter | NFR-Reliability |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json is source of truth; update on every artifact change | extension addition | FR-Integration |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| tests-create-update skill | `.claude/skills/tests-create-update/SKILL.md` | 16 anti-patterns, BAD/GOOD assertion table, compliance report at write-time | strong-tests CROSS-REFERENCES not duplicates: write-time prevention vs. post-write strength verification |
| dedup-tests skill | `.claude/skills/dedup-tests/SKILL.md` | jscpd-based dedup of test code | Pattern: scan → classify → ask → fix → verify (similar 5-step shape) |
| run-tests skill | `.claude/skills/run-tests/SKILL.md` | Framework auto-detection (vitest/pytest/dotnet/cargo/go) + wrapper invocation | strong-tests reuses the auto-detect approach |
| test-quality extension | `extensions/test-quality/extension.json` | Hosts both `dedup-tests` and `tests-create-update` skills + 1 hook + 2 tools | strong-tests joins this extension as third skill |
| honnibal mutation-testing | github.com/honnibal/claude-skills | 8-category mutation catalogue + diagnostic-quality rating | strong-tests borrows catalogue (with credit) + extends multi-stack |

### Architectural Constraints Summary

- Skill MUST live at `.claude/skills/strong-tests/` (dev-pomogator repo root) per `extension-layout.md`. Source paths in `extension.json` must point there.
- Skill files (SKILL.md, references/, scripts/) MUST be enumerated in `extensions/test-quality/extension.json` `skillFiles."strong-tests"` for installer/updater tracking.
- `allowed-tools` frontmatter MUST list every tool the workflow uses (Read, Write, Edit, Grep, Glob, Bash, AskUserQuestion, Skill).
- Mutation tool runs must be opt-in (Bash) — installer can't install Stryker/mutmut as global deps; skill detects + offers install command.
- Skill MUST NOT duplicate `tests-create-update` anti-patterns; cross-reference instead. The 16-rule compliance table at write-time and 12-point self-eval at strength-verification time are orthogonal.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Skill duplicates `tests-create-update` and confuses trigger routing | Medium | High | Distinct trigger phrases (RU "крепкие/сильные/mutation", EN "strong/strengthen/mutation-resistant") vs. write-time triggers ("create/update test"). Cross-reference both skills' "Related Skills" sections. Documented separation in DESIGN.md key decisions. |
| Mutation tool not installed in target project — skill becomes useless | High | Medium | Auto-detect via package.json/pyproject.toml; on miss offer (a) install command, (b) AI-driven manual mutation fallback per honnibal-style 8-category catalogue. UC-5 covers explicitly. |
| Mutation runs are slow (5–30 min for medium codebases) and block session | Medium | High | Honour `.claude/rules/pomogator/no-blocking-on-tests.md` — skill instructs to use `run_in_background` for mutation runs >2 min; persistent log via `tee` per `fix-bg-output-loss` spec. Default scope = single file, not whole project. |
| Equivalent mutants produce false-negative kill-rate signal | Medium | Medium | Borrow Meta ACH equivalence detector pattern: skill flags suspicious survivors (mathematically identical paths) with `[EQUIVALENT_SUSPECT]` marker for human review rather than auto-killing. |
| 12-point self-eval becomes a checkbox-ritual without real challenge | High | High | Each item demands concrete evidence: item #1 (mutation gutcheck) requires a real comment-out + test re-run; item #12 (self-challenge) requires an explicit "this assertion would FAIL if production code did X" sentence per assertion. Compliance report shows evidence column. |
| Multi-framework matrix becomes maintenance burden as tools change | Medium | Low | Tooling matrix lives in `references/tooling-setup.md` (on-demand load) not in SKILL.md body. Per-stack section stays small (install + run + threshold). Audit job can flag stale entries. |
| Skill auto-loads on irrelevant requests due to broad description | Medium | Medium | Description uses third-person "Use this skill BEFORE writing tests OR when user reports..." with concrete RU+EN trigger phrases ("крепкие тесты", "fake-positive", "mutation testing"). Negative scope explicitly listed: "NOT for: mocking-heavy unit tests, perf benchmarks, e2e UI tests". |
