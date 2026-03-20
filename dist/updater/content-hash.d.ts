/** Compute SHA-256 hex digest of a UTF-8 string. */
export declare function computeHash(content: string): string;
/** Read a file from disk and return its SHA-256 hash, or null if the file does not exist. */
export declare function getFileHash(filePath: string): Promise<string | null>;
/**
 * Check whether a file on disk has been modified relative to a stored hash.
 *
 * Returns `true` (modified) when:
 *   - The file exists AND its hash differs from storedHash.
 *   - storedHash is empty string (migration: no baseline yet) AND file content
 *     differs from the new upstream content (passed separately by the caller).
 *
 * Returns `false` (not modified / safe to overwrite) when:
 *   - The file does not exist on disk.
 *   - The file exists AND its hash matches storedHash.
 */
export declare function isModifiedByUser(filePath: string, storedHash: string | undefined): Promise<boolean>;
//# sourceMappingURL=content-hash.d.ts.map