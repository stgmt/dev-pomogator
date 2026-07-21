import fs from 'node:fs';
import path from 'node:path';

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
  const trimmed = value.trim().replace(/\\/g, '/');
  const wsl = trimmed.match(/^\/mnt\/([a-zA-Z])(?:\/(.*))?$/i);
  if (wsl) return `${wsl[1].toLowerCase()}:/${wsl[2] ?? ''}`.replace(/\/+$/, '').toLowerCase();
  const drive = trimmed.match(/^([a-zA-Z]):(?:\/(.*))?$/);
  if (drive) return `${drive[1].toLowerCase()}:/${drive[2] ?? ''}`.replace(/\/+$/, '').toLowerCase();
  return path.resolve(trimmed).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function unsafeReason(value: string): RootRejection | null {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized) return 'empty';
  if (normalized.includes('${')) return 'placeholder';
  if (/^[a-z]:\/windows(?:\/|$)/i.test(normalized)) return 'unsafe_windows';
  if (/^\/\//.test(normalized) || /^\\\\/.test(value)) return 'unsafe_unc';
  if (/(?:^|\/)\.claude\/(?:plugins|cache)(?:\/|$)/i.test(normalized) || /dev-pomogator[\/-]cache/i.test(normalized)) return 'plugin_cache';
  return null;
}

function validate(source: RootSource, value: string | undefined, rejected: RejectedRoot[]): string | null {
  const observed = value ?? '';
  const unsafe = unsafeReason(observed);
  if (unsafe) {
    rejected.push({ source, observed, reason: unsafe });
    return null;
  }
  const candidate = path.resolve(observed);
  if (!fs.existsSync(path.join(candidate, '.specs'))) {
    rejected.push({ source, observed, reason: 'missing_specs' });
    return null;
  }
  return candidate;
}

export function resolveTargetProjectRoot(input: RootResolutionInput): RootResolution {
  const rejected: RejectedRoot[] = [];
  const observed = {
    env_override: input.envRoot ?? null,
    caller_project: input.cwd || null,
    script_dir: input.scriptDir || null,
  };
  for (const [source, value] of [
    ['env_override', input.envRoot],
    ['caller_project', input.cwd],
    ['script_dir', input.scriptDir],
  ] as const) {
    const root = validate(source, value, rejected);
    if (root) {
      return {
        status: 'READY', root, source, observed, rejected,
        corrective_action: 'Use a repository root containing .specs/ in SPECS_GENERATOR_ROOT or run from that project.',
      };
    }
  }
  return {
    status: 'NOT_READY', root: null, source: null, observed, rejected,
    corrective_action: 'Set SPECS_GENERATOR_ROOT to the target project root containing .specs/, or run the command from that project; do not launch it from a plugin cache, C:\\Windows, or a UNC-relative directory.',
  };
}
