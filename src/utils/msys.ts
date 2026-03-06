import fs from 'fs';
import path from 'path';

/**
 * Detect if a path looks like it was mangled by MSYS/Git Bash.
 * MSYS converts Unix paths like /home/user to C:/Program Files/Git/home/user
 */
export function isMsysMangledPath(p: string): boolean {
  return /^[A-Za-z]:[/\\]Program Files[/\\]Git[/\\]/.test(p);
}

/**
 * Detect if running inside MSYS/Git Bash/Cygwin environment.
 */
export function detectMsysEnvironment(): boolean {
  return !!(
    process.env.MSYSTEM ||
    process.env.TERM_PROGRAM === 'mintty' ||
    (process.env.SHELL && /[/\\]Git[/\\]/.test(process.env.SHELL))
  );
}

/**
 * Return environment with MSYS_NO_PATHCONV=1 and MSYS2_ARG_CONV_EXCL=*
 * to prevent MSYS path mangling. Only modifies on Windows; on other platforms
 * returns the base env unchanged.
 */
export function getMsysSafeEnv(baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...(baseEnv ?? process.env) };
  if (process.platform === 'win32') {
    env.MSYS_NO_PATHCONV = '1';
    env.MSYS2_ARG_CONV_EXCL = '*';
  }
  return env;
}

/**
 * Scan project root for directories that look like MSYS path mangling artifacts.
 * A directory named like "C:" (single letter + colon) in a project root is
 * almost certainly an artifact of MSYS converting /home/... to C:/Program Files/Git/...
 * which, on Linux, creates a literal "C:" directory.
 */
export function detectMangledArtifacts(projectRoot: string): string[] {
  const artifacts: string[] = [];
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && /^[A-Za-z]:$/.test(entry.name)) {
        // Check if it contains the telltale nested structure
        const nested = path.join(projectRoot, entry.name, 'Program Files', 'Git');
        if (fs.existsSync(nested)) {
          artifacts.push(entry.name);
        }
      }
    }
  } catch {
    // Can't read directory — skip silently
  }
  return artifacts;
}
