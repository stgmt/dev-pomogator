/**
 * Write JSON atomically: backup current file → write to .tmp → move to target.
 * Prevents data loss on crash mid-write.
 *
 * Pattern from src/config/index.ts:saveConfig()
 */
export declare function writeJsonAtomic(filePath: string, data: unknown): Promise<void>;
/**
 * Read JSON safely with backup recovery.
 * If primary file is corrupted, tries .bak file.
 * Returns fallback if both fail.
 */
export declare function readJsonSafe<T = Record<string, unknown>>(filePath: string, fallback?: T): Promise<T>;
/**
 * Write a text/binary file atomically: temp file + move.
 * Same temp+move pattern as `writeJsonAtomic` but for non-JSON content
 * (e.g. `.gitignore` text file). Per `.claude/rules/atomic-config-save.md`.
 */
export declare function writeFileAtomic(filePath: string, content: string | Buffer): Promise<void>;
/**
 * Sync version of writeJsonAtomic for use in standalone bundle context
 * (hook-migration.ts runs synchronously).
 */
export declare function writeJsonAtomicSync(filePath: string, data: unknown): void;
//# sourceMappingURL=atomic-json.d.ts.map