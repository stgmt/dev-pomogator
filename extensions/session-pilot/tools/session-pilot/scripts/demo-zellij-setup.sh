#!/bin/bash
# Demo: spin up Zellij Web Client (no pkill — it kills our shell)
set -e

ZJ=$HOME/.local/bin/zellij
CFG_DIR=$HOME/.config/zellij
mkdir -p "$CFG_DIR"

cat > "$CFG_DIR/config.kdl" <<'EOF'
web_server true
web_sharing "on"
web_server_ip "127.0.0.1"
web_server_port 8082
EOF

"$ZJ" web --stop 2>/dev/null || true
sleep 1

TOKEN=$("$ZJ" web --create-token 2>&1 | awk -F': ' '/token_/{print $2}')
echo "TOKEN=$TOKEN"
echo "$TOKEN" > /tmp/zellij-token.txt

echo "---START WEB---"
"$ZJ" web --daemonize 2>&1 || true
sleep 2
"$ZJ" web --status 2>&1
echo "---DONE---"
