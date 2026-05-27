/**
 * Shared utilities for extension hook scripts.
 * Eliminates duplication of log() and normalizePath() across 8+ extensions.
 */

export function log(
  level: 'INFO' | 'DEBUG' | 'ERROR' | 'WARN',
  prefix: string,
  message: string
): void {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [${prefix}] [${level}] ${message}\n`);
}

export function normalizePath(p: string): string {
  if (!p) return p;
  // /d:/repos/project → D:\repos\project on Windows
  if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(p)) {
    const drive = p[1].toUpperCase();
    return `${drive}:${p.slice(2).replace(/\//g, '\\')}`;
  }
  return p;
}
