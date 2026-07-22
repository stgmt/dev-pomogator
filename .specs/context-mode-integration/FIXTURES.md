# Fixtures

## Required real-shaped fixtures

| Fixture | Path | Purpose |
|---------|------|---------|
| healthy plugin registry | `tests/fixtures/context-mode/installed_plugins.healthy.json` | Shows `enabledPlugins["context-mode@context-mode"] === true`. |
| poisoned plugin registry | `tests/fixtures/context-mode/installed_plugins.poisoned.json` | Plugin appears present but enabled flag is missing or false. |
| malformed registry | `tests/fixtures/context-mode/installed_plugins.malformed.json` | Verifies fail-open malformed JSON behavior. |
| plugin manifest | `tests/fixtures/context-mode/plugin.manifest.json` | Contains MCP server command equivalent to `node <plugin>/start.mjs`. |
| dead process snapshot | `tests/fixtures/context-mode/process.dead.json` | Represents healthy registration with no live MCP process. |
| hook payload unavailable | `tests/fixtures/context-mode/hook.ctx-unavailable.json` | PreToolUse event where ctx tools are unavailable. |

## Fixture rule

Fixtures must mirror real artifact shapes. Hand-typed simplified JSON is not enough for config parsing. If the real artifact has nested keys or unusual property names, the fixture must preserve those quirks.
