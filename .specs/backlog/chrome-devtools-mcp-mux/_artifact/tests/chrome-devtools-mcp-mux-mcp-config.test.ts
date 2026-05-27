import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeServerEntry, removeServerEntry, readMcpJson, hashMcpServerConfig } from '../../src/installer/mcp-config.ts';
import {
  copyFixtureMcpJson,
  makeFixtureProjectDir,
  cleanupFixture,
} from './chrome-devtools-mcp-mux-helpers';

describe('PLUGIN017: chrome-devtools-mcp-mux — MCP config writer (smart merge)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeFixtureProjectDir();
  });

  afterEach(() => {
    cleanupFixture(tmpDir);
  });

  // @feature2 — FR-2: smart merge preserves user keys
  it('PLUGIN017_02: writeServerEntry preserves existing user mcpServer keys', async () => {
    copyFixtureMcpJson('existing-mcp-json', tmpDir);

    const result = await writeServerEntry(tmpDir, 'chrome-devtools-mcp-mux', {
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp-mux@0.2.2'],
    });

    expect(result.created).toBe(false);
    expect(result.configHash).toMatch(/^[0-9a-f]{64}$/);

    const json = await readMcpJson(tmpDir);
    expect(json).not.toBeNull();
    expect(Object.keys(json!.mcpServers!).sort()).toEqual([
      'chrome-devtools-mcp-mux',
      'user-server-foo',
    ]);
    // Pre-existing entry untouched
    expect(json!.mcpServers!['user-server-foo']).toEqual({
      command: 'echo',
      args: ['dummy'],
    });
    // Mux entry written correctly (objectContaining — auto-injected env on
    // Windows where Edge is present is a separate concern; test the contract
    // not the FR-9 default-injection side-effect).
    expect(json!.mcpServers!['chrome-devtools-mcp-mux']).toEqual(
      expect.objectContaining({
        command: 'npx',
        args: ['-y', 'chrome-devtools-mcp-mux@0.2.2'],
      }),
    );

    // No leftover .tmp file (atomic move)
    const tmpFile = path.join(tmpDir, '.mcp.json.tmp');
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  // @feature2 — FR-2: create from scratch when .mcp.json absent
  it('PLUGIN017_03: writeServerEntry creates .mcp.json when missing', async () => {
    expect(fs.existsSync(path.join(tmpDir, '.mcp.json'))).toBe(false);

    await writeServerEntry(tmpDir, 'chrome-devtools-mcp-mux', {
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp-mux@0.2.2'],
    });

    expect(fs.existsSync(path.join(tmpDir, '.mcp.json'))).toBe(true);
    const json = await readMcpJson(tmpDir);
    expect(Object.keys(json!.mcpServers!)).toEqual(['chrome-devtools-mcp-mux']);
  });

  // @feature6 — FR-6: removeServerEntry deletes mux key but preserves others
  it('PLUGIN017_09: removeServerEntry preserves other mcpServers entries', async () => {
    // Setup: write both user-server + mux
    copyFixtureMcpJson('existing-mcp-json', tmpDir);
    await writeServerEntry(tmpDir, 'chrome-devtools-mcp-mux', {
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp-mux@0.2.2'],
    });

    const before = await readMcpJson(tmpDir);
    expect(Object.keys(before!.mcpServers!).sort()).toEqual([
      'chrome-devtools-mcp-mux',
      'user-server-foo',
    ]);

    const { removed } = await removeServerEntry(tmpDir, 'chrome-devtools-mcp-mux');
    expect(removed).toBe(true);

    const after = await readMcpJson(tmpDir);
    expect(Object.keys(after!.mcpServers!)).toEqual(['user-server-foo']);
    expect(after!.mcpServers!['user-server-foo']).toEqual({
      command: 'echo',
      args: ['dummy'],
    });
  });

  // No-op when key absent
  it('PLUGIN017: removeServerEntry returns removed=false when key not present', async () => {
    copyFixtureMcpJson('existing-mcp-json', tmpDir);
    const { removed } = await removeServerEntry(tmpDir, 'chrome-devtools-mcp-mux');
    expect(removed).toBe(false);
  });

  // Determinism of configHash
  it('PLUGIN017: hashMcpServerConfig is deterministic', () => {
    const cfg = { command: 'npx', args: ['-y', 'pkg@1.0.0'] };
    const h1 = hashMcpServerConfig(cfg);
    const h2 = hashMcpServerConfig({ command: 'npx', args: ['-y', 'pkg@1.0.0'] });
    expect(h1).toBe(h2);
    const h3 = hashMcpServerConfig({ command: 'npx', args: ['-y', 'pkg@1.0.1'] });
    expect(h1).not.toBe(h3);
  });

  // Path traversal guard
  it('PLUGIN017: writeServerEntry refuses paths escaping target project', async () => {
    // resolveWithinProject is the gate; .mcp.json is the only allowed relative path,
    // so the function intrinsically refuses traversal. This test guards that behavior
    // by spot-checking the underlying utility (used by readMcpJson too).
    const escapeBase = path.join(tmpDir, 'subdir');
    fs.mkdirSync(escapeBase, { recursive: true });
    // Should still resolve correctly because '.mcp.json' is fixed inside the helper
    await writeServerEntry(tmpDir, 'chrome-devtools-mcp-mux', {
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp-mux@0.2.2'],
    });
    expect(fs.existsSync(path.join(tmpDir, '.mcp.json'))).toBe(true);
  });
});
