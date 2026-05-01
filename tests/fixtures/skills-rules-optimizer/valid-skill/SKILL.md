---
name: example-valid-skill
description: This skill processes user input through a multi-step pipeline. Triggers on "process input", "run pipeline".
allowed-tools: Read, Write, Edit, Bash
---

# Example Valid Skill

## Mission

Demonstrates a properly-structured skill — valid frontmatter, body uses only declared tools, fits within Anthropic 500-line cap.

## Steps

1. Read the input file via Read tool
2. Process content with Edit operations
3. Write result через Write tool
4. Run verification via Bash (`echo "done"`)

## Output

Resulting file at the specified target path.
