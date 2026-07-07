# Functional Requirements (FR)

## FR-1: {Название}

Claude channel NSS content generation. The existing Claude channel SHALL remain available as its own Nilesoft Shell `.nss` script containing exactly ONE Claude entry — "Claude Code (YOLO + TUI)", elevated (`admin=true`), launching through `launch-claude-tui.ps1` with `-Yolo` (Claude Code `--dangerously-skip-permissions`). The Claude NSS SHALL reference the global path `~/.dev-pomogator/scripts/launch-claude-tui.ps1` and SHALL NOT contain project-specific hardcoded paths. This requirement SHALL NOT be interpreted as excluding a separate Codex NSS file or Codex entry.

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

## FR-6: Context-menu launch entries log every invocation

Every Claude context-menu launch entry — the existing `.ps1`-routed entries AND the raw `wt.exe`-direct NSS entries ("Claude Code (YOLO)", "Claude Code", and their Admin-submenu mirrors) — SHALL append an invocation record (timestamp, resolved project directory, Claude flags used) to `~/.dev-pomogator/logs/context-menu-launch.log` before invoking `claude`. WHEN the launched `claude` process exits non-zero THEN the log entry SHALL record "ERROR" plus the observed exit code, so a failed right-click leaves a diagnosable trace regardless of which Claude menu entry triggered it. Today only the `.ps1`-routed "YOLO + TUI" entry logs (`scripts/launch-claude-tui.ps1`); the raw NSS entries call `claude` directly with zero diagnostics — this requirement closes that gap by routing every Claude entry through the same logged script.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-1](USE_CASES.md#uc-1-название)

## FR-7: Trust auto-grant before bypass-permissions launch

WHEN a context-menu entry launches `claude --dangerously-skip-permissions` (a "YOLO" entry) AND the target directory has not yet been interactively trusted by Claude Code (`~/.claude.json` → `projects["<dir>"].hasTrustDialogAccepted` is `false` or absent) THEN the launcher SHALL atomically write `hasTrustDialogAccepted: true` for that exact directory into `~/.claude.json` (temp-file + atomic rename) BEFORE invoking `claude`, so the launch does not hard-fail with `Ignoring N permissions.allow entries ... this workspace has not been trusted` (confirmed Claude Code behavior — see RESEARCH.md). The plain "Claude Code" entries (no `--dangerously-skip-permissions`) SHALL NOT auto-grant trust — they SHALL preserve Claude Code's normal interactive trust-dialog flow untouched.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-1](USE_CASES.md#uc-1-название)

## FR-8: Parallel Claude Code and Codex channels

The context-menu feature SHALL support Claude Code and Codex as parallel channels. Adding Codex support SHALL NOT rename, remove, or weaken the existing Claude Code entry, script, NSS import, tests, or trust behavior. The generated/installed Nilesoft configuration SHALL be able to load both `imports/claude-code.nss` and `imports/Codex.nss` from the same `shell.nss`. Each channel SHALL keep its own launch script and agent-specific flags.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-1](USE_CASES.md#uc-1-название)

## FR-9: Codex NSS content generation

The Codex channel SHALL generate a separate Nilesoft Shell `.nss` script for `Codex (YOLO)` containing exactly ONE Codex entry, elevated (`admin=true`), routed through `powershell.exe -ExecutionPolicy Bypass -File "<home>\.dev-pomogator\scripts\launch-Codex-tui.ps1" -Yolo -NoTui -ProjectDir "@sel.dir"`. The first supported Codex iteration is explicitly non-TUI; Codex+TUI is deferred until the Codex launcher can prove the TUI module path and split-pane behavior. The Codex NSS SHALL use `codex-icon.ico`, SHALL NOT call `codex` directly from NSS, and SHALL NOT reference `launch-claude-tui.ps1`, `claude-code.nss`, `claude-icon.ico`, or `~/.claude.json`.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-1](USE_CASES.md#uc-1-название)

## FR-10: Codex launch script copy and path drift guard

The Codex installer path SHALL copy the bundled `scripts/launch-Codex-tui.ps1` to `~/.dev-pomogator/scripts/launch-Codex-tui.ps1`, creating intermediate directories when needed. The path embedded by the Codex NSS SHALL match that copy destination exactly, so the Codex context-menu entry and the installed Codex launch script cannot drift apart. A missing bundled Codex launch script SHALL be a detectable installer error, not a silently broken right-click entry.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-1](USE_CASES.md#uc-1-название)

## FR-11: Codex full-access launch and trust handling

WHEN the Codex context-menu entry launches in YOLO mode THEN the launcher SHALL invoke Codex with Codex-native full-access flags for the installed CLI version, currently `codex -C "<dir>" --dangerously-bypass-approvals-and-sandbox` and, when hooks are enabled for the project, `--dangerously-bypass-hook-trust` [src:https://developers.openai.com/codex/cli/reference]. The Codex launcher SHALL NOT use Claude Code's `--dangerously-skip-permissions`. If Codex requires persisted project trust before loading project configuration or hooks, the launcher SHALL handle Codex trust via `%USERPROFILE%\.codex\config.toml` project trust state, scoped to the exact selected directory, and SHALL NOT modify `~/.claude.json`.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** [UC-1](USE_CASES.md#uc-1-название)

## FR-12: Codex-only install mode

WHEN the Codex whitelist install instructions run `tools/context-menu/postinstall.ts` for the Codex plugin, the script SHALL support an explicit Codex-only mode. In Codex-only mode it SHALL copy only `launch-Codex-tui.ps1`, write only `Codex.nss`, and add only `import 'imports/Codex.nss'` when missing. It SHALL NOT create, overwrite, import, or copy Claude context-menu artifacts (`claude-code.nss`, `launch-claude-tui.ps1`) as part of that Codex-only install. Existing Claude artifacts may remain untouched if they were already present.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
**Use Case:** [UC-1](USE_CASES.md#uc-1-название)

## FR-13: Codex context-menu install launcher script

The Codex context-menu install path SHALL provide a first-class PowerShell launcher script at `scripts/install-codex-context-menu.ps1`. A user SHALL be able to run that single script from the repository/plugin root to register the local Codex marketplace, install `context-menu@dev-pomogator-codex`, and apply the Windows context-menu postinstall in `--codex-only` mode. The user-facing instructions SHALL NOT require copying the internal `node -e ... bootstrap.cjs` command, SHALL NOT use `npm`/`npx`, and SHALL NOT use the deprecated v1 `--Codex` installer flag.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
**Use Case:** [UC-1](USE_CASES.md#uc-1-название)

## FR-14: Codex context-menu icon installation

The Codex context-menu installer SHALL ensure `C:\Program Files\Nilesoft Shell\imports\codex-icon.ico` exists when installing the Codex channel. When a local OpenAI Codex application resource icon is installed, the installer SHALL prefer copying that `.ico` file directly. Extracting the associated icon from `codex.exe` is only a secondary fallback because it may produce a shell-unfriendly single-size icon. A generated fallback icon MAY be used only when no local Codex application icon can be found or extracted, and it SHALL NOT be described as the official Codex icon. The generated Codex NSS SHALL reference the same `codex-icon.ico` filename. A user may still replace the file later with a custom icon.

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)
**Use Case:** [UC-1](USE_CASES.md#uc-1-название)

