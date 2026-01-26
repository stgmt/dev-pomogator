# dev-pomogator

Universal installer for custom plugins, rules, commands, and hooks for **Cursor** and **Claude Code**.

## Installation

Run from your project folder. The installer detects project root via git.

### Cursor

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.ps1 | iex
```

**Linux/macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.sh | bash
```

### Claude Code

**Windows (PowerShell):**
```powershell
$env:TARGET="claude"; irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.ps1 | iex
```

**Linux/macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.sh | TARGET=claude bash
```

### Non-interactive modes

```bash
# Install specific plugins
npx dev-pomogator --cursor --plugins=suggest-rules,specs-workflow
npx dev-pomogator --claude --plugins=forbid-root-artifacts

# Install all plugins
npx dev-pomogator --cursor --all
npx dev-pomogator --claude --all
```

## What Gets Installed

### Per-Project (Cursor)

| Type | Location | Files |
|------|----------|-------|
| Commands | `{project}/.cursor/commands/` | `suggest-rules.md`, `create-spec.md`, `configure-root-artifacts.md` |
| Rules | `{project}/.cursor/rules/` | `specs-management.mdc`, `dev-plan.mdc`, `research-workflow.mdc` |
| Tools | `{project}/tools/specs-generator/` | 5 scripts + 13 templates |
| Tools | `{project}/tools/forbid-root-artifacts/` | check.py, setup.py, whitelist config |

### Per-Project (Claude Code)

| Type | Location | Files |
|------|----------|-------|
| Commands | `{project}/.claude/commands/` | `suggest-rules.md`, `create-spec.md`, `configure-root-artifacts.md` |
| Rules | `{project}/.claude/rules/` | `specs-management.md`, `dev-plan.md`, `research-workflow.md` |
| Tools | `{project}/tools/specs-generator/` | 5 scripts + 13 templates |
| Tools | `{project}/tools/forbid-root-artifacts/` | check.py, setup.py, whitelist config |

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
| `settings.json` (hooks) | `~/.claude/` |
| `check-update.js` | `~/.dev-pomogator/scripts/` |
| `config.json` | `~/.dev-pomogator/` |
| Logs | `~/.dev-pomogator/logs/` |

## Plugins

### suggest-rules

Analyze session and suggest rules for IDE.

```bash
/suggest-rules
```

Creates `.cursor/rules/*.mdc` files tailored to your stack.

### specs-workflow

Comprehensive specs management with 3-phase workflow.

| Component | Description |
|-----------|-------------|
| `/create-spec <name>` | Create spec folder structure |
| 3 Rules | `specs-management`, `dev-plan`, `research-workflow` |
| 5 Scripts | `scaffold-spec.ps1`, `validate-spec.ps1`, etc. |
| 13 Templates | User Stories, Use Cases, FR, NFR, Design, etc. |

### forbid-root-artifacts

Pre-commit hook to control files in repository root.

| Component | Description |
|-----------|-------------|
| `/configure-root-artifacts` | Configure whitelist interactively |
| `check.py` | Pre-commit hook script |
| `setup.py` | First-time setup (creates config, installs hook) |
| `.root-artifacts.yaml` | User configuration file |

**Install specific plugins (non-interactive):**

```bash
npx dev-pomogator --cursor --plugins=suggest-rules
npx dev-pomogator --cursor --plugins=specs-workflow,forbid-root-artifacts
npx dev-pomogator --cursor --all  # all plugins
```

## Features

### 📜 /suggest-rules Command

Analyze project and generate custom rules:

```bash
# In Cursor chat:
/suggest-rules
```

Creates `.cursor/rules/*.mdc` files tailored to your stack.

### 📋 /create-spec Command

Create new specification folder:

```bash
# In Cursor/Claude chat:
/create-spec my-feature
```

Creates `.specs/my-feature/` with 13 template files.

### 🚫 /configure-root-artifacts Command

Control files allowed in repository root:

```bash
# In Cursor/Claude chat:
/configure-root-artifacts
```

Setup pre-commit hook:

```bash
python tools/forbid-root-artifacts/setup.py
```

Customize via `.root-artifacts.yaml`:

```yaml
mode: extend
allow:
  - Makefile
  - pyproject.toml
```

### 🪝 Cursor Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| `beforeSubmitPrompt` | Before prompt | Session init, context |
| `afterMCPExecution` | After MCP call | Log observation |
| `afterShellExecution` | After shell | Log observation |
| `afterFileEdit` | After edit | Log file change |
| `stop` | Conversation end | Summarize, check updates |

### 🪝 Claude Code Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| `Stop` | Conversation end | Check updates |

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
  "platforms": ["cursor", "claude"],
  "autoUpdate": true,
  "cooldownHours": 24,
  "installedExtensions": [...]
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
