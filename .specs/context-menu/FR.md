# Functional Requirements (FR)

## FR-1: {Название}

NSS content generation. The `generateNss()` exported function SHALL produce a Nilesoft Shell `.nss` script containing entries for "Claude Code (YOLO + TUI)", "Claude Code (YOLO)", and "Claude Code". The YOLO+TUI entry SHALL appear before the YOLO entry. The NSS SHALL reference the global path `~/.dev-pomogator/scripts/launch-claude-tui.ps1` and SHALL NOT contain project-specific hardcoded paths.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-название)

## FR-2: {Название}

Non-Windows skip and integration execution. WHEN `postinstall.ts` is executed on a non-Windows platform it SHALL exit 0 and print "Skipped" to stdout. WHEN executed via tsx integration the script SHALL exit 0 and produce non-empty combined output.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-название)

## FR-3: {Название}

Launch script copy and resolution. `copyLaunchScript(src, dest)` SHALL copy src to dest (creating intermediate directories) and return `true`. WHEN src does not exist it SHALL return `false` and NOT create dest. `bundledLaunchScriptPath()` SHALL resolve to `scripts/launch-claude-tui.ps1` in the repository tree and that file SHALL exist.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-название)

## FR-4: {Название}

NSS path drift guard. The path embedded by `generateNss()` SHALL match the default destination of `copyLaunchScript()` — `~/.dev-pomogator/scripts/launch-claude-tui.ps1` — so the context menu entry and the installed launch script cannot drift apart.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-название)

## FR-5: {Название}

Launch script split ratio artifact. `scripts/launch-claude-tui.ps1` SHALL contain `-s 0.07` and SHALL NOT contain `-s 0.3`.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-5](USE_CASES.md#uc-5-название)

## FR-N: {Название} — OUT OF SCOPE

> OUT OF SCOPE — Launch script pwsh logging (FR-6). Requires a real `pwsh` binary; cannot run headlessly in Docker without pwsh or on Windows host. Covered by @manual BDD scenarios CTXMENU001_09 / CTXMENU001_10.
>
> Связанные UC, AC и User Stories также должны быть помечены `> OUT OF SCOPE — см. FR-N`.

