import path from 'path';
import fs from 'fs';

/**
 * Find the TOPMOST git repository root in the directory tree.
 * 
 * This handles the case where a project is nested inside another git repo
 * (e.g., dev-pomogator/ inside presentation-ai-pomogator/).
 * We want to install plugins into the outermost project, not the nested one.
 * 
 * @returns The absolute path to the topmost git repository root, or process.cwd() if not in a git repo
 */
export function findRepoRoot(): string {
  let current = process.cwd();
  let lastGitRoot: string | null = null;
  
  // Walk up the directory tree
  while (current !== path.parse(current).root) {
    const gitPath = path.join(current, '.git');
    
    // Check if .git exists (can be a file for submodules or a directory)
    if (fs.existsSync(gitPath)) {
      lastGitRoot = current;
    }
    
    current = path.dirname(current);
  }
  
  // Check the filesystem root as well
  const rootGitPath = path.join(current, '.git');
  if (fs.existsSync(rootGitPath)) {
    lastGitRoot = current;
  }
  
  return lastGitRoot || process.cwd();
}
