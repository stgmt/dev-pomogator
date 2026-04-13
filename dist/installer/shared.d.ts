import type { ManagedFileEntry, ManagedFiles, Platform } from '../config/schema.js';
import type { Extension } from './extensions.js';
/**
 * Generate a cross-platform hook command that resolves ~/.dev-pomogator/scripts/<script>
 * at runtime using os.homedir(), so settings.json can sync across OS.
 */
export declare function makePortableScriptCommand(scriptName: string, args?: string): string;
/**
 * Generate a cross-platform hook command that runs a TypeScript file
 * via tsx-runner-bootstrap.cjs, which is a fail-soft wrapper around
 * tsx-runner.js. If tsx-runner.js is missing after install (antivirus,
 * Claude Code updater, manual cleanup), the bootstrap silently exits 0
 * instead of crashing the entire Claude Code session with MODULE_NOT_FOUND.
 *
 * Same portable pattern as makePortableScriptCommand — resolves
 * ~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs at runtime via os.homedir().
 *
 * See .specs/personal-pomogator/ FR-6.
 */
export declare function makePortableTsxCommand(scriptPath: string, args?: string): string;
/**
 * Check if a hook command string belongs to dev-pomogator.
 *
 * Single source of truth used by:
 *  - `installExtensionHooks` in claude.ts to scrub previous managed hooks on re-install
 *  - `migrateLegacySettingsJson` / `stripDevPomogatorFromSettingsLocal` in settings-local.ts
 *
 * Matches any of:
 *  - `.dev-pomogator/tools/` — managed tool script reference
 *  - `.dev-pomogator/scripts/` — global scripts reference
 *  - `tsx-runner.js` — legacy direct require pattern
 *  - `tsx-runner-bootstrap.cjs` — current fail-soft wrapper (FR-6)
 */
export declare function isDevPomogatorCommand(command: string): boolean;
/**
 * Replace `npx tsx "SCRIPT"` or `npx tsx SCRIPT` in a hook command
 * with the portable tsx-runner command that handles cache corruption.
 */
export declare function replaceNpxTsxWithPortable(command: string): string;
/**
 * Hook tool path resolver — currently a no-op.
 *
 * Previously converted relative `.dev-pomogator/tools/` paths to absolute.
 * Now tsx-runner.js handles path resolution at runtime via CWD-relative
 * lookup and git-root walk-up, making baked absolute paths unnecessary
 * and harmful for cross-platform use (Windows host + Linux devcontainer).
 */
export declare function resolveHookToolPaths(command: string, _repoRoot: string): string;
/**
 * Recursively collect file hashes from a directory.
 * Returns ManagedFileEntry[] with relative paths prefixed by basePath.
 * basePath is normalized to forward slashes to avoid mixed separators on Windows.
 */
export declare function collectFileHashes(dirPath: string, basePath: string): Promise<ManagedFileEntry[]>;
/**
 * Remove files in dest that don't exist in source (stale/legacy cleanup).
 * Compares recursively — if a file exists in dest but not in source, it's deleted.
 * Skips runtime dirs (__pycache__, node_modules, logs).
 */
export declare function removeOrphanedFiles(sourceDir: string, destDir: string): Promise<void>;
/**
 * Ensure every shell entrypoint under a copied tool directory is executable.
 * Accepts either a single file path or a directory path.
 */
export declare function ensureExecutableShellScripts(targetPath: string): Promise<void>;
/**
 * Add project path to config for tracking installed extensions.
 * Always called regardless of autoUpdate setting to persist managed data.
 */
export declare function addProjectPaths(projectPath: string, extensions: Extension[], platform: Platform, managedByExtension?: Map<string, ManagedFiles>): Promise<void>;
export declare function setupGlobalScripts(distDir: string): Promise<void>;
/**
 * Ensure Bun runtime is installed for claude-mem plugin hooks.
 * On cold start (devcontainer restart), claude-mem's SessionStart hooks
 * fail if Bun is not available. Non-fatal: skips silently on failure.
 */
export declare function ensureHomeBun(): Promise<void>;
/**
 * Install tsx into ~/.dev-pomogator/ so tsx-runner.js can always find it.
 * Non-fatal: if npm install fails, tsx-runner still falls back to global/npx strategies.
 */
export declare function ensureHomeTsx(devPomogatorDir: string): Promise<void>;
//# sourceMappingURL=shared.d.ts.map