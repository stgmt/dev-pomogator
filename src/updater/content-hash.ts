import { createHash } from 'crypto';
import fs from 'fs-extra';

/** Compute SHA-256 hex digest of a UTF-8 string. */
export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Read a file from disk and return its SHA-256 hash, or null if the file does not exist. */
export async function getFileHash(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return computeHash(content);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code && code !== 'ENOENT') {
      console.log(`  ⚠ Failed to read file for hash: ${filePath} (${code})`);
    }
    return null;
  }
}

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
export async function isModifiedByUser(
  filePath: string,
  storedHash: string | undefined
): Promise<boolean> {
  const currentHash = await getFileHash(filePath);
  // File doesn't exist yet — nothing to lose.
  if (currentHash === null) return false;
  // No stored hash (migration) — treat current content as potentially modified.
  // The caller should compare with the new upstream content hash instead.
  if (!storedHash) return true;
  return currentHash !== storedHash;
}
