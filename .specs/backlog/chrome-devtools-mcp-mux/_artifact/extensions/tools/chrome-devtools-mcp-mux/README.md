# chrome-devtools-mcp-mux tools

## smoke-test.mjs

Spawns `cdmcp-mux` (or its stub equivalent) and validates the JSON-RPC handshake works on the host platform. Used by integration tests and (optionally) by `pomogator-doctor` CDMM-3.

### Usage

```bash
node smoke-test.mjs                  # uses npx -y chrome-devtools-mcp-mux@<pinned>
CDMM_SMOKE_BIN=node CDMM_SMOKE_BIN_ARGS=path/to/fake.mjs node smoke-test.mjs
```

Env overrides:

- `CDMM_SMOKE_BIN` — override binary (defaults to `npx`)
- `CDMM_SMOKE_BIN_ARGS` — override args (defaults to `["-y", "chrome-devtools-mcp-mux@<pinned>"]`); space-separated
- `CDMM_SMOKE_TIMEOUT_MS` — override total budget (default 30_000)

### Exit codes

- `0` — initialize + tools/list both succeeded
- non-zero — first failed step printed to stderr

See `.specs/chrome-devtools-mcp-mux/FR.md` FR-8 + AC-8 for spec.
