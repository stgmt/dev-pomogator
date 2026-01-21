# dev-pomogator

Universal installer for custom plugins, rules, commands, and hooks for **Cursor** and **Claude Code**.

## Installation

### Cursor

Run from your **project folder**:

```bash
cd /path/to/your-project
npx dev-pomogator --cursor
```

Or from source:

```bash
cd /path/to/your-project
git clone https://github.com/stgmt/dev-pomogator.git
cd dev-pomogator
npm install && npm run build
node dist/index.js --cursor
```

> **Important**: The installer detects the project root via git. Commands are installed into the project you run it from.

### Claude Code

Use standard marketplace:

```bash
claude mcp add /path/to/dev-pomogator
```

Or add manually to `~/.claude/settings.json`.

## What Gets Installed

### Per-Project (Cursor)

| File | Location |
|------|----------|
| `suggest-rules.md` | `{project}/.cursor/commands/` |

### Global (Cursor)

| File | Location |
|------|----------|
| `hooks.json` | `~/.cursor/hooks/` |
| `check-update.js` | `~/.dev-pomogator/scripts/` |
| `cursor-summarize.ts` | `~/.dev-pomogator/scripts/` |
| `config.json` | `~/.dev-pomogator/` |
| Logs | `~/.dev-pomogator/logs/` |

### Global (Claude Code)

| File | Location |
|------|----------|
| Plugin | `~/.claude/plugins/dev-pomogator/` |

## Features

### 📜 /suggest-rules Command

Analyze project and generate custom rules:

```bash
# In Cursor chat:
/suggest-rules
```

Creates `.cursor/rules/*.mdc` files tailored to your stack.

### 🪝 Cursor Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| `beforeSubmitPrompt` | Before prompt | Session init, context |
| `afterMCPExecution` | After MCP call | Log observation |
| `afterShellExecution` | After shell | Log observation |
| `afterFileEdit` | After edit | Log file change |
| `stop` | Conversation end | Summarize, check updates |

### 🔄 Auto-Update

- Checks GitHub releases every 24 hours
- Silent background updates
- Logs: `~/.dev-pomogator/logs/dev-pomogator-YYYY-MM-DD.log`

### 🧠 Persistent Memory

Integration with [claude-mem](https://github.com/thedotmack/claude-mem):

- Session tracking
- Context injection
- Automatic summarization

## Configuration

`~/.dev-pomogator/config.json`:

```json
{
  "platforms": ["cursor"],
  "autoUpdate": true,
  "cooldownHours": 24,
  "installedVersion": "1.1.0"
}
```

## Development

```bash
npm install
npm run build
npm run test:e2e:docker
```

## License

MIT
