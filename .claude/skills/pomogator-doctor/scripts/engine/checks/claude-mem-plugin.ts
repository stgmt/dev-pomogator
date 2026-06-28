import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { buildResult } from './_helpers.js';

const META = {
  id: 'C-CMEM',
  fr: 'FR-6',
  name: 'claude-mem plugin installed',
  group: 'needs-external' as const,
  reinstallable: false,
};

const INSTALL_HINT =
  'claude-mem (persistent memory) is not installed. The dev-pomogator SessionStart bootstrap ' +
  'installs it automatically on the next session (opt-out: DEV_POMOGATOR_CLAUDE_MEM=off). To install ' +
  'now: `/plugin marketplace add thedotmack/claude-mem` then `/plugin install claude-mem`, or ' +
  '`npx claude-mem install`.';

/**
 * Source of truth is Claude Code's installed_plugins.json (any `claude-mem@<marketplace>` key
 * with a non-empty entry list). The worker pid/db file under ~/.claude-mem is a fallback for an
 * install that registered outside that manifest. Mirrors tools/claude-mem-bootstrap detection.
 */
function isClaudeMemInstalled(homeDir: string): boolean {
  try {
    const manifest = path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
    const data = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { plugins?: Record<string, unknown[]> };
    const plugins = data.plugins ?? {};
    for (const key of Object.keys(plugins)) {
      if (key.startsWith('claude-mem@') && Array.isArray(plugins[key]) && plugins[key].length > 0) {
        return true;
      }
    }
  } catch {
    /* missing/malformed → fall through */
  }
  try {
    const memDir = path.join(homeDir, '.claude-mem');
    return fs.existsSync(path.join(memDir, '.worker.pid')) || fs.existsSync(path.join(memDir, 'claude-mem.db'));
  } catch {
    return false;
  }
}

export const claudeMemPluginCheck: CheckDefinition = {
  ...META,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult> {
    return isClaudeMemInstalled(ctx.homeDir)
      ? buildResult(META, 'ok', 'claude-mem plugin is installed')
      : buildResult(META, 'warning', 'claude-mem plugin not installed', { hint: INSTALL_HINT });
  },
};
