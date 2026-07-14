import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { CANONICAL_REINSTALL_HINT } from './canonical.js';

const ID = 'C31';
const FR = 'FR-14';
const NAME = 'Hook runtime dispatch and script paths resolve';

/**
 * Hook commands run with the USER'S PROJECT as cwd, but every script a hook invokes
 * ships inside the PLUGIN. A command that names its script by a bare relative path
 * therefore resolves against a directory where the file cannot exist — it fails for
 * 100% of users, on every OS, on every matching event.
 *
 * That is not hypothetical: `bash tools/bg-task-guard/stop-guard.sh` failed on every
 * single Stop with "No such file or directory" and nothing caught it — C18 only smoke-tests
 * that bootstrap.cjs runs, and never looks at the other hook commands. This check does.
 *
 * A command is safe when it either anchors to CLAUDE_PLUGIN_ROOT, or reaches its script
 * through bootstrap.cjs (which resolves CLAUDE_PLUGIN_ROOT itself).
 */
/**
 * The leading `/` matters: in an ANCHORED command the script sits behind the anchor
 * (`bash "${CLAUDE_PLUGIN_ROOT}/tools/x.sh"`), so `tools/` is preceded by a slash, not by
 * whitespace. Requiring whitespace extracted nothing from anchored commands, which silently
 * disabled the "script missing from the plugin" branch entirely — caught by
 * POMOGATORDOCTOR001_49 before this check ever shipped.
 */
function extractScriptPaths(command: string): string[] {
  const matches = command.matchAll(/(?:^|[\s"'/])((?:\.\/)?tools\/[\w./-]+\.(?:ts|cjs|mjs|js|sh|py))/g);
  return [...matches].map((m) => m[1].replace(/^\.\//, ''));
}

function isAnchored(command: string): boolean {
  return command.includes('CLAUDE_PLUGIN_ROOT');
}

export const hookScriptPathsCheck: CheckDefinition = {
  id: ID,
  fr: FR,
  name: NAME,
  group: 'self-sufficient',
  reinstallable: true,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult> {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? ctx.projectRoot;
    const hooksPath = path.join(pluginRoot, '.claude-plugin', 'hooks.json');

    let raw: string;
    try {
      raw = fs.readFileSync(hooksPath, 'utf-8');
    } catch {
      return build('warning', `hooks.json not found at ${hooksPath}`);
    }

    let hooks: unknown;
    try {
      hooks = JSON.parse(raw);
    } catch (error) {
      return build('critical', `hooks.json parse error: ${(error as Error).message}`);
    }

    const commands: string[] = [];
    JSON.stringify(hooks, (key, value) => {
      if (key === 'command' && typeof value === 'string') commands.push(value);
      return value;
    });

    const unanchored: string[] = [];
    const missing: string[] = [];

    for (const command of commands) {
      const scripts = extractScriptPaths(command);
      if (scripts.length === 0) continue;
      if (!isAnchored(command)) {
        // Resolves against the user's project, where a plugin script never exists.
        unanchored.push(command.slice(0, 80));
        continue;
      }
      for (const script of scripts) {
        if (!fs.existsSync(path.join(pluginRoot, script))) missing.push(script);
      }
    }

    if (unanchored.length === 0 && missing.length === 0) {
      return build('ok', `${commands.length} hook command(s) resolve against the plugin`);
    }

    const parts: string[] = [];
    if (unanchored.length > 0) {
      parts.push(`${unanchored.length} hook(s) name a plugin script by a project-relative path: ${unanchored.join(' | ')}`);
    }
    if (missing.length > 0) {
      parts.push(`${missing.length} hook script(s) missing from the plugin: ${missing.join(', ')}`);
    }
    return build('critical', parts.join('; '), 'Anchor every hook script to ${CLAUDE_PLUGIN_ROOT}');
  },
};

function build(severity: CheckResult['severity'], message: string, hint?: string): CheckResult {
  return {
    id: ID,
    fr: FR,
    name: NAME,
    group: 'self-sufficient',
    severity,
    reinstallable: true,
    message,
    hint,
    reinstallHint: CANONICAL_REINSTALL_HINT,
    durationMs: 0,
  };
}
