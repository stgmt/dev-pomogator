import type { Logger } from '../utils/logger.js';
export interface ClaudeMemValidation {
    worker: boolean;
    chroma: boolean;
    mcpBinary: boolean;
}
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
 * Installs claude-mem plugin via marketplace for Claude Code.
 */
export declare function ensureClaudeMem(platform: 'claude', logger?: Logger): Promise<ClaudeMemValidation>;
//# sourceMappingURL=memory.d.ts.map