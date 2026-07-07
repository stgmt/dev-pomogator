import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CheckDefinition } from '../types.js';
import { buildResult } from './_helpers.js';

const META = {
  id: 'C30',
  fr: 'FR-35',
  name: 'Legacy npm Claude install',
  group: 'self-sufficient' as const,
  reinstallable: false,
};

const NPM_GLOBAL_RELATIVE = ['.npm-global', 'claude.cmd'] as const;
const NPM_GLOBAL_SHIM_RELATIVE = ['.npm-global', 'claude'] as const;
const NPM_GLOBAL_PKG_RELATIVE = [
  '.npm-global',
  'node_modules',
  '@anthropic-ai',
  'claude-code',
] as const;

function joinHome(home: string, parts: readonly string[]): string {
  return path.join(home, ...parts);
}

export const claudeBinPriorityCheck: CheckDefinition = {
  ...META,
  pool: 'fs',
  gate() {
    return process.platform === 'win32'
      ? { relevant: true }
      : {
          relevant: false,
          reason: 'check targets Windows %USERPROFILE%\\.npm-global layout',
        };
  },
  async run() {
    const home = os.homedir();
    const cmd = joinHome(home, NPM_GLOBAL_RELATIVE);
    const shim = joinHome(home, NPM_GLOBAL_SHIM_RELATIVE);
    const pkg = joinHome(home, NPM_GLOBAL_PKG_RELATIVE);
    const stale: string[] = [];
    if (fs.existsSync(cmd)) stale.push(cmd);
    if (fs.existsSync(shim)) stale.push(shim);
    if (fs.existsSync(pkg)) stale.push(pkg);

    if (stale.length === 0) {
      return buildResult(META, 'ok', 'no legacy npm Claude install found');
    }

    const cleanupCmd =
      `Remove-Item -Recurse -Force ` +
      stale.map((p) => `'${p}'`).join(', ');
    return buildResult(
      META,
      'warning',
      `Legacy npm install of @anthropic-ai/claude-code found (${stale.length} artifact(s)). ` +
        `npm distribution is deprecated; native installer at ~/.local/bin/claude.exe is recommended. ` +
        `Stale shims may shadow the native binary depending on PATH order.`,
      {
        hint:
          `Remove the legacy install: ${cleanupCmd}. ` +
          `Native installer (recommended): irm https://claude.ai/install.ps1 | iex`,
        details: { staleArtifacts: stale },
      },
    );
  },
};
