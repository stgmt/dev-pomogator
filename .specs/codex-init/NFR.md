# Non-Functional Requirements (NFR)

## Performance

- Whitelist validation should complete in under 5 seconds for metadata-only checks on a warm repo.
- Any real Codex plugin install/load verification may be slower, but must be isolated from normal spec validation unless explicitly requested.

## Security

- Verification must not silently grant broad permissions, hook trust, or global Codex configuration outside an explicit temporary test boundary.
- Codex hook/MCP support must document trust and approval requirements instead of assuming install equals execution.

## Reliability

- The whitelist must be deterministic from committed files and verified CLI evidence.
- Context-menu drift checks must detect stale installed artifacts when plugin source files change.

## Usability

- Maintainers must be able to answer "is this feature supported as a Codex plugin?" from one whitelist entry.
- Unsupported features must report missing evidence clearly instead of being treated as implicitly supported.
