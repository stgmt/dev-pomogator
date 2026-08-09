# Research

## Context

dev-pomogator was historically specified around Claude Code plugin distribution. The user clarified that Codex support must be parallel to Claude support, not a replacement. The immediate target is a whitelist for Codex plugin support, with `context-menu` as the first approved Codex-compatible plugin surface.

This research intentionally starts with the distribution/runtime facts before writing implementation requirements, because Codex plugin behavior differs from older Claude-oriented assumptions.

## Hypotheses

| ID | Hypothesis | Status | Evidence |
|----|------------|--------|----------|
| H1 | Codex has a native plugin system with marketplace sources. | VERIFIED | `codex plugin --help`, `codex plugin marketplace --help`, `codex plugin marketplace list`; OpenAI Developers Plugins overview. |
| H2 | Codex plugin manifests are rooted at `.codex-plugin/plugin.json`, not `.Codex-plugin/plugin.json` or `.claude-plugin/plugin.json`. | VERIFIED | Official build plugins doc says `.codex-plugin/plugin.json` is the required entry point; local cache contains `.codex-plugin/plugin.json` for `browser`, `context-mode`, `documents`, `pdf`, `spreadsheets`, `presentations`, `template-creator`. |
| H3 | A repo/team marketplace can whitelist a curated list of plugins through `.agents/plugins/marketplace.json`. | VERIFIED | Official marketplace metadata section defines `$REPO_ROOT/.agents/plugins/marketplace.json` and `plugins[]`; plugin-creator skill uses the same default shape. |
| H4 | Existing Claude plugin artifacts can stay in place while Codex metadata is added separately. | LIKELY | Codex cache contains both `.claude-plugin` and `.codex-plugin` variants for some plugins; Codex also exposes a `claude-plugins-official` marketplace. Needs implementation verification in this repo. |
| H5 | Plugin-bundled hooks require Codex trust review and cannot be assumed to run immediately after install. | VERIFIED | Official build plugins and hooks docs state plugin hooks are non-managed hooks and are skipped until reviewed/trusted. |
| H6 | The context-menu feature is a good first whitelist entry because it already has a spec, installer, doctor drift check, and runtime artifacts. | VERIFIED | `.specs/context-menu/`, `tools/context-menu/postinstall.ts`, `.agents/skills/context-menu/SKILL.md`, and `.agents/skills/pomogator-doctor/scripts/engine/checks/context-menu.ts` exist. |
| H7 | A second marketplace record can publish the full `spec-generator-v4` plugin without widening the context-menu-only package. | PARTIALLY VERIFIED | The verified marketplace schema exposes an ordered `plugins[]` list and the current context-menu contract is intentionally narrow. The full plugin's Codex Desktop install/runtime proof has not been run. |

## Sources

| Source | Evidence |
|--------|----------|
| Local CLI | `codex --version` returned `codex-cli 0.142.5`. |
| Local CLI | `codex plugin --help` exposes `add`, `list`, `marketplace`, and `remove`. |
| Local CLI | `codex plugin add --help` accepts `PLUGIN@MARKETPLACE` or `--marketplace`. |
| Local CLI | `codex plugin marketplace add --help` accepts local paths, GitHub shorthand, Git URLs, `--ref`, and repeated `--sparse`. |
| Local CLI | `codex plugin marketplace list` shows marketplace roots for `openai-primary-runtime`, `openai-bundled`, `claude-plugins-official`, `context-mode`, and `openai-curated`. |
| Local cache | `C:\Users\stigm\.codex\plugins\cache\context-mode\context-mode\1.0.169\.codex-plugin\plugin.json` includes `skills`, `mcpServers`, `hooks`, and `interface`. |
| Local cache | `C:\Users\stigm\.codex\plugins\cache\openai-bundled\browser\26.623.101652\.codex-plugin\plugin.json` includes `skills` and `interface` metadata. |
| Official docs | https://developers.openai.com/codex/plugins describes plugins as bundles of skills, app integrations, and MCP servers, and documents app/CLI install surfaces. |
| Official docs | https://developers.openai.com/codex/plugins/build defines `.codex-plugin/plugin.json`, manifest fields, path rules, bundled MCP/hooks, and marketplace metadata. |
| Official docs | https://developers.openai.com/codex/cli/reference documents `codex plugin marketplace` commands, JSON-friendly output, `-C`, `--dangerously-bypass-approvals-and-sandbox`, and `--dangerously-bypass-hook-trust`. |
| Official docs | https://developers.openai.com/codex/hooks documents hook discovery, plugin-bundled hooks, and trust review. |

## Technical Findings

### Codex plugin distribution is marketplace-based

Codex CLI exposes a plugin command tree. The verified local command names are `codex plugin add`, `codex plugin list`, `codex plugin marketplace add/list/upgrade/remove`, and `codex plugin remove`.

Official docs define repo marketplaces at `$REPO_ROOT/.agents/plugins/marketplace.json`. The marketplace file can represent one plugin or a curated list. This matches the requested whitelist model: only entries present in the marketplace list are offered as supported Codex plugin surfaces.

### Codex plugin manifest shape differs from the current repo claims

The current repo docs still mention `.Codex-plugin/` in `AGENTS.md` and several historical specs. Current official Codex docs use `.codex-plugin/plugin.json` as the required plugin entry point and keep `skills/`, `hooks/`, `assets/`, `.mcp.json`, and `.app.json` at the plugin root.

This spec must therefore avoid treating `.Codex-plugin/` as Codex-native. If legacy uppercase paths remain for Claude compatibility, Codex support should add lowercase `.codex-plugin/` and `.agents/plugins/marketplace.json` without removing the Claude path.

### Plugin hooks need explicit trust handling

Official Codex docs state that installing/enabling a plugin does not automatically trust plugin-bundled hooks. Codex sets `PLUGIN_ROOT` and `PLUGIN_DATA` for plugin hooks and also sets `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` for compatibility. This is useful for migration, but the whitelist must still require hook trust review and runtime verification.

### Context-menu is the first practical whitelist item

The context-menu feature already has:

- A dedicated spec at `.specs/context-menu/`
- A skill at `.agents/skills/context-menu/SKILL.md`
- Installer code at `tools/context-menu/postinstall.ts`
- PowerShell launch scripts under `scripts/`
- Doctor drift logic at `.agents/skills/pomogator-doctor/scripts/engine/checks/context-menu.ts`

The Codex branch of that feature must use verified Codex launch flags and config/trust behavior. Earlier context-menu skill notes still contain stale Claude/Codex mixed claims such as `--dangerously-skip-permissions`; those must be corrected by implementation under the context-menu spec, not copied into this whitelist spec as truth.


### The second entry needs a hard distribution/runtime ownership boundary

The marketplace schema already supports an ordered `plugins[]` catalog, so the full `spec-generator-v4` plugin can be represented as a separate second entry after `context-menu`. It must use a distinct plugin source and manifest reference: reusing the context-menu-only manifest would either silently widen the launcher package or make two catalog entries alias the same installable surface.

The repository already centralizes the reusable spec graph, MCP server, and generation pipeline under `tools/spec-graph/`, `tools/spec-mcp-server/`, and `tools/specs-generator/`. Their Codex Desktop adaptation is not a whitelist concern. Requirement 83 of the main `spec-generator-v4` spec owns skills, agents, hooks, MCP wiring, project-root behavior, generated adapters, and installed runtime verification. This spec owns only the ordered catalog record, status, and evidence gate.

**Verification state (2026-08-10):** architecture and distribution boundaries were reviewed, but no full `spec-generator-v4` Codex plugin install, BDD scenario, or Codex Desktop runtime probe was run. The second entry therefore cannot be called `Supported`.

## Where Implementation Will Live

- Codex marketplace: `.agents/plugins/marketplace.json`
- Codex plugin manifest: `.codex-plugin/plugin.json`
- Existing Claude manifests: `.Codex-plugin/plugin.json`, `.Codex-plugin/hooks.json`, `.Codex-plugin/marketplace.json`
- First whitelisted feature: `.specs/context-menu/`, `tools/context-menu/postinstall.ts`, `scripts/launch-Codex-tui.ps1`
- Second distribution record: `spec-generator-v4` as entry 2 in `.agents/plugins/marketplace.json`, with a distinct plugin source and manifest reference
- Full plugin implementation: owned by requirement 83 of the main `spec-generator-v4` spec, not duplicated in this spec
- Verification scripts/tests: whitelist ordering and evidence gating here; full installed-runtime proof remains with the main spec

## Conclusions

1. Codex plugin support should be added as a separate whitelist layer, not as a global rename from Claude to Codex.
2. The whitelist source of truth should be a Codex marketplace file plus per-plugin manifest validation.
3. `context-menu` should be the first whitelisted Codex plugin because the behavior is already bounded, Windows-specific, and testable.
4. Existing Claude Code support must remain intact and separately verifiable.
5. Any Codex hook/MCP/skill support must be proven with the real `codex plugin` CLI and not inferred from Claude plugin behavior.
6. `context-menu` should remain the narrow first entry, while the full `spec-generator-v4` plugin is a separately installable second entry.
7. `codex-init` should own only distribution order/status/evidence; the main `spec-generator-v4` requirement 83 should remain the sole owner of full-plugin behavior.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| claims-need-evidence | `.Codex/rules/plan-pomogator/claims-need-evidence.md` | Technical claims need command/file/source evidence. | Codex plugin/current behavior claims | Research and requirements must cite local CLI/docs evidence. |
| verify-status-against-code-before-acting | `.Codex/rules/verify-status-against-code-before-acting.md` | Verify repo reality before acting from docs. | Historical plugin docs drift | Use local CLI/cache and current files before requirements. |
| integration-tests-first | `.Codex/rules/integration-tests-first.md` | Plugin/install behavior needs integration coverage. | Plugin distribution support | Validate with real `codex plugin` flows, not unit-only checks. |
| dead-integration-guard | `.Codex/rules/testing/dead-integration-guard.md` | Installed artifacts must have a runtime consumer and deps-absent proof when distributed. | Plugin-bundled hooks/MCP/scripts | Require real install/load checks for whitelisted entries. |
| skill-allowed-tools-audit | `.Codex/rules/checklists/skill-allowed-tools-audit.md` | Skill changes must cover all workflow tools. | Context-menu skill updates | Any skill edits for context-menu/Codex must be audited. |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|------------------|-----------|
| Context-menu spec | `.specs/context-menu/` | Existing feature contract for Windows right-click launcher. | First whitelist item and cross-spec dependency. |
| Context-menu installer | `tools/context-menu/postinstall.ts` | Generates Nilesoft Shell artifacts and copies launch scripts. | Codex branch must be generated here. |
| Context-menu skill | `.agents/skills/context-menu/SKILL.md` | User-facing workflow for installing/reinstalling context menu. | Needs Codex/Claude parallel wording and corrected Codex flags. |
| Pomogator doctor | `.agents/skills/pomogator-doctor/scripts/engine/checks/context-menu.ts` | Drift check for installed context-menu artifacts. | Should cover Codex artifact drift after implementation. |
| Plugin creator skill | `C:\Users\stigm\.codex\skills\.system\plugin-creator\SKILL.md` | Codex plugin scaffold and marketplace shape. | Confirms `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json` conventions. |

### Architectural Constraints Summary

The whitelist must separate product compatibility from feature implementation. A plugin surface is not "Codex-supported" until it is listed in the Codex marketplace, has a `.codex-plugin/plugin.json`, has validation coverage, and its runtime artifacts are proven under a real Codex install/load path. Claude support remains a sibling channel. The second full-plugin record must not reuse the context-menu-only plugin source or duplicate the main `spec-generator-v4` runtime contract.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Historical uppercase `.Codex-plugin` docs are mistaken for current Codex-native manifest format. | High | High | Codex requirements must cite official `.codex-plugin/plugin.json` docs and local cache examples; keep uppercase path only as existing Claude/legacy artifact unless proven otherwise. |
| Enabling Codex plugin support accidentally regresses existing Claude Code plugin/context-menu behavior. | Medium | High | Add cross-spec AC requiring Claude artifacts and tests to remain unchanged or explicitly updated; verify both launch channels. |
| Plugin hooks/MCP appear installed but do not run because Codex hook trust or MCP policy is not configured. | Medium | High | Require real `codex plugin` installation/load verification plus hook trust review documentation before marking a whitelist entry supported. |
| Context-menu implementation copies stale Codex flag names from old skill notes. | High | Medium | Require implementation to use verified `codex --help` flags and add regression checks that reject Claude-only `--dangerously-skip-permissions` in Codex launch paths. |
| The second entry aliases or widens the context-menu package, or this spec duplicates full-plugin behavior and drifts from the main spec. | Medium | High | Require a unique second id plus a distinct source/manifest reference; keep only distribution/status/evidence here and delegate runtime semantics to main `spec-generator-v4` requirement 83. |
