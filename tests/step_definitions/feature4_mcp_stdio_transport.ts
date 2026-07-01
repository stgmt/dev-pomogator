/**
 * @feature4 step definitions — MCP server real JSON-RPC/stdio transport (T-Cov.3).
 *
 * Migrated from tests/e2e/spec-graph-mcp.test.ts (SPECGEN004_391–393). Drives the
 * REAL `tools/spec-mcp-server/server.ts` as an actual subprocess over stdio using
 * the official MCP SDK Client + StdioClientTransport — the `boot()` →
 * StdioServerTransport path that the in-memory feature39 (buildToolRegistry) does
 * NOT exercise. An isolated tmpdir repo (V4World tempDir, DEV_POMOGATOR_REPO_ROOT)
 * keeps the lifecycle lock + chokidar watcher off the real .specs tree.
 *
 * @see tools/spec-mcp-server/server.ts (boot + StdioServerTransport)
 * @see .specs/spec-generator-v4/FR.md FR-4
 */
import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const SERVER = path.join(REPO_ROOT, 'tools', 'spec-mcp-server', 'server.ts');

interface McpStdioWorld extends V4World {
  mcpClient?: Client;
  mcpTransport?: StdioClientTransport;
  mcpToolNames?: string[];
  mcpTrace?: { ok: boolean; node?: { id: string; verified_status?: unknown } };
  mcpCoverage?: { ok: boolean; buckets?: unknown; totals?: unknown };
}

// Spawn the REAL server subprocess over stdio against an isolated demo repo.
Given(
  /^a running spec-graph MCP server over real stdio against an isolated demo spec$/,
  async function (this: McpStdioWorld) {
    const demoDir = path.join(this.tempDir, '.specs', 'demo');
    fs.mkdirSync(demoDir, { recursive: true });
    fs.writeFileSync(path.join(demoDir, 'FR.md'), '## FR-1: Demo\n\nSystem SHALL demo.\n');
    fs.writeFileSync(
      path.join(demoDir, 'demo.feature'),
      'Feature: Demo\n\n  @FR-1\n  Scenario: works\n    Given x\n',
    );
    this.mcpTransport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', SERVER],
      cwd: REPO_ROOT,
      env: { ...process.env, DEV_POMOGATOR_REPO_ROOT: this.tempDir } as Record<string, string>,
    });
    this.mcpClient = new Client({ name: 'mcp-stdio-bdd', version: '1.0.0' });
    await this.mcpClient.connect(this.mcpTransport); // JSON-RPC initialize handshake
  },
);

When(
  /^the agent lists the MCP server tools over the wire$/,
  async function (this: McpStdioWorld) {
    this.mcpToolNames = (await this.mcpClient!.listTools()).tools.map((t) => t.name);
  },
);

Then(
  /^the MCP server advertises the read-only tools get_trace and get_spec_status$/,
  function (this: McpStdioWorld) {
    assert.ok(this.mcpToolNames, 'listTools must return tool names over stdio');
    assert.ok(this.mcpToolNames!.includes('get_trace'), `get_trace must be advertised; got ${this.mcpToolNames}`);
    assert.ok(this.mcpToolNames!.includes('get_spec_status'), `get_spec_status must be advertised; got ${this.mcpToolNames}`);
  },
);

When(
  /^the agent calls get_trace for the demo node `([^`]+)` over the wire$/,
  async function (this: McpStdioWorld, nodeId: string) {
    const res = await this.mcpClient!.callTool({ name: 'get_trace', arguments: { node_id: nodeId } });
    this.mcpTrace = JSON.parse((res.content as Array<{ text: string }>)[0].text);
  },
);

Then(
  /^get_trace returns ok for `([^`]+)` carrying a verified_status surface$/,
  function (this: McpStdioWorld, nodeId: string) {
    assert.ok(this.mcpTrace?.ok, `get_trace must return ok over stdio: ${JSON.stringify(this.mcpTrace)}`);
    assert.equal(this.mcpTrace!.node?.id, nodeId, 'get_trace node id must match the qualified node');
    assert.ok(
      this.mcpTrace!.node && 'verified_status' in this.mcpTrace!.node,
      'the FR-32 verified_status surface must come over the transport',
    );
  },
);

When(
  /^the agent calls get_spec_status \(view coverage\) over the wire$/,
  async function (this: McpStdioWorld) {
    const res = await this.mcpClient!.callTool({ name: 'get_spec_status', arguments: { view: 'coverage' } });
    this.mcpCoverage = JSON.parse((res.content as Array<{ text: string }>)[0].text);
  },
);

Then(
  /^get_spec_status returns ok with buckets and totals$/,
  function (this: McpStdioWorld) {
    assert.ok(this.mcpCoverage?.ok, `get_spec_status must return ok over stdio: ${JSON.stringify(this.mcpCoverage)}`);
    assert.ok('buckets' in this.mcpCoverage!, 'coverage payload must carry buckets');
    assert.ok('totals' in this.mcpCoverage!, 'coverage payload must carry totals');
  },
);

// Close the subprocess transport so no MCP server leaks between scenarios.
After({ tags: '@mcp-stdio' }, async function (this: McpStdioWorld) {
  try {
    await this.mcpClient?.close();
  } catch {
    /* already closed */
  }
});
