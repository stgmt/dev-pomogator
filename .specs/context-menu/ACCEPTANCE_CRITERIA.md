# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-название)

WHEN {событие} THEN {система} SHALL {действие}.

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

WHEN any context-menu launch entry invokes `claude` THEN the launcher SHALL append an invocation record (timestamp, resolved project directory, claude flags) to `~/.dev-pomogator/logs/context-menu-launch.log` before invoking `claude`. IF the `claude` process exits non-zero THEN the launcher SHALL append "ERROR" plus the observed exit code to the same log.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-trust-auto-grant-before-bypass-permissions-launch)

IF a "YOLO" context-menu entry (`--dangerously-skip-permissions`) targets a directory where `~/.claude.json` → `projects["<dir>"].hasTrustDialogAccepted` is not `true` THEN the launcher SHALL atomically set it to `true` BEFORE invoking `claude`. IF the entry is the plain (non-YOLO) "Claude Code" entry THEN the launcher SHALL leave `hasTrustDialogAccepted` untouched and rely on Claude Code's normal interactive trust dialog.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-название)

IF {условие} THEN {система} SHALL {действие}.

