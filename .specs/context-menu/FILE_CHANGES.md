# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

> ⚠️ `edit`/`delete` — только для СУЩЕСТВУЮЩИХ на диске путей (audit FILE_CHANGES_VERIFY бьёт HARD ERROR-ом по edit-строке с несуществующим путём). Для планируемых файлов — `create`.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `{путь/к/файлу1}` | create | [FR-1](FR.md#fr-1-название) |
| `{путь/к/файлу2}` | create | [FR-2](FR.md#fr-2-название) |
| `{путь/к/файлу3}` | create | {причина} |
| `tools/context-menu/postinstall.ts` | edit | [FR-6](FR.md#fr-6-context-menu-launch-entries-log-every-invocation) — `generateNss()` routes raw "Claude Code (YOLO)" / "Claude Code" NSS entries (incl. Admin-submenu mirrors) through `launch-claude-tui.ps1` instead of calling `wt.exe ... claude` directly |
| `scripts/launch-claude-tui.ps1` | edit | [FR-6](FR.md#fr-6-context-menu-launch-entries-log-every-invocation) / [FR-7](FR.md#fr-7-trust-auto-grant-before-bypass-permissions-launch) — add `-NoTui` switch, `ensureWorkspaceTrust` (Yolo-gated atomic `~/.claude.json` write), ERROR+exit-code logging on every launch path |
| `tests/step_definitions/feature_context_menu.ts` | edit | step definitions for CTXMENU001_13..17 driving the real script/function, no mocks |
| `audit-reports/context-menu-cross-user-analysis.md` | edit | document gap G8 (YOLO entries hard-fail on untrusted dirs; raw NSS entries have zero logging) in the existing gap register, matching the G1-G7 format |

