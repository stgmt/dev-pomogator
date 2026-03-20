/**
 * Create a timestamped backup of a file before overwriting
 * @param filePath - Path to the file to backup
 * @returns Path to backup file, or null if original doesn't exist
 */
export declare function backupFile(filePath: string): Promise<string | null>;
/**
 * Create a timestamped backup of a directory before overwriting
 * @param dirPath - Path to the directory to backup
 * @returns Path to backup directory, or null if original doesn't exist
 */
export declare function backupDirectory(dirPath: string): Promise<string | null>;
//# sourceMappingURL=backup.d.ts.map