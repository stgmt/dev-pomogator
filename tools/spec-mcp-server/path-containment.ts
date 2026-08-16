import fs from 'node:fs';
import path from 'node:path';

/**
 * Realpath-based containment check: is `candidate` inside `root`?
 *
 * Both paths are resolved through realpath (symlinks followed) so a
 * symlinked escape (`<root>/link -> /elsewhere`) is rejected, not trusted.
 * Used by MCP handlers to keep every read/mutation inside the single
 * resolved target repository root (FR-83c "single target repository root").
 */
export function isPathWithin(root: string, candidate: string): boolean {
  const rootReal = fs.realpathSync.native(root);
  const candidateReal = fs.realpathSync.native(candidate);
  const relative = path.relative(rootReal, candidateReal);
  return relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative));
}
