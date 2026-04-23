# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased] - Second Failure Mode Hardening (2026-04-20)

### Added (FR-6..FR-10, AC-7..AC-11, US-5..US-8, UC-4..UC-6)

- **FR-6 Prompt-race failure mode detection** — `/install-diagnostics` skill различает Mode A (EPERM) vs Mode B (npm prompt-race) vs A+B (sequential) через evidence-driven branching: empty `_npx/<hash>/` + log mtime stale + `--yes` reproduction success = Mode B.
- **FR-7 Docs hardening** — все user-facing docs SHALL использовать `npx --yes github:stgmt/dev-pomogator` instead of unsafe `npx github:stgmt/dev-pomogator`. Затрагивает: root README.md + CLAUDE.md + extensions/*/README.md + docs/**.
- **FR-8 CI lint regression prevention** — `tools/lint-install-commands.ts` grep regex `/npx\s+(?!--?yes\s+|-y\s+)...dev-pomogator/` по tracked .md files; fail build если found. Exceptions через `.lintignore-install` / `<!-- lint-install: allow -->` marker.
- **FR-9 BDD regression scenario CORE003_20** — test reproduces prompt-race с `forceYes: false` + empty stdin + fresh `NPM_CONFIG_CACHE`; asserts empty `_npx/<hash>/` + install.log mtime stale.
- **FR-10 Defensive bin wrapper (DEFERRED)** — optional `bin/dev-pomogator-safe.cjs` proxy которая пишет timestamp в `~/.dev-pomogator/logs/wrapper-entry.log` до invoke; skill FR-6 использует как tie-breaker.
- 5 new BDD scenarios `INSTALL_DIAG_05..09` (Mode B detection, sequential A+B, lint violation, lint clean, CORE003_20 reproduction).
- Phase 4 в TASKS.md — 8 sub-phases (BDD Red → skill update → helper forceYes → docs hardening → CI lint → CORE003_20 → deferred wrapper → validation).
- `.specs/install-diagnostics/RESEARCH.md` раздел "Second Failure Mode — npm Confirmation Prompt Race" с user-visible symptom, evidence table, root cause, confirmed fix options, cross-ref with Mode A.

### Changed

- Mode taxonomy: original spec использовала "Mode A — Windows EPERM". Добавлен Mode B (prompt-race), Mode A+B (sequential). Backward compat: существующий `INSTALL_DIAG_02` остаётся valid.
- FR count: 5 → 10 (FR-6..FR-10 `@feature6`)
- AC count: 6 → 11 (AC-7..AC-11 `@feature6`)
- User Stories: 4 → 8 (US-5..US-8)
- Use Cases: 3 + edge cases → 6 (UC-4..UC-6)
- BDD scenarios: 4 → 9 (INSTALL_DIAG_05..09)
- FILE_CHANGES: 17 create + 3 edit → 22 create + 14 edit

### Evidence

Live diagnostic session 2026-04-20 в `D:\repos\smarts`:
- User command `npx github:stgmt/dev-pomogator --claude` → silent exit 0
- `_npx/eade2dc1c54870ea/` empty (no node_modules, no package.json)
- `~/.dev-pomogator/logs/install.log` mtime Apr 18 (2 days stale)
- Reproduce с `--yes` в fresh cache → exit 0, 17 extensions installed, install.log advanced
- Root cause: npm 11.11.1 confirmation prompt race на Windows PS (npm/cli#7147)

### Recommendation for users NOW (before Phase 4 implementation)

Использовать команду **с `--yes`**:
```
npx --yes github:stgmt/dev-pomogator --claude
```

---

## [Unreleased] - 2026-04-09

### Added
- Spec `.specs/install-diagnostics/` с full 13-file structure
- BDD scenarios CORE003_18 (Linux control) + CORE003_19 (Windows TDD red) в `tests/features/core/CORE003_claude-installer.feature`
- Integration tests `describe.skipIf` блоки в `tests/e2e/claude-installer.test.ts` с парными `it()` для каждого assertion
- Helper `runInstallerViaNpx(args, options): Promise<NpxInstallResult>` в `tests/e2e/helpers.ts` для запуска `npx --yes github:stgmt/dev-pomogator` в isolated temp dir с capture cleanup warnings
- Diagnostic skill `.claude/skills/install-diagnostics/SKILL.md` с 4-mode classification (A=Win EPERM, B=missing dist, C=installer crash, D=top error)

### Changed
- N/A — все изменения additive

### Fixed
- N/A — это regression coverage, не fix самого bug-а. Сам silent install bug (npm reify EPERM на Windows) НЕ исправлен и требует upstream npm fix или local workaround (см. [RESEARCH.md](RESEARCH.md) и Phase 2 BLOCKED в [TASKS.md](TASKS.md))

## [0.1.0] - 2026-04-09

### Added
- Initial spec scaffold via `scaffold-spec.ts`
