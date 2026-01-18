# dev-pomogator

Team coding standards and workflows for **Cursor** and **Claude Code**.

## Quick Start

```bash
npx dev-pomogator
```

Interactive installer will guide you through:
1. Select platform(s): Cursor, Claude Code, or both
2. Enable auto-updates
3. Remember your choices

## Features

### 🎯 suggest-rules

Analyzes your project and generates IDE-specific rules:

**For Cursor:**
```bash
# In Cursor, use the suggest-rules command
# Creates .cursor/rules/*.mdc files
```

**For Claude Code:**
```bash
# Use /suggest-rules command
# Updates CLAUDE.md or creates commands
```

### 🔄 Auto-Update (Cursor)

When enabled, checks for updates on Cursor `stop` hook:
- 6-hour cooldown between checks
- Silent background updates
- Version comparison via GitHub Releases

### 📦 Claude Code Marketplace

Integrates with Claude Code's built-in plugin system:
- Auto-sync from marketplace
- Manual refresh available

## Manual Installation

### Cursor

Copy rules to your project:
```bash
cp -r cursor/rules/* .cursor/rules/
```

### Claude Code

Install as plugin:
```bash
cp -r claude/.claude-plugin ~/.claude/plugins/dev-pomogator/
```

## Configuration

Config stored in `~/.dev-pomogator/config.json`:

```json
{
  "platforms": ["cursor", "claude"],
  "autoUpdate": true,
  "cooldownHours": 6,
  "installedVersion": "0.1.0"
}
```

## Rules Included

### suggest-rules
Analyzes project and generates custom rules based on:
- Tech stack (TypeScript, Python, Go, etc.)
- Frameworks (React, Next.js, FastAPI, etc.)
- Testing tools (Jest, Vitest, pytest, etc.)
- Existing configuration

## License

MIT
