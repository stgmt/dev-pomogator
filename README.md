# dev-pomogator

Canonical Claude Code marketplace plugin — командные стандарты, рабочие процессы, скиллы и хуки. Distributed через Anthropic plugin marketplace, работает в Claude Code CLI и Claude Desktop.

**Что это даёт:**
- Единый формат планов, спецификаций и коммитов для всей команды
- Автокоммиты с LLM-генерацией сообщений при завершении работы агента
- Анализ сессий и автоматическое предложение правил для проекта
- Защита от типичных LLM-ошибок (лишние файлы в корне, пустые фолбеки)
- TUI/statusline мониторинг тестов, BDD/specs workflow, hooks-автоматизация
- Pomogator-doctor diagnostic skill (17 environment checks)

> **v2.0 BREAKING**: npm install path удалён. Distribution через canonical Anthropic plugin marketplace (`/plugin marketplace add` + `/plugin install`). Cursor support удалён полностью. Existing v1 users — см. [Migration v1 → v2](#migration-v1--v2) ниже.

## Установка

### Canonical (рекомендуется)

В Claude Code CLI или Desktop session:

```
/plugin marketplace add stgmt/dev-pomogator
/plugin install dev-pomogator@stgmt
/reload-plugins
```

В Claude Desktop: после `/plugin install` restart Desktop application для подхвата нового plugin (или используй UI «**+**» button → «**Plugins**» browser для install с visual feedback).

### Scope flags (canonical Anthropic per plugin-marketplaces.md)

```
/plugin install dev-pomogator@stgmt --scope user      # default — across all your projects
/plugin install dev-pomogator@stgmt --scope project   # committed to <cwd>/.claude/settings.json (team-shared)
/plugin install dev-pomogator@stgmt --scope local     # personal per-repo (gitignored settings.local.json)
```

## Что устанавливается

После canonical install Claude Code copies plugin к `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/`:

- **Skills** (19): `/dev-pomogator:create-spec`, `/dev-pomogator:run-tests`, `/dev-pomogator:plan-pomogator`, `/dev-pomogator:pomogator-doctor`, `/dev-pomogator:research-workflow` и др. — invokable через `Skill` tool или slash command
- **Commands**: `/reflect`, `/simplify`, `/pomogator-doctor` — slash commands из plugin
- **Hooks** (25): SessionStart, Stop, PreToolUse, PostToolUse, UserPromptSubmit — declared в `.claude-plugin/hooks.json` plugin manifest
- **MCP servers**: настраиваются плагином через `.mcp.json`
- **Rules**: `.claude/rules/` content для context loading

`enabledPlugins` declaration автоматически добавляется в `~/.claude/settings.json` соответствующего scope.

## Skills overview

| Skill | Purpose |
|-------|---------|
| `create-spec` | 4-фазный workflow создания/обновления specs (Discovery → Context → Requirements+Design → Finalization) |
| `research-workflow` | Hypothesis-FIRST research с triangulation через 3 INDEPENDENT angles + fail-loud markers |
| `pomogator-doctor` | Environment diagnostic: 17 checks (Node/Git/Bun/Python/MCP/hooks/env vars) с severity grouping |
| `run-tests` | Centralized test runner с TUI integration (vitest/jest/pytest/dotnet/cargo/go auto-detection) |
| `tests-create-update` | TDD-first test creation, integration tests preferred over unit |
| `dev-pomogator-uninstall` | Soft removal of dev-pomogator artifacts из project |
| `dedup-tests` | Duplicate test code detection через jscpd |
| `deep-insights` | Quantitative analysis Claude Code usage patterns |
| `debug-screenshot` | Screenshot-driven UI verification |
| `proxy-up` | Manage local Claude subscription proxy |
| `use-claude-subscription` | Wire project к Claude subscription (env config) |
| `context-menu` | Windows right-click Claude Code integration |
| `claude-in-chrome-multisession` | Multi-session Chrome MCP safety |
| `chrome-devtools-mcp-mux` | Chrome DevTools MCP multiplexer (multi-session) |
| `dev-pomogator-uninstall` | Removal utility |
| ... + others (skills/discovery-forms, requirements-chk-matrix, task-board-forms, variant-matrix-build для create-spec ecosystem) |

## v4: spec-generator (rc1)

The `spec-generator-v4` track ships an MCP server + two hooks + a
mechanical cross-spec consistency analyzer on top of the existing
form-guards (v3 soft tier, preserved). Status: rc1 on
`feat/phase-2a-mcp-server-and-hooks` / PR #32.

- **`tools/spec-mcp-server/`** — stdio MCP server registered in
  `.mcp.json` as `dev-pomogator-specs`. 11 read-only tools over an
  in-memory SpecGraph (`get_trace` primary, plus `find_by_tags` /
  `conformance_check` / `search` / `get_node` / `list_phase_tasks` /
  `get_test_result` / `find_orphans` / `get_coverage_summary` /
  `validate_anchor` / `list_specs`). SQLite WAL backend is opt-in
  behind `.spec-config.json::storage.sqlite_enabled = true`.

- **`tools/spec-conformance-guard/`** — PreToolUse hard hook. Denies
  writes to `.specs/<slug>/*.md` and `.feature` files that violate
  structural invariants (duplicate FR ids / malformed frontmatter /
  malformed Gherkin / invalid anchor pattern). Version-gated per
  FR-22 — `.progress.json::version < 4` → allow + log.

- **`tools/spec-conformance-push/`** — PostToolUse soft hook with a
  3-second fixed-window throttle (FR-28). Pushes aggregated conformance
  findings back into the agent context via `<system-reminder>` blocks.

- **`tools/migrate-v3-to-v4/`** — `dev-pomogator-migrate-v3-to-v4` CLI.
  `--suggest-only` mode prints a diff; apply mode prompts per file
  with a 30-second default-skip timeout, then atomically rewrites the
  spec MD and bumps `.progress.json::version` from 3 → 4. Legacy
  `### Requirement: FR-N` triple-anchor headings survive parsing.

- **`.claude/skills/cross-spec-reconcile/`** — mechanical (LLM-free)
  consistency analyzer across all `.specs/<slug>/`. 11 of the 28-code
  finding matrix ship in rc1 — `impl-drift/missing-file`,
  `cross-spec/runtime-identifier-drift`, `cross-spec/concept-overlap`,
  `cross-spec/duplicate-fr-id`, `cross-spec/contradictory-fr`,
  `spec-only/orphan-FR`, `spec-only/uncovered-AC`,
  `spec-only/orphan-task`, `spec-only/missing-fr-section`,
  `impl-drift/test-without-fr`, `schema-drift/missing-feature-heading`.
  YAML + SARIF 2.1.0 output, JSONL audit log for CRITICAL overrides.

- **`.claude/skills/cross-spec-resolve/`** — interactive 7-step walker
  through the YAML report. 5-field explanation block per finding
  (code / severity / class — files+lines — plain — WHY — options),
  Path A/B/C dispatch for `architectural-decision-vs-reality`,
  foreign-spec extra-confirm banner, step-7 atomic
  `resolution_status` stamper.

- **`.claude/skills/architecture-research-workflow/`** — 7-stage
  greenfield architecture-decision skill picked by a complexity
  heuristic (`scripts/complexity-heuristic.ts`) when the prompt
  carries `архитектур*` / `rebuild` / `v\d+` / etc. or ≥3 component
  nouns. 3-rewind hard limit prevents infinite Stage 5 loops.

- **`tools/marksman-installer/`** — Marksman LSP postinstall with
  sha256 verification per FR-27 against a pinned
  `marksman-hashes.json`.

- **Codespaces autostart** — `.devcontainer/scripts/post-start.sh`
  starts the MCP server automatically when `$CODESPACES=true`,
  honouring `.dev-pomogator/.mcp-lock.json` for stale-PID recovery.

See `.specs/spec-generator-v4/CHANGELOG.md` for the full per-FR ledger.

## Migration v1 → v2

Existing v1 users (installed через `npm i -g dev-pomogator` или `npx github:stgmt/dev-pomogator --claude`):

```bash
# Cleanup project + global v1 artifacts
npx tsx https://raw.githubusercontent.com/stgmt/dev-pomogator/main/tools/migrate-v1-to-v2/migrate-v1-to-v2.ts --global

# Or если уже cloned repo locally
cd /path/to/dev-pomogator-canonical-v2
npx tsx tools/migrate-v1-to-v2/migrate-v1-to-v2.ts --global
```

Script:
- Backups user-modified files в `<project>/.dev-pomogator/.user-overrides/<rel-path>` (content hash mismatch detection)
- Removes project-scope managed files (`.claude/skills/<dev-pomogator-managed>/`, `.claude/rules/<managed>/`, `.dev-pomogator/`)
- Removes managed marker block из `<project>/.gitignore` (preserves user entries)
- Removes `~/.dev-pomogator/` директорию (with `--global` flag)
- Smart-merges removal of dev-pomogator entries из `~/.claude/settings.json` (SessionStart hook + statusLine wrapper)
- Removes `~/.config/dev-pomogator/` если existует
- Idempotent — re-running после cleanup → exit 0 + informational

Flags:
- `--project-only` / `--no-global` — только project cleanup
- `--global-only` / `--no-project` — только global cleanup
- `--dry-run` — show что would быть removed без modification

После cleanup → canonical install (`/plugin marketplace add stgmt/dev-pomogator` + `/plugin install dev-pomogator@stgmt` + `/reload-plugins`).

## Diagnostic Doctor

`/pomogator-doctor` slash command или skill invocation проверяет 17 environment aspects:

- 🟢 **Self-sufficient**: Node, Git, plugin cache structure, hooks registry, version match
- 🟡 **Needs env vars**: `AUTO_COMMIT_API_KEY` и др. (ищет в `.env` + `.claude/settings.local.json → env`)
- 🔴 **Needs external deps**: Bun, Python + packages, Docker, MCP servers

Output: severity-coded report + actionable hints. Если detected v1 install — предлагает migration script. Если detected canonical install issue — предлагает `/plugin install dev-pomogator@stgmt --force`.

## Architecture (canonical v2.0)

- **Plugin manifests**: `.claude-plugin/{plugin.json, marketplace.json, hooks.json}` — canonical Anthropic schema, plugin self-contained для distribution
- **Skills**: `.claude/skills/<name>/SKILL.md` — distributed via plugin.json `"skills": ".claude/skills"` field override
- **Commands**: `.claude/commands/*.md` — slash commands
- **Hook scripts**: `tools/<tool>/<script>.ts` — TypeScript scripts, loaded via `tools/_shared/bootstrap.cjs` + `tools/_shared/tsx-runner.js` (multi-strategy tsx fallback)
- **Migration script**: `tools/migrate-v1-to-v2/migrate-v1-to-v2.ts` — standalone, user-driven (no plugin dependency)

## Требования

- **Node.js** ≥ 18 (с npm для tsx)
- **Git**
- **Claude Code** CLI ≥ 2.x (с plugin marketplace support) ИЛИ Claude Desktop application

## Лицензия

MIT
