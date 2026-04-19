# Changelog

All notable changes to the pomogator-doctor feature will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Spec draft

### Added

- Initial spec (15 files в `.specs/pomogator-doctor/`) покрывает:
  - 8 User Stories (contributor onboarding, broken install reinstall, missing API key hint, maintainer silent SessionStart, DevOps CI, juniors traffic-light, plugin-loader detection, per-extension gating)
  - 12 Use Cases (happy path, reinstall offer, hint-only non-reinstallable, silent/banner SessionStart, MCP probe timeout, version mismatch, CI JSON, plugin-loader BROKEN-missing, traffic-light layout, per-ext gating, settings.local.json env fallback)
  - 25 Functional Requirements (14 checks + 3 entry points + reinstall + output + gating)
  - 22 NFR criteria (Performance P-1..P-5, Security S-1..S-6, Reliability R-1..R-6, Usability U-1..U-7)
  - 25 EARS Acceptance Criteria (один AC на каждый FR)
  - DESIGN.md с shared core `src/doctor/` + extension + CLI flag architecture
  - BDD Test Infrastructure classification = TEST_DATA_ACTIVE с 4 новыми hooks (tempHome / fakeMcp / envSnapshot / childRegistry) и 13 fixtures
  - 15 BDD scenarios POMOGATORDOCTOR001_01..15 в .feature файле
  - FILE_CHANGES.md с 43 операциями (33 create + 10 edit) включая 6 extension.json updates для нового `dependencies` поля
  - TASKS.md с TDD-порядком: Phase 0 Red (BDD + hooks + fixtures) → Phase 1-6 Green (core → filesystem → extension-gated → MCP → reporter/reinstall → extension manifest) → Phase 7 Refactor + E2E + docs

### Research findings

- 17 проверок окружения сгруппированы в 🟢🟡🔴 по dependency type
- Расширения разделены на 3 класса: self-sufficient (7 ext), needs env vars (4 ext), needs external deps (7 ext)
- API keys могут храниться в `.env` ИЛИ `.claude/settings.local.json → env` — Doctor проверяет оба места
- MCP probe требует Full connection (spawn/fetch + initialize + tools/list) — parse-only даёт ложнопозитивы при runtime crashes
- Commands/Skills могут регистрироваться динамически через plugin-loader (`~/.claude/plugins/`) без физических файлов в `.claude/commands/` — FR-13 различает 4 state
- Community patterns из /doctor (Claude Code), npm doctor, Expo Doctor, mise, devcontainer, Anthropic plugins 2026 guidance

### Flagged for implementation

- `[UNVERIFIED]` Claude Code plugin-loader dynamic registry format (`~/.claude/plugins/`) — ПЕРЕД implementation FR-13 требуется проверка на живом user install
- `[NEW SCHEMA]` `dependencies` поле в `extension.json` — backwards-compatible (optional, missing = self-sufficient)

## [0.1.0] - TBD (после implementation)

### Added

- Initial implementation (см. TASKS.md Phase 0..7)
- `src/doctor/` shared core module (index + runner + reporter + reinstall + types + lock + 14 checks)
- `extensions/pomogator-doctor/` extension (SessionStart hook + slash command)
- `dev-pomogator --doctor` CLI flag
- 6 extension.json updates с новым `dependencies` field
