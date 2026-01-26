#!/bin/bash
# dev-pomogator installer
# Usage (Cursor):      curl -fsSL https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.sh | bash
# Usage (Claude Code): curl -fsSL https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.sh | TARGET=claude bash

set -e

REPO="https://github.com/stgmt/dev-pomogator.git"
TMP_DIR=$(mktemp -d)
ORIGINAL_DIR=$(pwd)

# Determine target: claude or cursor (default)
if [ "$TARGET" = "claude" ]; then
    TARGET_FLAG="--claude"
    TARGET_NAME="Claude Code"
else
    TARGET_FLAG="--cursor"
    TARGET_NAME="Cursor"
fi

echo "🚀 Installing dev-pomogator for $TARGET_NAME..."

# Clone to temp
git clone --depth 1 "$REPO" "$TMP_DIR" > /dev/null 2>&1

# Install and build
cd "$TMP_DIR"
npm install --silent > /dev/null 2>&1
npm run build --silent > /dev/null 2>&1

# Run installer (from original directory)
cd "$ORIGINAL_DIR"
node "$TMP_DIR/dist/index.js" $TARGET_FLAG

# Cleanup
rm -rf "$TMP_DIR"

echo "✨ Done!"
