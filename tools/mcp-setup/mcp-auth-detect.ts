// Pure auth-config detection for the Context7 / Octocode MCP servers.
//
// Shared by the SessionStart bootstrap hook (tools/mcp-setup/mcp-bootstrap.ts), the key writer
// (set-mcp-key.ts) and the pomogator-doctor check (checks/mcp-auth.ts). The point is to decide —
// with REAL checks, not blindly — whether each server is *properly configured* (Context7 has an
// API key; Octocode has GitHub auth), so a warning can nag until it is and then go silent.
//
// Contract: builtins + node:child_process ONLY (deps-absent-safe — ships in the plugin, runs with
// no node_modules). Pure predicates are side-effect-free; the only side effect is the injectable
// `gh auth status` probe, which is passed in so tests stay deterministic.

import { spawnSync } from 'node:child_process';

/** Minimal shape of an `mcpServers` entry from ~/.claude.json / .mcp.json (subset we read). */
export interface McpEntry {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

/** Env var names that carry a usable GitHub token for Octocode (any one is enough). */
export const OCTOCODE_TOKEN_VARS = ['GITHUB_TOKEN', 'GH_TOKEN', 'OCTOCODE_TOKEN'] as const;
export const CONTEXT7_KEY_VAR = 'CONTEXT7_API_KEY';

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Read a value from an entry's `env` first, then the ambient process env. */
function fromEntryOrEnv(
  entry: McpEntry | undefined,
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const onEntry = entry?.env?.[name];
  if (nonEmpty(onEntry)) return onEntry;
  const onEnv = env[name];
  return nonEmpty(onEnv) ? onEnv : undefined;
}

/** Find a `--api-key <value>` pair in stdio args (the Context7 stdio form). */
function apiKeyFromArgs(args: string[] | undefined): string | undefined {
  if (!args) return undefined;
  const i = args.indexOf('--api-key');
  if (i >= 0 && nonEmpty(args[i + 1])) return args[i + 1];
  return undefined;
}

/**
 * Context7 is "configured" (NOT the anonymous tier) iff a non-empty API key is present — on the
 * entry env, as a `--api-key` arg, or in the ambient process env (inherited by the MCP child).
 * An entry that merely EXISTS with no key = anonymous tier = NOT configured (warning stays).
 */
export function context7Configured(entry: McpEntry | undefined, env: NodeJS.ProcessEnv): boolean {
  if (nonEmpty(fromEntryOrEnv(entry, env, CONTEXT7_KEY_VAR))) return true;
  if (nonEmpty(apiKeyFromArgs(entry?.args))) return true;
  return false;
}

/** Run `gh auth status`; exit 0 ⟹ the GitHub CLI is logged in. Fail-safe to false (ENOENT/timeout). */
export function ghAuthStatus(timeoutMs = 3000): boolean {
  try {
    const r = spawnSync('gh', ['auth', 'status'], {
      encoding: 'utf-8',
      timeout: timeoutMs,
      windowsHide: true,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Octocode is "configured" iff GitHub auth is available — a non-empty token (entry env or process
 * env) OR the `gh` CLI is logged in. The gh probe is injectable so callers can skip the spawn (the
 * token check is cheap and tried first) and tests stay deterministic.
 */
export function octocodeConfigured(
  entry: McpEntry | undefined,
  env: NodeJS.ProcessEnv,
  ghStatus: () => boolean = ghAuthStatus,
): boolean {
  for (const name of OCTOCODE_TOKEN_VARS) {
    if (nonEmpty(fromEntryOrEnv(entry, env, name))) return true;
  }
  return ghStatus();
}

/** Case-insensitive lookup of an entry whose key contains `needle` (handles user-/claude- prefixes). */
export function findEntry(
  configs: Map<string, McpEntry> | Record<string, McpEntry>,
  needle: string,
): McpEntry | undefined {
  const entries = configs instanceof Map ? configs : new Map(Object.entries(configs));
  for (const [name, cfg] of entries) {
    if (name.toLowerCase().includes(needle.toLowerCase())) return cfg;
  }
  return undefined;
}

export interface McpAuthStatus {
  context7: boolean;
  octocode: boolean;
}

/**
 * Resolve the full auth status from a set of configured entries. `gh auth status` is only probed
 * when Octocode lacks a token, to avoid a needless spawn on every session.
 */
export function detectMcpAuth(
  configs: Map<string, McpEntry> | Record<string, McpEntry>,
  env: NodeJS.ProcessEnv = process.env,
  ghStatus: () => boolean = ghAuthStatus,
): McpAuthStatus {
  const c7 = findEntry(configs, 'context7');
  const oc = findEntry(configs, 'octocode');
  return {
    context7: context7Configured(c7, env),
    octocode: octocodeConfigured(oc, env, ghStatus),
  };
}
