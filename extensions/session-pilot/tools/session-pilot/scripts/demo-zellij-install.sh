#!/bin/bash
set -e
mkdir -p ~/.local/bin
if [ -f /tmp/zellij ]; then
  mv /tmp/zellij ~/.local/bin/zellij
fi
chmod +x ~/.local/bin/zellij
echo "Installed at: $HOME/.local/bin/zellij"
~/.local/bin/zellij --version
