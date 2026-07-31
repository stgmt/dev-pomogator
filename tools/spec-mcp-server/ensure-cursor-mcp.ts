/**
 * Ensure project `.cursor/mcp.json` registers the SpecGraph door for Cursor
 * (FR-81g path-layout adapter).
 *
 * Root `.mcp.json` stays Claude/plugin-shaped (`node -e` + CLAUDE_PLUGIN_ROOT /
 * `${CLAUDE_PROJECT_DIR}`). Cursor needs a different launch shape:
 * `node ${workspaceFolder}/tools/spec-mcp-server/server.bundle.mjs` with
 * `DEV_POMOGATOR_REPO_ROOT=${workspaceFolder}` — same door binary, not a byte
 * copy of the Claude entry (Cursor does not expand CLAUDE_PROJECT_DIR and may
 * not cwd the Claude `-e` wrapper at the repo root).
 *
 * Usage:
 *   node --import tsx tools/spec-mcp-server/ensure-cursor-mcp.ts
 *   node --import tsx tools/spec-mcp-server/ensure-cursor-mcp.ts --check
 *
 * --check: exit 0 if Cursor twin is present + semantically valid; exit 2 otherwise.
 * default: write/overwrite the Cursor door entry (preserves other mcpServers).
 */
import fs from 'node:fs';
import path from 'node:path';

const DOOR = 'dev-pomogator-specs';
const BUNDLE_REL = 'tools/spec-mcp-server/server.bundle.mjs';

type McpFile = { mcpServers?: Record<string, unknown> };

type StdioDoor = {
  type?: string;
  command?: string;
  args?: unknown;
  env?: Record<string, unknown>;
};

/** Canonical Cursor twin — path-layout adapter for the same server.bundle.mjs. */
export function cursorDoorEntry(): StdioDoor {
  return {
    type: 'stdio',
    command: 'node',
    args: [`\${workspaceFolder}/${BUNDLE_REL}`],
    env: {
      DEV_POMOGATOR_REPO_ROOT: '${workspaceFolder}',
    },
  };
}

function readJson(p: string): McpFile {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as McpFile;
}

function asDoor(v: unknown): StdioDoor | null {
  if (!v || typeof v !== 'object') return null;
  return v as StdioDoor;
}

/** Root Claude entry must clearly target the SpecGraph bundle. */
export function rootDoorPointsAtBundle(door: unknown): boolean {
  const d = asDoor(door);
  if (!d) return false;
  const blob = JSON.stringify(d);
  return blob.includes('server.bundle.mjs') && blob.includes('spec-mcp-server');
}

/**
 * Cursor twin is valid when it launches node against the workspace bundle
 * (via ${workspaceFolder} or a path that includes the relative bundle).
 */
export function isValidCursorDoor(door: unknown): boolean {
  const d = asDoor(door);
  if (!d) return false;
  if (d.command !== 'node') return false;
  const args = Array.isArray(d.args) ? d.args.map(String) : [];
  const joined = args.join(' ');
  const hitsBundle =
    joined.includes(BUNDLE_REL) ||
    (joined.includes('spec-mcp-server') && joined.includes('server.bundle.mjs'));
  if (!hitsBundle) return false;
  const rootEnv = d.env?.DEV_POMOGATOR_REPO_ROOT;
  // Prefer workspaceFolder; allow literal/cwd fallbacks already tolerated by resolveRepoRoot.
  return typeof rootEnv === 'string' && rootEnv.length > 0;
}

function doorsMatch(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main(): void {
  const root = process.cwd();
  const rootMcpPath = path.join(root, '.mcp.json');
  const cursorMcpPath = path.join(root, '.cursor', 'mcp.json');
  const checkOnly = process.argv.includes('--check');
  const expected = cursorDoorEntry();

  if (!fs.existsSync(rootMcpPath)) {
    process.stderr.write('[ensure-cursor-mcp] root .mcp.json missing\n');
    process.exit(1);
  }
  const rootMcp = readJson(rootMcpPath);
  const rootDoor = rootMcp.mcpServers?.[DOOR];
  if (!rootDoor) {
    process.stderr.write(`[ensure-cursor-mcp] root .mcp.json has no ${DOOR}\n`);
    process.exit(1);
  }
  if (!rootDoorPointsAtBundle(rootDoor)) {
    process.stderr.write(
      `[ensure-cursor-mcp] root ${DOOR} does not reference ${BUNDLE_REL}\n`,
    );
    process.exit(1);
  }

  let cursorMcp: McpFile = { mcpServers: {} };
  if (fs.existsSync(cursorMcpPath)) {
    cursorMcp = readJson(cursorMcpPath);
  }
  const existing = cursorMcp.mcpServers?.[DOOR];
  const ok = existing !== undefined && isValidCursorDoor(existing) && doorsMatch(existing, expected);

  if (checkOnly) {
    if (ok) {
      process.stdout.write(
        `[ensure-cursor-mcp] OK: .cursor/mcp.json ${DOOR} is Cursor-native twin of root door\n`,
      );
      process.exit(0);
    }
    if (existing === undefined) {
      process.stderr.write(`[ensure-cursor-mcp] MISSING: .cursor/mcp.json has no ${DOOR}\n`);
    } else if (!isValidCursorDoor(existing)) {
      process.stderr.write(
        `[ensure-cursor-mcp] INVALID: .cursor/mcp.json ${DOOR} is not a Cursor-native door twin\n`,
      );
    } else {
      process.stderr.write(
        `[ensure-cursor-mcp] DIVERGENT: .cursor/mcp.json ${DOOR} != canonical Cursor twin\n`,
      );
    }
    process.exit(2);
  }

  if (ok) {
    process.stdout.write('[ensure-cursor-mcp] already in sync\n');
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(cursorMcpPath), { recursive: true });
  const next: McpFile = {
    mcpServers: { ...(cursorMcp.mcpServers ?? {}), [DOOR]: expected },
  };
  const tmp = `${cursorMcpPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmp, cursorMcpPath);
  process.stdout.write(`[ensure-cursor-mcp] wrote ${path.relative(root, cursorMcpPath)}\n`);
}

main();
