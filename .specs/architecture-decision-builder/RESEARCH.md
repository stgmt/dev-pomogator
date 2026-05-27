# Research

## Контекст

Subskill `architecture-decision-builder` закрывает gap: `create-spec` (specs-workflow) формализует фичу внутри **уже выбранного** стека (FR/AC/DESIGN описывают поведение; `## Key Decisions` в DESIGN.md — мелкие выборы для текущей фичи типа vitest vs jest). Для greenfield-проектов (только PRD-маркдауны, кода нет) нет инструмента для multi-variant анализа архитектуры с артефактом "Variant A/B/C/D + pros/cons/cost/когда-выбрать/рекомендация". Skeleton провалидирован вручную (dry-run) на `D:\repos\bhph-early-warning` — рекомендация (Supabase+n8n+Edge Functions) совпала с реальным выбором в HANDOFF.md.

## Источники

- [adr/madr v4 template](https://github.com/adr/madr/blob/develop/template/adr-template.md) — Markdown ADR, прочитан агентом целиком [VERIFIED]
- [kubernetes/enhancements KEP template](https://github.com/kubernetes/enhancements/blob/master/keps/NNNN-kep-template/README.md) — Non-Goals секция [VERIFIED]
- [DPR Y-Form ADR (Olaf Zimmermann)](https://socadk.github.io/design-practice-repository/artifact-templates/DPR-ArchitecturalDecisionRecordYForm.html) — Y-statement формула [VERIFIED]
- [bmad-code-org/BMAD-METHOD bmad-create-architecture](https://github.com/bmad-code-org/BMAD-METHOD) — step-04-decisions.md, 3-tier priority + 5 категорий + cascading [VERIFIED]
- [tc39/how-we-work explainer.md](https://github.com/tc39/how-we-work/blob/main/explainer.md) — Comparison naming, dual-axis [VERIFIED]
- [thoughtworks/build-your-own-radar](https://github.com/thoughtworks/build-your-own-radar) — Adopt/Trial/Assess/Hold ring [VERIFIED]
- [microsoft/OpenAIWorkshop ARCHITECTURE.md](https://github.com/microsoft/OpenAIWorkshop/blob/main/ARCHITECTURE.md) — ✅/❌ emoji, bifurcated recommendation, cost quantification [VERIFIED]
- [tezgiden/AgenticSolutionForE-commerceSearchEvaluation architecture.md](https://github.com/tezgiden/AgenticSolutionForE-commerceSearchEvaluation/blob/main/architecture.md) — Option 1/2/3 + honest recommendation [VERIFIED]
- [RooCodeInc/Roo-Code mode.ts](https://github.com/RooCodeInc/Roo-Code/blob/main/packages/types/src/mode.ts) — Architect mode `fileRegex: \\.md$` + "no time estimates" [VERIFIED]
- [github/spec-kit plan-template.md](https://github.com/github/spec-kit/blob/main/templates/plan-template.md) — NEEDS CLARIFICATION marker + Constitution Check gate [VERIFIED]
- Negative result: Cursor (awesome-cursorrules), Cline, Aider, OpenHands — multi-variant tech-proposal не делает никто; везде архитектура = input, не output [VERIFIED]

## Технические находки

### Attribution: что украдено из каждого источника

- **BMAD step-04-decisions.md** → 3-tier приоритет (Critical/Important/Deferred), 5 fixed категорий (Data/Auth/API/Frontend/Infra) как стартовый chek-list axis enumeration, cascading implications check ("this choice means we'll also need to decide…"), mandatory web-search перед фиксацией версий, facilitator pattern ("NEVER generate content without user input")
- **MADR v4** → RACI frontmatter (decision-makers/consulted/informed), `## Decision Drivers`, `Good/Neutral/Bad` taxonomy (Neutral — первоклассная категория, спасает от fake-padding), `### Confirmation` fitness function, status enum с `superseded by`
- **Kubernetes KEP** → `Non-Goals` = наш "When NOT to choose" (главное уникальное; никто больше не делает)
- **Y-statement (Zimmermann)** → 6-частная формула TL;DR-шапка варианта: "In context X, facing Y, we chose Z and against W, to achieve V, accepting U"
- **TC39 explainer** → `## Comparison` naming (не "Alternatives"), двух-осевое сравнение (ecosystem libs + cross-language)
- **Thoughtworks Tech Radar** → `Adopt/Trial/Assess/Hold` ring как одно-токенный maturity tag
- **microsoft OpenAIWorkshop** → ✅/◐/❌ emoji, bifurcated recommendation ("use X for Y, use Z for W"), cost quantification, setup code per variant
- **tezgiden architecture.md** → "Start with X for one stated reason" recommendation pattern
- **Roo Architect mode** → `.md` edit-sandbox, "never time estimates" (но cost разрешаем — наша deliverable)
- **spec-kit** → `NEEDS CLARIFICATION` marker, Constitution Check gate
- **dev-pomogator research-workflow** → `[VERIFIED]/[UNVERIFIED]/[SINGLE_SOURCE]` markers

### Greenfield contribution (нет ни у кого)

- **Real-world precedent через live octocode grep** — никто из MADR/Rust-RFC/PEP/KEP не требует доказательства что кто-то shipped этот стек
- **Cost band с обязательным live fetch / качественные чипы** вместо устаревающих чисел
- **HTML-визуализация** — все templates pure-markdown, никто не генерит HTML viewer
- **Multi-variant proposal для tech stack** — null в Cursor/Cline/Aider/OpenHands

### Multi-axis = итеративно

Dry-run на bhph показал: реальный greenfield = 4-6 связанных decision-axes (email / LLM / hosting / compliance), не одно решение. HANDOFF.md делал 4 параллельных ресёрча. Поэтому skill работает по оси за раз, итеративно через AskUserQuestion, отдельный файл на ось + INDEX.

## Где лежит реализация

- Reference shape (mirror): `.claude/skills/variant-matrix-build/SKILL.md` — структура subskill (mission/preconditions/inputs/execution/contract/fallback/hard-OUT/escape-hatch) [VERIFIED — прочитан]
- Helper scripts pattern: `extensions/specs-workflow/tools/specs-generator/variant-matrix/` (trigger-phrases.ts, parsers.ts, audit.ts, escape-log.ts, variant-matrix-cli.ts) [VERIFIED — в extension.json toolFiles]
- create-spec integration: `.claude/skills/create-spec/SKILL.md` Phase navigation [VERIFIED — прочитан]
- Manifest: `extensions/specs-workflow/extension.json` v1.20.0 [VERIFIED — прочитан]
- Dry-run артефакт: `D:\repos\bhph-early-warning\ARCHITECTURE_PROPOSAL.md` (валидация формата)

## Выводы

Skeleton рабочий (dry-run попал в реальный выбор Ivan). Subskill mirror-ит variant-matrix-build: standalone trigger + create-spec Phase 1.75 (multi-invocation, stateless через QUEUE.json). Новизна — HTML-визуализация + live-fetch precedent/версий + multi-axis итеративность. 2 rules (when-to-build + escape-hatch) по паттерну variant-matrix. Новая audit category ARCHITECTURE_COVERAGE (9-я).

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-layout | `.claude/rules/extension-layout.md` | rules/skills в `.claude/` repo root, не в extensions/<ext>/ | создание skill/rule | FR-7 |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | `.ts` (не `.js`) в relative imports extensions/**/*.ts | helper scripts | FR-1, FR-2 |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | все файлы в extension.json | manifest | FR-7 |
| extension-test-quality | `.claude/rules/extension-test-quality.md` | 1:1 test↔feature, DOMAIN_CODE_NN, integration-first | tests | FR-1..FR-10 |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | тесты через runInstaller/spawnSync | tests | FR-1..FR-10 |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| variant-matrix-build | `.claude/skills/variant-matrix-build/SKILL.md` | subskill shape + 2-rule pattern + CLI/audit/escape-log | Mirror target |
| requirements-chk-matrix | `.claude/skills/requirements-chk-matrix/SKILL.md` | Phase 2 child-skill контракт | Phase 1.75 pattern |
| specs-generator core | `extensions/specs-workflow/tools/specs-generator/` | scaffold/validate/spec-status/audit | Helper scripts co-location |
| BDD framework | `tests/e2e/*.test.ts` + `tests/specs-workflow/` | TypeScript + vitest, integration-first (spawnSync), 1:1 .feature mapping | ARCH001-005 тесты пишутся как .test.ts. NB: bdd-framework-detector ложно вернул C#/Reqnroll из fixture `tests/fixtures/steps-validator/csharp/Project.csproj` — это fixture, не реальный стек проекта |

### Architectural Constraints Summary

Phase 1.5 дополнит. Базово: subskill ОБЯЗАН жить в `.claude/skills/` (extension-layout); helper scripts в `tools/specs-generator/architecture-decision/` с `.ts` imports; всё перечислено в extension.json; тесты integration-first 1:1 с .feature.

## Risk Assessment

> Auto-populated by Skill `discovery-forms` during Phase 1. Hook `risk-assessment-guard` enforces:
> when `## Risk Assessment` heading is present, the table below must have ≥2 non-placeholder rows
> with Likelihood ∈ Low/Medium/High, Impact ∈ Low/Medium/High, and non-empty Mitigation.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Over-application — skill триггерится на не-greenfield (brownfield/уже выбранный стек), генерит лишние артефакты | Medium | High | Hard-OUT signals в when-to-build rule (build-manifest detection: package.json/*.csproj/pyproject.toml/Cargo.toml/go.mod) + escape hatch `[skip-architecture-axis:]` — mirror H1 mitigation из variant-matrix |
| Cost numbers устаревают (knowledge cutoff Jan 2026) → пользователь принимает решение по неверной цене | High | Medium | Качественные чипы `$/$$/$$$` вместо точных цифр + live-fetch только версий (не цен) + явный `[UNVERIFIED — knowledge cutoff]` маркер |
| Position bias — LLM фаворитизирует первый описанный / самый словоохотливый вариант (MIT 2026 study) | Medium | Medium | Randomize variant order (Fisher-Yates seeded by axis.id) + equal word-budget ±15% per variant; recommended-card pinned top независимо от random order |
| Browser launch fail (WSL/headless/proxy) → skill падает | Low | Medium | ENOENT-safe open-in-browser возвращает launched=false с fallback-путём, печатает путь, не бросает исключение; mermaid CDN gated --no-mermaid с ASCII fallback |
