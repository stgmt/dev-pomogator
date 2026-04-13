# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

## Spec files (scaffold + fill)

| Path | Action | Reason |
|------|--------|--------|
| `.specs/personal-pomogator/README.md` | create | Spec overview + navigation (scaffold-spec.ts generates skeleton) |
| `.specs/personal-pomogator/USER_STORIES.md` | create | [US-1..US-9](USER_STORIES.md) 9 user stories covering personal mode + dogfooding + incident + uninstall skill |
| `.specs/personal-pomogator/USE_CASES.md` | create | [UC-1..UC-12](USE_CASES.md) 12 use cases включая fresh install, re-install, dogfooding, broken dist, fail-soft, collision, uninstall, MCP personal, secret detection, AI skill trigger |
| `.specs/personal-pomogator/RESEARCH.md` | create | Context analysis + Project Context & Constraints (relevant rules scan + existing patterns) + Claude Code settings.local.json docs citation |
| `.specs/personal-pomogator/REQUIREMENTS.md` | create | Traceability matrix FR↔AC↔UC↔@featureN |
| `.specs/personal-pomogator/FR.md` | create | [FR-1..FR-11](FR.md) 11 functional requirements с @featureN тегами |
| `.specs/personal-pomogator/NFR.md` | create | Performance/Security/Reliability/Usability для personal mode |
| `.specs/personal-pomogator/ACCEPTANCE_CRITERIA.md` | create | [AC-1..AC-11](ACCEPTANCE_CRITERIA.md) EARS формат (WHEN/THEN/IF/SHALL) |
| `.specs/personal-pomogator/DESIGN.md` | create | Компоненты + reuse plan + BDD Test Infrastructure (TEST_DATA_ACTIVE) + алгоритмы |
| `.specs/personal-pomogator/TASKS.md` | create | TDD-порядок: Phase 0 BDD foundation → Phase 1-8 implementation → Phase 9 refactor |
| `.specs/personal-pomogator/FILE_CHANGES.md` | create | Этот файл — список всех файлов к изменению |
| `.specs/personal-pomogator/CHANGELOG.md` | create | Keep-a-Changelog entry для personal-pomogator feature |
| `.specs/personal-pomogator/FIXTURES.md` | create | Fixtures inventory: F-1..F-12, gap analysis, cleanup strategy |
| `.specs/personal-pomogator/personal-pomogator.feature` | create | 33 BDD сценария в 9 @featureN группах (PERSO_10..93) |
| `.specs/personal-pomogator/personal-pomogator_SCHEMA.md` | create | Schema definitions (optional, may be empty для этой фичи) |

## Implementation: new modules (create)

| Path | Action | Reason |
|------|--------|--------|
| `src/installer/self-guard.ts` | create | [FR-4](FR.md#fr-4-self-guard-для-dev-pomogator-репо-feature3): `isDevPomogatorRepo(repoRoot)` детект "running in dev-pomogator source repo" |
| `src/installer/gitignore.ts` | create | [FR-1](FR.md#fr-1-managed-gitignore-block-feature1): marker block writer/remover/collapse helper, atomic write |
| `src/installer/settings-local.ts` | create | [FR-2](FR.md#fr-2-settingslocaljson-target-для-hooksenv-feature2), [FR-3](FR.md#fr-3-legacy-migration-из-settingsjson-feature2): writer + legacy migration + strip helpers |
| `src/installer/collisions.ts` | create | [FR-7](FR.md#fr-7-collision-detection-через-git-ls-files-feature6): git ls-files collision detection batched |
| `src/installer/uninstall-project.ts` | create | [FR-8](FR.md#fr-8-per-project-uninstall-command-feature7): per-project uninstall function с self-guard refuse |
| `src/installer/mcp-security.ts` | create | [FR-10](FR.md#fr-10-secret-detection-в-project-mcpjson-feature8): secret pattern detection в project .mcp.json |
| `src/scripts/tsx-runner-bootstrap.cjs` | create | [FR-6](FR.md#fr-6-fail-soft-hook-wrapper-feature5): fail-soft wrapper для hook commands, try/catch MODULE_NOT_FOUND |

## Implementation: new extension (create)

| Path | Action | Reason |
|------|--------|--------|
| `extensions/personal-pomogator/extension.json` | create | [FR-11](FR.md#fr-11-ai-agent-uninstall-skill-feature9): minimal extension manifest hosting uninstall skill |
| `extensions/personal-pomogator/skills/dev-pomogator-uninstall/SKILL.md` | create | [FR-11](FR.md#fr-11-ai-agent-uninstall-skill-feature9): Claude Code Skill для AI агента — 5-шаговый алгоритм soft-removal |

## Implementation: modify existing

| Path | Action | Reason |
|------|--------|--------|
| `src/installer/claude.ts` | edit | Wire self-guard + gitignore writer + settings.local routing + collision detection + mcp-security. New helper `collectManagedPaths`. [FR-1, FR-2, FR-3, FR-4, FR-7, FR-10](FR.md) |
| `src/installer/shared.ts` | edit | [FR-5](FR.md#fr-5-loud-fail-setupglobalscripts-feature4): loud-fail в `copyBundledScript`, post-install verify в `setupGlobalScripts`, [FR-6](FR.md#fr-6-fail-soft-hook-wrapper-feature5): bootstrap copy, `makePortableTsxCommand` → bootstrap path |
| `src/updater/hook-migration.ts` | edit | Consistent с FR-2: обновить migration чтобы таргетил `.claude/settings.local.json` не `.claude/settings.json` |
| `src/index.ts` | edit | [FR-8](FR.md#fr-8-per-project-uninstall-command-feature7): CLI command parsing `uninstall --project [--dry-run]` |
| `scripts/build-check-update.js` | edit | [FR-6](FR.md#fr-6-fail-soft-hook-wrapper-feature5): добавить `tsx-runner-bootstrap.cjs` в dist/ copy list |
| `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py` | edit | [FR-9](FR.md#fr-9-force-global-mcp-writes-feature8): `get_config_path()` force-global, убрать project-first branch. Info print при save |
| `extensions/specs-workflow/extension.json` | edit | Если изменён `setup-mcp.py` — версия manifest bump (если нужно) |

## Tests (create + edit)

| Path | Action | Reason |
|------|--------|--------|
| `tests/e2e/personal-pomogator.test.ts` | create | Integration тесты 1:1 с .feature через runInstaller helpers. 33 scenarios PERSO_10..93 |
| `tests/e2e/helpers.ts` | edit | Добавить helper `createFakeDevPomogatorRepo(targetDir)` для PERSO_30..33 self-guard tests (если не можем reuse initGitRepo) |
| `tests/features/plugins/personal-pomogator/PERSO001_personal-pomogator.feature` | create | Симлинк или копия `.specs/personal-pomogator/personal-pomogator.feature` для specs-validator (если нужно separate tests/features path) |

## Docs (edit)

| Path | Action | Reason |
|------|--------|--------|
| `CLAUDE.md` | edit | Architecture секция: settings.local.json routing, MCP force-global, uninstall skill. Rules таблица: новые rule если создадим. Per `.claude/rules/claude-md-glossary.md` |
| `.claude/rules/updater-managed-cleanup.md` | edit | Упомянуть gitignore marker block в scope cleanup + settings.local.json stripping при uninstall |

## Summary counts

- **Spec files**: 15 (create через scaffold-spec.ts)
- **New src modules**: 7 (self-guard, gitignore, settings-local, collisions, uninstall-project, mcp-security, tsx-runner-bootstrap.cjs)
- **New extension files**: 2 (extension.json + SKILL.md)
- **Modified src files**: 5 (claude.ts, shared.ts, hook-migration.ts, index.ts, build-check-update.js)
- **Modified extensions**: 1 (setup-mcp.py)
- **Tests**: 1 new file (personal-pomogator.test.ts), 1 edit (helpers.ts)
- **Docs**: 2 edits (CLAUDE.md, updater-managed-cleanup.md)

**Total: 33 files** (15 spec + 7 new src + 2 new ext + 5 modified src + 1 modified ext + 2 tests + 2 docs — 1 overlap на tests/features symlink if decided против = 33)
