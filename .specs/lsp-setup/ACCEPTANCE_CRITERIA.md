# Acceptance Criteria (EARS)

## AC-1 (FR-1): Extension Manifest Valid @feature1

**Требование:** [FR-1](FR.md#fr-1-extension-manifest-feature1)

WHEN dev-pomogator installer reads `extensions/lsp-setup/extension.json`
THEN it SHALL find valid manifest with `tools`, `ruleFiles`, `envRequirements`, `postInstall`
AND the manifest SHALL pass schema validation

## AC-2 (FR-2): LSP Servers Installed @feature2 @feature3 @feature4

**Требование:** [FR-2](FR.md#fr-2-lsp-server-installation-feature2-feature3-feature4)

WHEN postInstall hook runs on system with Node.js >= 16
THEN `vtsls --stdio` SHALL be available in PATH
AND `pyright-langserver --stdio` SHALL be available in PATH
AND `vscode-json-languageserver --stdio` SHALL be available in PATH

WHEN postInstall hook runs on system with Node.js >= 16 AND .NET SDK >= 10
THEN `csharp-ls` SHALL also be available in PATH

## AC-3 (FR-3): Missing Runtime Handling @feature5

**Требование:** [FR-3](FR.md#fr-3-runtime-detection-feature5)

WHEN postInstall runs on system without `node`
THEN setup SHALL exit with non-zero code
AND SHALL print error "Node.js >= 16 is required"

WHEN postInstall runs on system without `dotnet`
THEN setup SHALL skip csharp-ls installation
AND SHALL print warning "dotnet not found, skipping C# LSP"
AND SHALL continue installing other servers

WHEN postInstall runs on system with dotnet < 10
THEN setup SHALL skip csharp-ls installation
AND SHALL print warning ".NET SDK 10+ required for csharp-ls"

## AC-4 (FR-4): Plugin Installation with Fallback @feature7

**Требование:** [FR-4](FR.md#fr-4-claude-code-plugin-installation-feature7)

WHEN Piebald-AI marketplace is reachable
THEN setup SHALL install plugins via `claude plugin install` from Piebald-AI

WHEN Piebald-AI marketplace is NOT reachable (network error, timeout)
THEN setup SHALL create local plugin directory with `.lsp.json` files
AND SHALL install plugins from local source
AND SHALL print info "Using local LSP plugins (Piebald-AI unavailable)"

## AC-5 (FR-5): LSP Usage Rule Installed @feature6

**Требование:** [FR-5](FR.md#fr-5-lsp-usage-rule-feature6)

WHEN dev-pomogator installs lsp-setup extension
THEN `.claude/rules/lsp-setup/lsp-usage.md` SHALL exist in project
AND rule SHALL contain instructions for goToDefinition, findReferences, hover
AND rule SHALL instruct to prefer LSP over grep for code symbols

## AC-6 (FR-6): ENABLE_LSP_TOOL Env Var @feature1

**Требование:** [FR-6](FR.md#fr-6-enable_lsp_tool-environment-variable-feature1)

WHEN dev-pomogator installs lsp-setup extension
THEN `.claude/settings.json` env section SHALL contain `"ENABLE_LSP_TOOL": "1"`

## AC-7 (FR-7): Verification Report @feature2 @feature3 @feature4

**Требование:** [FR-7](FR.md#fr-7-verification-report-feature2-feature3-feature4)

WHEN postInstall completes
THEN it SHALL print a table with columns: Language, Server, Binary, Status
AND Status SHALL be "installed" or "skipped: {reason}"
AND it SHALL print total count "N/M LSP servers installed"

## AC-8 (FR-8): Idempotent Installation @feature1

**Требование:** [FR-8](FR.md#fr-8-idempotent-installation-feature1)

WHEN postInstall runs and `vtsls` is already in PATH
THEN setup SHALL NOT re-run `npm install -g @vtsls/language-server`
AND SHALL print "vtsls: already installed"

## AC-9 (FR-9): Update Adds New Servers @feature1

**Требование:** [FR-9](FR.md#fr-9-update-support-feature1)

WHEN postUpdate runs and new language support was added in extension update
THEN setup SHALL install only new servers
AND SHALL NOT reinstall existing servers
