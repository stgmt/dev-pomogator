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
export function getManagedPaths(items: ManagedFileItem[] | undefined): string[] {
  if (!items) return [];
  return items.map((item) => (typeof item === 'string' ? item : item.path));
}

/** Find the stored hash for a given relative path, or undefined if not tracked. */
export function getManagedHash(
  items: ManagedFileItem[] | undefined,
  relativePath: string
): string | undefined {
  if (!items) return undefined;
  for (const item of items) {
    if (typeof item === 'string') continue;
    if (item.path === relativePath) return item.hash;
  }
  return undefined;
}

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

export const DEFAULT_CONFIG: Config = {
  platforms: [],
  autoUpdate: true,
  enableMemory: true,
  lastCheck: new Date().toISOString(),
  cooldownHours: 24,
  rememberChoice: true,
  installedExtensions: [],
};
