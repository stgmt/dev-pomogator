# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-extension-package-chrome-devtools-mcp-mux) | Extension package | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-mcp-server-registration-in-users-mcpjson) | MCP server registration | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-skill-chrome-devtools-mcp-mux-направляет-claude-к-mux-как-default) | Skill направляет Claude к mux как DEFAULT | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-pomogator-doctor-checks-5-checks) | Pomogator-doctor checks | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-conflict-detection-с-claude-in-chrome-mcp) | Conflict detection | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-uninstall-cleanup) | Uninstall cleanup | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-pinned-version-в-extensionjson) | Pinned version | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-windows-transport-verification-smoke-test) | Windows transport verification | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-first-run-browser-preference-prompt-skill-driven) | First-run browser preference prompt | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature9 | Draft |

## Functional Requirements

- [FR-1: Extension package `chrome-devtools-mcp-mux`](FR.md#fr-1-extension-package-chrome-devtools-mcp-mux)
- [FR-2: MCP server registration in user's `.mcp.json`](FR.md#fr-2-mcp-server-registration-in-users-mcpjson)
- [FR-3: Skill направляет Claude к mux как DEFAULT](FR.md#fr-3-skill-chrome-devtools-mcp-mux-направляет-claude-к-mux-как-default)
- [FR-4: Pomogator-doctor checks (5 checks)](FR.md#fr-4-pomogator-doctor-checks-5-checks)
- [FR-5: Conflict detection с `claude-in-chrome` MCP](FR.md#fr-5-conflict-detection-с-claude-in-chrome-mcp)
- [FR-6: Uninstall cleanup](FR.md#fr-6-uninstall-cleanup)
- [FR-7: Pinned version в `extension.json`](FR.md#fr-7-pinned-version-в-extensionjson)
- [FR-8: Windows transport verification (smoke test)](FR.md#fr-8-windows-transport-verification-smoke-test)
- [FR-9: First-run browser preference prompt (skill-driven)](FR.md#fr-9-first-run-browser-preference-prompt-skill-driven)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Extension installed + files copied](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): MCP entry written to `.mcp.json` (smart merge)](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): SKILL.md содержит 5 mandatory sections + DEFAULT phrase](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): Doctor 5 CDMM-checks с traffic-light + fixHints](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): Conflict warning при coexistence + 3 options](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6): Uninstall removes 5 artifacts atomically](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7): Pinned exact semver, no @latest](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8): Smoke test passes на Windows + Linux/macOS CI](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-9 (FR-9): First-run browser prompt with 5 options + don't-ask-again marker](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)

## Reuse from existing dev-pomogator code

| Source | Path | Reused for |
|--------|------|------------|
| edge-debug-port skill template | `extensions/edge-debug-port/.claude/skills/edge-debug-port/SKILL.md` | SKILL.md structure (Triggers, Compatibility, Hard rules) |
| pomogator-doctor checks framework | `src/doctor/checks/index.ts` + per-check modules | CDMM-1 .. CDMM-5 implementation |
| atomic config save | `src/installer/` (atomic-config-save rule) | `.mcp.json` writes |
| smart merge pattern | `src/installer/settings-local.ts` | preserve existing user MCP server keys |
| runInstaller test helper | `tests/e2e/helpers.ts` | integration tests |
| Test 1:1 .feature mapping | `tests/features/plugins/{ext}/` convention | new `tests/features/plugins/chrome-devtools-mcp-mux/` |

## Out of Scope

- **Cursor / Codex platforms.** Cursor/Codex не имеют tool-call routing к chrome-devtools-mcp; добавление manifest для них — separate spec.
- **HTTP-transport MCP вариант.** chrome-devtools-mcp-mux только stdio; HTTP — out of scope.
- **Daemon orphan kill в uninstaller.** User concern, doctor может это поднять (P1 follow-up), но не блокирует MVP.
- **Preserving sessions across daemon restarts.** Architecture mux: per-connection `BrowserContext` is fresh on each connect; restoring tabs is не goal mux'а.
- **Custom Chrome flags / `--browserUrl` / `--autoConnect`** — upstream limitation (см. RESEARCH.md), spec не пытается обойти.
- **Skill files перевод на английский.** Skill description-line должна быть на английском (Anthropic plugin convention) но body-разделы могут содержать русский текст для команды.
