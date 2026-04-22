# onboard-repo-phase0

**Phase 0 Repo Onboarding** — автоматический AI-first онбординг target репо при первом `/create-spec`. Добавляется как новая фаза ПЕРЕД Phase 1 Discovery в существующем `specs-workflow`. Результат: `.specs/.onboarding.json` (typed 17-блочная schema) + `.specs/.onboarding.md` (6-секционный prose report) + управляемое правило `.claude/rules/onboarding-context.md` + PreToolUse hook в `.claude/settings.local.json`.

## Ключевые идеи

- **AI-first artifact:** `.onboarding.json` содержит 17 AI-specific блоков (rules_index, skills_registry, hooks_registry, mcp_servers, boundaries 3-tier, gotchas, glossary, verification, env_requirements) — не generic project metadata. Опирается на Anthropic CLAUDE.md best practices + Cline Memory Bank + AGENTS.md 2500-repo study.
- **Two-layer enforcement (single source of truth):** из одного `.onboarding.json` рендерятся декларативный prose-rule (`onboarding-context.md`) И механический PreToolUse hook (blocks raw `npm test`, `pytest` когда есть skill-обёртка `/run-tests`). Pattern: Claude Agent SDK `permissionDecision` + `updatedInput`.
- **Commands via skill-reference, не hardcode:** если в target репо есть skill-обёртка (`/run-tests`, `auto-commit`) — `commands.<name>.via_skill` ссылается на skill name, `raw_pattern_to_block` блокирует прямой вызов. Raw command = fallback degraded mode only.
- **Git-SHA cache invalidation:** `last_indexed_sha` сравнивается с `git rev-parse HEAD`. Cache hit ≤ 3s. Drift ≥ 5 commits → prompt user refresh/continue. Manual override `--refresh-onboarding`.
- **Archetype-first routing:** 2-минутный triage на 9 архетипов (python-api / nodejs-frontend / fullstack-monorepo / dotnet-service / cli-tool / library / infra / ml-research / unknown). Дальнейшие шаги routing-специфичны.
- **3 parallel Explore subagents для recon** в одном tool call — keeps main context clean. Priority merge: Subagent A (manifests) > B (tests+configs) > C (entry points).
- **Baseline test run через `/run-tests`:** уникальная фича против всех 19 найденных SOTA-паттернов. Фиксирует passed/failed до изменений — защита от ложных обвинений агенту в поломках.
- **Text gate перед Phase 1:** агент пишет 1-абзац резюме архитектуры, user подтверждает. Catch "formal scan без понимания" до инвестирования часов в FR/AC.

## Где лежит реализация

- **Новый extension:** `extensions/onboard-repo/tools/onboard-repo/**` (phase0 orchestrator, 7 steps, 2 renderers, 5 lib helpers, schemas, templates)
- **Cross-extension edits:** `.claude/rules/specs-workflow/specs-management.md` (add Phase 0), `.claude/skills/create-spec/SKILL.md` (trigger detection), `extensions/specs-workflow/tools/specs-generator/spec-status.ts` (new state)
- **New rules:** `.claude/rules/onboard-repo/{onboarding-artifact-ai-centric,commands-via-skill-reference}.md`
- **Tests:** `tests/e2e/onboard-repo/*.test.ts`, `tests/features/onboard-repo/*.feature`, `tests/fixtures/onboard-repo-fake-repos/**`
- **Artifacts produced на target репо (per install):** `.specs/.onboarding.json`, `.specs/.onboarding.md`, `.specs/.onboarding-history/`, `.claude/rules/onboarding-context.md`, injected hook block в `.claude/settings.local.json`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 15 stories покрытие всех @feature1..@feature15
- [USE_CASES.md](USE_CASES.md) — 13 UC happy paths + 6 Edge Cases
- [RESEARCH.md](RESEARCH.md) — SOTA обзор 19 паттернов (codebase-explorer, codebase-knowledge-builder, Aider repomap, Cline Memory Bank, LangGraph/CrewAI/SWE-agent/AutoCodeRover/MetaAgent state machines) с URL-pruf цитатами; 10 technical findings
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix FR↔AC↔UC↔@feature
- [FR.md](FR.md) — 20 functional requirements + 1 OUT OF SCOPE (tree-sitter PageRank)
- [NFR.md](NFR.md) — Performance (≤15 min), Security (secrets redaction, path traversal), Reliability (atomic writes, idempotent re-run), Usability, Maintainability, Observability, Compatibility, Risks, Out of Scope
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — EARS формат AC-1..AC-20 по FR-1..FR-20
- [DESIGN.md](DESIGN.md) — архитектура, компоненты, алгоритм 7 шагов, BDD Test Infrastructure (TEST_DATA_ACTIVE), design decisions, reuse существующих компонентов
- [FILE_CHANGES.md](FILE_CHANGES.md) — 52 create + 6 edit файлов
- [FIXTURES.md](FIXTURES.md) — 20 fixtures (F-1..F-20) + dependencies graph + gap analysis
- [onboard-repo-phase0_SCHEMA.md](onboard-repo-phase0_SCHEMA.md) — полная JSON Schema v1.0 для `.onboarding.json` (17 блоков + метаданные)
- [onboard-repo-phase0.feature](onboard-repo-phase0.feature) — 34 BDD сценария (ONBOARD001..ONBOARD034)
- [TASKS.md](TASKS.md) — TDD план: Phase -1 → Phase 0 (fixtures/hooks/red) → Phase 1..13 (green по features) → Refactor
- [CHANGELOG.md](CHANGELOG.md) — Keep-a-Changelog
