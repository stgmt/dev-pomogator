# Non-Functional Requirements (NFR)

## Performance

- {Метрика производительности}

## Security

- {Требование безопасности}
- FR-7: auto-granting `hasTrustDialogAccepted` SHALL be scoped to exactly the directory Nilesoft passes as `@sel.dir` — never a blanket/wildcard trust grant — and SHALL only fire for entries that already pass `--dangerously-skip-permissions` (YOLO); the plain "Claude Code" entry SHALL never write to `~/.claude.json`.

## Reliability

- {Требование надёжности}
- FR-6: every context-menu launch path (TUI, NoTui, Yolo, plain) SHALL leave a diagnosable log trace at `~/.dev-pomogator/logs/context-menu-launch.log` on failure — a flashing/closing terminal window SHALL never be the only signal of what happened.

## Usability

- {Требование удобства использования}

