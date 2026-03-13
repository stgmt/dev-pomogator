# Scaffold Script

Generate a test-statusline extension skeleton with one command.

## Usage

```bash
bash scripts/scaffold-test-statusline.sh --name <extension-name>
```

## Options

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | yes | Extension name (e.g., `my-test-statusline`) |
| `--help` | no | Show help message |

## What It Generates

```
extensions/<name>/
  extension.json              # Extension manifest (statusLine + hooks + toolFiles)
  tools/<name>/
    statusline_render.cjs     # Render script (reads YAML, outputs ANSI bar)
    test_runner_wrapper.cjs   # Wrapper (spawns tests, writes YAML status)
    session_start_hook.cjs    # SessionStart hook (creates dirs, writes env vars)
    package.json              # {"type": "commonjs"}
```

## Example

```bash
$ bash scripts/scaffold-test-statusline.sh --name my-test-statusline

Creating test-statusline extension: my-test-statusline
Location: /path/to/project/extensions/my-test-statusline

Extension created successfully!

Generated files:
  extensions/my-test-statusline/extension.json
  extensions/my-test-statusline/tools/my-test-statusline/statusline_render.cjs
  extensions/my-test-statusline/tools/my-test-statusline/test_runner_wrapper.cjs
  extensions/my-test-statusline/tools/my-test-statusline/session_start_hook.cjs
  extensions/my-test-statusline/tools/my-test-statusline/package.json

Next steps:
  1. Edit statusline_render.cjs to customize the progress bar appearance
  2. Add a framework adapter for real-time test progress (see SKILL.md Step 5)
  3. For statusline coexistence, add statusline_wrapper.cjs (see SKILL.md Step 7)
  4. Install: npm run build && node dist/index.cjs --claude --all
  5. Test: restart Claude Code session and run tests
```

## Notes

- All templates are **embedded** in the script via heredoc — no external file dependencies
- The script is standalone and can be copied anywhere
- Generated scripts are minimal but functional; customize as needed
- The extension manifest uses the direct render command (no wrapper); add the wrapper per SKILL.md Step 7 if coexistence is needed
