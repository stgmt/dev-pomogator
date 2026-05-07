#!/bin/bash
# Devcontainer ENTRYPOINT: запуск GUI и фоновых сервисов
# Процессы из ENTRYPOINT живут как PID 1 дерево — не убиваются VS Code cgroup cleanup

# Fix CRLF (Windows host writes \r\n)
find "{{WORKSPACE_FOLDER}}/.devcontainer/scripts" -name '*.sh' -exec sed -i 's/\r$//' {} + 2>/dev/null || true

# Fix git worktree .git file (Windows → Linux path)
GIT_FILE="{{WORKSPACE_FOLDER}}/.git"
if [ -f "$GIT_FILE" ]; then
    RAW=$(sed -n 's/^gitdir: //p' "$GIT_FILE" | tr -d '\r\n')
    if echo "$RAW" | grep -qE '^[A-Z]:'; then
        FIXED=$(echo "$RAW" | sed -E 's|^[A-Z]:[/\\]repos[/\\]|/mnt/repos/|' | sed 's|\\|/|g')
        echo "gitdir: $FIXED" > /tmp/dot-git-worktree
        if ! mountpoint -q "$GIT_FILE" 2>/dev/null; then
            sudo mount --bind /tmp/dot-git-worktree "$GIT_FILE"
            echo "Fixed git worktree path: $FIXED"
        fi
    fi
fi

# GUI stack (Xvfb + mutter + x11vnc + noVNC)
if [ -f "{{WORKSPACE_FOLDER}}/.devcontainer/scripts/start-gui.sh" ]; then
    bash "{{WORKSPACE_FOLDER}}/.devcontainer/scripts/start-gui.sh" > /tmp/start-gui.log 2>&1 &
fi

# Auto-snapshot
if [ -f "{{WORKSPACE_FOLDER}}/.devcontainer/scripts/auto-snapshot.sh" ]; then
    bash "{{WORKSPACE_FOLDER}}/.devcontainer/scripts/auto-snapshot.sh" >> /tmp/auto-snapshot.log 2>&1 &
fi

# Pass control to CMD (sleep infinity from devcontainer)
exec "$@"
