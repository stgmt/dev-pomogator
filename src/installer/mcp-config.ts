/**
 * MCP server config writer for target project's `.mcp.json`.
 *
 * Atomic smart-merge writer/remover for the `mcpServers.{name}` entries
 * declared by extensions in their `extension.json.mcpServers` field.
 *
 * Preserves all OTHER keys in the user's `.mcp.json` — both at top-level
 * (e.g. `inputs`, `name`) and inside `mcpServers` (e.g. user's own MCP
 * servers, MCP servers written by other extensions).
 */
import { createHash } from 'crypto';
import fs from 'fs-extra';
import { writeJsonAtomic } from '../utils/atomic-json.js';
import { resolveWithinProject } from '../utils/path-safety.js';
import type { McpServerConfig } from './extensions.js';

interface McpJsonShape {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

/**
 * Resolve the project's `.mcp.json` path with traversal guard.
 * Throws if the resolved path escapes `targetProject` (per
 * `no-unvalidated-manifest-paths` rule).
 */
function resolveMcpJsonPath(targetProject: string): string {
  const resolved = resolveWithinProject(targetProject, '.mcp.json');
  if (!resolved) {
    throw new Error(
      `MCPConfigWriteError: '.mcp.json' resolves outside targetProject ${targetProject}`
    );
  }
  return resolved;
}

// Missing file = empty config; parse error = fail-fast (don't silently overwrite
// user-edited broken JSON). Falls back to .bak only on parse error.
async function readMcpJsonStrict(filePath: string): Promise<McpJsonShape> {
  try {
    return await fs.readJson(filePath) as McpJsonShape;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'ENOENT') return {};
    const bakPath = filePath + '.bak';
    try {
      const recovered = await fs.readJson(bakPath) as McpJsonShape;
      console.warn(`  [WARN] Recovered .mcp.json from backup: ${bakPath}`);
      await fs.copy(bakPath, filePath, { overwrite: true });
      return recovered;
    } catch { /* .bak also unusable */ }
    throw new Error(
      `MCPConfigWriteError: cannot parse ${filePath} — fix the JSON syntax error before re-running. ` +
      `Underlying: ${(err as Error).message}`
    );
  }
}

/**
 * Compute a deterministic SHA-256 hash of an MCP server config object.
 * Used to track drift so the updater can re-write `.mcp.json` when an
 * extension bumps its pinned version.
 */
export function hashMcpServerConfig(config: McpServerConfig): string {
  // Stable key ordering for determinism (JSON.stringify visits inserted order;
  // McpServerConfig has only command/args/env so we serialize each explicitly).
  const stable = {
    command: config.command,
    args: config.args ?? [],
    env: config.env ?? {},
  };
  return createHash('sha256').update(JSON.stringify(stable), 'utf-8').digest('hex');
}

/**
 * Write a single mcpServer entry into the target project's `.mcp.json`,
 * preserving all other keys. Atomic via temp file + `fs.move`.
 *
 * Returns the configHash for tracking in `~/.dev-pomogator/config.json`
 * `installedExtensions[*].managed[repoRoot].mcpServers[serverName]`.
 */
export async function writeServerEntry(
  targetProject: string,
  serverName: string,
  config: McpServerConfig
): Promise<{ configHash: string }> {
  const filePath = resolveMcpJsonPath(targetProject);

  const existing = await readMcpJsonStrict(filePath);

  if (existing.mcpServers && typeof existing.mcpServers !== 'object') {
    throw new Error(
      `MCPConfigWriteError: invalid existing .mcp.json — 'mcpServers' is not an object`
    );
  }

  const merged: McpJsonShape = { ...existing };
  if (!merged.mcpServers || typeof merged.mcpServers !== 'object') {
    merged.mcpServers = {};
  }

  // Smart-merge: overwrite only the named entry; leave others untouched.
  merged.mcpServers[serverName] = {
    command: config.command,
    args: config.args ?? [],
    ...(config.env ? { env: config.env } : {}),
  };

  await writeJsonAtomic(filePath, merged);

  return { configHash: hashMcpServerConfig(config) };
}

/**
 * Remove a single mcpServer entry from the target project's `.mcp.json`.
 * No-op if the file doesn't exist or the key is absent.
 *
 * Other keys (top-level + other mcpServers entries) are preserved.
 * If `mcpServers` becomes empty, the empty object is kept (don't delete the
 * file — user may have other top-level keys).
 */
export async function removeServerEntry(
  targetProject: string,
  serverName: string
): Promise<{ removed: boolean }> {
  const filePath = resolveMcpJsonPath(targetProject);

  if (!(await fs.pathExists(filePath))) return { removed: false };

  const existing = await readMcpJsonStrict(filePath);
  if (!existing.mcpServers || typeof existing.mcpServers !== 'object') {
    return { removed: false };
  }
  if (!Object.prototype.hasOwnProperty.call(existing.mcpServers, serverName)) {
    return { removed: false };
  }

  const next: McpJsonShape = { ...existing };
  next.mcpServers = { ...existing.mcpServers };
  delete next.mcpServers[serverName];

  await writeJsonAtomic(filePath, next);
  return { removed: true };
}

/**
 * Read the current `.mcp.json` for inspection (e.g., conflict detection).
 * Returns `null` if the file doesn't exist or is invalid JSON unrecoverable.
 */
export async function readMcpJson(targetProject: string): Promise<McpJsonShape | null> {
  const filePath = resolveMcpJsonPath(targetProject);
  if (!(await fs.pathExists(filePath))) return null;
  const data = await readMcpJsonStrict(filePath);
  return data;
}
