# Changelog

All notable changes to the pomogator-doctor feature will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Post-launch hardening spec update (2026-04-20)

### Added (FR-26..FR-34, AC-26..AC-34, US-9..US-12, UC-13..UC-18)

- **FR-26 Hook Command Integrity (C20)** — парсит `.claude/settings.local.json → hooks` во всех 3 форматах (string/object/array per `installer-hook-formats.md`), извлекает `.dev-pomogator/tools/**/*.{ts,sh,mjs,cjs,js}` из `command`-полей, проверяет `fs.existsSync` каждого пути project-relative. Missing → critical reinstallable, grouped by event.
- **FR-27 Managed Files Hash Integrity (C21)** — итерирует `installedExtensions[*].managed[projectRoot].tools[]`, missing file → critical, `sha256` mismatch → warning (user edit or version drift). Performance guard: 1MB size cap.
- **FR-28 Plugin.json for installed projects** — FIX to FR-13: missing `.dev-pomogator/.claude-plugin/plugin.json` у installed projectRoot → critical (было silent ok). Claude Code без manifest не грузит commands/skills.
- **FR-29 Self-install guarantee** — installer автоматически ставит `pomogator-doctor` extension + SessionStart hook во все projectPaths без opt-in. Doctor warning если отсутствует.
- **FR-30 --all-projects flag** — iterates `installedExtensions[*].projectPaths` union (dedup), concurrency 4, per-project traffic-light + aggregate summary. Exit code = max.
- **FR-31 Hooks registry path correction** — FIX to FR-4: читать `installedExtensions[*].managed[projectRoot].hooks` (aggregated union), а не `config.managed[projectRoot].hooks` (top-level field отсутствует в реальной schema). Regression fix: C6 выдавал ложный critical на всех healthy installations.
- **FR-32 config.json top-level version** — installer SHALL писать `version: pkg.version` top-level; C13 enabled через этот field. Migration: backfill при first install after upgrade.
- **FR-33 MCP probe retune** — timeout 3s → 10s; timeout → warning (не critical); `spawn ENOENT`/`EACCES`/exit-code → distinct critical hints. Addresses false-positive noise.
- **FR-34 Stale managed entries detection** — cross-ref installed extension names + sub-tool directories из manifest `tools` field; orphan names → warning. Известный non-orphan: `specs-validator` ∈ `specs-workflow.tools`.
- 16 new BDD scenarios `POMOGATORDOCTOR001_16..31` покрывающих C20/C21/C22 integrity, plugin manifest, self-install, `--all-projects`, hooks-registry regression, version field, MCP retune, orphan detection.
- Phase 8 в TASKS.md — 11 sub-phases (Phase 8.0 BDD Red foundation → Phase 8.11 full re-verification), ~50 новых tasks с TDD Red→Green order.
- New test files: `doctor-integrity.test.ts`, `doctor-selfinstall.test.ts`, `doctor-allprojects.test.ts`, `doctor-regression.test.ts`.
- RESEARCH.md секция `Post-Launch Edge Cases Found (2026-04-20)` с D1-D4 defect inventory + B1-B7 blind spots + performance/UX findings + file:line proofs.

### Changed

- Feature tag `@feature12` для всей post-launch cohort (отличать от initial @feature1..@feature11).
- FILE_CHANGES.md общий счётчик: 43 → 63 file operations (+4 create + 16 edit).
- Scenarios count в BDD: 15 → 31.
- FR count: 25 → 34.
- AC count: 25 → 34.
- User Stories count: 8 → 12.
- Use Cases count: 12 → 18.

### Evidence

Live run `dev-pomogator --doctor` в `D:/repos/dev-pomogator` на 2026-04-20 показал:
- `✗ C6 Hooks registry sync: unexpected keys: Stop, SessionStart, PreToolUse, UserPromptSubmit, PostToolUse` — на **рабочей** установке dev-pomogator → D1 подтверждён
- `⚠ C13 Version match: cannot compare versions (config=unknown, package=24.1.20)` → D2 подтверждён
- `✗ C5 Extension tools directories: missing tools for: {17 extensions}` → C5 проверяет HOME, не project-local → D3 подтверждён

Webapp analysis: 22 хука в settings.local.json × empty `.dev-pomogator/tools/` → 22 `ERR_MODULE_NOT_FOUND` за сессию при каждом event без детектирования доктором → B1 подтверждён.

---

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
  - BDD scenarios POMOGATORDOCTOR001_01..15 в .feature файле (initial draft set — расширено до 31 в post-launch update, см. `[Unreleased] - Post-launch hardening spec update (2026-04-20)`)
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
