/**
 * Real JSON-RPC/stdio transport e2e for the spec-graph MCP server (T-Cov.3).
 *
 * Spawns `server.ts` as an actual subprocess and drives it with the official
 * MCP SDK client over stdio — the `boot()` → StdioServerTransport path that the
 * in-memory `tools.test.ts` does NOT exercise. Uses an isolated tmpdir repo so
 * the lifecycle lock + chokidar watcher don't touch the real .specs tree.
 *
 * @see tools/spec-mcp-server/server.ts (boot + StdioServerTransport)
 * @see tests/step_definitions/phase2-mcp.ts (header reference — now real)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmp: string;
let client: Client;
let transport: StdioClientTransport;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'specgraph-mcp-e2e-'));
  fs.mkdirSync(path.join(tmp, '.specs', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.specs', 'demo', 'FR.md'), '## FR-1: Demo\n\nSystem SHALL demo.\n');
  fs.writeFileSync(
    path.join(tmp, '.specs', 'demo', 'demo.feature'),
    'Feature: Demo\n\n  @FR-1\n  Scenario: works\n    Given x\n',
  );

  transport = new StdioClientTransport({
    command: 'node',
    args: ['--import', 'tsx', path.resolve('tools/spec-mcp-server/server.ts')],
    env: { ...process.env, DEV_POMOGATOR_REPO_ROOT: tmp } as Record<string, string>,
  });
  client = new Client({ name: 'spec-graph-mcp-e2e', version: '1.0.0' });
  await client.connect(transport); // performs the JSON-RPC `initialize` handshake
}, 30000);

afterAll(async () => {
  try {
    await client?.close();
  } catch {
    /* already closed */
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('spec-graph MCP server — real JSON-RPC over stdio (T-Cov.3)', () => {
  it('completes the initialize handshake and advertises the read-only tools', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('get_trace');
    expect(names).toContain('get_coverage');
  });

  it('answers tools/call get_trace for a real node over the wire', async () => {
    const res = await client.callTool({ name: 'get_trace', arguments: { node_id: 'FR-1' } });
    const payload = JSON.parse((res.content as Array<{ text: string }>)[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.node.id).toBe('FR-1');
    expect(payload.node).toHaveProperty('verified_status'); // FR-32 surface, over the transport
  });

  it('answers tools/call get_coverage over the wire', async () => {
    const res = await client.callTool({ name: 'get_coverage', arguments: {} });
    const payload = JSON.parse((res.content as Array<{ text: string }>)[0].text);
    expect(payload.ok).toBe(true);
    expect(payload).toHaveProperty('buckets');
    expect(payload).toHaveProperty('totals');
  });
});
