export interface ModifiedFile {
    /** Relative path inside the project (e.g. ".claude/rules/specs-management.md") */
    relativePath: string;
    /** Absolute path to the backup copy */
    backupPath: string;
    /** Extension name that triggered the overwrite */
    extensionName: string;
}
/**
 * Copy a user-modified file into `{projectPath}/.dev-pomogator/.user-overrides/{relativePath}`
 * before it gets overwritten by an upstream update.
 *
 * Returns the absolute backup path on success, or null on failure.
 */
export declare function backupUserFile(projectPath: string, relativePath: string): Promise<string | null>;
/**
 * Write (or overwrite) a Markdown summary report listing all files that were
 * backed up because they contained user modifications.
 *
 * Location: `~/.dev-pomogator/last-update-report.md`
 */
export declare function writeUpdateReport(modifications: ModifiedFile[]): Promise<void>;
//# sourceMappingURL=backup.d.ts.map