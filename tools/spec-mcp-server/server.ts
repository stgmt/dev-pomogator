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
import { pathToFileURL } from 'node:url';
import { startLifecycle, type LifecycleHandle } from './lifecycle.ts';
import { buildToolRegistry } from './tools.ts';

const PRODUCT_NAME = 'dev-pomogator-specs';
const PRODUCT_VERSION = '0.1.0';

export interface BootOptions {
  repoRoot: string;
}

/**
 * Boot the MCP server. Exported so integration tests can call it without
 * touching real stdio (they hand-roll an in-memory transport).
 */
export async function boot(opts: BootOptions): Promise<{
  server: McpServer;
  lifecycle: LifecycleHandle;
}> {
  // Enable the touch-test watch-mode probe (SPECGEN004_32): on a Docker-Desktop
  // bind mount where native fs events don't propagate, auto-fall-back to polling.
  const lifecycle = await startLifecycle({ repoRoot: opts.repoRoot, autoDetectWatchMode: true });
  const server = new McpServer({ name: PRODUCT_NAME, version: PRODUCT_VERSION });

  for (const tool of buildToolRegistry(() => lifecycle.graph)) {
    // SDK v1 `server.tool(name, schemaShape, handler)` — accepts raw zod
    // shape (i.e. `{key: z.string()}` not `z.object({key: ...})`).
    server.tool(tool.name, tool.description, tool.inputShape, tool.handler);
  }

  return { server, lifecycle };
}

async function main(): Promise<void> {
  const repoRoot = process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd();
  const { server, lifecycle } = await boot({ repoRoot });

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
  // Closing transport (EOF on stdin) resolves connect(); we treat that as a
  // clean shutdown signal — the parent agent decided we're done.
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`[${PRODUCT_NAME}] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  });
}
