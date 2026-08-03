import fs from 'node:fs';
import path from 'node:path';

export function isPathWithin(root: string, candidate: string): boolean {
  const rootReal = fs.realpathSync.native(root);
  const candidateReal = fs.realpathSync.native(candidate);
  const relative = path.relative(rootReal, candidateReal);
  return relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative));
}
