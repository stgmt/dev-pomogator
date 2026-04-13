# Typical Claude Code User (test fixture)

Minimal Node.js project that simulates a developer **already using Claude Code** with hooks, commands, and rules configured — but **without** dev-pomogator installed.

Used as a clean baseline by `tools/sandbox-test-runner/` to verify dev-pomogator install / uninstall against a realistic-but-pristine target.

## Layout

```
typical-claude-user/
├── package.json          # Node project (zod + vitest + eslint)
├── README.md             # this file
├── .gitignore
├── src/
│   └── index.ts          # trivial module
└── .claude/
    ├── settings.json     # statusLine + env + PreToolUse/PostToolUse hooks
    ├── commands/
    │   ├── lint.md       # /lint slash command
    │   └── test.md       # /test slash command
    └── rules/
        └── no-mocks.md   # always-apply rule
```

## What is intentionally absent

- No `.dev-pomogator/` directory
- No dev-pomogator entries in `.claude/settings.json` or `settings.local.json`
- No marker block in `.gitignore`
- No `~/.dev-pomogator/` references

This is the "before" state for an install test.
