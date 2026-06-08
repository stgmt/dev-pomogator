// Regression for the P17-6 live-diagnosis (2026-06-08): a headless `claude -p`
// launch passed the UNRESOLVED `${CLAUDE_PROJECT_DIR}` literal as
// DEV_POMOGATOR_REPO_ROOT. The old `env || cwd` only caught an EMPTY string, so
// the server built its graph from a nonexistent path → every get_node/get_trace
// returned NODE_NOT_FOUND → the live agent fell back to a raw Read of `.specs/`.
// resolveRepoRoot now trusts the env ONLY when it's a real dir containing
// `.specs/`, else falls back to cwd.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveRepoRoot } from '../server.ts';

describe('resolveRepoRoot — robust against an unresolved ${CLAUDE_PROJECT_DIR}', () => {
  let repo: string;
  let cwd: string;
  beforeEach(() => {
    repo = path.join(os.tmpdir(), `srr-repo-${randomUUID()}`);
    cwd = path.join(os.tmpdir(), `srr-cwd-${randomUUID()}`);
    fs.mkdirSync(path.join(repo, '.specs'), { recursive: true });
    fs.mkdirSync(path.join(cwd, '.specs'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('uses the env path when it is a real dir containing .specs/', () => {
    expect(resolveRepoRoot(repo, cwd)).toBe(repo);
  });
  it('falls back to cwd on the literal ${CLAUDE_PROJECT_DIR} (headless non-substitution)', () => {
    expect(resolveRepoRoot('${CLAUDE_PROJECT_DIR}', cwd)).toBe(cwd);
  });
  it('falls back to cwd when the env path has no .specs/', () => {
    const noSpecs = path.join(os.tmpdir(), `srr-nospecs-${randomUUID()}`);
    fs.mkdirSync(noSpecs, { recursive: true });
    try {
      expect(resolveRepoRoot(noSpecs, cwd)).toBe(cwd);
    } finally {
      fs.rmSync(noSpecs, { recursive: true, force: true });
    }
  });
  it('falls back to cwd when env is undefined or empty', () => {
    expect(resolveRepoRoot(undefined, cwd)).toBe(cwd);
    expect(resolveRepoRoot('', cwd)).toBe(cwd);
  });
});
