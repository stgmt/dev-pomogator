/**
 * Compiles PreToolUse hook block from `.onboarding.json.commands` and smart-merges
 * it into `.claude/settings.local.json` (FR-3, FR-15, FR-18, AC-3).
 *
 * Hook matches raw commands regex (e.g. `^(npm|yarn|pnpm)\s+(run\s+)?test`),
 * returns `permissionDecision: "deny"` с reason pointing to skill wrapper.
 * Preserves pre-existing user hooks via marker-block isolation.
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-3, AC.md#ac-3, AC.md#ac-15, AC.md#ac-18}.
 */

import * as path from 'node:path';
import * as fsExtra from 'fs-extra';
import type { CommandBlock, OnboardingJson } from '../lib/types.ts';


export const MANAGED_MARKER = 'managed-by-dev-pomogator-onboard-repo';
export const SETTINGS_LOCAL_REL = path.join('.claude', 'settings.local.json');


export interface HookEntry {
  matcher: string;
  command_name: string;
  pattern: string;
  skill: string | null;
  reason: string;
}


export interface CompiledHookBlock {
  _marker: string;
  _source: string;
  _regenerate: string;
  hooks: {
    PreToolUse: Array<{
      matcher: 'Bash';
      hooks: Array<{
        type: 'command';
        command: string;
        _managed: true;
        _entries: HookEntry[];
      }>;
    }>;
  };
}


export function compilePreToolUseBlock(commands: Record<string, CommandBlock>): CompiledHookBlock {
  const entries: HookEntry[] = [];

  for (const [name, cmd] of Object.entries(commands)) {
    if (!cmd.forbidden_if_skill_present) continue;
    if (!cmd.raw_pattern_to_block || cmd.raw_pattern_to_block.trim() === '') continue;
    entries.push({
      matcher: 'Bash',
      command_name: name,
      pattern: cmd.raw_pattern_to_block,
      skill: cmd.via_skill,
      reason: cmd.reason,
    });
  }

  return {
    _marker: MANAGED_MARKER,
    _source: '.specs/.onboarding.json',
    _regenerate: '/create-spec <slug> --refresh-onboarding',
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: 'onboard-repo-guard',
              _managed: true,
              _entries: entries,
            },
          ],
        },
      ],
    },
  };
}


export interface MergeResult {
  settingsPath: string;
  entriesAdded: number;
  userHooksPreserved: number;
}


export async function mergeHookIntoSettingsLocal(
  projectPath: string,
  block: CompiledHookBlock,
): Promise<MergeResult> {
  const settingsPath = path.join(projectPath, SETTINGS_LOCAL_REL);
  await fsExtra.ensureDir(path.dirname(settingsPath));

  let existing: Record<string, unknown> = {};
  if (await fsExtra.pathExists(settingsPath)) {
    try {
      existing = (await fsExtra.readJson(settingsPath)) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  const existingHooks = (existing.hooks as Record<string, unknown> | undefined) ?? {};
  const existingPreToolUse = (existingHooks.PreToolUse as Array<Record<string, unknown>> | undefined) ?? [];

  // Remove previously-managed entries (idempotent re-merge), preserve user hooks
  const userHooks = existingPreToolUse.filter((entry) => !isManagedEntry(entry));

  const newPreToolUse = [...userHooks, ...block.hooks.PreToolUse];

  const merged = {
    ...existing,
    hooks: {
      ...existingHooks,
      PreToolUse: newPreToolUse,
    },
  };

  const tempPath = `${settingsPath}.tmp-${process.pid}-${Date.now()}`;
  await fsExtra.writeJson(tempPath, merged, { spaces: 2 });
  await fsExtra.move(tempPath, settingsPath, { overwrite: true });

  const entriesAdded = block.hooks.PreToolUse[0]?.hooks[0]?._entries?.length ?? 0;
  return {
    settingsPath,
    entriesAdded,
    userHooksPreserved: userHooks.length,
  };
}


function isManagedEntry(entry: Record<string, unknown>): boolean {
  const hooks = entry.hooks as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(hooks)) return false;
  return hooks.some((h) => h._managed === true);
}


export interface DenyDecision {
  allow: boolean;
  permissionDecision?: 'deny';
  permissionDecisionReason?: string;
}


export function evaluateBashCommand(command: string, entries: HookEntry[]): DenyDecision {
  for (const entry of entries) {
    try {
      const regex = new RegExp(entry.pattern);
      if (regex.test(command)) {
        const skillHint = entry.skill ? `/${entry.skill}` : 'the skill wrapper';
        return {
          allow: false,
          permissionDecision: 'deny',
          permissionDecisionReason: `Use ${skillHint} skill; raw \`${entry.command_name}\` bypasses: ${entry.reason}`,
        };
      }
    } catch {
      // invalid regex — skip entry (should have been caught by schema validator)
    }
  }
  return { allow: true };
}


export async function buildRenderContextFromOnboarding(json: OnboardingJson): Promise<{
  block: CompiledHookBlock;
  entries: HookEntry[];
}> {
  const block = compilePreToolUseBlock(json.commands);
  const entries = block.hooks.PreToolUse[0]?.hooks[0]?._entries ?? [];
  return { block, entries };
}
