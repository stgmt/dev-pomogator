// Write an MCP auth secret (Context7 API key / Octocode GitHub token) into the user-global
// ~/.claude.json entry — the "agent writes the key the user pasted in chat" path (owner Q3).
//
// Used by the configure-mcp skill: the agent obtains a key (asks the user / points to where to get
// it / acquires it itself via `npx ctx7 setup` or `gh auth`), then calls this to persist it and
// VERIFY it took ("не вслепую, а с проверками"). The secret lives only in ~/.claude.json (user-
// global, not git-tracked) — never in a project .mcp.json (personal-pomogator FR-10).
//
// Contract: builtins only; atomic write (temp → fsync → rename); creates the server entry if absent
// (reusing the canonical definition); returns whether the post-write real-check now reports configured.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildEntry, MCP_SERVERS } from './mcp-bootstrap.ts';
import { context7Configured, octocodeConfigured, type McpEntry } from './mcp-auth-detect.ts';

interface ClaudeJsonForWrite {
  mcpServers?: Record<string, McpEntry>;
  [k: string]: unknown;
}

/** Which canonical server a secret belongs to, and the env var name that carries it. */
export const SECRET_TARGET: Record<string, { server: string; envName: string }> = {
  context7: { server: 'context7', envName: 'CONTEXT7_API_KEY' },
  octocode: { server: 'octocode', envName: 'GITHUB_TOKEN' },
};

export interface SetKeyResult {
  written: boolean;
  verified: boolean;
  server: string;
  envName: string;
  configPath: string;
}

function userConfigPath(homeDir: string): string {
  return path.join(homeDir, '.claude.json');
}

function readConfig(homeDir: string): ClaudeJsonForWrite {
  try {
    return JSON.parse(fs.readFileSync(userConfigPath(homeDir), 'utf-8')) as ClaudeJsonForWrite;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { mcpServers: {} };
    throw e; // malformed → refuse to clobber
  }
}

function writeAtomic(homeDir: string, data: ClaudeJsonForWrite): void {
  const target = userConfigPath(homeDir);
  const tmp = target + '.dev-pomogator.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, target);
}

/**
 * Persist `value` as the auth secret for `which` ('context7' | 'octocode') into ~/.claude.json, then
 * re-read and real-check. Creates the server entry (keyless base) if it does not exist yet.
 */
export function setMcpKey(opts: {
  which: 'context7' | 'octocode';
  value: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
}): SetKeyResult {
  const homeDir = opts.homeDir ?? os.homedir();
  const platform = opts.platform ?? process.platform;
  const target = SECRET_TARGET[opts.which];
  if (!target) throw new Error(`unknown MCP server: ${opts.which}`);
  if (!opts.value || !opts.value.trim()) throw new Error('refusing to write an empty secret');

  const config = readConfig(homeDir);
  if (!config.mcpServers) config.mcpServers = {};

  // Create the entry if missing (so a key can be set before the bootstrap hook ran).
  let entry = config.mcpServers[target.server] as McpEntry | undefined;
  if (!entry) {
    entry = buildEntry(MCP_SERVERS[target.server].baseArgs, platform);
    config.mcpServers[target.server] = entry;
  }
  entry.env = { ...(entry.env ?? {}), [target.envName]: opts.value.trim() };

  writeAtomic(homeDir, config);

  // Real-check post-write ("не вслепую"): re-read and confirm the predicate now passes.
  const fresh = readConfig(homeDir).mcpServers?.[target.server] as McpEntry | undefined;
  const verified =
    opts.which === 'context7'
      ? context7Configured(fresh, {})
      : octocodeConfigured(fresh, {}, () => false); // entry-token only; gh not relevant here

  return { written: true, verified, server: target.server, envName: target.envName, configPath: userConfigPath(homeDir) };
}

// CLI: `node set-mcp-key.ts <context7|octocode> <secret-value>`
function main(): void {
  const which = process.argv[2] as 'context7' | 'octocode';
  const value = process.argv[3];
  if (!which || !value) {
    process.stderr.write('usage: set-mcp-key.ts <context7|octocode> <secret-value>\n');
    process.exit(2);
  }
  try {
    const r = setMcpKey({ which, value });
    process.stdout.write(JSON.stringify(r) + '\n');
    process.exit(r.verified ? 0 : 1);
  } catch (e) {
    process.stderr.write(`set-mcp-key failed: ${(e as Error).message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
