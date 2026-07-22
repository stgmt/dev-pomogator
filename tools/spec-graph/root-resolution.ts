import {
  normalizeRootIdentity as normalizeRootIdentityRuntime,
  resolveTargetProjectRoot as resolveTargetProjectRootRuntime,
} from './root-resolution.mjs';

/**
 * FR-62 target-project resolution.  This deliberately has no stdin parameter:
 * a project identity is process configuration, never a request payload.
 */
export type RootSource = 'env_override' | 'caller_project' | 'script_dir';
export type RootRejection = 'empty' | 'placeholder' | 'unsafe_windows' | 'unsafe_unc' | 'plugin_cache' | 'missing_specs';

export interface RejectedRoot {
  source: RootSource;
  observed: string;
  reason: RootRejection;
}

export interface RootResolution {
  status: 'READY' | 'NOT_READY';
  root: string | null;
  source: RootSource | null;
  observed: Record<RootSource, string | null>;
  rejected: RejectedRoot[];
  corrective_action: string;
}

export interface RootResolutionInput {
  envRoot?: string;
  cwd: string;
  scriptDir: string;
}

/** Stable comparison key for Windows-host and WSL `/mnt/<drive>` spellings. */
export function normalizeRootIdentity(value: string): string {
  return normalizeRootIdentityRuntime(value);
}

export function resolveTargetProjectRoot(input: RootResolutionInput): RootResolution {
  return resolveTargetProjectRootRuntime(input) as RootResolution;
}
