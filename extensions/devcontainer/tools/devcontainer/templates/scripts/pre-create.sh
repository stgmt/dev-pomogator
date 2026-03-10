#!/bin/bash
set -e

echo "DevContainer: Настройка аутентификации GitHub CLI (pre-create)"

# Настройка GitHub CLI
if command -v gh >/dev/null 2>&1; then
    GH_AUTH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
    if [ -z "$GH_AUTH_TOKEN" ] && [ -f "{{WORKSPACE_FOLDER}}/.mcp.json" ]; then
        GH_AUTH_TOKEN=$(jq -r '.mcpServers | to_entries[] | select(.value.env.GITHUB_TOKEN != null) | .value.env.GITHUB_TOKEN' "{{WORKSPACE_FOLDER}}/.mcp.json" | head -n 1)
        [ "$GH_AUTH_TOKEN" = "null" ] && GH_AUTH_TOKEN=""
    fi
    if [ -n "$GH_AUTH_TOKEN" ]; then
        if gh auth status >/dev/null 2>&1; then
            echo "GitHub CLI уже авторизован"
        else
            mkdir -p ~/.config/gh
            if printf '%s\n' "$GH_AUTH_TOKEN" | gh auth login --with-token >/dev/null 2>&1; then
                gh auth setup-git >/dev/null 2>&1 || true
                echo "GitHub CLI авторизован и настроен для Git"
            else
                echo "Не удалось авторизовать GitHub CLI"
            fi
        fi
    else
        echo "Токен GitHub CLI не найден, пропускаем авторизацию"
    fi
else
    echo "GitHub CLI недоступен"
fi
