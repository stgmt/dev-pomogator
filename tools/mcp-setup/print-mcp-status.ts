// Print the real auth-config status of Context7 / Octocode from the user-global ~/.claude.json.
// Used by the configure-mcp skill (and handy for /pomogator-doctor debugging). Read-only.
//
// Output (one JSON line): { context7: {present, configured}, octocode: {present, configured} }
// "configured" is the REAL check (Context7 key present; Octocode token OR `gh auth status` ok).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  context7Configured,
  octocodeConfigured,
  findEntry,
  ghAuthStatus,
  type McpEntry,
} from './mcp-auth-detect.ts';

export function mcpStatus(homeDir = os.homedir(), env = process.env): {
  context7: { present: boolean; configured: boolean };
  octocode: { present: boolean; configured: boolean };
} {
  let servers: Record<string, McpEntry> = {};
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(homeDir, '.claude.json'), 'utf-8')) as {
      mcpServers?: Record<string, McpEntry>;
    };
    servers = cfg.mcpServers ?? {};
  } catch {
    /* missing/malformed → empty */
  }
  const c7 = findEntry(servers, 'context7');
  const oc = findEntry(servers, 'octocode');
  return {
    context7: { present: !!c7, configured: context7Configured(c7, env) },
    octocode: { present: !!oc, configured: octocodeConfigured(oc, env, () => ghAuthStatus()) },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(mcpStatus()) + '\n');
}
