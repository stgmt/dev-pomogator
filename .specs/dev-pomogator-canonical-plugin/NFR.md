# Non-Functional Requirements (NFR)

## Performance

- **NFR-P1**: Migration script project-only cleanup выполняется ≤2 секунды для типичного project (skills + rules + commands + tools + .gitignore block). Измерять через wall-clock в integration test.
- **NFR-P2**: Migration script project + global cleanup combined выполняется ≤5 секунд. Включает remove `~/.dev-pomogator/`, smart-merge edit `~/.claude/settings.json`, remove `~/.config/dev-pomogator/`.
- **NFR-P3**: PostToolUse marker guard hook выполняется ≤100ms (regex scan agent output, no I/O). Hook fires на каждом Skill tool invocation, не должен ощутимо impact на UX.
- **NFR-P4**: Re-running migration после `.migrated-to-v2` marker — no-op в ≤200ms (только проверка marker + early exit).

## Security

- **NFR-S1**: Migration script через `resolveWithinHome()` guard для global paths (no `..` traversal, no абсолютные paths за пределами `~/.dev-pomogator/`, `~/.claude/`, `~/.config/dev-pomogator/`). Project paths через `resolveWithinProject()` guard.
- **NFR-S2**: PostToolUse marker guard hook не выполняет arbitrary code из tool output, только regex scan на presence маркеров. Output payload bounded (Claude Code limits tool response size).
- **NFR-S3**: Atomic writes везде где applicable (per `atomic-config-save` + `atomic-update-lock` rules): migration script edit `.gitignore`, `.claude/settings.local.json`, `~/.claude/settings.json` через temp+move. Не допускается partial-write corruption при kill -9 во время migration.
- **NFR-S4**: При migration user-modified файлы (content hash mismatch с upstream) backup'ятся в `<cwd>/.dev-pomogator/.user-overrides/<rel-path>` ДО removal. Backup НЕ удаляется автоматически — user может recover. Аналогичный подход для global cleanup: если detected user customization в `~/.claude/settings.json` за пределами managed entries — preserved через smart merge, не overwritten.

## Reliability

- **NFR-R1**: Migration script идемпотентен: повторный запуск после `.migrated-to-v2` marker (project-scope) или после global cleanup completed (no `~/.dev-pomogator/` exists) — no-op + informational message «Already migrated» / «No v1 install detected».
- **NFR-R2**: PostToolUse marker guard hook fail-soft: try/catch around stdin parsing AND regex scan. На любую ошибку → exit 0 silently (warn-only design per FR-4, не блокирует workflow).
- **NFR-R3**: Migration script fail-soft при partial failures: если backup write succeeds но removal fails — script logs warning, marker НЕ записывается (next run может re-attempt). Если settings.json edit fails atomic move — original preserved.
- **NFR-R4**: Concurrent migration protection: lock file `<cwd>/.dev-pomogator/.migration.lock` через `flag: 'wx'` (per `atomic-update-lock` rule). Если lock удерживается — error «another migration in progress, wait or remove lock».
- **NFR-R5**: Marker guard hook tolerates malformed payload: invalid JSON, missing tool_name field, unexpected tool_response shape — все handled через graceful fallback (exit 0 silently).

## Usability

- **NFR-U1**: Migration script при detection v1 install печатает clear progress: «Detected v1 install (version X.Y.Z)», «Backing up N user-modified files», «Removing M project files», «Cleaning K global entries». Флаги `--project-only` / `--global-only` / `--no-global` / `--no-project` документированы в `--help`.
- **NFR-U2**: Migration script после успешного завершения печатает next steps:
  ```
  ✓ Migration complete. Next steps:
    1. /plugin marketplace add stgmt/dev-pomogator
    2. /plugin install dev-pomogator@stgmt
    3. /reload-plugins  (CLI) or restart Claude Desktop
  ```
- **NFR-U3**: PostToolUse marker guard warning message includes actionable hint: «See AP-1..AP-8 anti-patterns в `.claude/skills/research-workflow/SKILL.md`» — пользователь может узнать почему его research result was flagged.
- **NFR-U4**: Error messages в legacy CLI entry point (если remains для migration utility) содержат actionable guidance для canonical install: "Cursor support was removed in v2.0. Use canonical install: /plugin marketplace add stgmt/dev-pomogator + /plugin install dev-pomogator@stgmt."
- **NFR-U5**: Migration script после Phase 2 hook commands rewrite печатает summary number rewritten hooks: «Rewrote N hook commands in .claude/settings.json + M in .claude/settings.local.json».
