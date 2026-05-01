---
name: claude-helper
description: This skill demonstrates a forbidden token "claude" in the name field. Triggers on "use claude helper".
allowed-tools: Read, Write
---

# Claude Helper (Fixture: forbidden-token violation)

## Mission

Test fixture для FR-2 (frontmatter validation). The `name` field contains "claude" — Anthropic spec explicitly forbids "anthropic" or "claude" tokens в skill names.

## Steps

1. Read input
2. Write output
