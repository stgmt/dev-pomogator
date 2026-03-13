import os from 'os';
import path from 'path';
import { makePortableScriptCommand } from '../installer/shared.js';
import { writeJsonAtomic, readJsonSafe } from './atomic-json.js';

export interface ClaudeStatusLineEntry {
  type: string;
  command: string;
}

export interface ExistingClaudeStatusLineEntry {
  type?: string;
  command?: string;
}

export interface ResolveClaudeStatusLineInput {
  globalStatusLine?: ExistingClaudeStatusLineEntry;
  statusLineConfig: ClaudeStatusLineEntry;
}

export interface ParsedWrappedStatusLineCommand {
  userCommand: string;
  managedCommand: string;
}

export interface SelectedClaudeStatusLine {
  source: 'global' | 'none';
  kind: 'none' | 'managed' | 'wrapped' | 'user';
  entry?: ExistingClaudeStatusLineEntry;
}

export interface ResolvedClaudeStatusLine extends ClaudeStatusLineEntry {
  mode: 'direct' | 'wrapped';
  source: 'global' | 'none';
  existingKind: 'none' | 'managed' | 'wrapped' | 'user';
}

const MANAGED_STATUSLINE_DIR = '.dev-pomogator/tools/test-statusline/';
const MANAGED_RENDER_SCRIPT = 'statusline_render.cjs';
const WRAPPER_SCRIPT_MARKER = 'statusline_wrapper.js';

export const DEFAULT_USER_STATUSLINE_COMMAND = 'npx -y ccstatusline@latest';

function quoteArgument(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFlagValue(command: string, flag: string): string | null {
  const match = command.match(
    new RegExp(`${escapeRegExp(flag)}\\s+(?:"([^"]+)"|'([^']+)'|(\\S+))`)
  );

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function decodeBase64Strict(value: string): string | null {
  if (!/^[A-Za-z0-9+/=]+$/.test(value) || value.length % 4 !== 0) {
    return null;
  }

  const decoded = Buffer.from(value, 'base64').toString('utf-8');
  const normalizedInput = value.replace(/=+$/, '');
  const normalizedRoundTrip = Buffer.from(decoded, 'utf-8')
    .toString('base64')
    .replace(/=+$/, '');

  return normalizedInput === normalizedRoundTrip ? decoded : null;
}

function normalizeExistingStatusLine(
  entry?: ExistingClaudeStatusLineEntry
): ExistingClaudeStatusLineEntry | undefined {
  const command = entry?.command?.trim();
  if (!command) {
    return undefined;
  }

  return {
    type: entry?.type,
    command,
  };
}

export function isWrappedStatusLineCommand(command: string): boolean {
  return command.includes(WRAPPER_SCRIPT_MARKER);
}

export function isManagedStatusLineCommand(command: string): boolean {
  if (isWrappedStatusLineCommand(command)) return false;
  // Detect old project-path format (.dev-pomogator/tools/test-statusline/)
  if (command.includes(MANAGED_STATUSLINE_DIR)) return true;
  // Detect new global format (os.homedir() + scripts/statusline_render.cjs)
  return command.includes("'.dev-pomogator','scripts','" + MANAGED_RENDER_SCRIPT + "'");
}

export function classifyClaudeStatusLineCommand(
  command?: string
): SelectedClaudeStatusLine['kind'] {
  const normalizedCommand = command?.trim();
  if (!normalizedCommand) {
    return 'none';
  }

  if (isWrappedStatusLineCommand(normalizedCommand)) {
    return 'wrapped';
  }

  if (isManagedStatusLineCommand(normalizedCommand)) {
    return 'managed';
  }

  return 'user';
}

/**
 * Build portable managed command that resolves ~/.dev-pomogator/scripts/statusline_render.cjs
 * at runtime via os.homedir(). Works cross-platform.
 */
export function buildPortableManagedCommand(): string {
  return makePortableScriptCommand(MANAGED_RENDER_SCRIPT);
}

/**
 * Build portable wrapped command that runs both user and managed statuslines
 * via ~/.dev-pomogator/scripts/statusline_wrapper.js with base64-encoded args.
 */
export function buildPortableWrappedCommand(
  userCommand: string,
  managedCommand: string
): string {
  const wrapperCmd = makePortableScriptCommand(WRAPPER_SCRIPT_MARKER);
  const encodedUserCommand = Buffer.from(userCommand, 'utf-8').toString('base64');
  const encodedManagedCommand = Buffer.from(managedCommand, 'utf-8').toString('base64');

  return `${wrapperCmd} -- --user-b64 ${quoteArgument(encodedUserCommand)} --managed-b64 ${quoteArgument(encodedManagedCommand)}`;
}

export function selectExistingClaudeStatusLine({
  globalStatusLine,
}: Pick<ResolveClaudeStatusLineInput, 'globalStatusLine'>): SelectedClaudeStatusLine {
  const global = normalizeExistingStatusLine(globalStatusLine);
  if (global) {
    return {
      source: 'global',
      kind: classifyClaudeStatusLineCommand(global.command),
      entry: global,
    };
  }

  return {
    source: 'none',
    kind: 'none',
  };
}

export function parseWrappedStatusLineCommand(command: string): ParsedWrappedStatusLineCommand | null {
  if (!isWrappedStatusLineCommand(command)) {
    return null;
  }

  const encodedUserCommand = extractFlagValue(command, '--user-b64');
  const encodedManagedCommand = extractFlagValue(command, '--managed-b64');
  if (!encodedUserCommand || !encodedManagedCommand) {
    return null;
  }

  const userCommand = decodeBase64Strict(encodedUserCommand);
  const managedCommand = decodeBase64Strict(encodedManagedCommand);
  if (!userCommand || !managedCommand) {
    return null;
  }

  return {
    userCommand,
    managedCommand,
  };
}

/**
 * Shared helper: resolve and write statusLine to global ~/.claude/settings.json.
 * Used by both installer (setupClaudeStatusLine) and updater (updateClaudeStatusLineGlobal).
 * Preserves extra fields (e.g. padding) via read-modify-write pattern.
 * Pass pre-loaded settings to avoid double-reading the file.
 */
export async function writeGlobalStatusLine(
  statusLineConfig: ClaudeStatusLineEntry,
  preloadedSettings?: Record<string, unknown>,
): Promise<void> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = preloadedSettings ?? await readJsonSafe<Record<string, unknown>>(settingsPath, {});

  const resolved = resolveClaudeStatusLine({
    globalStatusLine: settings.statusLine as ExistingClaudeStatusLineEntry | undefined,
    statusLineConfig,
  });

  const existingStatusLine = (settings.statusLine ?? {}) as Record<string, unknown>;
  settings.statusLine = {
    ...existingStatusLine,
    type: resolved.type,
    command: resolved.command,
  };

  await writeJsonAtomic(settingsPath, settings);
}

export function resolveClaudeStatusLine({
  globalStatusLine,
  statusLineConfig,
}: ResolveClaudeStatusLineInput): ResolvedClaudeStatusLine {
  const managedCommand = buildPortableManagedCommand();
  const selected = selectExistingClaudeStatusLine({ globalStatusLine });
  const existingCommand = selected.entry?.command;

  // No existing statusLine → auto-install ccstatusline wrapped with managed
  if (!existingCommand) {
    return {
      type: statusLineConfig.type,
      command: buildPortableWrappedCommand(DEFAULT_USER_STATUSLINE_COMMAND, managedCommand),
      mode: 'wrapped',
      source: 'none',
      existingKind: 'none',
    };
  }

  // Existing is wrapped → parse, keep user command, update managed
  if (selected.kind === 'wrapped') {
    const wrapped = parseWrappedStatusLineCommand(existingCommand);
    if (!wrapped) {
      // Broken wrapper → fall back to ccstatusline + managed
      return {
        type: statusLineConfig.type,
        command: buildPortableWrappedCommand(DEFAULT_USER_STATUSLINE_COMMAND, managedCommand),
        mode: 'wrapped',
        source: selected.source,
        existingKind: selected.kind,
      };
    }

    return {
      type: statusLineConfig.type,
      command: buildPortableWrappedCommand(wrapped.userCommand, managedCommand),
      mode: 'wrapped',
      source: selected.source,
      existingKind: selected.kind,
    };
  }

  // Existing is managed (old format) → replace with ccstatusline + managed wrapper
  if (selected.kind === 'managed') {
    return {
      type: statusLineConfig.type,
      command: buildPortableWrappedCommand(DEFAULT_USER_STATUSLINE_COMMAND, managedCommand),
      mode: 'wrapped',
      source: selected.source,
      existingKind: selected.kind,
    };
  }

  // Existing is user-defined → wrap with managed
  return {
    type: statusLineConfig.type,
    command: buildPortableWrappedCommand(existingCommand, managedCommand),
    mode: 'wrapped',
    source: selected.source,
    existingKind: selected.kind,
  };
}
