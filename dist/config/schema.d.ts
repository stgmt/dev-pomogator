export type Platform = 'claude';
export interface ManagedFileEntry {
    path: string;
    hash: string;
}
/** Backward-compatible type: old configs store plain strings, new ones store {path, hash}. */
export type ManagedFileItem = string | ManagedFileEntry;
export interface InstalledExtension {
    name: string;
    version: string;
    platform: Platform;
    projectPaths: string[];
    managed?: Record<string, ManagedFiles>;
}
export interface ManagedFiles {
    commands?: ManagedFileItem[];
    rules?: ManagedFileItem[];
    tools?: ManagedFileItem[];
    skills?: ManagedFileItem[];
    hooks?: Record<string, string[]>;
}
/** Extract plain paths from a mixed ManagedFileItem array. */
export declare function getManagedPaths(items: ManagedFileItem[] | undefined): string[];
/** Find the stored hash for a given relative path, or undefined if not tracked. */
export declare function getManagedHash(items: ManagedFileItem[] | undefined, relativePath: string): string | undefined;
export interface Config {
    platforms: Platform[];
    autoUpdate: boolean;
    enableMemory?: boolean;
    lastCheck: string;
    cooldownHours: number;
    rememberChoice: boolean;
    installedExtensions: InstalledExtension[];
    /**
     * Per-project tracking of `_shared/` cross-extension utility files synced
     * by the updater (FR-12). Keyed by absolute project path. Each entry tracks
     * which files were last written so the updater can prune stale ones.
     *
     * Not populated by the installer — only by `updateSharedFiles()` after the
     * first update run. Installer continues using `fs.copy` directly for fresh installs.
     */
    installedShared?: Record<string, ManagedFileEntry[]>;
}
export declare const DEFAULT_CONFIG: Config;
//# sourceMappingURL=schema.d.ts.map