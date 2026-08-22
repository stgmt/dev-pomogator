#!/usr/bin/env -S node --import tsx
/**
 * MCP server entry point — `dev-pomogator-specs`.
 *
 * Wires the Phase-1 SpecGraph + 11 read-only tools per [SCHEMA Entity 3]
 * into the @modelcontextprotocol/sdk v1 stdio transport.
 *
 *     $ node --import tsx tools/spec-mcp-server/server.ts
 *
 * Or via the registered `.mcp.json` entry — Claude Code spawns the process
 * during agent initialization and feeds JSON-RPC over stdio.
 *
 * @see ./tools.ts (11 read-only graph query tools)
 * @see ./lifecycle.ts (graph + watcher + lock orchestration)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { startLifecycle, type LifecycleHandle } from './lifecycle.ts';
import { buildToolRegistry } from './tools.ts';
import { configuredFeatureRoots } from '../specs-generator/spec-verdict.ts';
import { resolveTargetProjectRoot, type RootResolution } from '../spec-graph/root-resolution.ts';
import { checkDeclaredWorktree, ROOT_WORKTREE_MISMATCH } from './path-containment.ts';

export const PRODUCT_NAME = 'dev-pomogator-specs';
export const MCP_VERSION = '0.1.0';

function installedPluginVersion(): string {
  try {
    const packagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export interface BootOptions {
  repoRoot: string;
  /** Claimed caller worktree. A mismatch is fail-closed for every mutation. */
  declaredWorktree?: string;
  pluginVersion?: string;
}

/**
 * Boot the MCP server. Exported so integration tests can call it without
 * touching real stdio (they hand-roll an in-memory transport).
 */
export async function boot(opts: BootOptions): Promise<{
  server: McpServer;
  lifecycle: LifecycleHandle;
}> {
  // Admission is intentionally before lifecycle startup: lifecycle creates locks
  // and caches, which a mismatched caller must not cause in another worktree.
  if (!checkDeclaredWorktree(opts.repoRoot, opts.declaredWorktree).ok) {
    throw new Error(ROOT_WORKTREE_MISMATCH);
  }

  // Enable the touch-test watch-mode probe (SPECGEN004_32): on a Docker-Desktop
  // bind mount where native fs events don't propagate, auto-fall-back to polling.
  // P21-1: `onLockContention: 'readonly'` — when a sibling session owns the
  // write-lock, boot a READ-ONLY door instead of crashing, so every session
  // keeps a live door for reads while writes serialise to the lock owner.
  const lifecycle = await startLifecycle({
    repoRoot: opts.repoRoot,
    featureRoots: configuredFeatureRoots(opts.repoRoot),
    autoDetectWatchMode: true,
    onLockContention: 'readonly',
  });
  if (lifecycle.readOnly && lifecycle.lockHolder) {
    process.stderr.write(
      `[${PRODUCT_NAME}] presence-reader door: presence lock owned by pid ${lifecycle.lockHolder.pid} ` +
        `(env ${lifecycle.lockHolder.env}); E-A — writes still proceed, serialized per-mutation by the short write-lock + CAS\n`,
    );
  }
  const server = new McpServer({ name: PRODUCT_NAME, version: MCP_VERSION });

  // FR-7b: markdown navigation (definition/references/rename over wiki-links) is
  // owned by Marksman as a NATIVE Claude Code LSP plugin (`.lsp.json`), exposed
  // through Claude Code's built-in `LSP` tool — NOT a custom in-MCP bridge. This
  // server keeps only the spec-DOMAIN graph tools (trace / coverage / honesty /
  // conformance + the graph-edge `find_refs` the LSP has no concept of).
  for (const tool of buildToolRegistry(() => lifecycle.graph, {
    repoRoot: opts.repoRoot,
    declaredWorktree: opts.declaredWorktree,
    refreshGraph: lifecycle.refreshGraph,
    preflight: () => ({
      lockMode: lifecycle.lockMode,
      writeMode: lifecycle.writeMode,
      dependencies: lifecycle.dependencies,
      mcpVersion: MCP_VERSION,
      pluginVersion: opts.pluginVersion ?? installedPluginVersion(),
    }),
    // P21-1: in a read-only door the write tools refuse with the holder named.
    writeLockHeldBy: () =>
      lifecycle.readOnly && lifecycle.lockHolder
        ? {
            pid: lifecycle.lockHolder.pid,
            env: lifecycle.lockHolder.env,
            started_at: lifecycle.lockHolder.started_at,
          }
        : null,
  })) {
    // SDK v1 `server.tool(name, schemaShape, handler)` — accepts raw zod
    // shape (i.e. `{key: z.string()}` not `z.object({key: ...})`).
    server.tool(tool.name, tool.description, tool.inputShape, tool.handler);
  }

  return { server, lifecycle };
}

/**
 * Resolve the repo root robustly. `DEV_POMOGATOR_REPO_ROOT` is preferred, but
 * ONLY when it's a real directory that actually contains `.specs/`. Headless
 * launch contexts (`claude -p`) were observed to pass the UNRESOLVED
 * `${CLAUDE_PROJECT_DIR}` LITERAL (a non-empty string, so the old `|| cwd`
 * never caught it) — the server then built its graph from a nonexistent path, so
 * EVERY `get_node`/`get_trace` returned NODE_NOT_FOUND and the live agent fell
 * back to a raw `Read` of `.specs/` (2026-06-08 P17-6 live diagnosis). Reject an
 * `${…}` placeholder or a `.specs`-less path, then fall back to cwd.
 */
export function resolveMcpRoot(env: string | undefined, cwd: string, scriptDir: string): RootResolution {
  // DEV_POMOGATOR_REPO_ROOT predates FR-62; accept it as the MCP spelling of
  // the explicit override while the shared contract retains its source label.
  return resolveTargetProjectRoot({ envRoot: env ?? process.env.SPECS_GENERATOR_ROOT, cwd, scriptDir });
}

/** Backward-compatible string helper retained for the FR-39 consumer. */
export function resolveRepoRoot(env: string | undefined, cwd: string): string {
  const result = resolveMcpRoot(env, cwd, path.dirname(fileURLToPath(import.meta.url)));
  return result.root ?? cwd;
}

async function main(): Promise<void> {
  const resolution = resolveMcpRoot(process.env.SPECS_GENERATOR_ROOT ?? process.env.DEV_POMOGATOR_REPO_ROOT, process.cwd(), path.dirname(fileURLToPath(import.meta.url)));
  if (resolution.status === 'NOT_READY' || !resolution.root) {
    process.stderr.write(`[${PRODUCT_NAME}] NOT_READY ${JSON.stringify(resolution)}\n`);
    process.exitCode = 2;
    return;
  }
  const repoRoot = resolution.root;
  const { server, lifecycle } = await boot({
    repoRoot,
    declaredWorktree: process.env.CLAUDE_PROJECT_DIR,
    pluginVersion: installedPluginVersion(),
  });

  const shutdownAndExit = async (code: number): Promise<void> => {
    await lifecycle.shutdown();
    try {
      await server.close();
    } catch {
      // SDK throws if already closed; best-effort.
    }
    process.exit(code);
  };

  process.on('SIGINT', () => void shutdownAndExit(0));
  process.on('SIGTERM', () => void shutdownAndExit(0));
  process.on('uncaughtException', async (err) => {
    process.stderr.write(`[${PRODUCT_NAME}] uncaughtException: ${err.stack ?? err.message}\n`);
    await shutdownAndExit(1);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The SDK keeps connect() alive after stdin EOF. Treat EOF as the parent
  // closing the MCP session so bundle smoke tests and real clients shut down cleanly.
  process.stdin.once('end', () => void shutdownAndExit(0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`[${PRODUCT_NAME}] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  });
}
