#!/bin/bash
set -e

echo "DevContainer: Post-start"

cd "/workspaces/dev-pomogator"

# Fix CRLF in shell scripts (Windows host writes \r\n, bash needs \n)
find .devcontainer/scripts -name '*.sh' -exec sed -i 's/\r$//' {} + 2>/dev/null || true

# Ensure USER is set
: "${USER:=$(whoami)}"

# Docker socket GID sync
if [ -S "/var/run/docker.sock" ]; then
    echo "Syncing Docker socket permissions..."
    sudo chown root:docker /var/run/docker.sock 2>/dev/null || true
    DOCKER_SOCKET_GID=$(stat -c '%g' /var/run/docker.sock)
    if [ -n "$DOCKER_SOCKET_GID" ]; then
        existing_group=$(getent group | awk -F: -v gid="$DOCKER_SOCKET_GID" '$3 == gid {print $1; exit}')
        if [ -z "$existing_group" ]; then
            target_group="docker-host"
            if getent group "$target_group" >/dev/null 2>&1; then
                current_gid=$(getent group "$target_group" | awk -F: '{print $3}')
                if [ "$current_gid" != "$DOCKER_SOCKET_GID" ]; then
                    sudo groupmod -g "$DOCKER_SOCKET_GID" "$target_group"
                fi
            else
                sudo groupadd -g "$DOCKER_SOCKET_GID" "$target_group"
            fi
        else
            target_group="$existing_group"
        fi
        if ! id -nG "$USER" | tr ' ' '\n' | grep -qx "${target_group:-docker-host}"; then
            sudo usermod -aG "${target_group:-docker-host}" "$USER"
        fi
    fi
else
    echo "Docker socket not mounted"
fi

# Anti-detect: Windows-like TCP/IP fingerprint (обход Qrator/CloudFlare)
# ip_default_ttl=128 и disable_ipv6 вынесены в docker-compose.yml sysctls
sudo sysctl -w net.ipv4.tcp_window_scaling=1 2>/dev/null || true
sudo sysctl -w net.ipv4.tcp_sack=1 2>/dev/null || true
sudo sysctl -w net.ipv4.tcp_timestamps=1 2>/dev/null || true
sudo sysctl -w net.ipv4.tcp_rmem="8192 65535 16777216" 2>/dev/null || true
sudo sysctl -w net.ipv4.tcp_wmem="8192 65535 16777216" 2>/dev/null || true

# open-browser command (Chromium CDP)
sudo ln -sf "/workspaces/dev-pomogator/.devcontainer/scripts/open-browser.sh" /usr/local/bin/open-browser 2>/dev/null || true

# Git status
echo ""
echo "Git branch: $(git branch --show-current 2>/dev/null || echo 'N/A')"
git status -s 2>/dev/null || true

# === Claude Memory → repo symlink ===
CLAUDE_MEM_DEEP="/home/vscode/.claude/projects/-workspaces-dev-pomogator/memory"
CLAUDE_MEM_REPO="/workspaces/dev-pomogator/.claude/memory"
if [ ! -L "$CLAUDE_MEM_DEEP" ] || [ "$(readlink "$CLAUDE_MEM_DEEP")" != "$CLAUDE_MEM_REPO" ]; then
    mkdir -p "$(dirname "$CLAUDE_MEM_DEEP")" "$CLAUDE_MEM_REPO"
    if [ -d "$CLAUDE_MEM_DEEP" ] && [ ! -L "$CLAUDE_MEM_DEEP" ]; then
        cp -r "$CLAUDE_MEM_DEEP"/. "$CLAUDE_MEM_REPO"/ 2>/dev/null || true
        rm -rf "$CLAUDE_MEM_DEEP"
    fi
    ln -sfn "$CLAUDE_MEM_REPO" "$CLAUDE_MEM_DEEP"
    echo "Memory: $CLAUDE_MEM_DEEP -> repo/.claude/memory/"
fi


# === FR-16: dev-pomogator-specs MCP autostart in Codespaces ===
# Idempotent: only fires when CODESPACES=true AND the lock file says either
# nothing or a dead PID. Runs the MCP server in the background and writes a
# foreground-style log so Codespaces users can `tail -f` it.
if [ "${CODESPACES:-}" = "true" ] && [ -f tools/spec-mcp-server/server.ts ]; then
    SP_MCP_LOCK="/workspaces/dev-pomogator/.dev-pomogator/.mcp-lock.json"
    SP_MCP_LOG="/workspaces/dev-pomogator/.dev-pomogator/.spec-mcp-server.log"
    SP_MCP_STALE=1
    if [ -f "$SP_MCP_LOCK" ]; then
        SP_MCP_PID=$(grep -oE '"pid"[[:space:]]*:[[:space:]]*[0-9]+' "$SP_MCP_LOCK" | grep -oE '[0-9]+' | head -1 || true)
        if [ -n "${SP_MCP_PID:-}" ] && kill -0 "$SP_MCP_PID" 2>/dev/null; then
            SP_MCP_STALE=0
        fi
    fi
    if [ "$SP_MCP_STALE" = "1" ]; then
        mkdir -p "$(dirname "$SP_MCP_LOCK")"
        rm -f "$SP_MCP_LOCK" 2>/dev/null || true
        # Run detached — stdio MCP doesn't need a controlling terminal because
        # the SDK initialize handshake reads from stdin only after a client
        # connects via the .mcp.json registration.
        nohup node --import tsx tools/spec-mcp-server/server.ts \
            > "$SP_MCP_LOG" 2>&1 < /dev/null &
        echo "MCP: dev-pomogator-specs started (codespaces), log: $SP_MCP_LOG"
    else
        echo "MCP: dev-pomogator-specs already running (pid=$SP_MCP_PID)"
    fi
fi

echo ""
echo "post-start done"
