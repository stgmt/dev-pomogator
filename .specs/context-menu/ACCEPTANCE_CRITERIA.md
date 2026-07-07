# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-название)

WHEN the Claude channel NSS is generated THEN it SHALL contain exactly one Claude entry titled `Claude Code (YOLO + TUI)`, `admin=true`, `-Yolo`, and `launch-claude-tui.ps1`. The generated Claude NSS SHALL NOT prevent a separate Codex NSS from being generated or imported.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-название)

IF {условие} THEN {система} SHALL {действие}.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-название)

WHEN {событие} AND {условие} THEN {система} SHALL {действие}.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-название)

WHEN {событие} THEN {система} SHALL {действие}.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-context-menu-launch-entries-log-every-invocation)

WHEN any Claude context-menu launch entry invokes `claude` THEN the launcher SHALL append an invocation record (timestamp, resolved project directory, Claude flags) to `~/.dev-pomogator/logs/context-menu-launch.log` before invoking `claude`. IF the `claude` process exits non-zero THEN the launcher SHALL append "ERROR" plus the observed exit code to the same log.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-trust-auto-grant-before-bypass-permissions-launch)

IF a "YOLO" context-menu entry (`--dangerously-skip-permissions`) targets a directory where `~/.claude.json` → `projects["<dir>"].hasTrustDialogAccepted` is not `true` THEN the launcher SHALL atomically set it to `true` BEFORE invoking `claude`. IF the entry is the plain (non-YOLO) "Claude Code" entry THEN the launcher SHALL leave `hasTrustDialogAccepted` untouched and rely on Claude Code's normal interactive trust dialog.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-parallel-claude-code-and-codex-channels)

WHEN Codex support is installed THEN the existing Claude Code context-menu channel SHALL remain installed and runnable. IF `shell.nss` is updated for Codex THEN it SHALL preserve or add the Claude import `imports/claude-code.nss` and also include the Codex import `imports/Codex.nss`.

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-codex-nss-content-generation)

WHEN the Codex channel NSS is generated THEN it SHALL contain exactly one Codex entry titled `Codex (YOLO)`, `admin=true`, `-Yolo`, `-NoTui`, `codex-icon.ico`, and `launch-Codex-tui.ps1`. The Codex NSS SHALL NOT contain `Codex (YOLO + TUI)`, `launch-claude-tui.ps1`, `claude-code.nss`, `claude-icon.ico`, or a direct `cmd /k codex` launch.

## AC-10 (FR-10)

**Требование:** [FR-10](FR.md#fr-10-codex-launch-script-copy-and-path-drift-guard)

WHEN the Codex postinstall path runs THEN it SHALL copy `scripts/launch-Codex-tui.ps1` to `~/.dev-pomogator/scripts/launch-Codex-tui.ps1`. IF the bundled Codex launch script is missing THEN the installer SHALL report the missing source and SHALL NOT write a Codex NSS that points to a nonexistent script.

## AC-11 (FR-11)

**Требование:** [FR-11](FR.md#fr-11-codex-full-access-launch-and-trust-handling)

WHEN `launch-Codex-tui.ps1` receives `-Yolo` THEN it SHALL invoke `codex` with Codex-native full-access flags (`--dangerously-bypass-approvals-and-sandbox`, plus `--dangerously-bypass-hook-trust` when hook trust must be bypassed). IF Codex project trust must be pre-granted THEN the launcher SHALL update `%USERPROFILE%\.codex\config.toml` for the exact selected directory and SHALL NOT modify `~/.claude.json`.

## AC-12 (FR-12)

**Требование:** [FR-12](FR.md#fr-12-codex-only-install-mode)

WHEN `postinstall.ts` runs in Codex-only mode THEN it SHALL only copy the Codex launch script, only write `Codex.nss`, and only add the `imports/Codex.nss` shell import if missing. It SHALL NOT create, overwrite, import, or copy Claude context-menu artifacts during that Codex-only run.

## AC-13 (FR-13)

**Требование:** [FR-13](FR.md#fr-13-codex-context-menu-install-launcher-script)

WHEN the Codex context-menu install command is documented or recommended THEN it SHALL be the first-class launcher script `scripts/install-codex-context-menu.ps1`. The launcher SHALL run `codex plugin marketplace add . --json`, `codex plugin add context-menu@dev-pomogator-codex --json`, and `tools/context-menu/postinstall.ts --codex-only`. It SHALL NOT expose `npm`, `npx`, or deprecated `--Codex` installation paths as the Codex install workflow.

## AC-14 (FR-14)

**Требование:** [FR-14](FR.md#fr-14-codex-context-menu-icon-installation)

WHEN the Codex context-menu installer plan is generated THEN it SHALL include only the Codex icon file `codex-icon.ico` for the Codex channel. WHEN Codex icon file candidates are generated for a Windows app install THEN the installed OpenAI Codex `app/resources/icon.ico` path SHALL be included before executable-associated-icon or generated fallback paths are needed. WHEN the fallback Codex icon is generated THEN it SHALL be a valid ICO file, and the Codex NSS SHALL reference the same `codex-icon.ico` filename.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-название)

IF {условие} THEN {система} SHALL {действие}.

