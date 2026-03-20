import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
/**
 * Create a timestamped backup of a file before overwriting
 * @param filePath - Path to the file to backup
 * @returns Path to backup file, or null if original doesn't exist
 */
export async function backupFile(filePath) {
    if (!await fs.pathExists(filePath)) {
        return null;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup.${timestamp}`;
    await fs.copy(filePath, backupPath);
    console.log(chalk.gray(`    Backup: ${path.basename(backupPath)}`));
    return backupPath;
}
/**
 * Create a timestamped backup of a directory before overwriting
 * @param dirPath - Path to the directory to backup
 * @returns Path to backup directory, or null if original doesn't exist
 */
export async function backupDirectory(dirPath) {
    if (!await fs.pathExists(dirPath)) {
        return null;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${dirPath}.backup.${timestamp}`;
    await fs.copy(dirPath, backupPath);
    console.log(chalk.gray(`    Backup: ${path.basename(backupPath)}/`));
    return backupPath;
}
//# sourceMappingURL=backup.js.map