import fs from 'fs-extra';
import os from 'os';
import path from 'path';
export async function updateFiles(_releaseData, platforms) {
    for (const platform of platforms) {
        if (platform === 'claude') {
            await updateClaudeFiles();
        }
    }
}
async function updateClaudeFiles() {
    const homeDir = os.homedir();
    const targetDir = path.join(homeDir, '.claude', 'plugins', 'dev-pomogator');
    const backupDir = path.join(homeDir, '.claude', 'plugins', 'dev-pomogator.backup');
    if (await fs.pathExists(targetDir)) {
        await fs.copy(targetDir, backupDir);
    }
}
//# sourceMappingURL=files.js.map