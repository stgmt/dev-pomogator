import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';

export interface McpServerConfig {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export function readMcpConfigs(ctx: CheckContext): Map<string, McpServerConfig> {
  const result = new Map<string, McpServerConfig>();
  const paths = [
    path.join(ctx.projectRoot, '.mcp.json'),
    path.join(ctx.homeDir, '.claude', 'mcp.json'),
  ];
  for (const p of paths) {
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as {
        mcpServers?: Record<string, Omit<McpServerConfig, 'name'>>;
      };
      for (const [name, cfg] of Object.entries(parsed.mcpServers ?? {})) {
        if (!result.has(name)) result.set(name, { name, ...cfg });
      }
    } catch {
      // skip missing or malformed
    }
  }
  return result;
}

export const mcpParseCheck: CheckDefinition = {
  id: 'C11',
  fr: 'FR-9',
  name: 'MCP servers referenced in rules/skills',
  group: 'needs-external',
  reinstallable: false,
  pool: 'mcp',
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const referenced = ctx.referencedMcpServers;
    if (referenced.size === 0) {
      return [
        {
          id: 'C11',
          fr: 'FR-9',
          name: 'MCP servers referenced',
          group: 'needs-external',
          severity: 'ok',
          reinstallable: false,
          message: 'no mcp__*__ references found in rules/skills',
          durationMs: 0,
        },
      ];
    }
    const configured = readMcpConfigs(ctx);
    const missing = Array.from(referenced).filter((n) => !configured.has(n));
    if (missing.length === 0) {
      return [
        {
          id: 'C11',
          fr: 'FR-9',
          name: 'MCP servers referenced',
          group: 'needs-external',
          severity: 'ok',
          reinstallable: false,
          message: `${referenced.size} referenced MCP server(s) all configured`,
          durationMs: 0,
        },
      ];
    }
    return [
      {
        id: 'C11',
        fr: 'FR-9',
        name: 'MCP servers referenced',
        group: 'needs-external',
        severity: 'warning',
        reinstallable: false,
        message: `${missing.length} referenced MCP server(s) not configured: ${missing.join(', ')}`,
        hint: `Add missing server(s) to .mcp.json or ~/.claude/mcp.json`,
        durationMs: 0,
        details: { missing, referencedCount: referenced.size },
      },
    ];
  },
};
