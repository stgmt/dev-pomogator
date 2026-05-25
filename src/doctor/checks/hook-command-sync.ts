import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { buildResult } from './_helpers.js';
import { listExtensions, getExtensionHooks } from '../../installer/extensions.js';

const META = {
  id: 'C31',
  fr: 'FR-36',
  name: 'Hook command sync (manifest vs settings)',
  group: 'self-sufficient' as const,
  reinstallable: true,
};

/** Pull every command string out of a hook value (string | {command} | array of {hooks:[{command}]}). */
function extractCommands(rawHook: unknown): string[] {
  const cmds: string[] = [];
  if (typeof rawHook === 'string') {
    cmds.push(rawHook);
  } else if (Array.isArray(rawHook)) {
    for (const group of rawHook) {
      if (group?.command) cmds.push(group.command as string);
      for (const h of group?.hooks ?? []) if (h?.command) cmds.push(h.command as string);
    }
  } else if (rawHook && typeof rawHook === 'object' && (rawHook as { command?: string }).command) {
    cmds.push((rawHook as { command: string }).command);
  }
  return cmds;
}

/** A hook command is "installed" if its script basename appears anywhere in the wired hooks blob. */
function scriptToken(cmd: string): string {
  const m = cmd.match(/([\w.-]+\.(?:ts|cjs|js|sh|mjs))\b/);
  return m ? m[1] : cmd;
}

function readHooksBlob(file: string): string {
  try {
    return JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf-8')).hooks ?? {});
  } catch {
    return '';
  }
}

export const hookCommandSyncCheck: CheckDefinition = {
  ...META,
  pool: 'fs',
  gate(ctx: CheckContext) {
    return (ctx.installedExtensions?.length ?? 0) > 0
      ? { relevant: true }
      : { relevant: false, reason: 'no installed extensions to verify' };
  },
  async run(ctx: CheckContext): Promise<CheckResult> {
    // Read the CURRENT package manifests — source of truth for what each version SHOULD wire.
    // (config.managed.hooks only records what WAS installed, so it can't reveal a never-wired hook.)
    let extensions;
    try {
      extensions = await listExtensions();
    } catch (error) {
      return buildResult(META, 'ok', `cannot read package manifests — skipped (${(error as Error).message})`);
    }

    const installedNames = new Set((ctx.installedExtensions ?? []).map((e) => e.name));
    const wired =
      readHooksBlob(path.join(ctx.projectRoot, '.claude', 'settings.local.json')) +
      readHooksBlob(path.join(ctx.homeDir, '.claude', 'settings.json')); // SessionStart check-update lives here

    const missing: string[] = [];
    for (const ext of extensions) {
      if (!installedNames.has(ext.name)) continue; // only verify what is installed in this project
      const hooks = getExtensionHooks(ext, 'claude');
      for (const rawHook of Object.values(hooks)) {
        for (const cmd of extractCommands(rawHook)) {
          const token = scriptToken(cmd);
          if (!wired.includes(token)) missing.push(`${ext.name}/${token}`);
        }
      }
    }

    if (missing.length === 0) {
      return buildResult(META, 'ok', 'all installed-extension hooks are wired into settings');
    }
    return buildResult(
      META,
      'warning',
      `${missing.length} declared hook(s) not wired into settings: ${missing.join(', ')}. ` +
        `These extensions are installed but their hook commands are missing from .claude/settings.local.json ` +
        `(e.g. installed before the hook was added). The feature silently does nothing until reinstalled.`,
      {
        hint: 'Run `npx dev-pomogator` to re-wire the missing hooks.',
        reinstallHint: 'Run `npx dev-pomogator` to re-wire missing extension hooks',
        details: { missing },
      },
    );
  },
};
