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

- **NFR-R6**: On POSIX, the pre-Node hook dispatch must never attempt `node.exe`. If the platform-appropriate `node` command is unavailable or malformed doctor input prevents diagnostics, the dispatch shall fail open for permitted hook work while still rejecting prohibited host BDD before Node is started.
- **NFR-R7**: The authenticated loopback hook service SHALL sustain the observed 14 SessionStart calls and 39 steady-state HTTP calls per verified session without a caller bypassing the shared service.
- **NFR-R8**: Every service request SHALL use only the allowlisted `CLAUDE_ENV_FILE` environment variables and its authentication header; unallowlisted environment values SHALL NOT enter request headers or payloads.
- **NFR-R9**: State and settings persistence SHALL use byte-level CAS and recover the last known valid bytes after a conflict, failed write, or partial startup; a failed mutation SHALL NOT corrupt the newer on-disk version.

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

## Hook HTTP policy

- **NFR-H1**: Review is offline and deterministic: the same manifest and registry inputs yield the same ordered findings and no network I/O.
- **NFR-H2**: Bearer tokens are never persisted in manifests, registry fixtures, test output, or findings; only an environment-variable identifier is permitted.
- **NFR-H3**: Managed HTTP registrations require no per-event `bash`, `sh`, `.sh`, or `node -e` launch on Windows. The documented SessionStart bootstrap is narrow exception.
- **NFR-H4**: Findings name the failing contract so maintainers can correct a manifest or registry entry without inspecting gate internals.

## Stop dispatcher and project isolation

- **NFR-P5**: A Claude Code Stop event SHALL launch at most one DevPomogator host-visible client process. Inside one logical event flight, legacy child fallback SHALL have concurrency at most one and retain the existing 256 KiB input/output bounds; persistent workers SHALL be bounded by audited route capability and recycled by the existing lifecycle policy.
- **NFR-R10**: A long-lived service SHALL isolate event flights, CWD, forwarded environment, workers, and state by normalized request project identity. No startup CWD, plugin cache, previous request, or other repository may supply project identity implicitly.
- **NFR-R11**: Stop consolidation SHALL be behavior-preserving against a captured black-box legacy oracle. Self-heal after daemon loss, no retry of uncertain work, fail-open transport behavior, route order, approval/blocking, context, diagnostics, and stop-loop handling SHALL remain equivalent.

Credential-proven daemon recovery SHALL fail closed for process termination: incomplete, ambiguous, changing, or access-denied ownership evidence MUST leave the listener alive and use an atomically published OS-assigned loopback endpoint; only failure to start that endpoint returns a bounded actionable fail-open result.

## PR #227 review-hardening qualities

- **NFR-P9**: Client request time is bounded by the selected route/group execution budget plus fixed transport overhead; input memory never grows beyond the accepted stdin ceiling.
- **NFR-S8**: Managed state creation is denied before any descendant write when a parent is a symlink, junction, or canonical escape; process termination requires current repeated authenticated listener ownership proof and never state-only PID evidence.
- **NFR-R10**: Every worker startup settles within budget and every failed/starting child is reaped; mixed-success Stop groups preserve completed semantics and durable route-level failure evidence; imported runtime dependency drift triggers service replacement.
