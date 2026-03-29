import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { Platform } from '../config/schema.js';

export async function updateFiles(
  _releaseData: Buffer,
  platforms: Platform[]
): Promise<void> {
  for (const platform of platforms) {
    if (platform === 'claude') {
      await updateClaudeFiles();
    }
  }
}

async function updateClaudeFiles(): Promise<void> {
  const homeDir = os.homedir();
  const targetDir = path.join(homeDir, '.claude', 'plugins', 'dev-pomogator');
  const backupDir = path.join(homeDir, '.claude', 'plugins', 'dev-pomogator.backup');

  if (await fs.pathExists(targetDir)) {
    await fs.copy(targetDir, backupDir);
  }
}
