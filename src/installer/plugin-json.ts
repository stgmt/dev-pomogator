/**
 * Plugin.json generation for `.dev-pomogator/.claude-plugin/plugin.json`.
 *
 * Shared between installer (full content with skills metadata) and updater
 * (regenerates after extension list changes — FR-14). Atomic write so an
 * interrupted updater never leaves a half-written file.
 */

import fs from 'fs-extra';
import path from 'path';
import { writeJsonAtomic } from '../utils/atomic-json.js';

export interface PluginJsonInput {
  repoRoot: string;
  packageVersion: string;
  extensionNames: string[];
  /** Optional skills list (installer has this; updater may not). */
  skills?: Array<{ name: string; path: string }>;
}

/**
 * Write `.dev-pomogator/.claude-plugin/plugin.json` for the given project.
 * Returns the absolute path to the written file.
 */
export async function writePluginJson(input: PluginJsonInput): Promise<string> {
  const pluginDir = path.join(input.repoRoot, '.dev-pomogator', '.claude-plugin');
  await fs.ensureDir(pluginDir);

  const content: Record<string, unknown> = {
    name: 'dev-pomogator',
    version: input.packageVersion,
    description: `Installed extensions: ${input.extensionNames.join(', ')}`,
  };
  if (input.skills && input.skills.length > 0) {
    content.skills = input.skills;
  }

  const pluginJsonPath = path.join(pluginDir, 'plugin.json');
  await writeJsonAtomic(pluginJsonPath, content);
  return pluginJsonPath;
}
