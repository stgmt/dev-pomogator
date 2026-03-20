/**
 * Start Chroma server directly using Python's chroma binary.
 *
 * The claude-mem worker (from plugin cache) cannot find the chroma binary
 * because the plugin cache has no node_modules/. The npm chromadb CLI is
 * broken on Windows x64 (missing 'semver' transitive dependency).
 *
 * Fix: Start Chroma externally BEFORE the worker. The worker detects a
 * running Chroma via heartbeat and reuses it instead of trying to start one.
 */
export declare function startChromaServer(): Promise<void>;
/**
 * Install Cursor hooks by directly generating hooks.json
 *
 * Bypasses broken `bun run cursor:install` which looks for non-existent shell scripts.
 * Generates hooks.json with node CLI commands that call worker-service.cjs directly.
 */
export declare function installCursorHooks(): Promise<void>;
/**
 * Start claude-mem worker using bun run worker:start
 */
export declare function startClaudeMemWorker(): Promise<void>;
/**
 * Check if claude-mem plugin is registered in Claude Code.
 * Checks installed_plugins.json first (fast, works in Docker),
 * falls back to `claude plugin list` CLI.
 */
export declare function checkClaudeMemPluginInstalled(): Promise<boolean>;
/**
 * Install claude-mem plugin for Claude Code (NO confirmation)
 */
export declare function installClaudeMemPlugin(): Promise<void>;
/**
 * Ensure claude-mem is installed and configured for the specified platform.
 * Runs AUTOMATICALLY without user confirmation.
 *
 * For Cursor: Clones repo, builds, installs hooks, starts worker
 * For Claude Code: Installs plugin via marketplace
 */
export declare function ensureClaudeMem(platform: 'cursor' | 'claude'): Promise<void>;
//# sourceMappingURL=memory.d.ts.map