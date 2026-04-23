# Research

## Контекст

Фича добавляет **Phase 0 Repo Onboarding** в `specs-workflow` (или новым extension), активируемую автоматически при первом `/create-spec` в target repo. Цель: AI-агент за ~15 минут собирает полный AI-first контекст проекта, сохраняет в `.specs/.onboarding.json` (typed) + `.specs/.onboarding.md` (prose, 6 секций), рендерит в `.claude/rules/onboarding-context.md` + PreToolUse hook. Следующие `/create-spec` в этом же репо пропускают Phase 0 (cache по git SHA).

Ресерч проведён **4 параллельными subagents** плюс **2 deep-dive** по AI-facing artifact schemas и command abstraction. Источники включают академические работы (MetaAgent ICML 2025, SWE-agent, AutoCodeRover), fraemwork'и (LangGraph, CrewAI Flows), production-инструменты (Aider, Cline Memory Bank, Roo Advanced MB, Kimi Flow, Claude Code plugins), и 5 SKILL.md-based онбординг-скиллов в дикой природе.

## Источники

### Onboarding-skills в Claude Code ecosystem
- [codebase-onboarding (affaan-m)](https://github.com/affaan-m/everything-claude-code/blob/main/skills/codebase-onboarding/SKILL.md) — 4 phase sequential, 10 package manifests parallel scan
- [codebase-explorer](https://github.com/quicksilversurfer/codebase-explorer/blob/main/SKILL.md) — 5 phase (0-4), **archetype-first routing с 7 архетипами, 2-min triage**
- [codebase-knowledge-builder](https://github.com/OthmanAdi/codebase-knowledge-builder/blob/master/skills/codebase-knowledge-builder/SKILL.md) — 4 phase gated, `recon_findings.md` scratch file, **text gate "describe arch in 1 paragraph"**
- [repomix-explorer (official)](https://github.com/yamadashy/repomix/blob/main/.claude/skills/repomix-explorer/SKILL.md) — 4 step linear, `--compress` ~70% token reduction
- [improve-codebase-architecture (mattpocock)](https://github.com/mattpocock/skills/blob/main/improve-codebase-architecture/SKILL.md) — **Explore subagent delegation**

### Онбординг в других ecosystems
- [Aider repomap](https://aider.chat/2023/10/22/repomap.html) — tree-sitter 47 languages, PageRank graph ranking, **git-SHA cache**
- [Cline Memory Bank](https://github.com/nickbaumann98/cline_docs/blob/main/prompting/custom%20instructions%20library/cline-memory-bank.md) — **6-file hierarchy**: projectbrief → (productContext, systemPatterns, techContext) → activeContext → progress
- [Roo Advanced MB (VAN/PLAN/CREATIVE/IMPLEMENT)](https://github.com/enescingoz/roo-advanced-memory-bank) — 4 modes complexity routing, JIT rule loading
- [Kimi Code CLI Flow skills](https://moonshotai.github.io/kimi-cli/en/customization/skills.html) — native BEGIN/END/choice state graph
- [Continue.dev repo-map](https://docs.continue.dev/customize/deep-dives/custom-providers) — signature-based indexing
- [rulebook-ai](https://github.com/botingw/rulebook-ai) — cross-agent rule emitter

### State machine patterns
- [LangGraph StateGraph](https://docs.langchain.com/oss/python/langgraph/overview) — `add_conditional_edges` + Checkpointer durable execution
- [CrewAI Flows](https://docs.crewai.com/concepts/flows) — `@start`/`@listen`/`@router` + Pydantic state
- [SWE-agent (Princeton, arxiv 2405.15793)](https://arxiv.org/abs/2405.15793) — trajectory-per-step crash-resumable ACI loop
- [AutoCodeRover (arxiv 2404.05427)](https://arxiv.org/abs/2404.05427) — 2-stage FSM, iter cap (≤10), "sufficient context?" gate
- [MetaAgent (ICML 2025, arxiv 2507.22606)](https://arxiv.org/html/2507.22606v1) — formal FSM `ℳ=(Σ,S,s₀,F,δ)` auto-generated, Condition Verifier per state
- [Claude Agent SDK hooks](https://code.claude.com/docs/en/agent-sdk/hooks) — PreToolUse `permissionDecision`/`updatedInput` intercept

### AI-facing artifact schemas
- [agents.md (official spec)](https://agents.md) — intentionally minimal, no mandatory fields
- [GitHub Blog: "lessons from 2500 agents.md"](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/) — 6 core areas, **3-tier boundaries ✅/⚠️/🚫**
- [OpenAI Codex agents.md guide](https://developers.openai.com/codex/guides/agents-md) — 3-tier precedence (global/project/nested), closest-wins
- [Anthropic CLAUDE.md best practices](https://code.claude.com/docs/en/best-practices) — **verbatim include/exclude table**, "would removing this cause Claude to make mistakes?"
- [Anthropic CLAUDE.md memory docs](https://code.claude.com/docs/en/memory) — `@path` transclusion, path-specific rules
- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference) — skills/commands/hooks/agents manifest

### Command abstraction patterns
- [Taskfile schema](https://taskfile.dev/docs/reference/schema) — `aliases` + `task:` reference indirection
- [casey/just](https://github.com/casey/just) — aliases, wrappers, private recipes
- [devcontainer.json](https://containers.dev/implementors/json_reference/) — object-form `postCreateCommand` with named tasks
- [Cursor ignore files](https://cursor.com/docs/context/ignore-files) — `.cursorignore` vs `.cursorindexingignore` dual semantics

### Предшественники (lineage)
- [rpa-init (EvilFreelancer)](https://github.com/EvilFreelancer/rpa-skills/blob/main/rpa-init/SKILL.md) — 6-section fixed report template
- [cursor-vibe-prompts "01-init"](https://github.com/EvilFreelancer/cursor-vibe-prompts/blob/main/01-init.md) — original RU prompt

## Технические находки

### Находка #1: Два-слойное enforcement — это SOTA

Документирование команды в prose (`AGENTS.md`/`CLAUDE.md`) **не мешает агенту запустить raw `npm test`** — это просто текст. Claude Agent SDK предоставляет `PreToolUse` hook с `permissionDecision: "deny"` + `permissionDecisionReason` — механическая блокировка. SOTA — комбинировать оба: prose для happy path, hook для failsafe. Источник истины — один JSON, из которого рендерится и prose, и hook.

**Применение:** `.specs/.onboarding.json` → render в `.claude/rules/onboarding-context.md` (prose) + compile в hook block в `.claude/settings.local.json`.

### Находка #2: Archetype-first routing экономит время и ошибки

Из codebase-explorer: *"Phase 0: Archetype Detection (First 2 Minutes). Before reading any business logic, determine the **archetype** of the codebase. The archetype determines which vertical slice strategy to use, which smells to prioritize..."* — 7 архетипов (Serverless/Backend API/Frontend/Pipeline/Library/IaC/CLI/ML). Универсальный подход (одни и те же шаги для всех проектов) — проигрывает: backend API исследуется по endpoints, Frontend — по routes, Library — по public exports.

**Применение:** Phase 0 Step 1 — archetype triage **до** parallel recon. Routing далее специфичен типу.

### Находка #3: Git-SHA cache — единственный SOTA-валидный invalidation

Aider repomap кэшируется по git SHA — пересчитывается при изменении HEAD. Это единственный production-grade approach в обзоре. Memory Bank в Cline/Roo не инвалидирует — копится до pruning вручную. TTL cache — устаревает некорректно (проект не меняется, но TTL истёк → пересчёт впустую).

**Применение:** `last_indexed_sha` в `onboarding.json`. При drift — prompt user.

### Находка #4: AI-facing artifact = 17 секций, не 7

Мой первоначальный набросок схемы содержал generic project metadata (languages/frameworks/test_commands/entry_points) — этого **мало для AI file**. Anthropic CLAUDE.md include table и Cline Memory Bank 6-file hierarchy указывают на обязательные AI-specific секции: boundaries (3-tier), gotchas, failure_modes, rules_index, skills_registry, hooks_registry, subagents_registry, mcp_servers, verification, glossary, code_style.examples, imports, ignore. Plus dynamic: active_context, progress.

**Применение:** `.onboarding.json` schema содержит 17 блоков, каждый justified конкретным источником (см. DESIGN.md).

### Находка #5: Parallel subagents для recon — удерживает main context чистым

Mattpocock: *"Use the Agent tool with subagent_type=Explore to navigate the codebase naturally"*. MindStudio blog: subagents для codebase analysis разгружают main context. У нас уже есть Explore subagent (Claude Code), но он не используется в onboarding workflow.

**Применение:** Phase 0 Step 2 — 3 параллельных Explore subagent (manifests+env / tests+configs / entry points). Main context остаётся чистым для финального text gate + синтеза.

### Находка #6: Text gate — missing safety net в нашем workflow

Codebase-knowledge-builder: *"Do not proceed to Phase 2 until the repo's architecture can be described in one paragraph."* Prose gate в дополнение к script gate ловит случаи когда агент формально прошёл scan но ничего не понял.

**Применение:** Phase 0 Step 6 — AI пишет 1 абзац резюме, user подтверждает в чате. Без подтверждения — Phase 1 Discovery заблокирован.

### Находка #7: Baseline test run — уникальная фича (zero hits в обзоре)

Ни один из 19 изученных паттернов не делает baseline test run как часть онбординга. `rpa-init` упоминает "Run the test suite, record where and why" — но это не structured artifact, просто prose. Наш подход — формальный `baseline_tests: {passed, failed, duration, failed_tests: [...]}` в JSON — уникально.

**Ценность:** защита от ложных обвинений в поломке. Если после нашей фичи тесты падают на те же 2 теста что и в baseline — это не мы. Если появились новые failures — это наши.

### Находка #8: Commands через skill reference — GitHub 2500-repo study

Из анализа 2500 реальных AGENTS.md: *"Put relevant executable commands in an early section: `npm test`, `npm run build`, `pytest -v`."* Документируют wrapper **декларативно** — пишут `**Test:** npm test (runs Jest, must pass before commits)`, но НЕ пишут "не используй raw X". Enforcement — через hook, не через prose.

**Применение:** `commands.<name>.via_skill` ссылается на skill. `raw_pattern_to_block` — regex для PreToolUse hook. Два artifacts из одного source.

### Находка #9: Формальный Condition Verifier между states (MetaAgent)

MetaAgent (ICML 2025): *"A Condition Verifier paired with each task-solving agent to check if the agent's output meets any of the pre-defined state transition conditions"*. Академический пруф что наш `spec-status.ts -ConfirmStop` architecturally correct. Расширяем для Phase 0: новое state `Onboarding` в state machine + verifier проверяет `.onboarding.json` схему + `last_indexed_sha != null` + text gate passed.

### Находка #10: Compressed ingestion обязательна для крупных репо

Aider PageRank repomap или repomix `--compress` (70% reduction) — только эти два подхода SOTA. Без compression агент не может "прочитать весь проект" за 1 запрос — 150KB кода = 50k+ tokens. С compression влезает в 10-15k tokens.

**Применение:** Step 3 пытается `repomix` CLI, fallback — shell-based top-N.

## Где лежит реализация

### App-код (будет создан)

- `extensions/{name}/tools/onboard-repo/phase0.ts` — главный orchestrator Phase 0
- `extensions/{name}/tools/onboard-repo/archetype-triage.ts` — Step 1 (2-min triage)
- `extensions/{name}/tools/onboard-repo/manifest-scan.ts` — Step 2 (parallel recon, deploy-able в subagent)
- `extensions/{name}/tools/onboard-repo/ingestion.ts` — Step 3 (repomix wrapper + fallback)
- `extensions/{name}/tools/onboard-repo/baseline-tests.ts` — Step 4 (через `/run-tests`)
- `extensions/{name}/tools/onboard-repo/text-gate.ts` — Step 6 (prompt + user confirmation loop)
- `extensions/{name}/tools/onboard-repo/render-artifacts.ts` — Step 7 (JSON + MD + hook compile)
- `extensions/{name}/tools/onboard-repo/cache-invalidation.ts` — git SHA drift detection

### Scripts (существующие)

- `extensions/specs-workflow/tools/specs-generator/spec-status.ts` — **extend** с новым state `Onboarding`
- `extensions/tui-test-runner/skills/run-tests/SKILL.md` — переиспользуется для Step 4 baseline

### Templates (будут созданы)

- `extensions/{name}/tools/onboard-repo/templates/onboarding.json.schema.json` — JSON Schema для валидации
- `extensions/{name}/tools/onboard-repo/templates/onboarding.md.template` — 6-section report template (порт из rpa-init)
- `extensions/{name}/tools/onboard-repo/templates/onboarding-context.md.template` — rendered rule file template
- `extensions/{name}/tools/onboard-repo/templates/pretool-hook.json.template` — hook block template

### Rules (будут созданы / модифицированы)

- `.claude/rules/specs-workflow/specs-management.md` — **modify**: добавить `### PHASE 0: Repo Onboarding` перед `### PHASE 1: Discovery`
- `.claude/rules/{new-name}/onboarding-artifact-ai-centric.md` — **create**: правило enforcing AI-first content
- `.claude/rules/{new-name}/commands-via-skill-reference.md` — **create**: правило про raw command → skill-ref

### Configuration (будет модифицировано)

- Target project `.claude/settings.local.json` — injection PreToolUse hook block

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| specs-management | `.claude/rules/specs-workflow/specs-management.md` | 4-фазный workflow создания спеков с STOP-точками | /create-spec | FR-1 (Phase 0 integration), FR-6 (state machine) |
| specs-validation | `.claude/rules/specs-workflow/specs-validation.md` | @featureN tags, кросс-ссылки в спеках | Работа в .specs/ | FR-5 (traceability Phase 0 artifacts) |
| no-mocks-fallbacks | `.claude/rules/specs-workflow/no-mocks-fallbacks.md` | Реальные вызовы в тестах, fail-fast | Написание тестов | NFR-Reliability (baseline tests реальные) |
| centralized-test-runner | `.claude/rules/tui-test-runner/centralized-test-runner.md` | Тесты только через /run-tests, raw command блокируются | Запуск тестов | FR-3 (Step 4 использует /run-tests), FR-7 (rendered hook блокирует raw) |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json — source of truth, обновлять files/tools/hooks | Изменение extensions/ | FR-13 (новый extension имеет полный manifest) |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | Managed-файлы с SHA-256, user-overrides backup | Installer/updater | FR-9 (managed artifacts через SHA-256 tracking) |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | .ts import specifiers (не .js) в extensions/ | Edit .ts | NFR-Reliability (Phase 0 TS-код правильно грузится через Node 22.6+ native) |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Temp file + atomic move для конфигов | Write .json | NFR-Reliability (.onboarding.json сохраняется атомарно) |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker тесты в background, НЕ блокировать | Запуск долгих тестов | NFR-Performance (Step 4 baseline если >60s — предупреждение) |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Интеграционные тесты обязательны, unit допустим как доп | Написание тестов фичи | NFR-Reliability (тесты Phase 0 — реальный subprocess, не mock) |
| claude-md-glossary | `.claude/rules/claude-md-glossary.md` | CLAUDE.md = глоссарий, обновлять таблицу при новых rules | Добавление rules | FR-14 (новые rules регистрируются в CLAUDE.md) |
| plan-pomogator | `.claude/rules/plan-pomogator/plan-pomogator.md` | Формат планов разработки | План реализации спеки | Referenced в TASKS.md |
| extension-test-quality | `.claude/rules/extension-test-quality.md` | 1:1 mapping test↔feature scenario, import реального кода | Тесты extension-а | NFR-Reliability (тесты Phase 0 вызывают реальный phase0.ts через spawnSync) |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| specs-workflow | `extensions/specs-workflow/` | 4-фазный spec workflow, state machine via spec-status.ts, validate-spec, audit-spec | **Primary integration point** — Phase 0 добавляется как новая фаза |
| create-spec skill | `.claude/skills/create-spec/SKILL.md` | Scaffold + next-step hint к specs-management.md | **Modify**: добавить detection Phase 0 trigger |
| tui-test-runner / run-tests | `extensions/tui-test-runner/` + skill `run-tests` | Централизованный wrapper для pytest/vitest/jest/dotnet/cargo/go с TUI + YAML status | **Step 4** (baseline tests) использует /run-tests вместо raw cmd |
| suggest-rules | `extensions/suggest-rules/` | Post-session анализ для предложения rules | Будущая интеграция: после Phase 0 можно запустить suggest-rules для proposals |
| pomogator-doctor | `extensions/pomogator-doctor/` | Диагностика 17 проверок, smart reinstall | UC-5 референс: detection "dev-pomogator не установлен" |
| install-diagnostics | `.claude/skills/install-diagnostics/SKILL.md` | Диагностика silent install failures | Не пересекается, но аналогичный паттерн diagnostic artifact |
| rules-optimizer | `.claude/skills/rules-optimizer/SKILL.md` | Frontmatter/merge оптимизация rules | Будущая интеграция: после рендеринга onboarding-context.md запустить оптимизатор |
| debug-screenshot | `.claude/skills/debug-screenshot/SKILL.md` | Screenshot-driven verification | UC-9 verification step (проверить что rule-файл реально создан + hook работает) |
| Explore subagent (Claude Code native) | `Agent tool subagent_type=Explore` | Code exploration в изолированном контексте | **Step 2** — 3 параллельных subagents |
| auto-commit | `extensions/auto-commit/` | Stop-hook auto-commit с LLM-сообщениями | commands.commit.via_skill reference; пример "skill wrapper pattern" |

### BDD Framework Detection (Phase 1.5 Step 4a)

Выполнен `bdd-framework-detector.ts .` на dev-pomogator source repo:

```json
{
  "language": "csharp",
  "framework": "Reqnroll",
  "evidence": ["Reqnroll detected in tests/fixtures/steps-validator/csharp/Project.csproj:11"]
}
```

**Интерпретация:** детектор нашёл Reqnroll в **fixtures** для steps-validator (это fixture для тестирования нашего же validator-а, не production test suite). Реальный production test suite dev-pomogator — **vitest (TypeScript) + pytest (Python)**.

**Для target test-projects фичи `onboard-repo-phase0`:**

| Target test-project | Language | Framework | Install command | Config | Custom convention |
|---------------------|----------|-----------|-----------------|--------|-------------------|
| `tests/e2e/onboard-repo/*.test.ts` | TypeScript | **vitest** (уже установлен) | `npm install --save-dev vitest` (installed) | `vitest.config.*` | Custom BDD convention: vitest + analyze-features.ts grep по `@featureN` tags |
| `tests/features/onboard-repo/*.feature` | Gherkin | **Custom** (не Reqnroll/Cucumber.js/behave) | Нет install — файлы парсятся через `analyze-features.ts` | `specs-workflow/analyze-features.ts` | Custom convention: hand-written Gherkin читается валидатором, исполняется через vitest @featureN tests |

**Hooks для тестов фичи:**

| Hook файл | Тип | Scope | Что делает |
|-----------|-----|-------|------------|
| `tests/e2e/helpers.ts` | shared helpers | per-test-file | Helper функции для integration tests (spawnSync wrappers) — reuse |
| `tests/e2e/setup/docker-setup.ts` | BeforeAll | global | Docker container setup для E2E — reuse |
| (будет) `tests/e2e/onboard-repo/fixtures/` | fixtures | per-scenario | Синтетические target репо: `fake-python-api/`, `fake-nextjs-frontend/`, `fake-monorepo/`, `fake-empty/`, `fake-no-tests/`, `fake-no-git/` для EC-1..EC-6 |
| (будет) `tests/e2e/onboard-repo/fixtures/cleanup.ts` | AfterEach | per-scenario | Удалить созданные `.specs/.onboarding.*` файлы + restore `.claude/settings.local.json` после каждого теста (идемпотентность) |

### Architectural Constraints Summary

**Обязательные constraints (из правил выше):**

1. **Intégration в specs-management.md, не standalone** — Phase 0 добавляется как новая фаза в существующий 4-фазный workflow, не отдельный skill без связи
2. **extension.json как source of truth** — новый extension (или модификация specs-workflow) имеет полный manifest с files/tools/rules/skillFiles/hooks
3. **Managed files через SHA-256** — `.onboarding.json`, `.onboarding.md`, `.claude/rules/onboarding-context.md` трекаются в `~/.dev-pomogator/config.json` с хешами; user-модификации backup-ятся в `.dev-pomogator/.user-overrides/`
4. **TypeScript extensions require `.ts` import specifiers** — все новые .ts файлы в `extensions/*/tools/onboard-repo/` используют `./foo.ts` не `./foo.js`
5. **Atomic config writes** — `.onboarding.json` пишется через temp file + `fs.move` overwrite
6. **Baseline tests через `/run-tests`, не raw cmd** — Step 4 триггерит skill, не spawn `pytest` напрямую. Это dogfooding rule.
7. **PreToolUse hook идёт в `.claude/settings.local.json`** — не в team `.claude/settings.json` (personal-pomogator pattern)
8. **Integration tests обязательны** — тесты Phase 0 работают через spawnSync + реальные fixtures репо, unit допустим как дополнение

**Ограничения архитектуры dev-pomogator применительно к Phase 0:**

- **Идемпотентность:** повторный Phase 0 в том же репо с тем же git SHA = no-op (cache hit). Flag `--refresh-onboarding` обходит cache.
- **Isolation:** artifacts Phase 0 живут в `.specs/` target репо, НЕ в `.dev-pomogator/tools/` (generated) и НЕ в `~/.dev-pomogator/` (global config). Они — artifacts фичи, не dev-pomogator инфраструктуры.
- **Coexistence с /init:** Phase 0 НЕ читает и НЕ пишет `CLAUDE.md`. Respect-ит его наличие (записывает в `existing_ai_configs`), но живёт параллельно.
- **Performance envelope:** Phase 0 на среднем репо (~1000 файлов) должен укладываться в 15 минут. На крупных (>5000) — warning пользователю, предложение `--quick-onboard` (только archetype + manifest scan без ingestion).

## Выводы

1. **Phase 0 — закрытие РЕАЛЬНОЙ дыры**, не cosmetic improvement. У нас 0 из 10 онбординг-фич из обзора SOTA. Нельзя сказать "мы лучшие" — в этом скоупе нас просто нет.

2. **Two-layer enforcement (prose + hook) из single source** — ключевой архитектурный паттерн. Не документировать wrapper в prose — недостаточно (agent может забыть). Не блокировать hook'ом без prose — недостаточно (user не поймёт почему blocked). Оба из одного `.onboarding.json`.

3. **AI-first schema (17 блоков)** — главный урок переделки. Generic project metadata из Cline techContext.md недостаточно для AI-file. Добавлены boundaries (3-tier), gotchas, failure_modes, rules_index, skills/commands/hooks/subagents registries, verification, glossary — с прямыми pruf-цитатами из Anthropic CLAUDE.md guidance.

4. **Baseline test run — наша уникальная фича**. Ни один из 19 SOTA-паттернов не делает это. Должна стать distinctive value proposition.

5. **Archetype-first routing (2-min triage) перед parallel recon** — смартер чем универсальный подход. Экономит время и улучшает качество для не-backend проектов.

6. **Git-SHA cache invalidation — production-ready approach**. TTL или mtime — inferior. Manual refresh через `--refresh-onboarding` flag как escape hatch.

7. **Parallel Explore subagents** — единственный способ не засорить main context при крупном репо. Уже tooling есть в Claude Code, просто не используется в онбординге.

8. **Text gate — safety net против "формального прохождения scan без понимания"**. Prose gate дополняет script gate.

9. **Coexistence с /init без конфликта**. Пишем в свои файлы, respect-им существующие. Два AI context-а живут параллельно.

10. **Extension boundary:** новый extension `onboard-repo` или интеграция в `specs-workflow` — решается в Phase 2 Design (trade-off separation of concerns vs coupling с 4-phase workflow).
