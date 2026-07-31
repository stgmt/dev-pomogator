/**
 * Ensure project `.cursor/mcp.json` carries the same `dev-pomogator-specs` door
 * entry as root `.mcp.json` (FR-81g Cursor path-layout adapter).
 *
 * Usage:
 *   node --import tsx tools/spec-mcp-server/ensure-cursor-mcp.ts
 *   node --import tsx tools/spec-mcp-server/ensure-cursor-mcp.ts --check
 *
 * --check: exit 0 if twin present + equivalent; exit 2 if missing/divergent (no write).
 * default: write/overwrite `.cursor/mcp.json` door entry from root template (preserves
 * other Cursor mcpServers if any).
 */
import fs from 'node:fs';
import path from 'node:path';

const DOOR = 'dev-pomogator-specs';

type McpFile = { mcpServers?: Record<string, unknown> };

function readJson(p: string): McpFile {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as McpFile;
}

function doorEquivalent(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main(): void {
  const root = process.cwd();
  const rootMcpPath = path.join(root, '.mcp.json');
  const cursorMcpPath = path.join(root, '.cursor', 'mcp.json');
  const checkOnly = process.argv.includes('--check');

  if (!fs.existsSync(rootMcpPath)) {
    process.stderr.write('[ensure-cursor-mcp] root .mcp.json missing\n');
    process.exit(1);
  }
  const rootMcp = readJson(rootMcpPath);
  const door = rootMcp.mcpServers?.[DOOR];
  if (!door) {
    process.stderr.write(`[ensure-cursor-mcp] root .mcp.json has no ${DOOR}\n`);
    process.exit(1);
  }

  let cursorMcp: McpFile = { mcpServers: {} };
  if (fs.existsSync(cursorMcpPath)) {
    cursorMcp = readJson(cursorMcpPath);
  }
  const existing = cursorMcp.mcpServers?.[DOOR];
  const ok = existing !== undefined && doorEquivalent(existing, door);

  if (checkOnly) {
    if (ok) {
      process.stdout.write(`[ensure-cursor-mcp] OK: .cursor/mcp.json ${DOOR} matches root\n`);
      process.exit(0);
    }
    process.stderr.write(
      existing === undefined
        ? `[ensure-cursor-mcp] MISSING: .cursor/mcp.json has no ${DOOR}\n`
        : `[ensure-cursor-mcp] DIVERGENT: .cursor/mcp.json ${DOOR} != root\n`,
    );
    process.exit(2);
  }

  if (ok) {
    process.stdout.write(`[ensure-cursor-mcp] already in sync\n`);
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(cursorMcpPath), { recursive: true });
  const next: McpFile = {
    mcpServers: { ...(cursorMcp.mcpServers ?? {}), [DOOR]: door },
  };
  const tmp = `${cursorMcpPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmp, cursorMcpPath);
  process.stdout.write(`[ensure-cursor-mcp] wrote ${path.relative(root, cursorMcpPath)}\n`);
}

main();
