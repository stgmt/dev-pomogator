#!/bin/bash
# dev-pomogator installer
# Usage: curl -fsSL https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.sh | bash

set -e

REPO="https://github.com/stgmt/dev-pomogator.git"
TMP_DIR=$(mktemp -d)

echo "🚀 Installing dev-pomogator..."

# Clone to temp
git clone --depth 1 "$REPO" "$TMP_DIR" > /dev/null 2>&1

# Install and build
cd "$TMP_DIR"
npm install --silent > /dev/null 2>&1
npm run build --silent > /dev/null 2>&1

# Run installer for Cursor
node dist/index.js --cursor

# Cleanup
cd - > /dev/null
rm -rf "$TMP_DIR"

echo "✨ Done!"
