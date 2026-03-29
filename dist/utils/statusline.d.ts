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
export interface SelectedClaudeStatusLine {
    source: 'global' | 'none';
    kind: 'none' | 'managed' | 'wrapped' | 'user';
    entry?: ExistingClaudeStatusLineEntry;
}
export interface ResolvedClaudeStatusLine extends ClaudeStatusLineEntry {
    mode: 'direct';
    source: 'global' | 'none';
    existingKind: 'none' | 'managed' | 'wrapped' | 'user';
}
export declare const DEFAULT_USER_STATUSLINE_COMMAND = "npx -y ccstatusline@latest";
/** Detect legacy wrapped command (statusline_wrapper.js) */
export declare function isWrappedStatusLineCommand(command: string): boolean;
/** Detect legacy managed-only command (statusline_render.cjs without wrapper) */
export declare function isManagedStatusLineCommand(command: string): boolean;
export declare function classifyClaudeStatusLineCommand(command?: string): SelectedClaudeStatusLine['kind'];
export declare function selectExistingClaudeStatusLine({ globalStatusLine, }: Pick<ResolveClaudeStatusLineInput, 'globalStatusLine'>): SelectedClaudeStatusLine;
/**
 * Extract user command from legacy wrapped statusLine command.
 * Used during migration to unwrap and keep only the user's command.
 */
export declare function extractUserCommandFromLegacyWrapper(command: string): string | null;
export declare function writeGlobalStatusLine(statusLineConfig: ClaudeStatusLineEntry, preloadedSettings?: Record<string, unknown>): Promise<void>;
/**
 * Resolve statusLine command. Always returns a direct command (no wrapping).
 *
 * Migration: legacy wrapped/managed commands are unwrapped to just the user command
 * (or ccstatusline if no user command found). Test progress is shown in TUI
 * (compact_bar.py), not in Claude Code statusLine.
 */
export declare function resolveClaudeStatusLine({ globalStatusLine, statusLineConfig, }: ResolveClaudeStatusLineInput): ResolvedClaudeStatusLine;
//# sourceMappingURL=statusline.d.ts.map