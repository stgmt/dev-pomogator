#!/bin/bash
# Start worktree dashboard daemon
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE=/tmp/worktree-dashboard.pid

if [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
  echo "Already running (PID $(cat $PIDFILE)). Killing first..."
  kill "$(cat $PIDFILE)" || true
  sleep 0.5
fi

mkdir -p ~/.local/bin
cp "$SCRIPT_DIR/zclaude" ~/.local/bin/zclaude
chmod +x ~/.local/bin/zclaude
echo "Installed: ~/.local/bin/zclaude"

nohup python3 "$SCRIPT_DIR/worktree-dashboard.py" >/tmp/worktree-dashboard.log 2>&1 &
echo $! > "$PIDFILE"
sleep 1
if kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
  echo "Dashboard started: http://localhost:8083 (PID $(cat $PIDFILE))"
  echo "Log: /tmp/worktree-dashboard.log"
else
  echo "Failed to start; log:"
  cat /tmp/worktree-dashboard.log
  exit 1
fi
