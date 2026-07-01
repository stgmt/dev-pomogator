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
    // Canonical user-global MCP config is ~/.claude.json (NOT ~/.claude/mcp.json, which
    // Claude Code never creates) — the latter made every globally-registered MCP invisible.
    path.join(ctx.homeDir, '.claude.json'),
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

/**
 * Live-but-config-invisible MCP servers: plugin-bundled tools (`mcp__plugin_<plugin>_<srv>__`),
 * claude.ai connectors (`mcp__claude_ai_*__`) and the built-in `claude-in-chrome` are provided via
 * plugin/connector manifests, NOT via .mcp.json / ~/.claude.json. readMcpConfigs cannot see them,
 * so they must not be reported as "missing" (the C11 false over-report fix).
 */
export function isPluginProvidedMcp(name: string): boolean {
  return name.startsWith('plugin_') || name.startsWith('claude_ai_') || name === 'claude-in-chrome';
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
    const missing = Array.from(referenced).filter(
      (n) => !configured.has(n) && !isPluginProvidedMcp(n),
    );
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
        hint: `Add missing server(s) to .mcp.json or ~/.claude.json`,
        durationMs: 0,
        details: { missing, referencedCount: referenced.size },
      },
    ];
  },
};
