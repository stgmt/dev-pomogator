#!/bin/bash
# Spawn detached Zellij sessions emulating worktrees
# Trick: `script` allocates a fake PTY, run zellij inside, detach via Ctrl-o d
# But Ctrl-o d via stdin is fragile. Easier: use `setsid script` which keeps
# the zellij server alive even after the wrapper exits.
set -e
ZJ=$HOME/.local/bin/zellij
mkdir -p /tmp/demo

SESSIONS=(feature-auth payments-fix refactor-storage docs-update hotfix-prod)

for slug in "${SESSIONS[@]}"; do
  mkdir -p /tmp/demo/$slug
  cd /tmp/demo/$slug
  echo "Worktree: $slug" > NOTES.md
  # Pre-attach as a brand-new session, then immediately exit zellij gracefully.
  # Use bash here-doc into zellij's stdin to run a placeholder command then quit-but-detach.
  # The cleanest: `script -qc "$ZJ -s $slug action ..." /dev/null` — but zellij CLI requires a session that exists.
  # Use bg approach: setsid + script. The session lingers server-side even when wrapper script exits.
  setsid script -qfc "cd /tmp/demo/$slug && $ZJ --session $slug" /dev/null </dev/null >/dev/null 2>&1 &
  sleep 0.4
done
sleep 2

echo "---LIST---"
"$ZJ" list-sessions 2>&1 || echo "(no sessions yet)"
