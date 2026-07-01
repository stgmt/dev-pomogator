// FR-10: shared health-check for the forbid-root-artifacts pre-commit install.
// Builtins-only (imported by the pomogator-doctor engine AND the BDD step-defs — DRY, deps-absent safe).

import fs from 'node:fs';
import path from 'node:path';

export type RootArtifactsStatus = 'green' | 'yellow' | 'red';

export interface RootArtifactsCheckResult {
  status: RootArtifactsStatus;
  message: string;
  /** Non-empty when a reinstall fix should be offered (FR-10). */
  fixAction?: string;
}

const HOOK_ID = 'forbid-root-artifacts';
const REINSTALL = 'python .dev-pomogator/tools/forbid-root-artifacts/setup.py';

/**
 * Verify the forbid-root-artifacts pre-commit hook is (1) registered in .pre-commit-config.yaml
 * and (2) its entry path resolves to an existing check.py. Returns a status + optional reinstall fix.
 */
export function checkRootArtifactsInstall(repoRoot: string): RootArtifactsCheckResult {
  const cfg = path.join(repoRoot, '.pre-commit-config.yaml');
  let content = '';
  try {
    if (fs.existsSync(cfg)) content = fs.readFileSync(cfg, 'utf8');
  } catch {
    content = '';
  }

  if (!content || !content.includes(`id: ${HOOK_ID}`)) {
    return {
      status: 'yellow',
      message: 'forbid-root-artifacts pre-commit hook is not installed in this repo',
      fixAction: REINSTALL,
    };
  }

  // Extract the hook entry path (python[3] <path>) and confirm it resolves.
  const entryMatch = content.match(/entry:\s*python3?\s+(\S+)/);
  const entryPath = entryMatch?.[1];
  if (entryPath) {
    let resolves = false;
    try {
      resolves = fs.existsSync(path.join(repoRoot, entryPath));
    } catch {
      resolves = false;
    }
    if (!resolves) {
      return {
        status: 'red',
        message: `forbid-root-artifacts hook entry "${entryPath}" does not resolve — install is broken`,
        fixAction: REINSTALL,
      };
    }
  }

  return {
    status: 'green',
    message: 'forbid-root-artifacts pre-commit hook installed and its entry path resolves',
  };
}
