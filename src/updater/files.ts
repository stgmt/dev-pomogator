import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { Platform } from '../config/schema.js';

export async function updateFiles(
  _releaseData: Buffer,
  platforms: Platform[]
): Promise<void> {
  // For now, we'll use npx to reinstall
  // In future, extract tarball and copy files
  
  const cwd = process.cwd();
  
  for (const platform of platforms) {
    if (platform === 'cursor') {
      await updateCursorFiles(cwd);
    }
    
    if (platform === 'claude') {
      await updateClaudeFiles();
    }
  }
}

async function updateCursorFiles(cwd: string): Promise<void> {
  const targetDir = path.join(cwd, '.cursor', 'rules');
  
  // Backup existing files
  const backupDir = path.join(cwd, '.cursor', 'rules.backup');
  
  if (await fs.pathExists(targetDir)) {
    await fs.copy(targetDir, backupDir);
  }
  
  // Files will be updated by next npx run
}

async function updateClaudeFiles(): Promise<void> {
  const homeDir = os.homedir();
  const targetDir = path.join(homeDir, '.claude', 'plugins', 'dev-pomogator');
  
  // Backup existing files
  const backupDir = path.join(homeDir, '.claude', 'plugins', 'dev-pomogator.backup');
  
  if (await fs.pathExists(targetDir)) {
    await fs.copy(targetDir, backupDir);
  }
  
  // Files will be updated by next npx run
}
