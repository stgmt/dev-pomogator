/**
 * test-spec-gate Stop hook — shared-tree scoping (M2, incident 2026-06-19).
 *
 * The gate flagged a PARALLEL session's uncommitted test files (docker/WSL WIP) that this session
 * never touched: the agent's own work was committed (gone from `git diff`), so only foreign noise
 * remained and got flagged. Fix: the first invocation per session records the already-dirty test
 * files as a foreign baseline; only test files appearing AFTER are the agent's and can be flagged.
 *
 * Integration: spawns the REAL hook (node --import tsx) against a REAL temp git repo — no mocks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const HOOK = path.resolve('tools/plan-pomogator/test-spec-gate.ts');

function runHook(root: string, sessionId: string): string {
  // Spawn from the repo root (so tsx resolves); the hook reads its working dir from input.cwd.
  const r = spawnSync(process.execPath, ['--import', 'tsx', HOOK], {
    input: JSON.stringify({ session_id: sessionId, cwd: root }),
    encoding: 'utf-8',
  });
  return JSON.parse(r.stdout).decision as string;
}

describe('TSGATE001: test-spec-gate scopes to the session, not the shared dirty tree', () => {
  let root: string;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsgate-'));
    const git = (c: string) => execSync(c, { cwd: root, stdio: 'pipe' });
    fs.mkdirSync(path.join(root, 'tests', 'e2e'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tests', 'e2e', 'foreign.test.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'tests', 'e2e', 'agent.test.ts'), 'export const b = 1;\n');
    git('git init -q');
    git('git config user.email t@t.t');
    git('git config user.name t');
    git('git add -A');
    git('git commit -qm init');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('TSGATE001_01: the first invocation records the foreign baseline and approves', () => {
    // foreign.test.ts dirtied by a PARALLEL session before this session's gate first runs
    fs.appendFileSync(path.join(root, 'tests', 'e2e', 'foreign.test.ts'), '// foreign edit\n');
    expect(runHook(root, 'S1')).toBe('approve');
  });

  it('TSGATE001_02: a foreign-only dirty tree stays approved (false-positive fixed)', () => {
    // still only foreign.test.ts dirty — it is in the baseline, so it must NOT be flagged
    expect(runHook(root, 'S1')).toBe('approve');
  });

  it("TSGATE001_03: the agent's OWN new test without a spec is still blocked", () => {
    fs.appendFileSync(path.join(root, 'tests', 'e2e', 'agent.test.ts'), '// agent edit\n');
    expect(runHook(root, 'S1')).toBe('block');
  });
});
