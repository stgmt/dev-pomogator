# onboard-repo extension

**Phase 0 Repo Onboarding** — автоматический AI-first онбординг target репо при первом `/create-spec` в проекте. Интегрируется как новая фаза ПЕРЕД Phase 1 Discovery в существующем `specs-workflow`.

Полная спецификация: `.specs/onboard-repo-phase0/`.

## Что делает

При первом запуске `/create-spec <slug>` в репо без `.specs/.onboarding.json`:

1. **Archetype triage** (2 мин) — классифицирует проект в один из 9 архетипов (python-api, nodejs-frontend, monorepo, dotnet-service, ...)
2. **Parallel recon** — 3 параллельных Claude Code Explore subagents (manifests, tests+configs, entry points)
3. **Ingestion** — `repomix --compress` (70% token reduction) или fallback top-N
4. **Baseline tests** — запускает `/run-tests` skill, фиксирует passed/failed
5. **Scratch findings** (>500 файлов) — external memory для крупных репо
6. **Text gate** — AI пишет 1-абзац резюме, user подтверждает понимание
7. **Finalize** — валидирует по JSON Schema, atomic write, рендерит dual artifacts

## Produced artifacts (в target репо)

- `.specs/.onboarding.json` — 17-блочная typed schema (AI-first: rules_index / skills_registry / hooks_registry / mcp_servers / boundaries 3-tier / gotchas / glossary / verification / ...)
- `.specs/.onboarding.md` — 6-секционный human-readable report
- `.claude/rules/onboarding-context.md` — managed prose-rule (always-loaded)
- PreToolUse hook в `.claude/settings.local.json` — блокирует raw commands (`npm test`) когда есть skill-обёртка (`/run-tests`)

## Cache

Invalidation по git SHA: `last_indexed_sha != git rev-parse HEAD`. Drift ≥ 5 commits → prompt user. Manual override: `/create-spec <slug> --refresh-onboarding`.

## Installation

```bash
npx github:stgmt/dev-pomogator --claude --plugins=onboard-repo
```

Extension depends on `specs-workflow` и `tui-test-runner`.

## Development

См. `.specs/onboard-repo-phase0/TASKS.md` для TDD-ordered плана реализации.
