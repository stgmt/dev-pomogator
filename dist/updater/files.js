import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { findRepoRoot } from '../utils/repo.js';
export async function updateFiles(_releaseData, platforms) {
    // For now, we'll use npx to reinstall
    // In future, extract tarball and copy files
    // Find git repository root for correct project directory
    const repoRoot = findRepoRoot();
    for (const platform of platforms) {
        if (platform === 'cursor') {
            await updateCursorFiles(repoRoot);
        }
        if (platform === 'claude') {
            await updateClaudeFiles();
        }
    }
}
async function updateCursorFiles(cwd) {
    const targetDir = path.join(cwd, '.cursor', 'rules');
    // Backup existing files
    const backupDir = path.join(cwd, '.cursor', 'rules.backup');
    if (await fs.pathExists(targetDir)) {
        await fs.copy(targetDir, backupDir);
    }
    // Files will be updated by next npx run
}
async function updateClaudeFiles() {
    const homeDir = os.homedir();
    const targetDir = path.join(homeDir, '.claude', 'plugins', 'dev-pomogator');
    // Backup existing files
    const backupDir = path.join(homeDir, '.claude', 'plugins', 'dev-pomogator.backup');
    if (await fs.pathExists(targetDir)) {
        await fs.copy(targetDir, backupDir);
    }
    // Files will be updated by next npx run
}
//# sourceMappingURL=files.js.map