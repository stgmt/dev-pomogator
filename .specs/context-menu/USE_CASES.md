# Use Cases

## UC-1: {Название}

{Описание сценария}

- {Шаг 1}
- {Шаг 2}
- {Результат}

## UC-2: {Название}

{Описание сценария}

- {Шаг 1}
- {Шаг 2}
- {Результат}

## UC-3: {Название}

{Описание сценария}

- {Шаг 1}
- {Шаг 2}
- {Результат}

## UC-4: {Название}

{Описание сценария}

- {Шаг 1}
- {Шаг 2}
- {Результат}

## UC-5: {Название}

{Описание сценария}

- {Шаг 1}
- {Шаг 2}
- {Результат}

## UC-6: Install parallel Codex context-menu channel @feature8 @feature9 @feature10 @feature11

Maintainer installs Codex support for the Windows right-click menu without replacing the existing Claude Code entry.

- Preserve `imports/claude-code.nss` and the existing `Claude Code (YOLO + TUI)` entry.
- Add `imports/Codex.nss` with a separate `Codex (YOLO)` entry.
- Run the Codex entry with `-NoTui`; Codex+TUI is outside the first supported iteration.
- Copy `scripts/launch-Codex-tui.ps1` to `~/.dev-pomogator/scripts/launch-Codex-tui.ps1`.
- Launch Codex with Codex-native full-access flags and Codex trust handling.
- Result: right-clicking a folder offers both Claude Code and Codex, each routed through its own script and trust store.

