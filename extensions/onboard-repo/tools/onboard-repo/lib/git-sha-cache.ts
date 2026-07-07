/**
 * Cache invalidation logic for Phase 0 Repo Onboarding (FR-4, FR-16, NFR-C3).
 *
 * Primary mechanism: git SHA comparison between `.onboarding.json.last_indexed_sha`
 * and `git rev-parse HEAD`. Non-git repos fall back to mtime comparison of manifest files
 * (NFR-C3 cross-platform).
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-4, FR.md#fr-16, NFR.md#compatibility}.
 */

import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as fsExtra from 'fs-extra';
import type { CacheStatus, OnboardingJson } from './types.ts';


const ONBOARDING_JSON_REL = path.join('.specs', '.onboarding.json');
const HISTORY_DIR_REL = path.join('.specs', '.onboarding-history');
const DEFAULT_DRIFT_THRESHOLD = 5;
const HISTORY_RETENTION = 5;


export function isGitRepo(projectPath: string): boolean {
  // Strict: require `.git` directly in projectPath — not via upward `git` discovery
  // (which would treat subdirs of ancestor git repos as tracked).
  const gitDir = path.join(projectPath, '.git');
  try {
    const stat = fsExtra.statSync(gitDir);
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}


export function getHeadSha(projectPath: string): string | null {
  if (!isGitRepo(projectPath)) return null;
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectPath,
    encoding: 'utf-8',
    shell: false,
  });
  if (result.status !== 0) return null;
  const sha = result.stdout.trim();
  return sha.length > 0 ? sha : null;
}


export function countCommitsSince(projectPath: string, sinceSha: string): number {
  // commits reachable from HEAD but not from sinceSha
  const result = spawnSync('git', ['rev-list', '--count', `${sinceSha}..HEAD`], {
    cwd: projectPath,
    encoding: 'utf-8',
    shell: false,
  });
  if (result.status !== 0) return -1;
  const n = parseInt(result.stdout.trim(), 10);
  return Number.isFinite(n) ? n : -1;
}


export async function checkCache(projectPath: string): Promise<CacheStatus> {
  const jsonPath = path.join(projectPath, ONBOARDING_JSON_REL);

  if (!(await fsExtra.pathExists(jsonPath))) {
    return { status: 'missing' };
  }

  let json: OnboardingJson;
  try {
    json = (await fsExtra.readJson(jsonPath)) as OnboardingJson;
  } catch (err) {
    return { status: 'error', error: `Failed to parse ${ONBOARDING_JSON_REL}: ${(err as Error).message}` };
  }

  const head = getHeadSha(projectPath);
  const gitAvailable = head !== null;

  if (!gitAvailable) {
    // Non-git fallback (NFR-C3). Use mtime comparison: if no manifests newer than onboarding.json, treat as valid.
    const valid = await mtimeStillFresh(projectPath, jsonPath);
    if (valid) return { status: 'valid', json };
    const commitsAhead = await countManifestChangesAhead(projectPath, jsonPath);
    return { status: 'drift', json, commitsAhead };
  }

  if (json.last_indexed_sha === head) {
    return { status: 'valid', json };
  }

  const commitsAhead = json.last_indexed_sha
    ? countCommitsSince(projectPath, json.last_indexed_sha)
    : -1;

  return {
    status: 'drift',
    json,
    commitsAhead: commitsAhead >= 0 ? commitsAhead : 0,
  };
}


export function driftExceedsThreshold(status: CacheStatus, threshold: number = DEFAULT_DRIFT_THRESHOLD): boolean {
  if (status.status !== 'drift') return false;
  return status.commitsAhead >= threshold;
}


async function mtimeStillFresh(projectPath: string, jsonPath: string): Promise<boolean> {
  const jsonMtime = (await fsExtra.stat(jsonPath)).mtimeMs;
  const manifestCandidates = [
    'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Gemfile', 'composer.json',
    'pom.xml', 'mix.exs', 'pubspec.yaml', 'requirements.txt',
  ];
  for (const manifest of manifestCandidates) {
    const manifestPath = path.join(projectPath, manifest);
    if (await fsExtra.pathExists(manifestPath)) {
      const mtime = (await fsExtra.stat(manifestPath)).mtimeMs;
      if (mtime > jsonMtime) return false;
    }
  }
  return true;
}


async function countManifestChangesAhead(projectPath: string, jsonPath: string): Promise<number> {
  const jsonMtime = (await fsExtra.stat(jsonPath)).mtimeMs;
  const manifestCandidates = [
    'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Gemfile', 'composer.json',
    'pom.xml', 'mix.exs', 'pubspec.yaml', 'requirements.txt',
  ];
  let changed = 0;
  for (const manifest of manifestCandidates) {
    const manifestPath = path.join(projectPath, manifest);
    if (await fsExtra.pathExists(manifestPath)) {
      const mtime = (await fsExtra.stat(manifestPath)).mtimeMs;
      if (mtime > jsonMtime) changed += 1;
    }
  }
  return changed;
}


export async function archivePreviousOnboarding(projectPath: string): Promise<string | null> {
  const jsonPath = path.join(projectPath, ONBOARDING_JSON_REL);
  const mdPath = path.join(projectPath, '.specs', '.onboarding.md');
  const scratchPath = path.join(projectPath, '.specs', '.onboarding-scratch.md');

  if (!(await fsExtra.pathExists(jsonPath))) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveDir = path.join(projectPath, HISTORY_DIR_REL, timestamp);
  await fsExtra.ensureDir(archiveDir);

  await fsExtra.move(jsonPath, path.join(archiveDir, '.onboarding.json'));
  if (await fsExtra.pathExists(mdPath)) {
    await fsExtra.move(mdPath, path.join(archiveDir, '.onboarding.md'));
  }
  if (await fsExtra.pathExists(scratchPath)) {
    await fsExtra.move(scratchPath, path.join(archiveDir, '.onboarding-scratch.md'));
  }

  await pruneHistory(projectPath);
  return archiveDir;
}


export async function pruneHistory(projectPath: string, keep: number = HISTORY_RETENTION): Promise<void> {
  const historyDir = path.join(projectPath, HISTORY_DIR_REL);
  if (!(await fsExtra.pathExists(historyDir))) return;

  const entries = await fsExtra.readdir(historyDir);
  const dirs = [];
  for (const entry of entries) {
    const full = path.join(historyDir, entry);
    const stat = await fsExtra.stat(full);
    if (stat.isDirectory()) dirs.push({ name: entry, path: full, mtime: stat.mtimeMs });
  }
  if (dirs.length <= keep) return;

  dirs.sort((a, b) => b.mtime - a.mtime);
  const toDelete = dirs.slice(keep);
  for (const entry of toDelete) {
    await fsExtra.remove(entry.path);
  }
}


export interface DecisionInput {
  projectPath: string;
  refreshFlag: boolean;
  driftThreshold?: number;
}


export interface Decision {
  action: 'run-full' | 'skip' | 'prompt-drift';
  status: CacheStatus;
  commitsAhead?: number;
  reason: string;
}


export async function decideAction(input: DecisionInput): Promise<Decision> {
  const { projectPath, refreshFlag, driftThreshold = DEFAULT_DRIFT_THRESHOLD } = input;

  if (refreshFlag) {
    const status = await checkCache(projectPath);
    return {
      action: 'run-full',
      status,
      reason: '--refresh-onboarding flag forces full re-run',
    };
  }

  const status = await checkCache(projectPath);

  if (status.status === 'missing') {
    return { action: 'run-full', status, reason: '.onboarding.json absent' };
  }
  if (status.status === 'error') {
    return { action: 'run-full', status, reason: status.error };
  }
  if (status.status === 'valid') {
    return { action: 'skip', status, reason: 'cache hit (SHA match)' };
  }
  // drift
  if (status.commitsAhead >= driftThreshold) {
    return {
      action: 'prompt-drift',
      status,
      commitsAhead: status.commitsAhead,
      reason: `drift ${status.commitsAhead} commits exceeds threshold ${driftThreshold}`,
    };
  }
  return {
    action: 'skip',
    status,
    commitsAhead: status.commitsAhead,
    reason: `drift ${status.commitsAhead} commits < threshold ${driftThreshold}, silent reuse`,
  };
}
