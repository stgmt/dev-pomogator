export type Platform = 'cursor' | 'claude';
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
}
export declare const DEFAULT_CONFIG: Config;
//# sourceMappingURL=schema.d.ts.map