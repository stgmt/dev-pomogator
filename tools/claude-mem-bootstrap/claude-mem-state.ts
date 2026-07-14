// Builtins-only state resolution for the claude-mem SessionStart bootstrap.
// On Windows Claude Code may expose a USERPROFILE different from HOME; all state must use the
// Windows profile, otherwise the hook probes and locks a different user's installation.
import path from 'node:path';

export interface ClaudeMemPaths {
  homeDir: string;
  manifest: string;
  memDir: string;
  workerPid: string;
  database: string;
  lock: string;
}

export function resolveClaudeMemHome(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  fallbackHome: string,
): string {
  if (platform === 'win32' && env.USERPROFILE) return env.USERPROFILE;
  return env.HOME || fallbackHome;
}

export function claudeMemPaths(homeDir: string): ClaudeMemPaths {
  const memDir = path.join(homeDir, '.claude-mem');
  return {
    homeDir,
    manifest: path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json'),
    memDir,
    workerPid: path.join(memDir, '.worker.pid'),
    database: path.join(memDir, 'claude-mem.db'),
    lock: path.join(homeDir, '.dev-pomogator', '.claude-mem-bootstrap.lock'),
  };
}
