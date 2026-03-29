# Changelog

All notable changes to the lsp-setup extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] - Unreleased

### Added
- Extension manifest (`extension.json`) with tools, ruleFiles, envRequirements, postInstall, postUpdate
- Setup script (`setup-lsp.ts`): automated LSP server installation for TypeScript (vtsls), Python (Pyright), C# (csharp-ls), JSON
- Runtime detection: Node.js >= 16 (required), .NET SDK >= 10 (optional for C#)
- Claude Code plugin installation with Piebald-AI marketplace + local fallback
- LSP usage rule (`lsp-usage.md`): goToDefinition > grep, findReferences > grep
- ENABLE_LSP_TOOL=1 env var injection via envRequirements
- Verification report: table with per-server installation status
- Idempotent installation: skip already-installed servers
- Standalone verification script (`verify-lsp.ts`)
- Bundled local LSP plugins for offline/fallback installation
- BDD feature file with 9 scenarios (LSP001_01 - LSP001_09)
- E2E integration tests
