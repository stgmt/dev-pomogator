import fs from 'fs-extra';
import fsNative from 'fs';
import path from 'path';

/**
 * Write JSON atomically: backup current file → write to .tmp → move to target.
 * Prevents data loss on crash mid-write.
 *
 * Pattern from src/config/index.ts:saveConfig()
 */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));

  // Backup current file (if valid JSON) before overwriting — single read
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    JSON.parse(content); // validate
    await fs.writeFile(filePath + '.bak', content, 'utf-8');
  } catch {
    // File doesn't exist or is corrupted — skip backup
  }

  // Write to temp file, then atomically move
  const tempFile = filePath + '.tmp';
  await fs.writeJson(tempFile, data, { spaces: 2 });
  await fs.move(tempFile, filePath, { overwrite: true });
}

/**
 * Read JSON safely with backup recovery.
 * If primary file is corrupted, tries .bak file.
 * Returns fallback if both fail.
 */
export async function readJsonSafe<T = Record<string, unknown>>(
  filePath: string,
  fallback: T = {} as T,
): Promise<T> {
  // Try primary file (no pathExists check — handle error directly)
  try {
    return await fs.readJson(filePath) as T;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== 'ENOENT') {
      console.warn(`  [WARN] Corrupted JSON: ${filePath}`);
    }
  }

  // Try backup
  const bakPath = filePath + '.bak';
  try {
    const recovered = await fs.readJson(bakPath) as T;
    console.warn(`  [WARN] Recovered from backup: ${bakPath}`);
    // Restore backup to primary
    await fs.copy(bakPath, filePath, { overwrite: true });
    return recovered;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== 'ENOENT') {
      console.warn(`  [WARN] Backup also corrupted: ${bakPath}`);
    }
  }

  console.warn(`  [WARN] Using empty fallback for: ${filePath}`);
  return fallback;
}

/**
 * Sync version of writeJsonAtomic for use in standalone bundle context
 * (hook-migration.ts runs synchronously).
 */
export function writeJsonAtomicSync(filePath: string, data: unknown): void {
  fsNative.mkdirSync(path.dirname(filePath), { recursive: true });

  // Backup current file (if valid JSON) — single read
  try {
    const content = fsNative.readFileSync(filePath, 'utf-8');
    JSON.parse(content); // validate
    fsNative.writeFileSync(filePath + '.bak', content, 'utf-8');
  } catch {
    // File doesn't exist or is corrupted — skip backup
  }

  // Write to temp file, then rename
  const tempFile = filePath + '.tmp';
  fsNative.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fsNative.renameSync(tempFile, filePath);
}
