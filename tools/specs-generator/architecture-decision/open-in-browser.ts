/**
 * Cross-platform browser launcher для axis HTML artefacts.
 * ENOENT-safe: при отсутствии браузера / headless / WSL возвращает
 * { launched: false, fallback } вместо throw (FR-3, AC-3).
 */

import { spawn } from 'node:child_process';

export interface OpenResult {
  launched: boolean;
  fallback?: string;
}

interface LauncherSpec {
  cmd: string;
  args: (file: string) => string[];
}

function launcherFor(platform: NodeJS.Platform): LauncherSpec {
  switch (platform) {
    case 'win32':
      // `start` is a cmd builtin; empty "" is the window-title arg so paths with spaces work.
      return { cmd: 'cmd', args: (f) => ['/c', 'start', '', f] };
    case 'darwin':
      return { cmd: 'open', args: (f) => [f] };
    default:
      return { cmd: 'xdg-open', args: (f) => [f] };
  }
}

/**
 * Open `filePath` in the default browser. Never throws — on any spawn error
 * (ENOENT, headless) resolves { launched: false, fallback: file:// path }.
 */
export function openInBrowser(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): Promise<OpenResult> {
  const fallback = `file://${filePath.replace(/\\/g, '/')}`;
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: OpenResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    try {
      const { cmd, args } = launcherFor(platform);
      const child = spawn(cmd, args(filePath), {
        stdio: 'ignore',
        detached: true,
      });
      child.on('error', () => done({ launched: false, fallback }));
      child.on('spawn', () => {
        child.unref();
        done({ launched: true });
      });
    } catch {
      done({ launched: false, fallback });
    }
  });
}
