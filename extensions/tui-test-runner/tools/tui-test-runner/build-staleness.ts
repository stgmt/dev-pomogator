/**
 * Build Staleness Detection Module
 * FR-2: TypeScript mtime check (src/ vs dist/)
 * FR-3: Docker SKIP_BUILD block
 * FR-4: dotnet --no-build block
 * FR-5: Framework detection
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface StalenessResult {
  stale: boolean;
  reason?: string;
  fixCommand?: string;
}

/** Recursively find max mtime among files with given extensions */
export function getMaxMtime(dir: string, extensions: string[]): number | null {
  if (!fs.existsSync(dir)) return null;

  let maxMtime = 0;
  const walk = (d: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(full);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
        } catch { /* skip unreadable files */ }
      }
    }
  };
  walk(dir);
  return maxMtime > 0 ? maxMtime : null;
}

/** Get mtime of build artifact */
function getBuildArtifactMtime(cwd: string): number | null {
  const distIndex = path.join(cwd, 'dist', 'index.js');
  try {
    return fs.statSync(distIndex).mtimeMs;
  } catch {
    return null;
  }
}

/** Check if dist/ directory exists */
function distExists(cwd: string): boolean {
  try {
    return fs.statSync(path.join(cwd, 'dist')).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check build staleness for a given framework and command.
 *
 * @param framework - detected framework (vitest, jest, dotnet, pytest, go, rust)
 * @param command - full Bash command string
 * @param cwd - working directory
 */
export function checkStaleness(framework: string, command: string, cwd: string): StalenessResult {
  // pytest/go/rust — compiler/interpreter handles build automatically
  if (['pytest', 'go', 'rust'].includes(framework)) {
    return { stale: false };
  }

  // Docker: block SKIP_BUILD=1
  if (framework === 'docker') {
    if (process.env.SKIP_BUILD === '1' || /SKIP_BUILD=1/.test(command)) {
      return {
        stale: true,
        reason: 'Docker build must not be skipped. Layer caching handles unchanged layers efficiently.',
        fixCommand: 'Remove SKIP_BUILD=1 and run tests normally',
      };
    }
    return { stale: false };
  }

  // dotnet: block --no-build flag
  if (framework === 'dotnet') {
    if (/--no-build/.test(command)) {
      return {
        stale: true,
        reason: 'dotnet test with --no-build may run stale binaries. Remove the flag to ensure fresh build.',
        fixCommand: 'Remove --no-build flag from the test command',
      };
    }
    return { stale: false };
  }

  // TypeScript (vitest/jest/unknown): mtime comparison src/ vs dist/
  const srcMtime = getMaxMtime(path.join(cwd, 'src'), ['.ts', '.tsx', '.js', '.jsx']);

  if (srcMtime === null) {
    // No src/ files found — not a TypeScript project or can't determine staleness, allow
    return { stale: false };
  }

  if (!distExists(cwd)) {
    return {
      stale: true,
      reason: 'No build artifacts found. dist/ directory does not exist.',
      fixCommand: 'npm run build',
    };
  }

  const distMtime = getBuildArtifactMtime(cwd);

  if (distMtime === null) {
    return {
      stale: true,
      reason: 'No build artifacts found. dist/index.js does not exist.',
      fixCommand: 'npm run build',
    };
  }

  if (srcMtime > distMtime) {
    return {
      stale: true,
      reason: 'Build stale. Source files are newer than dist/index.js.',
      fixCommand: 'npm run build',
    };
  }

  return { stale: false };
}
