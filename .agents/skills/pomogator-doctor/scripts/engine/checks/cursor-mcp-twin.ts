/**
 * Doctor check: Cursor MCP door twin (FR-81g).
 * When root `.mcp.json` has `dev-pomogator-specs` but `.cursor/mcp.json` is
 * missing that entry (or diverges), warn with apply hint via ensure-cursor-mcp.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { buildResult } from './_helpers.js';

const DOOR = 'dev-pomogator-specs';

type McpFile = { mcpServers?: Record<string, unknown> };

function readMcp(p: string): McpFile | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as McpFile;
  } catch {
    return null;
  }
}

export const cursorMcpTwinCheck: CheckDefinition = {
  id: 'C33',
  fr: 'FR-81',
  name: 'Cursor MCP door twin (.cursor/mcp.json)',
  group: 'self-sufficient',
  reinstallable: true,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const meta = {
      id: 'C33' as const,
      fr: 'FR-81',
      name: 'Cursor MCP door twin (.cursor/mcp.json)',
      group: 'self-sufficient' as const,
      reinstallable: true,
    };
    const rootMcp = readMcp(path.join(ctx.projectRoot, '.mcp.json'));
    const door = rootMcp?.mcpServers?.[DOOR];
    if (!door) {
      return [
        buildResult(meta, 'ok', `root .mcp.json has no ${DOOR} — Cursor twin N/A`),
      ];
    }
    const cursorPath = path.join(ctx.projectRoot, '.cursor', 'mcp.json');
    const cursorMcp = readMcp(cursorPath);
    const twin = cursorMcp?.mcpServers?.[DOOR];
    const applyHint =
      'Apply NOW: node --import tsx tools/spec-mcp-server/ensure-cursor-mcp.ts ' +
      '(copies/syncs dev-pomogator-specs from root .mcp.json into .cursor/mcp.json). ' +
      'Then enable Cursor Settings → Third-party skills/hooks and reload.';

    if (twin === undefined) {
      return [
        buildResult(
          meta,
          'warning',
          `root has ${DOOR} but .cursor/mcp.json is missing that entry — Cursor cannot see the door`,
          { hint: applyHint },
        ),
      ];
    }
    if (JSON.stringify(twin) !== JSON.stringify(door)) {
      return [
        buildResult(
          meta,
          'warning',
          `.cursor/mcp.json ${DOOR} diverges from root .mcp.json`,
          { hint: applyHint },
        ),
      ];
    }
    return [
      buildResult(meta, 'ok', `.cursor/mcp.json ${DOOR} matches root door entry`),
    ];
  },
};
