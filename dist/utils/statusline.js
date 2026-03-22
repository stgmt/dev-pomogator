import os from 'os';
import path from 'path';
import { writeJsonAtomic, readJsonSafe } from './atomic-json.js';
// Legacy markers — kept for migration detection only
const MANAGED_STATUSLINE_DIR = '.dev-pomogator/tools/test-statusline/';
const LEGACY_RENDER_SCRIPT = 'statusline_render.cjs';
const LEGACY_WRAPPER_MARKER = 'statusline_wrapper.js';
export const DEFAULT_USER_STATUSLINE_COMMAND = 'npx -y ccstatusline@latest';
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function extractFlagValue(command, flag) {
    const match = command.match(new RegExp(`${escapeRegExp(flag)}\\s+(?:"([^"]+)"|'([^']+)'|(\\S+))`));
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}
function decodeBase64Strict(value) {
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
function normalizeExistingStatusLine(entry) {
    const command = entry?.command?.trim();
    if (!command) {
        return undefined;
    }
    return {
        type: entry?.type,
        command,
    };
}
/** Detect legacy wrapped command (statusline_wrapper.js) */
export function isWrappedStatusLineCommand(command) {
    return command.includes(LEGACY_WRAPPER_MARKER);
}
/** Detect legacy managed-only command (statusline_render.cjs without wrapper) */
export function isManagedStatusLineCommand(command) {
    if (isWrappedStatusLineCommand(command))
        return false;
    if (command.includes(MANAGED_STATUSLINE_DIR))
        return true;
    return command.includes("'.dev-pomogator','scripts','" + LEGACY_RENDER_SCRIPT + "'");
}
export function classifyClaudeStatusLineCommand(command) {
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
export function selectExistingClaudeStatusLine({ globalStatusLine, }) {
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
/**
 * Extract user command from legacy wrapped statusLine command.
 * Used during migration to unwrap and keep only the user's command.
 */
export function extractUserCommandFromLegacyWrapper(command) {
    if (!isWrappedStatusLineCommand(command)) {
        return null;
    }
    const encodedUserCommand = extractFlagValue(command, '--user-b64');
    if (!encodedUserCommand)
        return null;
    return decodeBase64Strict(encodedUserCommand);
}
/**
 * Shared helper: resolve and write statusLine to global ~/.claude/settings.json.
 * Used by both installer (setupClaudeStatusLine) and updater (updateClaudeStatusLineGlobal).
 * Preserves extra fields (e.g. padding) via read-modify-write pattern.
 * Pass pre-loaded settings to avoid double-reading the file.
 */
export async function writeGlobalStatusLine(statusLineConfig, preloadedSettings) {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const settings = preloadedSettings ?? await readJsonSafe(settingsPath, {});
    const resolved = resolveClaudeStatusLine({
        globalStatusLine: settings.statusLine,
        statusLineConfig,
    });
    const existingStatusLine = (settings.statusLine ?? {});
    settings.statusLine = {
        ...existingStatusLine,
        type: resolved.type,
        command: resolved.command,
    };
    await writeJsonAtomic(settingsPath, settings);
}
/**
 * Resolve statusLine command. Always returns a direct command (no wrapping).
 *
 * Migration: legacy wrapped/managed commands are unwrapped to just the user command
 * (or ccstatusline if no user command found). Test progress is shown in TUI
 * (compact_bar.py), not in Claude Code statusLine.
 */
export function resolveClaudeStatusLine({ globalStatusLine, statusLineConfig, }) {
    const selected = selectExistingClaudeStatusLine({ globalStatusLine });
    const existingCommand = selected.entry?.command;
    // No existing statusLine → install ccstatusline
    if (!existingCommand) {
        return {
            type: statusLineConfig.type,
            command: DEFAULT_USER_STATUSLINE_COMMAND,
            mode: 'direct',
            source: 'none',
            existingKind: 'none',
        };
    }
    // Legacy wrapped → extract user command, unwrap
    if (selected.kind === 'wrapped') {
        const userCmd = extractUserCommandFromLegacyWrapper(existingCommand) || DEFAULT_USER_STATUSLINE_COMMAND;
        return {
            type: statusLineConfig.type,
            command: userCmd,
            mode: 'direct',
            source: selected.source,
            existingKind: selected.kind,
        };
    }
    // Legacy managed (old format) → replace with ccstatusline
    if (selected.kind === 'managed') {
        return {
            type: statusLineConfig.type,
            command: DEFAULT_USER_STATUSLINE_COMMAND,
            mode: 'direct',
            source: selected.source,
            existingKind: selected.kind,
        };
    }
    // User-defined → keep as-is
    return {
        type: statusLineConfig.type,
        command: existingCommand,
        mode: 'direct',
        source: selected.source,
        existingKind: selected.kind,
    };
}
//# sourceMappingURL=statusline.js.map