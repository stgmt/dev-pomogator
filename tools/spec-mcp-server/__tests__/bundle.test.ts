// The MCP server ships to plugin users as a self-contained esbuild bundle
// (server.bundle.mjs) because node_modules is NOT distributed with the plugin —
// `@modelcontextprotocol/sdk` + `zod` + `chokidar` + `tsx` are all absent on a
// user's machine, so the raw server.ts cannot run there. These guards keep the
// shipped bundle honest:
//   1. the bundle exists and is non-trivial (someone committed it),
//   2. it contains EVERY tool registered in tools.ts — a cheap staleness proxy:
//      add a tool to tools.ts but forget `npm run build:mcp` → this fails,
//   3. `.mcp.json` launches the bundle, never the raw `.ts` (which needs tsx).
// Functional proof (bundle serves get_trace with node_modules absent) was done
// manually; rebuilding here is impossible in Docker (`npm install --ignore-scripts`
// skips esbuild's platform binary).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = path.join(here, '..', 'server.bundle.mjs');
const toolsTs = path.join(here, '..', 'tools.ts');
const mcpJson = path.join(here, '..', '..', '..', '.mcp.json');

describe('MCP server distribution bundle', () => {
  it('committed server.bundle.mjs exists and is non-trivial', () => {
    expect(fs.existsSync(bundle), 'run `npm run build:mcp` and commit the bundle').toBe(true);
    expect(fs.statSync(bundle).size).toBeGreaterThan(100_000); // SDK+zod bundled ≈ 1.6mb
  });

  it('bundle contains every tool registered in tools.ts (stale-bundle guard)', () => {
    const bundleText = fs.readFileSync(bundle, 'utf8');
    const toolNames = [...fs.readFileSync(toolsTs, 'utf8').matchAll(/name:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(toolNames.length).toBeGreaterThanOrEqual(13);
    // esbuild emits the names double-quoted; check the bare name (tool ids like
    // `get_trace`/`find_refs` are distinctive enough to not false-match other code).
    for (const name of toolNames) {
      expect(bundleText, `bundle missing tool '${name}' — run \`npm run build:mcp\``).toContain(name);
    }
  });

  it('.mcp.json launches the bundle, not the raw .ts (which needs tsx/node_modules)', () => {
    const mcp = fs.readFileSync(mcpJson, 'utf8');
    expect(mcp).toContain('server.bundle.mjs');
    expect(mcp).not.toContain('server.ts');
    // dual-mode root: CLAUDE_PLUGIN_ROOT (installed plugin) || cwd (repo dogfood)
    expect(mcp).toContain('CLAUDE_PLUGIN_ROOT');
  });
});
