import type { CheckDefinition } from '../types.js';
import { buildResult, checkBinaryVersion } from './_helpers.js';

const META = {
  id: 'C2',
  fr: 'FR-2',
  name: 'Git presence',
  group: 'self-sufficient',
  reinstallable: false,
} as const;

export const gitCheck: CheckDefinition = {
  ...META,
  pool: 'fs',
  async run() {
    const { ok, output } = checkBinaryVersion('git', ['--version'], /git version/i);
    return ok
      ? buildResult(META, 'ok', output)
      : buildResult(META, 'critical', 'git --version failed or not found in PATH', {
          hint: 'Install Git (https://git-scm.com/downloads) and ensure it is in PATH',
        });
  },
};
