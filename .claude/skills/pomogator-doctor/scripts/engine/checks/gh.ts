import { spawnSync } from 'node:child_process';

import { DOCTOR_TIMEOUTS } from '../constants.js';
import type { CheckDefinition, CheckResult } from '../types.js';
import { buildResult } from './_helpers.js';

const META = {
  id: 'C-GH',
  fr: 'FR-37',
  name: 'GitHub CLI authentication',
  group: 'needs-external',
  reinstallable: false,
} as const satisfies Pick<CheckDefinition, 'id' | 'fr' | 'name' | 'group' | 'reinstallable'>;

const AUTH_LOGIN_HINT = 'Sign in with `gh auth login`.';

export type GhProbeState = 'available' | 'missing-or-unusable' | 'unauthenticated';

export interface GhCommandResult {
  status: number | null;
  errorCode?: string;
  timedOut: boolean;
}

/** Produces an install instruction without exposing host command output. */
export function ghInstallHint(platform: NodeJS.Platform): string {
  if (platform === 'win32') return 'Install GitHub CLI with `winget install GitHub.cli`.';
  if (platform === 'darwin') return 'Install GitHub CLI with `brew install gh`.';
  return 'Install GitHub CLI: https://cli.github.com/manual/installation';
}

/** Classifies sanitized command outcomes; never accepts or returns command output. */
export function classifyGhReadiness(version: GhCommandResult, auth: GhCommandResult | undefined): GhProbeState {
  if (version.errorCode || version.status !== 0 || version.timedOut) return 'missing-or-unusable';
  if (!auth || auth.errorCode || auth.status !== 0 || auth.timedOut) return 'unauthenticated';
  return 'available';
}

export type GhRunner = (args: string[]) => GhCommandResult;

export function runGh(args: string[]): GhCommandResult {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    timeout: DOCTOR_TIMEOUTS.SPAWN_MS,
    windowsHide: true,
    // `gh auth status` intentionally writes account details to stderr. Discard it.
    stdio: 'ignore',
  });

  const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
  return {
    status: result.status,
    errorCode,
    timedOut: errorCode === 'ETIMEDOUT' || result.signal === 'SIGTERM',
  };
}

export function createGhCheck(runner: GhRunner = runGh, platform: NodeJS.Platform = process.platform): CheckDefinition {
  return {
    ...META,
    pool: 'fs',
    async run(): Promise<CheckResult> {
      const version = runner(['--version']);
      const state = classifyGhReadiness(version, version.status === 0 ? runner(['auth', 'status']) : undefined);

      if (state === 'available') {
        return buildResult(META, 'ok', 'GitHub CLI is installed and authenticated.');
      }

      if (state === 'missing-or-unusable') {
        const hint = ghInstallHint(platform);
        return buildResult(META, 'critical', `GitHub CLI is missing or unusable. ${hint}`, { hint });
      }

      return buildResult(
        META,
        'warning',
        `GitHub CLI is installed but not authenticated. ${AUTH_LOGIN_HINT}`,
        { hint: AUTH_LOGIN_HINT },
      );
    },
  };
}

export const ghCheck: CheckDefinition = createGhCheck();
