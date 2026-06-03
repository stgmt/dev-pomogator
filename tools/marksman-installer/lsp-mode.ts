/**
 * LSP backend resolution (FR-7 / SPECGEN004_16).
 *
 * The MCP server consults this at startup to decide which Markdown LSP surface
 * to initialise. If the silent Marksman install succeeded, the bundled binary
 * is used. If it failed (offline / unsupported platform — recorded as
 * `marksman.available = false` in `.dev-pomogator/install-log.json`), the
 * server falls back to the custom JS-based MD LSP — a graph-backed subset whose
 * wiki-link navigation is served by the MCP `find_refs` tool.
 *
 * @see ./install-log.ts (the supply-chain record this reads)
 * @see ../spec-mcp-server/tools.ts (find_refs — the JS-LSP navigation surface)
 * @see .specs/spec-generator-v4/FR.md FR-7
 */

import { readLog } from './install-log.ts';

export type LspMode = 'marksman' | 'js-fallback';

/**
 * Resolve the active LSP backend for `repoRoot`. Returns `'marksman'` only when
 * the install log explicitly records an available binary; every other state
 * (missing log, `available: false`) resolves to `'js-fallback'` so navigation
 * never silently dies.
 */
export function resolveLspMode(repoRoot: string): LspMode {
  const log = readLog(repoRoot);
  return log?.marksman.available === true ? 'marksman' : 'js-fallback';
}
