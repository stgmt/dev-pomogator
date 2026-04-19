import { spawnSync } from 'node:child_process';
import { DOCTOR_TIMEOUTS } from '../constants.js';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';

function gatherPythonPackages(ctx: CheckContext): Array<{ pkg: string; extension: string }> {
  const out: Array<{ pkg: string; extension: string }> = [];
  for (const ext of ctx.installedExtensions) {
    for (const pkg of ext.dependencies?.pythonPackages ?? []) {
      out.push({ pkg, extension: ext.name });
    }
  }
  return out;
}

function requiresPython(ctx: CheckContext): boolean {
  return ctx.installedExtensions.some((ext) => {
    const binaries = ext.dependencies?.binaries ?? [];
    const pkgs = ext.dependencies?.pythonPackages ?? [];
    return binaries.includes('python3') || binaries.includes('python') || pkgs.length > 0;
  });
}

function detectPythonCommand(): { command: string; version: string } | null {
  for (const cmd of ['python3', 'python']) {
    const res = spawnSync(cmd, ['--version'], {
      encoding: 'utf-8',
      timeout: DOCTOR_TIMEOUTS.SPAWN_MS,
    });
    if (res.status === 0 && /Python (\d+\.\d+)/i.test((res.stdout ?? '') + (res.stderr ?? ''))) {
      const version = ((res.stdout ?? '') + (res.stderr ?? '')).trim().split(/\s+/).pop() ?? '';
      return { command: cmd, version };
    }
  }
  return null;
}

export const pythonCheck: CheckDefinition = {
  id: 'C10',
  fr: 'FR-8',
  name: 'Python + packages',
  group: 'needs-external',
  reinstallable: false,
  pool: 'fs',
  gate(ctx: CheckContext) {
    return requiresPython(ctx)
      ? { relevant: true }
      : {
          relevant: false,
          reason: 'no installed extension declares python3 or pythonPackages',
        };
  },
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const python = detectPythonCommand();

    if (!python) {
      results.push({
        id: 'C10a',
        fr: 'FR-8',
        name: 'Python 3',
        group: 'needs-external',
        severity: 'critical',
        reinstallable: false,
        message: 'neither python3 nor python found in PATH',
        hint: 'Install Python 3 (https://www.python.org/downloads/)',
        durationMs: 0,
      });
      return results;
    }

    results.push({
      id: 'C10a',
      fr: 'FR-8',
      name: 'Python 3',
      group: 'needs-external',
      severity: 'ok',
      reinstallable: false,
      message: `${python.command} v${python.version}`,
      durationMs: 0,
    });

    const packages = gatherPythonPackages(ctx);
    const pkgResults = await Promise.all(
      packages.map(async ({ pkg, extension }): Promise<CheckResult> => {
        const res = spawnSync(python.command, ['-c', `import ${pkg}`], {
          encoding: 'utf-8',
          timeout: DOCTOR_TIMEOUTS.SPAWN_MS,
        });
        const ok = res.status === 0;
        return {
          id: `C10b:${pkg}`,
          fr: 'FR-8',
          name: `Python package: ${pkg}`,
          group: 'needs-external',
          severity: ok ? 'ok' : 'critical',
          reinstallable: false,
          message: ok ? `${pkg} importable` : `import ${pkg} failed`,
          hint: ok ? undefined : `pip install --user ${pkg}`,
          extension,
          durationMs: 0,
        };
      }),
    );
    return [...results, ...pkgResults];
  },
};
