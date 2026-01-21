# dev-pomogator

Universal installer for custom plugins, rules, commands, and hooks for **Cursor** and **Claude Code**.

## Installation

### Cursor (one-liner)

**Linux/macOS:**
```bash
cd /path/to/your-project
curl -fsSL https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
cd C:\path\to\your-project
iwr -useb https://api.github.com/repos/stgmt/dev-pomogator/contents/install.ps1 -Headers @{Accept='application/vnd.github.v3.raw'} | iex
```

> **Important**: Run from your project folder. The installer detects project root via git.

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
