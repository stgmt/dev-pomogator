/**
 * env-resolver — FR-4: three-layer GitHub owner/repo resolution for PR flow.
 *
 *  Layer 0: ensure `~/.dev-pomogator/worktree-setup.env` exists (stub template).
 *  Layer 1: read env; if WT_GH_OWNER+WT_GH_REPO set AND `gh repo view` exits 0 → use.
 *  Layer 2: investigate real sources — git remote origin → gh repo view --json →
 *           gh api user + repo basename; each candidate validated via `gh repo view`.
 *  Layer 3: cannot resolve → return needsInput with a suggested default; the AI asks
 *           the user (the script never guesses an identifier — NFR-S5).
 *
 * No hardcoded owner/repo anywhere. Atomic env writes (NFR-R1).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface RepoResolution {
  owner?: string;
  repo?: string;
  source: 'env' | 'git-remote' | 'gh-repo-view' | 'gh-user' | 'provided' | 'unresolved';
  needsInput: boolean;
  suggestedDefault?: string;
}

function envFilePath(): string {
  return path.join(os.homedir(), '.dev-pomogator', 'worktree-setup.env');
}

const STUB = `# worktree-setup config — auto-created, safe to edit. WT_ prefix avoids gh CLI's GH_HOST collision.
# WT_GH_OWNER source: gh api user --jq .login  OR  parsed from git remote get-url origin
WT_GH_OWNER=
# WT_GH_REPO source: basename of main worktree  OR  parsed from git remote get-url origin
WT_GH_REPO=
# WT_GH_PROTOCOL: https or ssh (default https)
WT_GH_PROTOCOL=
# WT_GH_HOST: github.com (or enterprise host)
WT_GH_HOST=
`;

/** Layer 0: create the stub env file if absent. Returns its path. */
export function ensureEnvFile(): string {
  const p = envFilePath();
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, STUB);
    try {
      fs.chmodSync(tmp, 0o600);
    } catch {
      /* Windows ACL inherit */
    }
    fs.renameSync(tmp, p);
  }
  return p;
}

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of fs.readFileSync(envFilePath(), 'utf-8').split('\n')) {
      const m = line.match(/^(WT_GH_[A-Z]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {
    /* absent */
  }
  return out;
}

/** Persist resolved owner/repo back into the env file (atomic, preserves comments). */
export function persistEnv(owner: string, repo: string): void {
  const p = ensureEnvFile();
  let content = fs.readFileSync(p, 'utf-8');
  content = content.replace(/^WT_GH_OWNER=.*$/m, `WT_GH_OWNER=${owner}`);
  content = content.replace(/^WT_GH_REPO=.*$/m, `WT_GH_REPO=${repo}`);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, p);
}

function ghRepoExists(owner: string, repo: string): boolean {
  if (!owner || !repo) return false;
  const r = spawnSync('gh', ['repo', 'view', `${owner}/${repo}`], { encoding: 'utf-8' });
  return r.status === 0;
}

/** Parse owner/repo from a GitHub remote URL (https or ssh). */
export function parseRemoteUrl(url: string): { owner: string; repo: string } | null {
  const m = url
    .trim()
    .match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * Resolve owner/repo for the worktree's PR. `mainPath` is the main worktree
 * (used for git remote + repo basename default).
 */
export function resolveRepo(mainPath: string): RepoResolution {
  // Layer 1: env file.
  const env = readEnv();
  if (env.WT_GH_OWNER && env.WT_GH_REPO && ghRepoExists(env.WT_GH_OWNER, env.WT_GH_REPO)) {
    return { owner: env.WT_GH_OWNER, repo: env.WT_GH_REPO, source: 'env', needsInput: false };
  }

  // Layer 2a: git remote origin.
  const remote = spawnSync('git', ['-C', mainPath, 'remote', 'get-url', 'origin'], {
    encoding: 'utf-8',
  });
  if (remote.status === 0) {
    const parsed = parseRemoteUrl(remote.stdout || '');
    if (parsed && ghRepoExists(parsed.owner, parsed.repo)) {
      persistEnv(parsed.owner, parsed.repo);
      return { ...parsed, source: 'git-remote', needsInput: false };
    }
  }

  // Layer 2b: gh repo view --json (current dir).
  const view = spawnSync('gh', ['repo', 'view', '--json', 'owner,name'], {
    cwd: mainPath,
    encoding: 'utf-8',
  });
  if (view.status === 0) {
    try {
      const j = JSON.parse(view.stdout || '{}');
      const owner = j.owner?.login;
      const repo = j.name;
      if (owner && repo && ghRepoExists(owner, repo)) {
        persistEnv(owner, repo);
        return { owner, repo, source: 'gh-repo-view', needsInput: false };
      }
    } catch {
      /* fallthrough */
    }
  }

  // Layer 3: cannot resolve — produce a suggested default for the AI to confirm.
  const user = spawnSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf-8' });
  const login = user.status === 0 ? (user.stdout || '').trim() : '';
  const repoBase = path.basename(mainPath);
  const suggestedDefault = login ? `${login}/${repoBase}` : `<owner>/${repoBase}`;
  return { source: 'unresolved', needsInput: true, suggestedDefault };
}

/** Validate + persist an explicitly-provided `owner/repo` (from Layer-3 user input). */
export function acceptProvided(spec: string): RepoResolution {
  const [owner, repo] = spec.split('/');
  if (owner && repo && ghRepoExists(owner, repo)) {
    persistEnv(owner, repo);
    return { owner, repo, source: 'provided', needsInput: false };
  }
  return { source: 'unresolved', needsInput: true, suggestedDefault: spec };
}
