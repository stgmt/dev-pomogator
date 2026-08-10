# Non-Functional Requirements (NFR)

## Performance

- Whitelist validation should complete in under 5 seconds for metadata-only checks on a warm repo.
- Any real Codex plugin install/load verification may be slower, but must be isolated from normal spec validation unless explicitly requested.
- Adding a second catalog entry must not move the metadata-only validation budget above 5 seconds on a warm repo.

## Security

- Verification must not silently grant broad permissions, hook trust, or global Codex configuration outside an explicit temporary test boundary.
- Codex hook/MCP support must document trust and approval requirements instead of assuming install equals execution.
- The full `spec-generator-v4` entry must not inherit permissions or trust by sharing the context-menu-only plugin source or manifest.

## Reliability

- The whitelist must be deterministic from committed files and verified CLI evidence.
- Context-menu drift checks must detect stale installed artifacts when plugin source files change.
- Catalog ordering and identity must be deterministic: `context-menu` first, `spec-generator-v4` second, unique ids, and distinct plugin source/manifest references.

## Usability

- Maintainers must be able to answer "is this feature supported as a Codex plugin?" from one whitelist entry.
- Unsupported features must report missing evidence clearly instead of being treated as implicitly supported.
- Catalog metadata must distinguish the launcher-only `context-menu` package from the full `spec-generator-v4` workflow.
