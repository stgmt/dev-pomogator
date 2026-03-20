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
export declare const DEFAULT_USER_STATUSLINE_COMMAND = "npx -y ccstatusline@latest";
export declare function isWrappedStatusLineCommand(command: string): boolean;
export declare function isManagedStatusLineCommand(command: string): boolean;
export declare function classifyClaudeStatusLineCommand(command?: string): SelectedClaudeStatusLine['kind'];
/**
 * Build portable managed command that resolves ~/.dev-pomogator/scripts/statusline_render.cjs
 * at runtime via os.homedir(). Works cross-platform.
 */
export declare function buildPortableManagedCommand(): string;
/**
 * Build portable wrapped command that runs both user and managed statuslines
 * via ~/.dev-pomogator/scripts/statusline_wrapper.js with base64-encoded args.
 */
export declare function buildPortableWrappedCommand(userCommand: string, managedCommand: string): string;
export declare function selectExistingClaudeStatusLine({ globalStatusLine, }: Pick<ResolveClaudeStatusLineInput, 'globalStatusLine'>): SelectedClaudeStatusLine;
export declare function parseWrappedStatusLineCommand(command: string): ParsedWrappedStatusLineCommand | null;
/**
 * Shared helper: resolve and write statusLine to global ~/.claude/settings.json.
 * Used by both installer (setupClaudeStatusLine) and updater (updateClaudeStatusLineGlobal).
 * Preserves extra fields (e.g. padding) via read-modify-write pattern.
 * Pass pre-loaded settings to avoid double-reading the file.
 */
export declare function writeGlobalStatusLine(statusLineConfig: ClaudeStatusLineEntry, preloadedSettings?: Record<string, unknown>): Promise<void>;
export declare function resolveClaudeStatusLine({ globalStatusLine, statusLineConfig, }: ResolveClaudeStatusLineInput): ResolvedClaudeStatusLine;
//# sourceMappingURL=statusline.d.ts.map