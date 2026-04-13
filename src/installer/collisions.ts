/**
 * Collision detection: check if installer candidate paths are already
 * tracked in target project's git repository.
 *
 * Personal-pomogator FR-7: if a user has committed their own file at a path
 * dev-pomogator would install to (e.g. `.claude/commands/create-spec.md`),
 * we must NOT overwrite it. Instead: skip copy, exclude from gitignore
 * marker block, emit WARN in install report.
 *
 * Uses batched `git ls-files -- path1 path2 ...` for efficiency (single
 * subprocess, not N calls). Graceful if `.git/` is missing (returns empty Set).
 */

import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { getMsysSafeEnv } from '../utils/msys.js';

/**
 * Find which of the given candidate paths are already tracked in target repo.
 *
 * @param repoRoot Absolute path to target project root
 * @param candidatePaths Relative paths (forward-slash normalized) to check
 * @returns Set of paths that are git-tracked (case-sensitive, forward slashes)
 */
export async function detectGitTrackedCollisions(
  repoRoot: string,
  candidatePaths: string[],
): Promise<Set<string>> {
  if (candidatePaths.length === 0) {
    return new Set<string>();
  }

  // Graceful no-git: if .git/ directory absent, no collisions possible.
  const gitDir = path.join(repoRoot, '.git');
  if (!await fs.pathExists(gitDir)) {
    return new Set<string>();
  }

  // Normalize paths to forward slashes (git ls-files expects POSIX)
  const normalized = candidatePaths.map(p => p.replace(/\\/g, '/'));

  try {
    // Batched: single git invocation with all candidates as args after --
    const output = execFileSync('git', [
      '-C', repoRoot,
      'ls-files', '--',
      ...normalized,
    ], {
      encoding: 'utf-8',
      env: getMsysSafeEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Parse stdout: one path per line, forward slashes already
    const tracked = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    return new Set(tracked);
  } catch {
    // git exited non-zero — most likely no matches for any candidate.
    // ls-files returns 0 for "no matches" in most cases, so we only hit here
    // for actual git errors (no .git, corrupted index). Either way, no collisions.
    return new Set<string>();
  }
}
