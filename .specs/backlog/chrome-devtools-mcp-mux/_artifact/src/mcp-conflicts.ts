/**
 * Conflict detector for chrome-devtools-mcp-mux co-existence with
 * `claude-in-chrome` MCP browser extension.
 *
 * Chrome 136+ disables ALL browser extensions when launched with
 * `--remote-debugging-port=N` (security mitigation). Since
 * `chrome-devtools-mcp-mux` (via upstream `chrome-devtools-mcp` and puppeteer)
 * launches Chrome with that flag, it cannot coexist with the
 * `claude-in-chrome` MCP browser extension in the same Chrome instance.
 *
 * The installer warns about this at install time and offers 3 options:
 *  (a) skip — leave only claude-in-chrome
 *  (b) install + revert claude-in-chrome
 *  (c) install + use a SEPARATE Chrome instance (`CDMCP_MUX_USER_DATA_DIR`)
 *
 * In non-interactive mode (CI / `--non-interactive` / non-TTY) the default
 * is (a) skip + warning log per FR-5.
 *
 * See `.specs/chrome-devtools-mcp-mux/` FR-5.
 */

import path from 'path';
import { readMcpJson } from './mcp-config.js';
import { loadConfig } from '../config/index.js';

export interface ClaudeInChromeConflict {
  detected: boolean;
  source: 'mcp.json' | 'config.json' | 'both' | null;
  evidence: string[];
}

/**
 * Detect coexistence with `claude-in-chrome` in the target project.
 *
 * Sources scanned:
 *   1. `<targetProject>/.mcp.json` — `mcpServers["claude-in-chrome"]` key.
 *   2. `~/.dev-pomogator/config.json` — installedExtensions where
 *      `name === "claude-in-chrome"` AND `targetProject` is in projectPaths.
 */
export async function detectClaudeInChrome(
  targetProject: string
): Promise<ClaudeInChromeConflict> {
  const evidence: string[] = [];
  let inMcpJson = false;
  let inConfig = false;

  // Source 1: project .mcp.json
  try {
    const mcp = await readMcpJson(targetProject);
    if (mcp?.mcpServers && typeof mcp.mcpServers === 'object') {
      if (Object.prototype.hasOwnProperty.call(mcp.mcpServers, 'claude-in-chrome')) {
        inMcpJson = true;
        evidence.push(`${path.join(targetProject, '.mcp.json')} → mcpServers["claude-in-chrome"]`);
      }
    }
  } catch {
    // unreadable — ignore (treated as not-detected from this source)
  }

  // Source 2: dev-pomogator config.json
  try {
    const config = await loadConfig();
    if (config?.installedExtensions) {
      for (const ext of config.installedExtensions) {
        if (ext.name !== 'claude-in-chrome') continue;
        if (!ext.projectPaths || !ext.projectPaths.includes(targetProject)) continue;
        inConfig = true;
        evidence.push(
          `~/.dev-pomogator/config.json → installedExtensions["${ext.name}"] (projectPaths includes ${targetProject})`
        );
        break;
      }
    }
  } catch {
    // ignore — config load failures are not conflict signals
  }

  const detected = inMcpJson || inConfig;
  let source: ClaudeInChromeConflict['source'] = null;
  if (inMcpJson && inConfig) source = 'both';
  else if (inMcpJson) source = 'mcp.json';
  else if (inConfig) source = 'config.json';

  return { detected, source, evidence };
}

/**
 * Compose the user-facing warning block emitted at install time when
 * `claude-in-chrome` is detected. Pure string — no I/O.
 */
export function formatConflictWarning(conflict: ClaudeInChromeConflict): string {
  const lines = [
    '⚠ chrome-devtools-mcp-mux is mutually exclusive with claude-in-chrome in one Chrome',
    '  instance. Chrome 136+ automatically disables all extensions when Chrome is launched',
    '  with --remote-debugging-port=N (security mitigation, no override).',
    '',
    '  Detected via:',
    ...conflict.evidence.map((e) => `    - ${e}`),
    '',
    '  Options:',
    '    (a) skip          — keep claude-in-chrome only, do not install mux',
    '    (b) revert other  — install mux + remove claude-in-chrome from .mcp.json',
    '    (c) separate      — install mux + use a SEPARATE Chrome instance via',
    '                        CDMCP_MUX_USER_DATA_DIR env var (advanced)',
    '',
    '  Default in non-interactive mode (CI / no TTY): (a) skip',
  ];
  return lines.join('\n');
}

/**
 * Returns true when the installer should run in non-interactive mode.
 * Mirrors the heuristic used elsewhere in the installer (CI envs + no TTY).
 */
export function isNonInteractiveContext(): boolean {
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI) return true;
  if (process.env.JENKINS_URL || process.env.CIRCLECI || process.env.TRAVIS) return true;
  if (process.env.DEV_POMOGATOR_NON_INTERACTIVE === '1') return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return true;
  return false;
}
