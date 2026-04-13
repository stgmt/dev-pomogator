/**
 * Settings.local.json routing and legacy migration for personal-pomogator.
 *
 * Claude Code natively supports `.claude/settings.local.json` as a local-only
 * overrides file with higher precedence than shared `.claude/settings.json`:
 *   Managed > CLI args > Local > Project > User
 *
 * By default gitignored (by Claude Code convention and existing gitignore in
 * target projects like smarts). Perfect target for dev-pomogator's personal
 * hooks/env — never leaks into team-shared settings.json.
 *
 * See .specs/personal-pomogator/ FR-2, FR-3.
 */

import path from 'path';
import fs from 'fs-extra';
import { readJsonSafe, writeJsonAtomic } from '../utils/atomic-json.js';
import { isDevPomogatorCommand } from './shared.js';

interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}

interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
}

type SettingsJson = {
  hooks?: Record<string, HookGroup[]>;
  env?: Record<string, string>;
  [key: string]: unknown;
};

// `isDevPomogatorCommand` imported from shared.ts — single source of truth.

/**
 * Check if a hook group contains any dev-pomogator hooks.
 */
function hookGroupIsOurs(group: HookGroup, ourCommands: Set<string>): boolean {
  if (!group.hooks) return false;
  return group.hooks.some(h => {
    if (!h.command) return false;
    return ourCommands.has(h.command) || isDevPomogatorCommand(h.command);
  });
}

/**
 * Scan legacy `.claude/settings.json` for dev-pomogator hooks/env and remove them.
 *
 * This handles the case where a previous dev-pomogator install wrote hooks
 * directly to `settings.json`. After migration, team-only hooks remain
 * in `settings.json` while dev-pomogator hooks are handled by the new
 * `writeHooksToSettingsLocal` path.
 *
 * **Note**: This function only REMOVES dev-pomogator entries from `settings.json`.
 * The caller is responsible for writing them to `settings.local.json` via
 * `writeHooksToSettingsLocal`.
 *
 * @param repoRoot Absolute path to target project root
 * @param ourHookCommands Authoritative set of managed hook command strings (from current install)
 * @param ourEnvKeys Set of env variable names managed by dev-pomogator (from envRequirements)
 * @returns Number of hook entries removed from settings.json
 */
export async function migrateLegacySettingsJson(
  repoRoot: string,
  ourHookCommands: Set<string>,
  ourEnvKeys: Set<string>,
): Promise<{ movedHooks: number; movedEnvKeys: number }> {
  const settingsPath = path.join(repoRoot, '.claude', 'settings.json');

  // Read existing; if file doesn't exist, nothing to migrate
  // readJsonSafe returns the fallback {} on ENOENT — no need to pre-check existence
  const settings = await readJsonSafe<SettingsJson>(settingsPath, {});
  if (!settings.hooks && !settings.env) {
    return { movedHooks: 0, movedEnvKeys: 0 };
  }

  let mutated = false;
  let movedHooks = 0;
  let movedEnvKeys = 0;

  // Remove dev-pomogator hook groups from each hookName array
  if (settings.hooks) {
    for (const [hookName, groups] of Object.entries(settings.hooks)) {
      if (!Array.isArray(groups)) continue;

      const beforeCount = groups.length;
      const filtered = groups.filter(g => !hookGroupIsOurs(g, ourHookCommands));
      movedHooks += beforeCount - filtered.length;

      if (filtered.length !== beforeCount) {
        settings.hooks[hookName] = filtered;
        mutated = true;
      }

      // Remove empty hookName arrays to keep settings.json clean
      if (filtered.length === 0) {
        delete settings.hooks[hookName];
        mutated = true;
      }
    }

    // Remove empty hooks object
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
  }

  // Remove dev-pomogator env keys from settings.env
  if (settings.env && typeof settings.env === 'object') {
    for (const key of Object.keys(settings.env)) {
      if (ourEnvKeys.has(key)) {
        delete settings.env[key];
        movedEnvKeys++;
        mutated = true;
      }
    }
    if (Object.keys(settings.env).length === 0) {
      delete settings.env;
    }
  }

  if (mutated) {
    await writeJsonAtomic(settingsPath, settings);
  }

  return { movedHooks, movedEnvKeys };
}

/**
 * Write dev-pomogator hooks and env vars to `.claude/settings.local.json`.
 *
 * - Preserves existing user keys in the file (theme, etc.)
 * - Merges our hooks into existing hooks with dedupe by command string
 * - Merges our env vars into existing env section
 * - Atomic write via temp + move
 *
 * @param repoRoot Absolute path to target project root
 * @param allHooks Our hooks keyed by hook name (PreToolUse, Stop, etc.)
 * @param envSection Our env variables (from extension envRequirements defaults)
 */
export async function writeHooksToSettingsLocal(
  repoRoot: string,
  allHooks: Record<string, Array<{ type: string; command: string; timeout?: number; matcher: string }>>,
  envSection: Record<string, string>,
): Promise<void> {
  const settingsLocalPath = path.join(repoRoot, '.claude', 'settings.local.json');
  await fs.ensureDir(path.dirname(settingsLocalPath));

  // Read existing settings.local.json (preserve user keys)
  const settings = await readJsonSafe<SettingsJson>(settingsLocalPath, {});

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const existingHooks = settings.hooks;

  // Clean previous managed hooks to prevent duplicates on re-install.
  // Uses substring detection — matches previous installer versions too.
  for (const hookName of Object.keys(existingHooks)) {
    const arr = existingHooks[hookName] as Array<HookGroup>;
    existingHooks[hookName] = arr.filter(
      entry => !entry.hooks?.some(h => h.command && isDevPomogatorCommand(h.command))
    );
  }

  // Merge new hooks
  for (const [hookName, hookEntries] of Object.entries(allHooks)) {
    if (!existingHooks[hookName]) {
      existingHooks[hookName] = [];
    }

    const hookArray = existingHooks[hookName] as Array<HookGroup>;

    for (const hookEntry of hookEntries) {
      const commandExists = hookArray.some(h =>
        h.hooks?.some(hook => hook.command === hookEntry.command)
      );

      if (!commandExists) {
        hookArray.push({
          matcher: hookEntry.matcher,
          hooks: [{
            type: hookEntry.type,
            command: hookEntry.command,
            timeout: hookEntry.timeout,
          }],
        });
      }
    }
  }

  // Merge env section
  if (Object.keys(envSection).length > 0) {
    const existingEnv = (settings.env ?? {}) as Record<string, string>;
    for (const [key, value] of Object.entries(envSection)) {
      if (existingEnv[key] === undefined) {
        existingEnv[key] = value;
      }
    }
    settings.env = existingEnv;
  }

  await writeJsonAtomic(settingsLocalPath, settings);
}

/**
 * Remove dev-pomogator hooks/env from `.claude/settings.local.json`.
 *
 * Used by per-project uninstall (FR-8). Preserves user keys (theme, user hooks)
 * while removing everything we wrote.
 *
 * @param repoRoot Absolute path to target project root
 * @param managedHookCommands Set of command strings managed by dev-pomogator
 * @param managedEnvKeys Set of env var names managed by dev-pomogator
 */
export async function stripDevPomogatorFromSettingsLocal(
  repoRoot: string,
  managedHookCommands: Set<string>,
  managedEnvKeys: Set<string>,
): Promise<{ removedHooks: number; removedEnvKeys: number }> {
  const settingsLocalPath = path.join(repoRoot, '.claude', 'settings.local.json');

  // readJsonSafe returns the fallback {} on ENOENT — no pre-check needed
  const settings = await readJsonSafe<SettingsJson>(settingsLocalPath, {});
  if (!settings.hooks && !settings.env) {
    return { removedHooks: 0, removedEnvKeys: 0 };
  }

  let mutated = false;
  let removedHooks = 0;
  let removedEnvKeys = 0;

  if (settings.hooks) {
    for (const [hookName, groups] of Object.entries(settings.hooks)) {
      if (!Array.isArray(groups)) continue;

      const beforeCount = groups.length;
      const filtered = groups.filter(g => !hookGroupIsOurs(g, managedHookCommands));
      removedHooks += beforeCount - filtered.length;

      if (filtered.length !== beforeCount) {
        settings.hooks[hookName] = filtered;
        mutated = true;
      }

      if (filtered.length === 0) {
        delete settings.hooks[hookName];
        mutated = true;
      }
    }

    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
  }

  if (settings.env && typeof settings.env === 'object') {
    for (const key of Object.keys(settings.env)) {
      if (managedEnvKeys.has(key)) {
        delete settings.env[key];
        removedEnvKeys++;
        mutated = true;
      }
    }
    if (Object.keys(settings.env).length === 0) {
      delete settings.env;
    }
  }

  if (mutated) {
    // If settings.local.json is now empty, remove the file entirely
    const remainingKeys = Object.keys(settings).filter(k => k !== 'hooks' && k !== 'env');
    if (remainingKeys.length === 0 && !settings.hooks && !settings.env) {
      await fs.remove(settingsLocalPath);
    } else {
      await writeJsonAtomic(settingsLocalPath, settings);
    }
  }

  return { removedHooks, removedEnvKeys };
}
