/**
 * Doctor check: Cursor MCP door twin (FR-81g).
 * When root `.mcp.json` has `dev-pomogator-specs` but `.cursor/mcp.json` is
 * missing a Cursor-native twin (or is still a Claude byte-copy), warn with
 * apply hint via ensure-cursor-mcp.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { buildResult } from './_helpers.js';

const DOOR = 'dev-pomogator-specs';
const BUNDLE_REL = 'tools/spec-mcp-server/server.bundle.mjs';

type McpFile = { mcpServers?: Record<string, unknown> };
type StdioDoor = {
  command?: string;
  args?: unknown;
  env?: Record<string, unknown>;
};

function readMcp(p: string): McpFile | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as McpFile;
  } catch {
    return null;
  }
}

function rootPointsAtBundle(door: unknown): boolean {
  const blob = JSON.stringify(door ?? {});
  return blob.includes('server.bundle.mjs') && blob.includes('spec-mcp-server');
}

function isValidCursorDoor(door: unknown): boolean {
  if (!door || typeof door !== 'object') return false;
  const d = door as StdioDoor;
  if (d.command !== 'node') return false;
  const args = Array.isArray(d.args) ? d.args.map(String) : [];
  const joined = args.join(' ');
  const hitsBundle =
    joined.includes(BUNDLE_REL) ||
    (joined.includes('spec-mcp-server') && joined.includes('server.bundle.mjs'));
  if (!hitsBundle) return false;
  // Reject Claude `-e` wrapper copies — Cursor needs a direct bundle arg.
  if (args.some((a) => a === '-e' || a.startsWith('-e'))) return false;
  const rootEnv = d.env?.DEV_POMOGATOR_REPO_ROOT;
  return typeof rootEnv === 'string' && rootEnv.length > 0;
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
    if (!door || !rootPointsAtBundle(door)) {
      return [
        buildResult(meta, 'ok', `root .mcp.json has no usable ${DOOR} — Cursor twin N/A`),
      ];
    }
    const cursorPath = path.join(ctx.projectRoot, '.cursor', 'mcp.json');
    const cursorMcp = readMcp(cursorPath);
    const twin = cursorMcp?.mcpServers?.[DOOR];
    const applyHint =
      'Apply NOW: node --import tsx tools/spec-mcp-server/ensure-cursor-mcp.ts ' +
      '(writes Cursor-native ${workspaceFolder} launch for server.bundle.mjs). ' +
      'Then Cursor Settings → Tools & MCP → enable dev-pomogator-specs and reload.';

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
    if (!isValidCursorDoor(twin)) {
      return [
        buildResult(
          meta,
          'warning',
          `.cursor/mcp.json ${DOOR} is not Cursor-native (need direct node + \${workspaceFolder}/…/server.bundle.mjs, not Claude node -e copy)`,
          { hint: applyHint },
        ),
      ];
    }
    return [
      buildResult(meta, 'ok', `.cursor/mcp.json ${DOOR} is a Cursor-native twin of the root door`),
    ];
  },
};
