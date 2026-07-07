# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

> ⚠️ `edit`/`delete` — только для СУЩЕСТВУЮЩИХ на диске путей (audit FILE_CHANGES_VERIFY бьёт HARD ERROR-ом по edit-строке с несуществующим путём). Для планируемых файлов — `create`.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `tools/context-menu/postinstall.ts` | edit | [FR-6](FR.md#fr-6-context-menu-launch-entries-log-every-invocation) — `generateNss()` routes raw "Claude Code (YOLO)" / "Claude Code" NSS entries (incl. Admin-submenu mirrors) through `launch-claude-tui.ps1` instead of calling `wt.exe ... claude` directly |
| `scripts/launch-claude-tui.ps1` | edit | [FR-6](FR.md#fr-6-context-menu-launch-entries-log-every-invocation) / [FR-7](FR.md#fr-7-trust-auto-grant-before-bypass-permissions-launch) — add `-NoTui` switch, `ensureWorkspaceTrust` (Yolo-gated atomic `~/.claude.json` write), ERROR+exit-code logging on every launch path |
| `tests/step_definitions/feature_context_menu.ts` | edit | step definitions for CTXMENU001_13..17 driving the real script/function, no mocks |
| `audit-reports/context-menu-cross-user-analysis.md` | edit | document gap G8 (YOLO entries hard-fail on untrusted dirs; raw NSS entries have zero logging) in the existing gap register, matching the G1-G7 format |
| `tools/context-menu/postinstall.ts` | edit | [FR-8](FR.md#fr-8-parallel-claude-code-and-codex-channels) / [FR-9](FR.md#fr-9-codex-nss-content-generation) / [FR-10](FR.md#fr-10-codex-launch-script-copy-and-path-drift-guard) — add Codex channel generation/copy while preserving Claude channel |
| `tools/context-menu/postinstall.ts` | edit | [FR-12](FR.md#fr-12-codex-only-install-mode) — add explicit `--codex-only` install mode that writes only Codex artifacts |
| `README.md` | edit | [FR-12](FR.md#fr-12-codex-only-install-mode) — document Codex install command with `--codex-only` |
| `scripts/launch-Codex-tui.ps1` | edit | [FR-10](FR.md#fr-10-codex-launch-script-copy-and-path-drift-guard) / [FR-11](FR.md#fr-11-codex-full-access-launch-and-trust-handling) — Codex-specific launch, logging, full-access flags, Codex trust handling, and first-iteration `-NoTui` launch scope |
| `tests/step_definitions/feature_context_menu.ts` | edit | [FR-8](FR.md#fr-8-parallel-claude-code-and-codex-channels) / [FR-9](FR.md#fr-9-codex-nss-content-generation) / [FR-10](FR.md#fr-10-codex-launch-script-copy-and-path-drift-guard) / [FR-11](FR.md#fr-11-codex-full-access-launch-and-trust-handling) — step definitions for CTXMENU001_18..22 |
| `scripts/install-codex-context-menu.ps1` | create | [FR-13](FR.md#fr-13-codex-context-menu-install-launcher-script) — first-class Codex-only install launcher replacing the user-facing bootstrap one-liner |
| `tests/step_definitions/feature_context_menu.ts` | edit | [FR-13](FR.md#fr-13-codex-context-menu-install-launcher-script) — step definitions for CTXMENU001_24 verifying the real launcher script contract |
| `tools/context-menu/postinstall.ts` | edit | [FR-14](FR.md#fr-14-codex-context-menu-icon-installation) — generate and install fallback `codex-icon.ico` for the Codex channel |
| `tests/step_definitions/feature_context_menu.ts` | edit | [FR-14](FR.md#fr-14-codex-context-menu-icon-installation) — step definitions for CTXMENU001_25 verifying icon plan and ICO generation |

