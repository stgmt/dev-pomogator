#!/bin/bash
set -e

echo "DevContainer: Post-create setup"

cd "/workspaces/dev-pomogator"

# Git user config (from env, gh CLI, or defaults)
if [ -z "$(git config --global user.name 2>/dev/null)" ] || \
   [ -z "$(git config --global user.email 2>/dev/null)" ]; then
    USER_NAME=""
    USER_EMAIL=""

    # From environment variables
    [ -n "${GIT_AUTHOR_NAME:-}" ] && USER_NAME="$GIT_AUTHOR_NAME"
    [ -n "${GITHUB_USER:-}" ] && [ -z "$USER_NAME" ] && USER_NAME="$GITHUB_USER"
    [ -n "${GIT_AUTHOR_EMAIL:-}" ] && USER_EMAIL="$GIT_AUTHOR_EMAIL"
    [ -n "${GITHUB_EMAIL:-}" ] && [ -z "$USER_EMAIL" ] && USER_EMAIL="$GITHUB_EMAIL"

    # From GitHub CLI if authenticated
    if [ -z "$USER_NAME" ] && command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
        USER_NAME=$(gh api user --jq '.login' 2>/dev/null || echo "")
        USER_EMAIL=$(gh api user --jq '.email // empty' 2>/dev/null || echo "")
        if [ -z "$USER_EMAIL" ] && [ -n "$USER_NAME" ]; then
            USER_EMAIL="${USER_NAME}@users.noreply.github.com"
        fi
    fi

    [ -z "$USER_NAME" ] && USER_NAME="Developer"
    [ -z "$USER_EMAIL" ] && USER_EMAIL="developer@devcontainer.local"

    git config --global user.name "$USER_NAME"
    git config --global user.email "$USER_EMAIL"
fi

git config --global --add safe.directory "/workspaces/dev-pomogator"
git config --global core.autocrlf false
git config --global pull.rebase false

# ZSH + Oh My Zsh setup
if [ ! -d "$HOME/.oh-my-zsh" ]; then
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended || true
fi
if [ ! -f "$HOME/.zshrc" ]; then
    cp "$HOME/.oh-my-zsh/templates/zshrc.zsh-template" "$HOME/.zshrc" 2>/dev/null || true
fi

# Shell aliases (idempotent — skip if already added)
MARKER="# dev-pomogator-aliases"
ALIASES="${MARKER}
alias ll=\"ls -alF\"
alias la=\"ls -A\"
alias gs=\"git status\"
alias gp=\"git pull\"
alias gc=\"git commit\"
alias gco=\"git checkout\"

export PATH=\"/home/vscode/.npm-global/bin:\$PATH\"
export NPM_CONFIG_PREFIX=\"/home/vscode/.npm-global\"
"

for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
    if [ -f "$rc" ] && grep -qF "$MARKER" "$rc" 2>/dev/null; then
        echo "Aliases already in $(basename "$rc") — skipping"
    else
        echo "$ALIASES" >> "$rc" 2>/dev/null || true
    fi
done

# Claude Code: enable bypass permissions mode for devcontainer
CLAUDE_SETTINGS_DIR="${CLAUDE_CONFIG_DIR:-/home/vscode/.claude}"
mkdir -p "$CLAUDE_SETTINGS_DIR"
if [ ! -f "$CLAUDE_SETTINGS_DIR/settings.json" ]; then
    cat > "$CLAUDE_SETTINGS_DIR/settings.json" << 'SETTINGS_EOF'
{
  "permissions": {
    "allow": [],
    "deny": [],
    "additionalDirectories": [],
    "defaultMode": "bypassPermissions"
  }
}
SETTINGS_EOF
    echo "Claude Code: bypassPermissions mode configured"
else
    if ! grep -q '"bypassPermissions"' "$CLAUDE_SETTINGS_DIR/settings.json" 2>/dev/null; then
        if command -v jq >/dev/null 2>&1; then
            tmp=$(mktemp)
            jq '.permissions.defaultMode = "bypassPermissions"' "$CLAUDE_SETTINGS_DIR/settings.json" > "$tmp" && mv "$tmp" "$CLAUDE_SETTINGS_DIR/settings.json"
            echo "Claude Code: bypassPermissions mode updated in existing settings"
        else
            echo "Claude Code: settings.json exists but jq not available for update — check manually"
        fi
    else
        echo "Claude Code: bypassPermissions already configured"
    fi
fi

# MCP servers setup (oculos, desktop, context7, octocode)
echo "Setting up MCP servers..."
python3 .dev-pomogator/tools/mcp-setup/setup-mcp.py --platform claude --force 2>&1 || echo "[WARN] MCP setup failed"

# Docker check
if command -v docker &>/dev/null; then
    docker version --format 'Docker {{.Server.Version}}' 2>/dev/null || echo "Docker not accessible"
fi

# Environment info
echo ""
echo "Environment:"
echo "  Node.js: $(node --version 2>/dev/null || echo 'not installed')"
echo "  Python: $(python3 --version 2>/dev/null || echo 'not installed')"
echo "  Git: $(git --version 2>/dev/null)"
echo "  Claude: $(claude --version 2>/dev/null || echo 'not installed')"
echo "  gh: $(gh --version 2>/dev/null | head -1 || echo 'not installed')"
echo ""
echo "post-create done"
