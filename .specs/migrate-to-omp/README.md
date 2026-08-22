# Migrate dev-pomogator spec ecosystem to OMP

This is a migration specification, not an implementation claim.

## Direction

- Repository root remains the only marketplace/plugin source.
- A root OMP catalog and one extension factory add OMP capability.
- Existing SpecGraph, MCP door, verdict, evidence and BDD engines remain authoritative.
- Root .mcp.json keeps its Node launcher until W0 proves an installed-plugin alternative.
- Bounded rollback and preservation of unrelated specs are W0 gates.

## Delivery gates

1. Disposable install resolves and activates the root plugin after reload/restart.
2. Extension tool, mapped hook and MCP door execute their real contracts.
3. Every wave has Docker BDD and bounded rollback evidence.
4. The final failure case preserves the Claude path and unrelated specs.

See RESEARCH.md for evidence status, DESIGN.md for contracts, TASKS.md for ownership, and REVIEW_NOTES.md for unresolved review findings.
