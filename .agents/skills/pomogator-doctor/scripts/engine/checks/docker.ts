import { DOCTOR_TIMEOUTS } from '../constants.js';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { checkBinaryVersion } from './_helpers.js';

function requiresDocker(ctx: CheckContext): boolean {
  return ctx.installedExtensions.some((ext) => ext.dependencies?.docker === true);
}

export const dockerCheck: CheckDefinition = {
  id: 'C16',
  fr: 'FR-14',
  name: 'Docker + devcontainer CLI',
  group: 'needs-external',
  reinstallable: false,
  pool: 'fs',
  gate(ctx: CheckContext) {
    return requiresDocker(ctx)
      ? { relevant: true }
      : {
          relevant: false,
          reason: 'no installed extension declares docker:true',
        };
  },
  async run(): Promise<CheckResult[]> {
    void DOCTOR_TIMEOUTS; // referenced via checkBinaryVersion
    const [docker, devcontainer] = await Promise.all([
      Promise.resolve(checkBinaryVersion('docker')),
      Promise.resolve(checkBinaryVersion('devcontainer')),
    ]);

    return [
      {
        id: 'C16a',
        fr: 'FR-14',
        name: 'Docker CLI',
        group: 'needs-external',
        severity: docker.ok ? 'ok' : 'critical',
        reinstallable: false,
        message: docker.ok ? docker.output : 'docker not found in PATH',
        hint: docker.ok
          ? undefined
          : 'Install Docker Desktop (https://www.docker.com/products/docker-desktop)',
        durationMs: 0,
      },
      {
        id: 'C16b',
        fr: 'FR-14',
        name: 'devcontainer CLI',
        group: 'needs-external',
        severity: devcontainer.ok ? 'ok' : 'critical',
        reinstallable: false,
        message: devcontainer.ok ? devcontainer.output : 'devcontainer not found in PATH',
        hint: devcontainer.ok ? undefined : 'npm install -g @devcontainers/cli',
        durationMs: 0,
      },
    ];
  },
};
