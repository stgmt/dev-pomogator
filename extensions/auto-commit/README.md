# auto-commit

Automatic git commits with LLM-generated messages.

## How it works

- Triggers on every prompt submission (Claude Code: `UserPromptSubmit`, Cursor: `beforeSubmitPrompt`)
- Commits changes automatically every 15 minutes (configurable)
- Generates commit messages using LLM API
- Falls back to simple message if API unavailable
- Never blocks IDE - always exits with code 0

## Configuration

Create `.env` file in your project root:

```bash
# Required: Your API key for aipomogator.ru
AUTO_COMMIT_API_KEY=sk-xxx

# Optional: Custom endpoint (default: aipomogator.ru)
# AUTO_COMMIT_ENDPOINT=https://aipomogator.ru/go/v1/chat/completions

# Optional: Model to use (default: openrouter/deepseek/deepseek-v3.2)
# AUTO_COMMIT_MODEL=openrouter/deepseek/deepseek-v3.2

# Optional: Commit interval in minutes (default: 15)
# AUTO_COMMIT_INTERVAL=15
```

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `AUTO_COMMIT_API_KEY` | Yes | - |
| `AUTO_COMMIT_ENDPOINT` | No | `https://aipomogator.ru/go/v1/chat/completions` |
| `AUTO_COMMIT_MODEL` | No | `openrouter/deepseek/deepseek-v3.2` |
| `AUTO_COMMIT_INTERVAL` | No | 15 |

## Logs

Logs are written to `~/.claude/logs/auto-commits.log` (Claude Code) or `~/.cursor/logs/auto-commits.log` (Cursor).

## Requirements

- Python 3.8+
- requests
- python-dotenv
