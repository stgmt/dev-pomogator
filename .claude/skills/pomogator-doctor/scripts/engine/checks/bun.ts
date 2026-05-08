import type { CheckContext, CheckDefinition } from '../types.js';
import { buildResult, checkBinaryVersion } from './_helpers.js';

const META = {
  id: 'C9',
  fr: 'FR-7',
  name: 'Bun binary',
  group: 'needs-external',
  reinstallable: false,
} as const;

function requiresBun(ctx: CheckContext): boolean {
  return ctx.installedExtensions.some((ext) =>
    (ext.dependencies?.binaries ?? []).includes('bun'),
  );
}

export const bunCheck: CheckDefinition = {
  ...META,
  pool: 'fs',
  gate(ctx) {
    return requiresBun(ctx)
      ? { relevant: true }
      : {
          relevant: false,
          reason: 'no installed extension declares bun in dependencies.binaries',
        };
  },
  async run() {
    const { ok, output } = checkBinaryVersion('bun', ['--version'], /\d+\.\d+\.\d+/);
    if (ok) return buildResult(META, 'ok', `bun v${output}`);
    const hint =
      process.platform === 'win32'
        ? 'Install Bun: `irm bun.sh/install.ps1 | iex` (PowerShell)'
        : 'Install Bun: `curl -fsSL bun.sh/install | bash`';
    return buildResult(META, 'critical', 'bun not found in PATH', { hint });
  },
};
