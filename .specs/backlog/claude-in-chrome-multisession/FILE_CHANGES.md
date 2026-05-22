# File Changes

| Path | Action | Reason |
|------|--------|--------|
| `extensions/claude-in-chrome-multisession/extension.json` | create | [FR-1](FR.md#fr-1-extension-package-claude-in-chrome-multisession): manifest |
| `extensions/claude-in-chrome-multisession/README.md` | create | [FR-10](FR.md#fr-10-sunset-path): operational notes |
| `extensions/claude-in-chrome-multisession/CHANGELOG.md` | create | [FR-10](FR.md#fr-10-sunset-path): version history |
| `extensions/claude-in-chrome-multisession/tools/claude-in-chrome-multisession/cims-guard.ts` | create | [FR-2](FR.md#fr-2-pretooluse-hook-denies-cross-session-tab-access) + [FR-3](FR.md#fr-3-posttooluse-hook-auto-records-new-tabids) + [FR-6](FR.md#fr-6-bootstrap-mode--orphan-auto-claim) + [FR-7](FR.md#fr-7-hook-event-log) + [FR-8](FR.md#fr-8-fail-open-on-errors) |
| `extensions/claude-in-chrome-multisession/tools/claude-in-chrome-multisession/claim-tab.mjs` | create | [FR-5](FR.md#fr-5-manual-claimrelease-cli-helper) |
| `extensions/claude-in-chrome-multisession/tools/claude-in-chrome-multisession/README.md` | create | [FR-1](FR.md#fr-1-extension-package-claude-in-chrome-multisession): tool docs |
| `.claude/skills/claude-in-chrome-multisession/SKILL.md` | create | [FR-4](FR.md#fr-4-skill-instructs-claude-on-protocol) |
| `tests/features/plugins/claude-in-chrome-multisession/PLUGIN018_claude-in-chrome-multisession.feature` | create | BDD scenarios PLUGIN018_01..10 |
| `tests/e2e/claude-in-chrome-multisession-helpers.ts` | create | Local helpers |
| `tests/e2e/claude-in-chrome-multisession-guard.test.ts` | create | AC-2 + AC-3 + AC-6 + AC-7 + AC-8 |
| `tests/e2e/claude-in-chrome-multisession-claim.test.ts` | create | AC-5 |
| `tests/e2e/claude-in-chrome-multisession-skill.test.ts` | create | AC-4 |
| `tests/e2e/claude-in-chrome-multisession-installer.test.ts` | create | AC-9 (Docker tier) |
| `CLAUDE.md` | edit | Key extensions list |
| `extensions/chrome-devtools-mcp-mux/extension.json` | edit | Demote to `stability: "beta"` + Windows blocked warning |
| `.specs/chrome-devtools-mcp-mux/CHANGELOG.md` | edit | Post-mortem entry |
| `.mcp.json` | edit | Remove broken mux entry |
